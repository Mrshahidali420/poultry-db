#!/usr/bin/env node
// Pull every chicken breed FAO DAD-IS tracks, straight from its public
// Firebase JSON (no login, no browser export needed):
//   - Data/species/Chicken/Country.json  -> { ISO3: { breedName: 1, ... } }
//   - Data/breeds/<ISO3>/Chicken/<name>.json -> the ~6KB breed record
//   - Data/countries.json -> ISO3 -> country names
//
// Resume-safe: every raw record lands at imports/dad-is/raw/<ISO3>/<safe
// name>.json and a run that already has that file skips the request. The
// user's connection is slow and drops, so every request has its own
// timeout and short retry/backoff, and failures never hang the batch.
//
// After fetching, normalizes everything into:
//   data/breeds_global.json         one record per national population
//   data/breeds_global_by_name.json populations grouped by normalized name
//   data/breed-dadis-links.json     { breed_id, dadis_ids[] } for data/breeds.json (not edited)

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBreedIndex } from "./lib/match.mjs";
import { buildBreedDadisLinks, buildGlobalByName, normalizeDadisRecord, slugify } from "./lib/dadis-global.mjs";

const BASE = "https://dadis-ws.firebaseio.com/Data";
const RAW_DIR = path.resolve("imports/dad-is/raw");
const DATA_DIR = path.resolve("data");

const CONCURRENCY = 6;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 20_000;
const BASE_BACKOFF_MS = 1000;

function safeName(name) {
  const s = slugify(name);
  return s || "unnamed";
}

async function fetchJson(url, { attempts = MAX_ATTEMPTS } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < attempts) {
        const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

async function fileExists(p) {
  try {
    await readFile(p, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Run `tasks` (thunks) with a bounded concurrency, never letting one throw stop the batch. */
async function runPool(tasks, concurrency, onResult) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      try {
        const result = await tasks[i]();
        onResult(i, null, result);
      } catch (err) {
        onResult(i, err, null);
      }
    }
  });
  await Promise.all(workers);
}

async function fetchAll() {
  console.log("Fetching country list and chicken breed index...");
  const [countries, countryBreeds] = await Promise.all([
    fetchJson(`${BASE}/countries.json`),
    fetchJson(`${BASE}/species/Chicken/Country.json`),
  ]);

  // A few breed names collide once slugified (e.g. NZL's "Aseal - Asil" and
  // "Aseal Asil" both slugify to "aseal-asil"). Two concurrent writers to the
  // same path can corrupt each other's file and silently lose one breed, so
  // dedupe filenames deterministically (sorted breed name order) up front.
  const jobs = [];
  for (const [iso3, breeds] of Object.entries(countryBreeds || {})) {
    const seenSlugs = new Map();
    for (const breedName of Object.keys(breeds || {}).sort()) {
      const base = safeName(breedName);
      const count = seenSlugs.get(base) || 0;
      seenSlugs.set(base, count + 1);
      const fileSlug = count === 0 ? base : `${base}-${count + 1}`;
      jobs.push({ iso3, breedName, fileSlug });
    }
  }
  console.log(`${Object.keys(countryBreeds).length} countries, ${jobs.length} national breed populations to fetch.`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  const tasks = jobs.map((job) => async () => {
    const dir = path.join(RAW_DIR, job.iso3);
    const file = path.join(dir, `${job.fileSlug}.json`);
    if (await fileExists(file)) {
      skipped++;
      return { skipped: true };
    }
    const url = `${BASE}/breeds/${encodeURIComponent(job.iso3)}/Chicken/${encodeURIComponent(job.breedName)}.json`;
    const raw = await fetchJson(url);
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify({ iso3: job.iso3, breedName: job.breedName, raw }, null, 2) + "\n", "utf8");
    fetched++;
    return { skipped: false };
  });

  let done = 0;
  await runPool(tasks, CONCURRENCY, (i, err) => {
    done++;
    if (err) {
      failed++;
      failures.push({ ...jobs[i], error: String(err && err.message ? err.message : err) });
    }
    if (done % 200 === 0 || done === tasks.length) {
      console.log(`  progress: ${done}/${tasks.length} (fetched ${fetched}, skipped ${skipped}, failed ${failed})`);
    }
  });

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(path.join(RAW_DIR, "_countries.json"), JSON.stringify(countries, null, 2) + "\n", "utf8");
  if (failures.length) {
    await writeFile(path.join(RAW_DIR, "_failures.json"), JSON.stringify(failures, null, 2) + "\n", "utf8");
    console.log(`${failures.length} failed after ${MAX_ATTEMPTS} attempts each; see imports/dad-is/raw/_failures.json`);
  }

  return { countries, jobCount: jobs.length, fetched, skipped, failed };
}

async function loadAllRaw() {
  const isoDirs = (await readdir(RAW_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const records = [];
  for (const iso3 of isoDirs) {
    const dir = path.join(RAW_DIR, iso3);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const parsed = JSON.parse(await readFile(path.join(dir, f), "utf8"));
        records.push(parsed);
      } catch {
        // skip corrupt/partial file; a re-run of fetch will not re-fetch it
        // since it exists, so surface it instead of silently losing data.
        console.warn(`  skipping unreadable raw file: ${path.join(dir, f)}`);
      }
    }
  }
  return records;
}

async function normalize(countries) {
  const rawRecords = await loadAllRaw();
  const countryNames = new Map(Object.entries(countries || {}).map(([iso3, c]) => [iso3, c && c.name]));

  const normalized = [];
  for (const { iso3, breedName, raw } of rawRecords) {
    const record = normalizeDadisRecord(raw, { iso3, breedName, countryName: countryNames.get(iso3) });
    if (record) normalized.push(record);
  }
  normalized.sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(path.join(DATA_DIR, "breeds_global.json"), JSON.stringify(normalized, null, 2) + "\n", "utf8");

  const byName = buildGlobalByName(normalized);
  await writeFile(path.join(DATA_DIR, "breeds_global_by_name.json"), JSON.stringify(byName, null, 2) + "\n", "utf8");

  const breeds = JSON.parse(await readFile(path.join(DATA_DIR, "breeds.json"), "utf8"));
  const breedIndex = buildBreedIndex(breeds);
  const links = buildBreedDadisLinks(normalized, breedIndex);
  await writeFile(path.join(DATA_DIR, "breed-dadis-links.json"), JSON.stringify(links, null, 2) + "\n", "utf8");

  const withImages = normalized.filter((r) => r.images && r.images.length).length;
  return {
    normalizedCount: normalized.length,
    uniqueNames: byName.length,
    linkedBreeds: links.length,
    withImages,
  };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const { countries, jobCount, fetched, skipped, failed } = await fetchAll();
  console.log("Normalizing into data/breeds_global.json ...");
  const stats = await normalize(countries);

  console.log("Done.");
  console.log(`  jobs: ${jobCount} (fetched now: ${fetched}, already saved: ${skipped}, failed: ${failed})`);
  console.log(`  normalized records: ${stats.normalizedCount}`);
  console.log(`  unique breed names (grouped): ${stats.uniqueNames}`);
  console.log(`  linked to data/breeds.json: ${stats.linkedBreeds}`);
  console.log(`  records with images: ${stats.withImages}`);
}

main().catch((err) => {
  console.error("fetch-dadis failed:", err);
  process.exitCode = 1;
});
