#!/usr/bin/env node
// Processes the breeds_extra + diseases_extra enrichment queues using
// GitHub Models (free inference gateway available inside GitHub Actions).
// Resumable: at most BATCH items per run, ~5s between calls, stops cleanly
// on 429, records per-item pending/done/error status in state/queue.json.
// Locally (no GITHUB_TOKEN) it logs and exits 0 without making any calls.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { callGithubModelsJson, validateSchema, RateLimitError, SchemaValidationError } from "./lib/llm.mjs";
import { loadQueueFile, saveQueueFile, getIdsByStatus, markItem, ensureQueueItems } from "./lib/state.mjs";

const DATA_DIR = path.resolve("data");
const BATCH = Number(process.env.BATCH || 30);
const SLEEP_MS = 5000;

const BREEDS_SCHEMA = {
  eggs_per_year_min: "number|null",
  eggs_per_year_max: "number|null",
  egg_size: "string|null",
  temperament: "string|null",
  broodiness: "string|null",
  cold_hardy: "boolean|null",
  heat_tolerant: "boolean|null",
  beginner_friendly: "boolean|null",
  purpose: "string|null",
  bantam_available: "boolean|null",
  varieties: "array",
  lifespan_years: "number|null",
  notes: "string|null",
};

const DISEASES_SCHEMA = {
  cause_type: "string|null",
  contagious: "boolean|null",
  zoonotic: "boolean|null",
  key_symptoms: "array",
  prevention: "array",
  vaccine_available: "boolean|null",
  notifiable_in_us_uk: "string|null",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBreedPrompt(article) {
  return {
    system:
      "You extract structured facts about chicken breeds from a Wikipedia article. " +
      "Only report facts explicitly stated in the given text. If a fact is not stated, " +
      "use null (or an empty array for list fields). Never invent, estimate, or guess. " +
      'Respond with a single JSON object with exactly these keys: ' +
      "eggs_per_year_min, eggs_per_year_max, egg_size, temperament, broodiness, cold_hardy, " +
      "heat_tolerant, beginner_friendly, purpose (one of eggs|meat|dual|ornamental or null), " +
      "bantam_available, varieties (array of strings), lifespan_years, notes.",
    user: `Article text:\n\n${article.slice(0, 12000)}`,
  };
}

function buildDiseasePrompt(article) {
  return {
    system:
      "You extract structured facts about a poultry disease from a Wikipedia article. " +
      "Only report facts explicitly stated in the given text. If a fact is not stated, use null " +
      "(or an empty array for list fields). Never invent, estimate, or guess. This is not veterinary " +
      "advice. Respond with a single JSON object with exactly these keys: cause_type " +
      "(one of viral|bacterial|parasitic|fungal|nutritional|other, or null), contagious, zoonotic, " +
      "key_symptoms (array of strings), prevention (array of strings), vaccine_available, " +
      'notifiable_in_us_uk (one of "true", "false", "unknown").',
    user: `Article text:\n\n${article.slice(0, 12000)}`,
  };
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function processQueue({ queueName, sourceFile, extraFile, schema, buildPrompt, applyResult, token, queues }) {
  const sourceRecords = await loadJson(sourceFile, []);
  const sourceById = new Map(sourceRecords.map((r) => [r.id, r]));
  const extraRecords = await loadJson(extraFile, []);
  const extraById = new Map(extraRecords.map((r) => [r.id, r]));

  ensureQueueItems(queues, queueName, [...sourceById.keys()]);
  const pendingIds = getIdsByStatus(queues, queueName, "pending").slice(0, BATCH);

  console.log(`[${queueName}] ${pendingIds.length} items to process this run (batch limit ${BATCH}).`);

  let processed = 0;
  let stoppedOnRateLimit = false;

  for (const id of pendingIds) {
    const sourceRecord = sourceById.get(id);
    if (!sourceRecord) {
      markItem(queues, queueName, id, "error", "source record missing");
      continue;
    }
    const articleText = sourceRecord.summary || "";
    const prompt = buildPrompt(articleText);

    try {
      const result = await callGithubModelsJson({
        token,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
      });
      validateSchema(result, schema);

      const existing = extraById.get(id) ?? { id };
      const updated = applyResult(existing, result);
      extraById.set(id, updated);

      markItem(queues, queueName, id, "done");
      processed += 1;
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.log(`[${queueName}] rate limited, stopping batch cleanly.`);
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

  const breedsResult = await processQueue({
    queueName: "breeds_extra",
    sourceFile: path.join(DATA_DIR, "breeds.json"),
    extraFile: path.join(DATA_DIR, "breeds_extra.json"),
    schema: BREEDS_SCHEMA,
    buildPrompt: (text) => {
      const p = buildBreedPrompt(text);
      return { system: p.system, user: p.user };
    },
    applyResult: (existing, result) => ({
      ...existing,
      ...result,
      source: "wikipedia article text",
      needs_review: true,
    }),
    token,
    queues,
  });

  await saveQueueFile(queues);

  const diseasesResult = breedsResult.stoppedOnRateLimit
    ? { processed: 0, stoppedOnRateLimit: true }
    : await processQueue({
        queueName: "diseases_extra",
        sourceFile: path.join(DATA_DIR, "diseases.json"),
        extraFile: path.join(DATA_DIR, "diseases_extra.json"),
        schema: DISEASES_SCHEMA,
        buildPrompt: (text) => {
          const p = buildDiseasePrompt(text);
          return { system: p.system, user: p.user };
        },
        applyResult: (existing, result) => ({
          ...existing,
          ...result,
          needs_review: true,
          disclaimer: "Not veterinary advice",
        }),
        token,
        queues,
      });

  await saveQueueFile(queues);

  console.log(
    `Enrichment run complete. breeds_extra processed: ${breedsResult.processed}, ` +
      `diseases_extra processed: ${diseasesResult.processed}.`
  );
}

main().catch((err) => {
  console.error("enrich-llm failed:", err);
  process.exitCode = 1;
});
