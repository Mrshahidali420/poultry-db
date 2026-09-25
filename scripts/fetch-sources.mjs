#!/usr/bin/env node
// Checks every reference page in sources/reference-urls.json, keeps only
// the ones that answer HTTP 200, follows `discover` rules on live hub pages
// to find deep pages (breed pages, disease pages), and caches each page's
// plain text in cache/sources/ (gitignored: third-party prose is never
// committed). data/reference_sources.json lists the live pages with the
// breeds/diseases they cover, so enrich-llm.mjs can feed them to the model.
//
// Same politeness as the wiki fetcher (lib/http.mjs), 30-day incremental
// skip unless --force, per-URL status in state/queue.json.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { politeFetch } from "./lib/http.mjs";
import { htmlToText, extractLinks } from "./lib/html.mjs";
import { buildBreedIndex, buildDiseaseIndex, breedKey, diseaseKey } from "./lib/match.mjs";
import { loadQueueFile, saveQueueFile, markItem } from "./lib/state.mjs";

const SEED_FILE = path.resolve("sources/reference-urls.json");
const CACHE_DIR = path.resolve("cache/sources");
const DATA_DIR = path.resolve("data");
const OUT_FILE = path.join(DATA_DIR, "reference_sources.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");
const QUEUE = "reference_urls";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 30000;
const MAX_TEXT_CHARS = 60000;
const FORCE = process.argv.includes("--force");

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function cleanName(text) {
  return text.replace(/\(.*$/, "").replace(/\s+/g, " ").trim();
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await politeFetch(url, { signal: controller.signal, redirect: "follow" });
    const html = response.status === 200 ? await response.text() : "";
    return { status: response.status, finalUrl: response.url, html };
  } catch (err) {
    return { status: 0, finalUrl: url, html: "", error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function isFresh(queues, id) {
  if (FORCE) return false;
  const item = queues[QUEUE]?.[id];
  if (!item || item.status !== "done") return false;
  return Date.now() - new Date(item.updated_at).getTime() < THIRTY_DAYS_MS;
}

function resolveEntityIds(entry, breedIndex, diseaseIndex) {
  const names = [...(entry.entity_names ?? []), ...(entry.entity_name ? [entry.entity_name] : [])];
  const ids = new Set();
  for (const name of names) {
    const id = entry.entity_type === "breeds"
      ? breedIndex.get(breedKey(name))
      : entry.entity_type === "diseases"
        ? diseaseIndex.get(diseaseKey(name))
        : null;
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const seed = await loadJson(SEED_FILE, { entries: [] });
  const breeds = await loadJson(path.join(DATA_DIR, "breeds.json"), []);
  const diseases = await loadJson(path.join(DATA_DIR, "diseases.json"), []);
  const breedIndex = buildBreedIndex(breeds);
  const diseaseIndex = buildDiseaseIndex(diseases);

  const previous = new Map((await loadJson(OUT_FILE, [])).map((r) => [r.id, r]));
  const queues = await loadQueueFile();
  const alive = new Map();
  const dead = [];

  // Verify one entry; returns its HTML when freshly fetched and alive.
  const verify = async (entry) => {
    const cacheFile = path.join(CACHE_DIR, `${entry.id}.txt`);
    if (isFresh(queues, entry.id) && previous.has(entry.id) && (await exists(cacheFile))) {
      alive.set(entry.id, { ...previous.get(entry.id), entity_ids: resolveEntityIds(entry, breedIndex, diseaseIndex) });
      return { reused: true, html: null };
    }
    const page = await fetchPage(entry.url);
    if (page.status !== 200) {
      const reason = page.error ?? `HTTP ${page.status}`;
      dead.push({ id: entry.id, url: entry.url, reason });
      markItem(queues, QUEUE, entry.id, "error", reason);
      console.log(`  DEAD  ${reason.padEnd(9)} ${entry.url}`);
      return { reused: false, html: null };
    }
    const text = htmlToText(page.html).slice(0, MAX_TEXT_CHARS);
    await writeFile(cacheFile, text, "utf8");
    alive.set(entry.id, {
      id: entry.id,
      parent_id: entry.parent_id ?? null,
      entity_type: entry.entity_type,
      entity_name: entry.entity_name ?? null,
      entity_ids: resolveEntityIds(entry, breedIndex, diseaseIndex),
      publisher: entry.publisher,
      url: entry.url,
      final_url: page.finalUrl,
      http_status: 200,
      cache_file: path.relative(process.cwd(), cacheFile).replace(/\\/g, "/"),
      text_chars: text.length,
      fetched_at: new Date().toISOString(),
    });
    markItem(queues, QUEUE, entry.id, "done");
    return { reused: false, html: page.html, finalUrl: page.finalUrl };
  };

  console.log(`Checking ${seed.entries.length} seed reference URLs...`);
  for (const entry of seed.entries) {
    const result = await verify(entry);

    if (!entry.discover || !alive.has(entry.id)) continue;

    let children;
    if (result.html) {
      const pattern = new RegExp(entry.discover.pattern, "i");
      children = extractLinks(result.html, result.finalUrl)
        .filter((link) => pattern.test(link.url) && link.text)
        .map((link) => ({
          id: `${entry.id}--${slugify(new URL(link.url).pathname)}`,
          parent_id: entry.id,
          entity_type: entry.discover.entity_type,
          entity_name: cleanName(link.text),
          publisher: entry.publisher,
          url: link.url,
        }));
    } else {
      // Hub reused from cache: re-check the children we found last time.
      children = [...previous.values()]
        .filter((r) => r.parent_id === entry.id)
        .map((r) => ({ id: r.id, parent_id: r.parent_id, entity_type: r.entity_type, entity_name: r.entity_name, publisher: r.publisher, url: r.url }));
    }

    console.log(`  ${entry.id}: ${children.length} deep pages discovered`);
    for (const child of children) await verify(child);
  }

  const records = [...alive.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(OUT_FILE, JSON.stringify(records, null, 2) + "\n", "utf8");
  await saveQueueFile(queues);

  const sourceMap = new Map((await loadJson(SOURCES_FILE, [])).map((s) => [s.url, s]));
  for (const r of records) {
    if (!sourceMap.has(r.url)) {
      sourceMap.set(r.url, {
        url: r.url,
        type: `reference_${r.entity_type}`,
        publisher: r.publisher,
        license: "Publisher terms; only extracted facts and this URL are stored",
        fetched_at: r.fetched_at,
      });
    }
  }
  const merged = [...sourceMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  await writeFile(SOURCES_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");

  const linked = records.filter((r) => r.entity_ids.length).length;
  console.log(`Done. Alive: ${records.length}, dead/dropped: ${dead.length}, linked to a breed/disease: ${linked}.`);
}

main().catch((err) => {
  console.error("fetch-sources failed:", err);
  process.exitCode = 1;
});
