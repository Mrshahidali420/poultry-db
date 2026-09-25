#!/usr/bin/env node
// Fills breeds_extra.json and diseases_extra.json with GitHub Models, one
// resumable batch per run. For each entity the model gets every text source
// we have for it:
//   - the Wikipedia article (plain text)
//   - cached reference pages linked to it (data/reference_sources.json)
//   - for breeds, the Harris730 CSV description (text from starmilling.com)
// and must return each field as { value, source_url } citing one of those
// URLs, or { value: null, source_url: null } when no source states it.
// Disagreeing sources are kept side by side with conflict: true.
//
// At most BATCH items per run, ~5s between calls, clean stop on 429,
// per-item pending/done/error in state/queue.json. Without GITHUB_TOKEN it
// logs "skipped: no GITHUB_TOKEN" and exits 0.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { callGithubModelsJson, RateLimitError, SchemaValidationError, ServiceUnavailableError } from "./lib/llm.mjs";
import { loadQueueFile, saveQueueFile, getIdsByStatus, markItem, ensureQueueItems } from "./lib/state.mjs";
import { fetchWikitext, articlePlainText } from "./lib/wiki.mjs";
import {
  validateProvenanceResult,
  normalizeProvenanceResult,
  applyExtractedFacts,
  ORIGIN_HARRIS730,
} from "./lib/provenance.mjs";
import {
  BREED_EXTRA_SCHEMA,
  DISEASE_EXTRA_SCHEMA,
  emptyBreedExtra,
  emptyDiseaseExtra,
  toProvenanceShape,
} from "./lib/schemas.mjs";
import { loadHarris730Rows, STARMILLING_URL } from "./import-github-datasets.mjs";

const DATA_DIR = path.resolve("data");
const WIKI_CACHE = path.resolve("cache/wiki");
const BATCH = Number(process.env.BATCH || 30);
const SLEEP_MS = 5000;
const WIKI_CHARS = 12000;
const REFERENCE_CHARS = 5000;
const MAX_REFERENCES = 3;

const FIELD_HELP = {
  breeds: {
    purpose: "one of eggs|meat|dual|ornamental",
    temperament: "short phrase, e.g. docile, flighty",
    broodiness: "short phrase, e.g. frequently broody, rarely broody",
    egg_size: "small|medium|large|extra large",
    hen_weight_kg: "number in kg (convert from lb if needed)",
    rooster_weight_kg: "number in kg (convert from lb if needed)",
    varieties: "array of recognised colour varieties",
    autosexing: "true only if the text says chicks can be sexed by colour at hatch",
  },
  diseases: {
    cause_type: "one of viral|bacterial|parasitic|fungal|nutritional|other",
    notifiable_in_us_uk: 'one of "true", "false", "unknown"',
    key_symptoms: "array of short strings",
    prevention: "array of short strings",
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function readCached(file) {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function wikipediaText(record) {
  const file = path.join(WIKI_CACHE, `${record.id}.txt`);
  const cached = await readCached(file);
  if (cached) return cached;
  const page = await fetchWikitext(record.wikipedia_title ?? record.name);
  if (!page) return record.summary ?? "";
  const text = articlePlainText(page.wikitext);
  await mkdir(WIKI_CACHE, { recursive: true });
  await writeFile(file, text, "utf8");
  return text;
}

/**
 * Build the numbered source list for one entity.
 * @returns {Promise<Array<{url:string, origin:string, label:string, text:string}>>}
 */
async function gatherSources(entityType, record, references, harrisById) {
  const sources = [];
  const wiki = await wikipediaText(record);
  if (wiki) {
    sources.push({ url: record.url, origin: "wikipedia", label: "Wikipedia", text: wiki.slice(0, WIKI_CHARS) });
  }
  const linked = references.filter((r) => r.entity_ids.includes(record.id)).slice(0, MAX_REFERENCES);
  for (const ref of linked) {
    const text = await readCached(path.resolve(ref.cache_file));
    if (text) {
      sources.push({ url: ref.url, origin: `reference:${ref.publisher}`, label: ref.publisher, text: text.slice(0, REFERENCE_CHARS) });
    }
  }
  if (entityType === "breeds") {
    const row = harrisById.get(record.id);
    if (row?.description) {
      sources.push({ url: STARMILLING_URL, origin: ORIGIN_HARRIS730, label: "Star Milling breed guide", text: row.description });
    }
  }
  return sources;
}

function buildPrompt(entityType, record, schema, sources) {
  const fields = Object.entries(schema)
    .map(([f, t]) => `- ${f} (${t}${FIELD_HELP[entityType][f] ? `; ${FIELD_HELP[entityType][f]}` : ""})`)
    .join("\n");
  const system = [
    `You extract facts about the ${entityType === "breeds" ? "chicken breed" : "poultry disease"} "${record.name}" from the numbered sources given.`,
    "Only report a fact if a source states it. Never invent, estimate, or use outside knowledge.",
    'Return one JSON object. Each field is {"value": <value>, "source_url": "<url of the source that states it>"}.',
    'If no source states a field, use {"value": null, "source_url": null} (use [] as the value for array fields).',
    'If two sources disagree on a field, return {"value": <first value>, "source_url": "<its url>", "conflict": true, "values": [{"value": ..., "source_url": ...}, {"value": ..., "source_url": ...}]}.',
    "source_url must be copied exactly from the source list.",
    entityType === "diseases" ? "This is not veterinary advice." : "",
    `Fields:\n${fields}`,
  ].filter(Boolean).join("\n");
  const user = sources
    .map((s, i) => `SOURCE ${i + 1} (${s.label})\nurl: ${s.url}\n${s.text}`)
    .join("\n\n---\n\n");
  return { system, user };
}

async function processQueue({ entityType, queueName, sourceFile, extraFile, schema, emptyRecord, token, queues, references, harrisById }) {
  const sourceRecords = await loadJson(sourceFile, []);
  const sourceById = new Map(sourceRecords.map((r) => [r.id, r]));
  const extraById = new Map((await loadJson(extraFile, [])).map((r) => [r.id, toProvenanceShape(r, schema)]));

  ensureQueueItems(queues, queueName, [...sourceById.keys()]);
  const pendingIds = getIdsByStatus(queues, queueName, "pending").slice(0, BATCH);
  console.log(`[${queueName}] ${pendingIds.length} items this run (batch limit ${BATCH}).`);

  let processed = 0;
  let stoppedOnRateLimit = false;

  for (const id of pendingIds) {
    const record = sourceById.get(id);
    if (!record) {
      markItem(queues, queueName, id, "error", "source record missing");
      continue;
    }
    try {
      const sources = await gatherSources(entityType, record, references, harrisById);
      if (sources.length === 0) {
        markItem(queues, queueName, id, "error", "no source text");
        continue;
      }
      const prompt = buildPrompt(entityType, record, schema, sources);
      const result = await callGithubModelsJson({ token, systemPrompt: prompt.system, userPrompt: prompt.user });
      validateProvenanceResult(result, schema);
      const allowed = new Map(sources.map((s) => [s.url, s.origin]));
      const facts = normalizeProvenanceResult(result, schema, allowed);

      const existing = extraById.get(id) ?? emptyRecord(id);
      const updated = applyExtractedFacts(existing, facts);
      extraById.set(id, {
        ...updated,
        sources_used: sources.map((s) => s.url),
        needs_review: true,
        ...(entityType === "diseases" ? { disclaimer: "Not veterinary advice" } : {}),
      });
      markItem(queues, queueName, id, "done");
      processed += 1;
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.log(`[${queueName}] rate limited, stopping batch cleanly.`);
        stoppedOnRateLimit = true;
        break;
      }
      if (err instanceof ServiceUnavailableError) {
        // Loud in the Actions UI, but the item stays pending and the rest of
        // the pipeline's data still gets committed.
        console.log(`::error title=LLM enrichment not running::${err.message}. No items were marked; switch the provider in scripts/lib/llm.mjs.`);
        stoppedOnRateLimit = true;
        break;
      }
      const message = err instanceof SchemaValidationError ? `schema: ${err.message}` : err.message;
      markItem(queues, queueName, id, "error", message);
      console.log(`[${queueName}] error on "${id}": ${message}`);
    }
    await sleep(SLEEP_MS);
  }

  const merged = [...extraById.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(extraFile, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return { processed, stoppedOnRateLimit };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("skipped: no GITHUB_TOKEN");
    process.exitCode = 0;
    return;
  }

  const queues = await loadQueueFile();
  const references = await loadJson(path.join(DATA_DIR, "reference_sources.json"), []);
  const breeds = await loadJson(path.join(DATA_DIR, "breeds.json"), []);
  const harrisRows = (await loadHarris730Rows(breeds)) ?? [];
  const harrisById = new Map(harrisRows.filter((r) => r.breed_id).map((r) => [r.breed_id, r]));

  const breedsResult = await processQueue({
    entityType: "breeds",
    queueName: "breeds_extra",
    sourceFile: path.join(DATA_DIR, "breeds.json"),
    extraFile: path.join(DATA_DIR, "breeds_extra.json"),
    schema: BREED_EXTRA_SCHEMA,
    emptyRecord: emptyBreedExtra,
    token,
    queues,
    references,
    harrisById,
  });
  await saveQueueFile(queues);

  const diseasesResult = breedsResult.stoppedOnRateLimit
    ? { processed: 0 }
    : await processQueue({
        entityType: "diseases",
        queueName: "diseases_extra",
        sourceFile: path.join(DATA_DIR, "diseases.json"),
        extraFile: path.join(DATA_DIR, "diseases_extra.json"),
        schema: DISEASE_EXTRA_SCHEMA,
        emptyRecord: emptyDiseaseExtra,
        token,
        queues,
        references,
        harrisById,
      });
  await saveQueueFile(queues);

  console.log(`Enrichment run complete. breeds: ${breedsResult.processed}, diseases: ${diseasesResult.processed}.`);
}

main().catch((err) => {
  console.error("enrich-llm failed:", err);
  process.exitCode = 1;
});
