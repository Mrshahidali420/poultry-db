#!/usr/bin/env node
// Downloads ORIGINAL full-size Wikimedia Commons images (not 1200px
// thumbnails) for every breed's lead + gallery images, fast and in batch.
//
// Three stages:
//   1. Discovery — reuses fetch-images.mjs's category/lead-image lookup
//      logic to build the full list of Commons File: names per breed.
//      Cached to cache/image-list.json so re-runs skip discovery.
//   2. Resolve — batches up to 50 titles per action=query&prop=imageinfo
//      call (the MediaWiki API limit) to get each file's original URL,
//      size, mime and extmetadata (artist/licence/description for credit
//      lines; nothing is filtered by licence).
//   3. Download — streams each original from upload.wikimedia.org straight
//      to disk (never buffered fully in memory) with concurrency 6,
//      resume-safe by comparing existing file size to the expected size.
//
// Manifest: data/images-original.json (written incrementally).
// Failures: data/images-original-failed.json.
// Files land in data/images-original/<entity-type>/<id>/<safe-file-name>,
// which is gitignored — several GB, never goes into git.

import { mkdir, readFile, writeFile, stat, rename } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { resolveCommonsCategory, selectGalleryFiles, sanitizeFilename, MAX_GALLERY_PER_BREED } from "./fetch-images.mjs";
import { fetchPageLeadImage, stripWikiMarkup } from "./lib/wiki.mjs";

const DATA_DIR = path.resolve("data");
const CACHE_DIR = path.resolve("cache");
const ORIGINALS_DIR = path.join(DATA_DIR, "images-original");
const MANIFEST_FILE = path.join(DATA_DIR, "images-original.json");
const FAILED_FILE = path.join(DATA_DIR, "images-original-failed.json");
const IMAGE_LIST_CACHE = path.join(CACHE_DIR, "image-list.json");

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
export const UPLOAD_HOST_UA = "poultry-db/0.2 (https://github.com/Mrshahidali420/poultry-db)";
export const BATCH_SIZE = 50; // MediaWiki imageinfo titles-per-request limit
export const CONCURRENCY = 6;
export const PROGRESS_EVERY = 25;
export const MANIFEST_FLUSH_EVERY = 20;
export const MAX_RETRIES = 5;
export const DEFAULT_RETRY_AFTER_SEC = 30;
export const SKIP_MIMES = new Set([
  "application/pdf",
  "audio/ogg",
  "video/ogg",
  "video/webm",
  "application/ogg",
]);
const TIFF_SIZE_LIMIT = 50 * 1024 * 1024;

const FORCE_DISCOVER = process.argv.includes("--force-discover");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split an array into chunks of at most `size` items each.
 * @param {any[]} items
 * @param {number} size
 * @returns {any[][]}
 */
export function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Turn a Commons file name into a filesystem-safe local file name, keeping
 * its original extension.
 * @param {string} fileName
 * @returns {string}
 */
export function safeLocalFileName(fileName) {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return `${sanitizeFilename(base)}${ext.toLowerCase()}`;
}

/**
 * Should this mime/size combination be skipped rather than downloaded?
 * @param {string|null} mime
 * @param {number|null} size bytes
 * @returns {boolean}
 */
export function shouldSkipMime(mime, size) {
  if (!mime) return false;
  if (SKIP_MIMES.has(mime)) return true;
  if (mime === "image/tiff" && typeof size === "number" && size > TIFF_SIZE_LIMIT) return true;
  return false;
}

/**
 * Parse an action=query&prop=imageinfo response (formatversion=2) into a map
 * keyed by the *requested* title (before MediaWiki normalization), handling
 * `normalized` renames and `missing` pages.
 * @param {object} json raw parsed JSON response
 * @param {string[]} requestedTitles the "File:..." titles that were requested
 * @returns {Map<string, object>} requested title -> { missing } | { missing:false, ...info }
 */
export function mapImageInfoResults(json, requestedTitles) {
  const normalizedMap = new Map();
  for (const n of json?.query?.normalized ?? []) normalizedMap.set(n.from, n.to);

  const pagesByTitle = new Map();
  for (const p of json?.query?.pages ?? []) pagesByTitle.set(p.title, p);

  const results = new Map();
  for (const title of requestedTitles) {
    const resolvedTitle = normalizedMap.get(title) ?? title;
    const page = pagesByTitle.get(resolvedTitle);
    if (!page || page.missing || !page.imageinfo?.length) {
      results.set(title, { missing: true });
      continue;
    }
    const info = page.imageinfo[0];
    const meta = info.extmetadata ?? {};
    results.set(title, {
      missing: false,
      url: info.url ?? null,
      width: info.width ?? null,
      height: info.height ?? null,
      mime: info.mime ?? null,
      size: typeof info.size === "number" ? info.size : null,
      artist: meta.Artist?.value ? stripWikiMarkup(meta.Artist.value) : null,
      licence: meta.LicenseShortName?.value ?? null,
      licenceUrl: meta.LicenseUrl?.value ?? null,
      description: meta.ImageDescription?.value ? stripWikiMarkup(meta.ImageDescription.value) : null,
    });
  }
  return results;
}

/**
 * Resume check: is a file already downloaded at the expected size?
 * @param {string} localFile
 * @param {number|null} expectedBytes
 * @returns {Promise<boolean>}
 */
export async function isAlreadyDownloaded(localFile, expectedBytes) {
  try {
    const st = await stat(localFile);
    if (!st.isFile() || st.size === 0) return false;
    if (typeof expectedBytes === "number" && expectedBytes > 0) {
      return st.size === expectedBytes;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stage 1: discovery (reuses fetch-images.mjs's lookup logic; no downloads)
// ---------------------------------------------------------------------------

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readOptionalCache() {
  if (FORCE_DISCOVER) return null;
  try {
    return await loadJson(IMAGE_LIST_CACHE);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

const DISCOVERY_CONCURRENCY = 6;

/**
 * Run fn over items with at most `limit` in flight; results keep input order.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function discoverFileList() {
  const cached = await readOptionalCache();
  if (cached) {
    console.log(`Discovery: using cached list (${cached.length} files) from ${IMAGE_LIST_CACHE}.`);
    return cached;
  }

  console.log("Discovery: building the file list from Commons (no cache found)...");
  const breeds = await loadJson(path.join(DATA_DIR, "breeds.json"));
  const diseases = await loadJson(path.join(DATA_DIR, "diseases.json"));
  const loadCurated = (name) => loadJson(path.join(DATA_DIR, "curated", `${name}.json`));
  const foods = await loadCurated("food-safety");
  const predators = await loadCurated("predators");
  const toxicPlants = await loadCurated("toxic-plants");
  const safePlants = await loadCurated("safe-forage-plants");

  const list = [];
  const seen = new Set();
  const add = (entityType, entityId, file, role) => {
    const key = `${entityType}|${entityId}|${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ entity_type: entityType, entity_id: entityId, file, role });
  };

  // Breeds are looked up DISCOVERY_CONCURRENCY at a time; results are added in
  // breed order afterwards so the cached list stays stable between runs.
  let scanned = 0;
  const breedResults = await mapWithConcurrency(breeds, DISCOVERY_CONCURRENCY, async (breed) => {
    let candidates = [];
    try {
      candidates = await resolveCommonsCategory(breed.name);
    } catch {
      // no gallery for this breed; lead image (if any) is still queued
    }
    scanned += 1;
    if (scanned % 25 === 0) console.log(`Discovery: ${scanned}/${breeds.length} breeds scanned.`);
    return candidates;
  });
  breeds.forEach((breed, i) => {
    const leadFile = breed.image?.file ?? null;
    const exclude = new Set(leadFile ? [leadFile] : []);
    if (leadFile) add("breeds", breed.id, leadFile, "main");
    const selected = selectGalleryFiles(breedResults[i], exclude, MAX_GALLERY_PER_BREED);
    for (const file of selected) add("breeds", breed.id, file, "gallery");
  });

  const leadSets = [
    { type: "foods", entities: foods },
    { type: "predators", entities: predators },
    { type: "toxic-plants", entities: toxicPlants },
    { type: "safe-forage-plants", entities: safePlants },
    { type: "diseases", entities: diseases },
  ];
  for (const { type, entities } of leadSets) {
    const leads = await mapWithConcurrency(entities, DISCOVERY_CONCURRENCY, async (entity) => {
      try {
        let fileName = await fetchPageLeadImage(entity.wikipedia_title ?? entity.name);
        if (!fileName && entity.scientific_name) {
          fileName = await fetchPageLeadImage(entity.scientific_name);
        }
        return fileName;
      } catch {
        return null; // skip; not fatal to discovery
      }
    });
    entities.forEach((entity, i) => {
      if (leads[i]) add(type, entity.id, leads[i], "main");
    });
    console.log(`Discovery: ${type} done.`);
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(IMAGE_LIST_CACHE, JSON.stringify(list, null, 2) + "\n", "utf8");
  console.log(`Discovery: ${list.length} files found across ${breeds.length} breeds + curated entities. Cached to ${IMAGE_LIST_CACHE}.`);
  return list;
}

// ---------------------------------------------------------------------------
// Stage 2: resolve original URLs via batched imageinfo calls
// ---------------------------------------------------------------------------

let throttleUntil = 0;

/**
 * fetch() with Wikimedia-policy User-Agent, 429/503 Retry-After handling and
 * a temporary concurrency throttle after a rate limit.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}) {
  let attempt = 0;
  let lastError;
  while (attempt <= MAX_RETRIES) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { "User-Agent": UPLOAD_HOST_UA, ...(options.headers || {}) },
      });
      if (res.status === 429 || res.status === 503) {
        attempt += 1;
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : DEFAULT_RETRY_AFTER_SEC;
        const waitSec = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec : DEFAULT_RETRY_AFTER_SEC;
        throttleUntil = Date.now() + 60_000; // ease off concurrency for a minute
        if (attempt > MAX_RETRIES) return res;
        await sleep(waitSec * 1000);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (attempt > MAX_RETRIES) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

/**
 * Resolve imageinfo (url/size/mime/extmetadata) for every unique file name,
 * batching up to BATCH_SIZE titles per request.
 * @param {string[]} fileNames bare file names (no "File:" prefix)
 * @returns {Promise<Map<string, object>>} bare file name -> info (or {missing:true})
 */
async function resolveImageInfo(fileNames) {
  const unique = [...new Set(fileNames)];
  const titles = unique.map((f) => `File:${f}`);
  const batches = chunkArray(titles, BATCH_SIZE);
  const result = new Map();

  let batchNum = 0;
  for (const batch of batches) {
    batchNum += 1;
    // POST keeps 50 long file names out of the URL; long GETs got connection resets.
    const body = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      titles: batch.join("|"),
      format: "json",
      formatversion: "2",
    });

    let json;
    try {
      const res = await fetchWithRetry(COMMONS_API, { method: "POST", body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
    } catch (err) {
      // One bad batch must not end the run; its files are recorded as failed.
      console.log(`Resolve: batch ${batchNum}/${batches.length} failed (${err.cause?.code ?? err.message}).`);
      for (const title of batch) result.set(title.replace(/^File:/, ""), { missing: true, error: String(err.cause?.code ?? err.message) });
      continue;
    }
    const batchResult = mapImageInfoResults(json, batch);
    for (const [title, info] of batchResult) {
      result.set(title.replace(/^File:/, ""), info);
    }
    console.log(`Resolve: batch ${batchNum}/${batches.length} (${batch.length} titles).`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stage 3: parallel streaming download
// ---------------------------------------------------------------------------

async function downloadOriginal(url, localFile) {
  await mkdir(path.dirname(localFile), { recursive: true });
  const partFile = `${localFile}.part`;
  const res = await fetchWithRetry(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(partFile));
  await rename(partFile, localFile);
}

function formatRate(count, ms) {
  const minutes = ms / 60000;
  return minutes > 0 ? (count / minutes).toFixed(1) : "0.0";
}

async function main() {
  await mkdir(ORIGINALS_DIR, { recursive: true });

  const fileList = await discoverFileList();
  const infoMap = await resolveImageInfo(fileList.map((f) => f.file));

  // Build download tasks, deduping by local path (same file can appear as
  // lead + gallery, or be shared across entities).
  const tasks = [];
  const seenLocal = new Set();
  const skipped = [];
  const missing = [];
  for (const item of fileList) {
    const info = infoMap.get(item.file);
    if (!info || info.missing) {
      missing.push({ ...item, error: info?.error ?? "missing on Commons" });
      continue;
    }
    if (!info.url) {
      missing.push({ ...item, error: "no original url in imageinfo" });
      continue;
    }
    if (shouldSkipMime(info.mime, info.size)) {
      skipped.push({ ...item, mime: info.mime, size: info.size });
      continue;
    }
    const localFile = path.join(ORIGINALS_DIR, item.entity_type, item.entity_id, safeLocalFileName(item.file));
    if (seenLocal.has(localFile)) continue;
    seenLocal.add(localFile);
    tasks.push({ item, info, localFile });
  }

  console.log(
    `Resolved ${infoMap.size} unique files: ${tasks.length} to download, ${skipped.length} skipped (mime), ${missing.length} missing/failed.`
  );

  const manifest = [];
  const failed = [...missing];
  let done = 0;
  let totalBytes = 0;
  let sinceFlush = 0;
  const startedAt = Date.now();

  const persist = async () => {
    await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await writeFile(FAILED_FILE, JSON.stringify(failed, null, 2) + "\n", "utf8");
  };

  let cursor = 0;
  async function worker(workerId) {
    while (cursor < tasks.length) {
      const myIndex = cursor;
      cursor += 1;
      const { item, info, localFile } = tasks[myIndex];

      // Ease off after a rate limit: higher-numbered workers pause.
      if (Date.now() < throttleUntil && workerId >= 2) {
        await sleep(2000);
      }

      try {
        const already = await isAlreadyDownloaded(localFile, info.size);
        if (!already) {
          await downloadOriginal(info.url, localFile);
        }
        const st = await stat(localFile);
        manifest.push({
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          file: item.file,
          commons_page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item.file)}`,
          original_url: info.url,
          local_path: path.relative(process.cwd(), localFile).replace(/\\/g, "/"),
          width: info.width,
          height: info.height,
          bytes: st.size,
          mime: info.mime,
          artist: info.artist,
          licence: info.licence,
          licence_url: info.licenceUrl,
          description: info.description,
        });
        totalBytes += st.size;
      } catch (err) {
        failed.push({ ...item, error: err.message });
      }

      done += 1;
      sinceFlush += 1;
      if (done % PROGRESS_EVERY === 0 || done === tasks.length) {
        const elapsedMs = Date.now() - startedAt;
        console.log(
          `Progress: ${done}/${tasks.length} done, ${(totalBytes / (1024 * 1024)).toFixed(1)} MB, ${formatRate(done, elapsedMs)} files/min.`
        );
      }
      if (sinceFlush >= MANIFEST_FLUSH_EVERY) {
        sinceFlush = 0;
        await persist();
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);
  await persist();

  const elapsedMin = (Date.now() - startedAt) / 60000;
  console.log(
    `Done. ${manifest.length} originals saved (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) in ${elapsedMin.toFixed(1)} min. ` +
      `Skipped (mime): ${skipped.length}. Failed/missing: ${failed.length}.`
  );
  if (failed.length) {
    console.log(`Failures logged to ${FAILED_FILE}.`);
  }
}

if (process.argv[1]?.endsWith("fetch-originals.mjs")) {
  main().catch((err) => {
    console.error("fetch-originals failed:", err);
    process.exitCode = 1;
  });
}
