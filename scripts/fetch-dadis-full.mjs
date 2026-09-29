#!/usr/bin/env node
// Fetch every FAO DAD-IS chicken breed record in full and write
// data/breeds_global_full.json (see scripts/lib/dadis-full.mjs for fields).
//
// Fast and resumable: 16 requests in flight, each with its own timeout and
// retry/backoff, and every raw record cached at cache/dadis-full/<ISO3>/<slug>.json,
// so a rerun only fetches the misses. --refresh ignores the cache.
//
// Source: DAD-IS public Firebase JSON (no login)
//   Data/species/Chicken/Country.json        -> { ISO3: { breedName: 1 } }
//   Data/breeds/<ISO3>/Chicken/<name>.json   -> one breed record
//   Data/countries/<ISO3>/{name,region}.json -> country name and region

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./lib/dadis-global.mjs";
import { addTransboundaryLinks, normalizeFull, summarize } from "./lib/dadis-full.mjs";

const BASE = "https://dadis-ws.firebaseio.com/Data";
const CACHE_DIR = path.resolve("cache/dadis-full");
const OUT_FILE = path.resolve("data/breeds_global_full.json");
const CONCURRENCY = 16;
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 20_000;
const REFRESH = process.argv.includes("--refresh");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, attempts = MAX_ATTEMPTS) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await sleep(800 * 2 ** (attempt - 1) + Math.random() * 300);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function pool(items, limit, fn) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try {
          results[i] = { ok: true, value: await fn(items[i], i) };
        } catch (err) {
          results[i] = { ok: false, error: String(err?.message || err) };
        }
      }
    }),
  );
  return results;
}

async function readCache(file) {
  if (REFRESH) return undefined;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function cached(file, url) {
  const hit = await readCache(file);
  if (hit !== undefined) return { data: hit, fetched: false };
  const data = await fetchJson(url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), "utf8");
  return { data, fetched: true };
}

/** Deterministic file slugs; two names that slugify alike get -2, -3 suffixes. */
export function buildJobs(countryBreeds) {
  const jobs = [];
  for (const [iso3, breeds] of Object.entries(countryBreeds || {}).sort()) {
    const seen = new Map();
    for (const breedName of Object.keys(breeds || {}).sort()) {
      const base = slugify(breedName) || "unnamed";
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      jobs.push({ iso3, breedName, fileSlug: n === 1 ? base : `${base}-${n}` });
    }
  }
  return jobs;
}

async function main() {
  const t0 = Date.now();
  await mkdir(CACHE_DIR, { recursive: true });
  const { data: countryBreeds } = await cached(path.join(CACHE_DIR, "_index.json"), `${BASE}/species/Chicken/Country.json`);
  const isos = Object.keys(countryBreeds).sort();
  const jobs = buildJobs(countryBreeds);
  console.log(`${isos.length} countries, ${jobs.length} breed records.`);

  const countryMeta = new Map();
  await pool(isos, CONCURRENCY, async (iso3) => {
    const dir = path.join(CACHE_DIR, "_countries");
    const [n, r] = await Promise.all([
      cached(path.join(dir, `${iso3}-name.json`), `${BASE}/countries/${iso3}/name.json`),
      cached(path.join(dir, `${iso3}-region.json`), `${BASE}/countries/${iso3}/region.json`),
    ]);
    countryMeta.set(iso3, { name: n.data || iso3, region: r.data || null });
  });

  let fetched = 0;
  let done = 0;
  const results = await pool(jobs, CONCURRENCY, async (job) => {
    const url = `${BASE}/breeds/${encodeURIComponent(job.iso3)}/Chicken/${encodeURIComponent(job.breedName)}.json`;
    const res = await cached(path.join(CACHE_DIR, job.iso3, `${job.fileSlug}.json`), url);
    if (res.fetched) fetched++;
    if (++done % 250 === 0) console.log(`  ${done}/${jobs.length} (fetched ${fetched})`);
    return res.data;
  });
  const failures = results.map((r, i) => (r.ok ? null : { ...jobs[i], error: r.error })).filter(Boolean);

  const records = [];
  let empty = 0;
  results.forEach((res, i) => {
    if (!res.ok) return;
    const job = jobs[i];
    const meta = countryMeta.get(job.iso3) || {};
    const rec = normalizeFull(res.value, { iso3: job.iso3, breedName: job.breedName, countryName: meta.name, region: meta.region });
    if (rec) records.push(rec);
    else empty++;
  });

  // ids can collide when two keys share a MostCommonName; suffix them.
  const seenIds = new Map();
  for (const r of records.sort((a, b) => a.id.localeCompare(b.id))) {
    const n = (seenIds.get(r.id) || 0) + 1;
    seenIds.set(r.id, n);
    if (n > 1) r.id = `${r.id}-${n}`;
  }

  const linked = addTransboundaryLinks(records);
  const summary = summarize(linked);
  const out = {
    source: "FAO DAD-IS, Domestic Animal Diversity Information System",
    source_url: "https://www.fao.org/dad-is/en/",
    api: `${BASE}/breeds/<ISO3>/Chicken/<breed>.json`,
    generated_at: new Date().toISOString(),
    count: linked.length,
    summary,
    breeds: linked,
  };
  // one breed per line keeps diffs readable without tripling the file size
  const body = [
    "{",
    ...Object.entries(out)
      .filter(([k]) => k !== "breeds")
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '"breeds": [',
    linked.map((b) => JSON.stringify(b)).join(",\n"),
    "]}",
  ].join("\n");
  await writeFile(OUT_FILE, body + "\n", "utf8");
  if (failures.length) await writeFile(path.join(CACHE_DIR, "_failures.json"), JSON.stringify(failures, null, 2), "utf8");

  const has = (f) => linked.filter(f).length;
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. fetched ${fetched}, cached ${jobs.length - fetched - failures.length}, failed ${failures.length}, empty ${empty}`);
  console.log(`records ${linked.length}; with population history ${has((b) => b.population_history)}, trend ${has((b) => b.trend_latest)}, risk ${has((b) => b.risk_status)}, uses ${has((b) => b.main_uses)}, description ${has((b) => b.description || b.origin?.description)}, morphology ${has((b) => b.morphology)}, weights ${has((b) => b.adult_weights)}, eggs ${has((b) => b.eggs)}, distribution ${has((b) => b.distribution)}, same breed elsewhere ${has((b) => b.same_breed_elsewhere)}, DAD-IS images ${has((b) => b.images)}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("fetch-dadis-full.mjs")) {
  main().catch((err) => {
    console.error("fetch-dadis-full failed:", err);
    process.exitCode = 1;
  });
}
