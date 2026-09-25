#!/usr/bin/env node
// Fetches every article in Category:Poultry diseases and its direct
// subcategories (one level deep), pulls the first infobox found (whatever
// shape it has) plus a plain-text summary and lead image, and writes
// data/diseases.json. Seeds data/diseases_extra.json for LLM enrichment.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchCategoryMembers,
  fetchSubcategories,
  fetchWikitext,
  fetchCommonsImageInfo,
  stripWikiMarkup,
  extractSummary,
} from "./lib/wiki.mjs";
import { loadQueueFile, saveQueueFile, ensureQueueItems } from "./lib/state.mjs";
import { DISEASE_EXTRA_SCHEMA, emptyDiseaseExtra, toProvenanceShape } from "./lib/schemas.mjs";
import { loadTitleCache, saveTitleCache, recentTitle, recordTitle } from "./lib/title-cache.mjs";

const DATA_DIR = path.resolve("data");
const DISEASES_FILE = path.join(DATA_DIR, "diseases.json");
const DISEASES_EXTRA_FILE = path.join(DATA_DIR, "diseases_extra.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE = process.argv.includes("--force");
const ROOT_CATEGORY = "Category:Poultry diseases";

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Find the first {{Infobox ...}} template in wikitext and return its fields, generically. */
function extractFirstInfobox(wikitext) {
  const match = /\{\{\s*infobox[^|}\n]*/i.exec(wikitext);
  if (!match) return {};
  const start = wikitext.indexOf(match[0]);
  let depth = 0;
  let pos = start;
  while (pos < wikitext.length) {
    if (wikitext[pos] === "{" && wikitext[pos + 1] === "{") { depth += 1; pos += 2; continue; }
    if (wikitext[pos] === "}" && wikitext[pos + 1] === "}") {
      depth -= 1;
      pos += 2;
      if (depth === 0) break;
      continue;
    }
    pos += 1;
  }
  const block = wikitext.slice(start, pos);
  const inner = block.slice(2, -2);
  const pipeIndex = inner.indexOf("|");
  if (pipeIndex === -1) return {};
  const body = inner.slice(pipeIndex + 1);

  const fields = {};
  let depthBrace = 0;
  let depthBracket = 0;
  let current = "";
  const segments = [];
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{") { depthBrace += 1; current += two; i += 1; continue; }
    if (two === "}}") { depthBrace = Math.max(0, depthBrace - 1); current += two; i += 1; continue; }
    if (two === "[[") { depthBracket += 1; current += two; i += 1; continue; }
    if (two === "]]") { depthBracket = Math.max(0, depthBracket - 1); current += two; i += 1; continue; }
    if (body[i] === "|" && depthBrace === 0 && depthBracket === 0) { segments.push(current); current = ""; continue; }
    current += body[i];
  }
  if (current) segments.push(current);

  for (const segment of segments) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) continue;
    const key = segment.slice(0, eqIndex).trim().toLowerCase();
    const value = stripWikiMarkup(segment.slice(eqIndex + 1).trim());
    if (key && value) fields[key] = value;
  }
  return fields;
}

function extractImageFileFromInfobox(fields) {
  for (const key of ["image", "image1", "photo"]) {
    if (fields[key]) return fields[key];
  }
  return null;
}

async function loadExisting() {
  try {
    const raw = await readFile(DISEASES_FILE, "utf8");
    const arr = JSON.parse(raw);
    return new Map(arr.map((d) => [d.id, d]));
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
}

function isFresh(record) {
  if (FORCE || !record?.fetched_at) return false;
  return Date.now() - new Date(record.fetched_at).getTime() < THIRTY_DAYS_MS;
}

async function buildDiseaseRecord(title) {
  const page = await fetchWikitext(title);
  if (!page) return null;

  const id = slugify(page.title);
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  const infoboxFields = extractFirstInfobox(page.wikitext);

  let image = null;
  const imageFileRaw = extractImageFileFromInfobox(infoboxFields);
  if (imageFileRaw) {
    const fileName = imageFileRaw.replace(/^File:|^Image:/i, "").trim();
    if (fileName) {
      try {
        const info = await fetchCommonsImageInfo(fileName);
        if (info) image = { ...info, license_note: "Text/facts from Wikipedia, CC BY-SA 4.0" };
      } catch {
        image = null;
      }
    }
  }

  return {
    id,
    name: page.title,
    url,
    summary: extractSummary(page.wikitext),
    infobox_fields: infoboxFields,
    image,
    fetched_at: new Date().toISOString(),
  };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log(`Collecting members of ${ROOT_CATEGORY} and its subcategories (1 level)...`);
  const rootMembers = await fetchCategoryMembers(ROOT_CATEGORY);
  const subcats = rootMembers.filter((t) => t.startsWith("Category:"));
  const directArticles = rootMembers.filter((t) => !t.startsWith("Category:"));

  console.log(`  Direct articles: ${directArticles.length}, subcategories: ${subcats.length}`);

  const allTitles = new Set(directArticles);
  for (const sub of subcats) {
    const members = await fetchCategoryMembers(sub);
    for (const m of members) {
      if (!m.startsWith("Category:")) allTitles.add(m);
    }
  }
  console.log(`Total candidate disease titles: ${allTitles.size}`);

  const existing = await loadExisting();
  const results = new Map();
  const sources = new Set();
  let fetchedCount = 0;
  let skippedFresh = 0;
  let errors = 0;

  const titleCache = await loadTitleCache();
  for (const title of [...allTitles].sort()) {
    const known = FORCE ? null : recentTitle(titleCache, "diseases", title);
    if (known && known.id === null) continue; // missing page last time
    const cached = existing.get(known?.id ?? slugify(title));
    if (isFresh(cached)) {
      results.set(cached.id, cached);
      skippedFresh += 1;
      continue;
    }
    try {
      const record = await buildDiseaseRecord(title);
      recordTitle(titleCache, "diseases", title, record?.id ?? null);
      if (!record) continue;
      results.set(record.id, record);
      sources.add(record.url);
      fetchedCount += 1;
    } catch (err) {
      errors += 1;
      console.log(`  Error fetching "${title}": ${err.message}`);
    }
  }

  await saveTitleCache(titleCache);
  const diseases = [...results.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(DISEASES_FILE, JSON.stringify(diseases, null, 2) + "\n", "utf8");

  let extra = [];
  try {
    extra = JSON.parse(await readFile(DISEASES_EXTRA_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  extra = extra.map((e) => toProvenanceShape(e, DISEASE_EXTRA_SCHEMA));
  const extraIds = new Set(extra.map((e) => e.id));
  for (const disease of diseases) {
    if (!extraIds.has(disease.id)) extra.push(emptyDiseaseExtra(disease.id));
  }
  extra.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(DISEASES_EXTRA_FILE, JSON.stringify(extra, null, 2) + "\n", "utf8");

  const queues = await loadQueueFile();
  ensureQueueItems(queues, "diseases_extra", diseases.map((d) => d.id));
  await saveQueueFile(queues);

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
        type: "disease_article",
        license: "CC BY-SA 4.0",
        fetched_at: new Date().toISOString(),
      });
    }
  }
  const mergedSources = [...sourceMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  await writeFile(SOURCES_FILE, JSON.stringify(mergedSources, null, 2) + "\n", "utf8");

  console.log(`Done. Diseases total: ${diseases.length}`);
  console.log(`  Newly fetched: ${fetchedCount}, reused fresh cache: ${skippedFresh}, errors: ${errors}`);
}

main().catch((err) => {
  console.error("fetch-diseases failed:", err);
  process.exitCode = 1;
});
