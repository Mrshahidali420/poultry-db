#!/usr/bin/env node
// Fetches the full plain-text Wikipedia article for every breed and disease
// entity, plus any matching cached reference pages and Harris730 CSV
// descriptions, into cache/articles/. This is raw material for the Claude
// helpers that extract facts next (enrich-llm.mjs and friends read these
// files); it is never committed (cache/ is gitignored).
//
// Layout:
//   cache/articles/breeds/<id>.txt        Wikipedia article, "SOURCE: <url>" first line
//   cache/articles/diseases/<id>.txt      same, for diseases
//   cache/articles/<type>/<id>.refs.txt   matching cache/sources/*.txt pages, one SOURCE block each
//   cache/articles/breeds/<id>.harris.txt Harris730 CSV description, "SOURCE: <starmilling url>"
//   cache/articles/index.json             per-entity: which files exist + char counts
//
// Incremental: existing files are left alone unless --force. Sequential and
// polite (scripts/lib/http.mjs rate-limits + retries).

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fetchArticleExtract } from "./lib/wiki.mjs";
import { loadHarris730Rows, STARMILLING_URL } from "./import-github-datasets.mjs";

const DATA_DIR = path.resolve("data");
const CACHE_DIR = path.resolve("cache/articles");
const FORCE = process.argv.includes("--force");

/**
 * Group reference_sources.json entries (HTTP 200 only) by entity type and id.
 * @param {Array<object>} referenceSources
 * @param {"breeds"|"diseases"} entityType
 * @returns {Map<string, Array<{url: string, cache_file: string}>>}
 */
export function groupRefsByEntity(referenceSources, entityType) {
  const map = new Map();
  for (const ref of referenceSources) {
    if (ref.entity_type !== entityType) continue;
    if (ref.http_status !== 200) continue;
    if (!ref.cache_file) continue;
    for (const id of ref.entity_ids ?? []) {
      const list = map.get(id) ?? [];
      list.push({ url: ref.final_url ?? ref.url, cache_file: ref.cache_file });
      map.set(id, list);
    }
  }
  return map;
}

/**
 * Find the Harris730 CSV description text for a breed id, if the CSV was
 * matched to that breed.
 * @param {string} breedId
 * @param {Array<{breed_id: string|null, description: string}>} harrisRows
 * @returns {string|null}
 */
export function harrisTextFor(breedId, harrisRows) {
  if (!harrisRows) return null;
  const row = harrisRows.find((r) => r.breed_id === breedId && r.description);
  return row ? row.description : null;
}

/**
 * Build the per-entity index entry from the files actually written for it.
 * @param {Record<string, number|null>} files map of kind -> char count (null if absent)
 * @returns {{files: Record<string, number>}}
 */
export function buildIndexEntry(files) {
  const present = {};
  for (const [kind, chars] of Object.entries(files)) {
    if (chars !== null && chars !== undefined) present[kind] = chars;
  }
  return { files: present };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(file) {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeArticleFile(id, entityType, title, url) {
  const dir = path.join(CACHE_DIR, entityType);
  const file = path.join(dir, `${id}.txt`);
  if (!FORCE && (await exists(file))) {
    const text = await readFile(file, "utf8");
    return text.length;
  }
  let extract;
  try {
    extract = await fetchArticleExtract(title);
  } catch (err) {
    console.log(`  [${entityType}/${id}] article fetch failed: ${err.message}`);
    return null;
  }
  if (!extract || !extract.extract) {
    console.log(`  [${entityType}/${id}] no article extract found for "${title}"`);
    return null;
  }
  await mkdir(dir, { recursive: true });
  const content = `SOURCE: ${url}\n\n${extract.extract}`;
  await writeFile(file, content, "utf8");
  return content.length;
}

async function writeRefsFile(id, entityType, refs) {
  const dir = path.join(CACHE_DIR, entityType);
  const file = path.join(dir, `${id}.refs.txt`);
  if (!refs || refs.length === 0) return null;
  if (!FORCE && (await exists(file))) {
    const text = await readFile(file, "utf8");
    return text.length;
  }
  const blocks = [];
  for (const ref of refs) {
    const pageText = await readIfExists(path.resolve(ref.cache_file));
    if (!pageText) continue;
    blocks.push(`SOURCE: ${ref.url}\n\n${pageText}`);
  }
  if (blocks.length === 0) return null;
  await mkdir(dir, { recursive: true });
  const content = blocks.join("\n\n---\n\n");
  await writeFile(file, content, "utf8");
  return content.length;
}

async function writeHarrisFile(id, description) {
  const dir = path.join(CACHE_DIR, "breeds");
  const file = path.join(dir, `${id}.harris.txt`);
  if (!description) return null;
  if (!FORCE && (await exists(file))) {
    const text = await readFile(file, "utf8");
    return text.length;
  }
  await mkdir(dir, { recursive: true });
  const content = `SOURCE: ${STARMILLING_URL}\n\n${description}`;
  await writeFile(file, content, "utf8");
  return content.length;
}

async function processEntities(entities, entityType, refsByEntity, harrisRows) {
  let fetched = 0;
  let withRefs = 0;
  let withHarris = 0;
  let errors = 0;
  const totals = [];
  const index = {};

  for (const entity of entities) {
    const title = entity.wikipedia_title ?? entity.name;
    const url = entity.url;
    const articleChars = await writeArticleFile(entity.id, entityType, title, url);
    if (articleChars === null) errors += 1;
    else {
      fetched += 1;
      totals.push(articleChars);
    }

    const refs = refsByEntity.get(entity.id) ?? [];
    const refsChars = await writeRefsFile(entity.id, entityType, refs);
    if (refsChars !== null) withRefs += 1;

    let harrisChars = null;
    if (entityType === "breeds") {
      const description = harrisTextFor(entity.id, harrisRows);
      harrisChars = await writeHarrisFile(entity.id, description);
      if (harrisChars !== null) withHarris += 1;
    }

    index[entity.id] = buildIndexEntry({
      article: articleChars,
      refs: refsChars,
      harris: harrisChars,
    });
  }

  const avgChars = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  console.log(
    `${entityType}: ${fetched}/${entities.length} articles fetched (avg ${avgChars} chars), ` +
      `${withRefs} with refs, ${withHarris} with harris text, ${errors} errors.`
  );
  return index;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const breeds = JSON.parse(await readFile(path.join(DATA_DIR, "breeds.json"), "utf8"));
  const diseases = JSON.parse(await readFile(path.join(DATA_DIR, "diseases.json"), "utf8"));
  let referenceSources = [];
  try {
    referenceSources = JSON.parse(await readFile(path.join(DATA_DIR, "reference_sources.json"), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const harrisRows = await loadHarris730Rows(breeds);

  const breedRefs = groupRefsByEntity(referenceSources, "breeds");
  const diseaseRefs = groupRefsByEntity(referenceSources, "diseases");

  const breedIndex = await processEntities(breeds, "breeds", breedRefs, harrisRows);
  const diseaseIndex = await processEntities(diseases, "diseases", diseaseRefs, harrisRows);

  const fullIndex = { breeds: breedIndex, diseases: diseaseIndex };
  await writeFile(path.join(CACHE_DIR, "index.json"), JSON.stringify(fullIndex, null, 2) + "\n", "utf8");
  console.log(`Wrote cache/articles/index.json (${breeds.length} breeds, ${diseases.length} diseases).`);
}

if (process.argv[1]?.endsWith("fetch-articles.mjs")) {
  main().catch((err) => {
    console.error("fetch-articles failed:", err);
    process.exitCode = 1;
  });
}
