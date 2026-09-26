#!/usr/bin/env node
// Fetches every chicken breed article from Wikipedia (Category:Chicken breeds
// + List of chicken breeds), parses the {{Infobox poultry breed}} template,
// resolves the lead image via Commons, and writes data/breeds.json.
// Also seeds data/breeds_extra.json queue entries for LLM enrichment
// (scripts/enrich-llm.mjs fills in the actual values).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchCategoryMembers,
  fetchWikitext,
  fetchCommonsImageInfo,
  parseTemplate,
  stripWikiMarkup,
  extractSummary,
  parseWeightKg,
} from "./lib/wiki.mjs";
import { loadQueueFile, saveQueueFile, ensureQueueItems } from "./lib/state.mjs";
import { BREED_EXTRA_SCHEMA, emptyBreedExtra, toProvenanceShape } from "./lib/schemas.mjs";
import { loadTitleCache, saveTitleCache, recentTitle, recordTitle } from "./lib/title-cache.mjs";

const DATA_DIR = path.resolve("data");
const BREEDS_FILE = path.join(DATA_DIR, "breeds.json");
const BREEDS_EXTRA_FILE = path.join(DATA_DIR, "breeds_extra.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");

// Wikipedia pages that are not kept as breeds (owner decision, 2026-09-26).
// Golden Comet, ISA Brown and Isbar live on as aliases in breed-aliases.json;
// Broiler is a production type in data/curated/production-types.json.
const RETIRED_BREED_IDS = new Set(["broiler", "golden-comet", "isa-brown", "isbar"]);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE = process.argv.includes("--force");

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractWikilinkTitles(wikitext) {
  const titles = new Set();
  const regex = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;
  let match;
  while ((match = regex.exec(wikitext))) {
    const title = match[1].trim();
    if (!title) continue;
    if (/^(file|image|category):/i.test(title)) continue;
    titles.add(title);
  }
  return titles;
}

async function loadExisting() {
  try {
    const raw = await readFile(BREEDS_FILE, "utf8");
    const arr = JSON.parse(raw);
    const map = new Map();
    for (const item of arr) map.set(item.id, item);
    return map;
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
}

function isFresh(record) {
  if (FORCE || !record?.fetched_at) return false;
  const age = Date.now() - new Date(record.fetched_at).getTime();
  return age < THIRTY_DAYS_MS;
}

async function buildBreedRecord(title, previous = null) {
  const page = await fetchWikitext(title);
  if (!page) return null;

  const fields = parseTemplate(page.wikitext, "infobox poultry breed");
  if (fields === null) return null; // not a breed article

  const id = slugify(page.title);
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;

  const altnames = fields.altname
    ? stripWikiMarkup(fields.altname).split(/,|;/).map((s) => s.trim()).filter(Boolean)
    : [];

  const maleWeightRaw = fields.maleweight ?? fields.weight ?? null;
  const femaleWeightRaw = fields.femaleweight ?? fields.weight ?? null;

  let image = null;
  const imageField = fields.image;
  if (imageField) {
    const fileName = stripWikiMarkup(imageField).replace(/^File:|^Image:/i, "").trim();
    if (fileName) {
      try {
        const info = await fetchCommonsImageInfo(fileName);
        if (info) {
          image = {
            ...info,
            license_note: "Text/facts from Wikipedia, CC BY-SA 4.0",
          };
        }
      } catch {
        image = null;
      }
      // A failed or empty Commons lookup must not wipe a good image: keep the
      // one we already had for this same file.
      const prev = previous?.image;
      if (!image && prev && !prev.origin && prev.file === fileName) image = prev;
    }
  }

  return {
    id,
    name: page.title,
    wikipedia_title: page.title,
    url,
    altnames,
    country: fields.country ? stripWikiMarkup(fields.country) : null,
    apa_class: fields.apa ? stripWikiMarkup(fields.apa) : null,
    aba_class: fields.aba ? stripWikiMarkup(fields.aba) : null,
    pcgb_class: fields.pcgb ? stripWikiMarkup(fields.pcgb) : null,
    male_weight_kg: parseWeightKg(maleWeightRaw),
    female_weight_kg: parseWeightKg(femaleWeightRaw),
    male_weight_raw: maleWeightRaw ? stripWikiMarkup(maleWeightRaw) : null,
    female_weight_raw: femaleWeightRaw ? stripWikiMarkup(femaleWeightRaw) : null,
    egg_color: fields.eggcolor ? stripWikiMarkup(fields.eggcolor) : null,
    skin_color: fields.skincolor ? stripWikiMarkup(fields.skincolor) : null,
    comb: fields.comb ? stripWikiMarkup(fields.comb) : null,
    status: fields.status ? stripWikiMarkup(fields.status) : null,
    use: fields.use ? stripWikiMarkup(fields.use) : null,
    summary: extractSummary(page.wikitext),
    image,
    license_note: "Text/facts from Wikipedia, CC BY-SA 4.0",
    fetched_at: new Date().toISOString(),
  };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log("Collecting candidate breed titles from Wikipedia...");
  const categoryMembers = await fetchCategoryMembers("Category:Chicken breeds");
  console.log(`  Category:Chicken breeds -> ${categoryMembers.length} members`);

  let listLinks = [];
  try {
    const listPage = await fetchWikitext("List of chicken breeds");
    if (listPage) {
      listLinks = [...extractWikilinkTitles(listPage.wikitext)];
      console.log(`  List of chicken breeds -> ${listLinks.length} linked titles`);
    }
  } catch (err) {
    console.log(`  Could not fetch List of chicken breeds: ${err.message}`);
  }

  const candidateTitles = [...new Set([
    ...categoryMembers.filter((t) => !t.startsWith("Category:")),
    ...listLinks,
  ])].sort();

  console.log(`Total candidate titles: ${candidateTitles.length}`);

  const existing = await loadExisting();
  const results = new Map();
  const sources = new Set();
  let fetchedCount = 0;
  let skippedFresh = 0;
  let rejectedNonBreed = 0;
  let errors = 0;

  const titleCache = await loadTitleCache();
  let skippedKnownRejects = 0;

  for (const title of candidateTitles) {
    // What checking this title produced last time (breed id, or null = not a breed).
    const known = FORCE ? null : recentTitle(titleCache, "breeds", title);
    if (RETIRED_BREED_IDS.has(known?.id ?? slugify(title))) continue;
    if (known && known.id === null) {
      skippedKnownRejects += 1;
      continue;
    }
    const cached = existing.get(known?.id ?? slugify(title));
    if (isFresh(cached)) {
      results.set(cached.id, cached);
      skippedFresh += 1;
      continue;
    }

    try {
      const record = await buildBreedRecord(title, existing.get(known?.id ?? slugify(title)) ?? null);
      recordTitle(titleCache, "breeds", title, record?.id ?? null);
      if (!record) {
        rejectedNonBreed += 1;
        continue;
      }
      if (RETIRED_BREED_IDS.has(record.id)) continue;
      results.set(record.id, record);
      sources.add(record.url);
      fetchedCount += 1;
      if (fetchedCount % 20 === 0) {
        console.log(`  Fetched ${fetchedCount} breeds so far...`);
      }
    } catch (err) {
      errors += 1;
      console.log(`  Error fetching "${title}": ${err.message}`);
    }
  }

  await saveTitleCache(titleCache);
  const breeds = [...results.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(BREEDS_FILE, JSON.stringify(breeds, null, 2) + "\n", "utf8");

  // Seed the enrichment queue for breeds_extra.json (values filled by enrich-llm.mjs).
  let extra = [];
  try {
    extra = JSON.parse(await readFile(BREEDS_EXTRA_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  extra = extra.map((e) => toProvenanceShape(e, BREED_EXTRA_SCHEMA));
  const extraIds = new Set(extra.map((e) => e.id));
  for (const breed of breeds) {
    if (!extraIds.has(breed.id)) extra.push(emptyBreedExtra(breed.id));
  }
  extra.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(BREEDS_EXTRA_FILE, JSON.stringify(extra, null, 2) + "\n", "utf8");

  const queues = await loadQueueFile();
  ensureQueueItems(queues, "breeds_extra", breeds.map((b) => b.id));
  await saveQueueFile(queues);

  // Merge into sources.json.
  let sourceRecords = [];
  try {
    sourceRecords = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const sourceMap = new Map(sourceRecords.map((s) => [s.url, s]));
  for (const url of sources) {
    if (!sourceMap.has(url)) {
      sourceMap.set(url, {
        url,
        type: "breed_article",
        license: "CC BY-SA 4.0",
        fetched_at: new Date().toISOString(),
      });
    }
  }
  const mergedSources = [...sourceMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  await writeFile(SOURCES_FILE, JSON.stringify(mergedSources, null, 2) + "\n", "utf8");

  const withImage = breeds.filter((b) => b.image).length;
  console.log(`Done. Breeds total: ${breeds.length} (with image: ${withImage})`);
  console.log(`  Newly fetched: ${fetchedCount}, reused fresh cache: ${skippedFresh}, rejected non-breed pages: ${rejectedNonBreed}, known non-breed titles skipped: ${skippedKnownRejects}, errors: ${errors}`);
}

main().catch((err) => {
  console.error("fetch-breeds failed:", err);
  process.exitCode = 1;
});
