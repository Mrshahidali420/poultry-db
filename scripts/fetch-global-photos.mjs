#!/usr/bin/env node
// Best original photo for each DAD-IS breed that has an English Wikipedia
// article, for the global breed pages.
//
// Fast method, same as fetch-originals.mjs:
//   1. match: POST 50 candidate titles per request to the en.wikipedia API
//      ("<name> chicken", "<name> (chicken)", "<name>"), redirects followed,
//      and keep a page only when its short description says chicken/fowl.
//   2. list every image on the matched pages (50 pages per request) and
//      resolve imageinfo for all of them in 50-title POST batches. The
//      en.wikipedia API answers for Commons files, so commons.wikimedia.org
//      (blocked on this machine) is never needed.
//   3. pick the largest sharp JPEG (lead image first when it is big enough,
//      else the biggest JPEG whose file name carries the breed name) and
//      download a 1920px rendition (or the original when smaller) with 6
//      parallel streamed downloads, Range resume and a 60s stall abort.
//
// Breeds already covered by the 217 full breed pages (data/breed-dadis-links.json)
// are skipped: those pages have their own photos.
//
// Output: data/images-original/global/<key>.jpg (gitignored) and the manifest
// data/images-original-global.json (source page, file page, author, licence).

import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { breedKey } from "./lib/match.mjs";
import { linkKey } from "./lib/dadis-full.mjs";

const API = "https://en.wikipedia.org/w/api.php";
const UA = "poultry-db/0.2 (https://github.com/Mrshahidali420/poultry-db)";
const OUT_DIR = path.resolve("data/images-original/global");
const MANIFEST = path.resolve("data/images-original-global.json");
const BATCH = 50;
const DOWNLOAD_CONCURRENCY = 6;
const STALL_MS = 60_000;
const TARGET_WIDTH = 1920;
const MIN_WIDTH = 800;

// Search hits checked by eye and found to be a different breed (29 Sep 2026).
export const WRONG_MATCHES = new Set([
  "bergische zwerg kraher", // Bergischer Kraeher, not Schlotterkamm
  "irish pit game",
  "modern game miniature", // Modern Game is not Old English Game
  "new langshan",
  "coucou de france", // not Coucou de Rennes
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function titleCase(name) {
  return String(name).trim().replace(/^./, (c) => c.toUpperCase());
}

export function candidateTitles(name) {
  const base = titleCase(name.replace(/\s+/g, " "));
  if (!base || base.length < 3) return [];
  const out = [`${base} chicken`, `${base} (chicken)`, base];
  if (/\bchicken\b/i.test(base)) out.splice(0, 2);
  return out;
}

export function isChickenPage(page) {
  const desc = page?.pageprops?.["wikibase-shortdesc"] || "";
  if (!desc || /disambiguation/i.test(desc)) return false;
  // a breed (or strain/landrace) article, never a type, species, sport or dish
  if (/\b(dish|food|recipe|sport|species|type of|genus)\b/i.test(desc)) return false;
  return /\b(chicken|fowl|bantam|poultry)s?\b/i.test(desc) && /\b(breeds?|bantam|landrace|strain|hybrid|chicken)\b/i.test(desc);
}

/** Loose name overlap for fuzzy search hits: a 5-letter prefix of any name token in the title. */
export function titleOverlaps(title, tokens) {
  const t = breedKey(title);
  return tokens.some((tok) => t.includes(tok.slice(0, Math.min(5, tok.length))));
}

const NAME_STOP = new Set(["chicken", "hen", "cock", "rooster", "local", "the", "and", "fowl", "breed", "bantam", "de", "la", "le"]);

export function nameTokens(name) {
  return breedKey(name)
    .split(" ")
    .filter((t) => t.length > 2 && !NAME_STOP.has(t));
}

/**
 * Pick the best image from resolved imageinfo candidates.
 * @param {Array<{file:string, width:number, height:number, mime:string, lead?:boolean}>} infos
 * @param {string[]} tokens breed name tokens
 */
export function pickBest(infos, tokens) {
  const jpegs = infos.filter((i) => i && i.mime === "image/jpeg" && i.width >= MIN_WIDTH && i.height >= 500);
  if (!jpegs.length) return null;
  const hasName = (i) => tokens.some((t) => i.file.toLowerCase().replace(/[_-]/g, " ").includes(t));
  const bad = (i) => /\b(map|logo|egg|eggs|chick|skeleton|stamp|coat of arms|flag|drawing|illustration|painting|plate|village|panoramio|landscape|market|temple|street)\b/i.test(i.file.replace(/[_.-]/g, " "));
  const pool = jpegs.filter((i) => !bad(i));
  if (!pool.length) return null;
  const lead = pool.find((i) => i.lead);
  if (lead && lead.width >= 1200) return lead;
  const named = pool.filter(hasName).sort((a, b) => b.width * b.height - a.width * a.height);
  if (named.length && (!lead || named[0].width > lead.width)) return named[0];
  return lead || named[0] || null;
}

async function api(params, attempt = 1) {
  const body = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  try {
    const res = await fetch(API, { method: "POST", body, headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 5) throw err;
    await sleep(1500 * attempt);
    return api(params, attempt + 1);
  }
}

async function matchPages(groups) {
  // title -> [groupKey]
  const titleToKeys = new Map();
  for (const g of groups) {
    for (const t of g.titles) {
      if (!titleToKeys.has(t)) titleToKeys.set(t, []);
      titleToKeys.get(t).push(g.key);
    }
  }
  const titles = [...titleToKeys.keys()];
  const resolved = new Map(); // requested title -> page
  for (const batch of chunk(titles, BATCH)) {
    const json = await api({ action: "query", titles: batch.join("|"), redirects: "1", prop: "pageimages|pageprops", piprop: "name", ppprop: "wikibase-shortdesc" });
    const q = json.query || {};
    const map = new Map(batch.map((t) => [t, t]));
    for (const n of q.normalized || []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of q.redirects || []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const [req, final] of map) {
      const page = pages.get(final);
      if (page && !page.missing && isChickenPage(page)) resolved.set(req, page);
    }
  }
  const out = new Map(); // groupKey -> page
  for (const g of groups) {
    for (const t of g.titles) {
      const page = resolved.get(t);
      if (page) {
        out.set(g.key, page);
        break;
      }
    }
  }
  return out;
}

/**
 * Second pass for names with no exact title: one full-text search per name
 * ("<name> chicken", 8 in flight), then a batched pageprops check. A hit counts
 * only when it is a chicken breed article whose title shares a name token.
 */
async function searchPages(groups) {
  const SEARCH_CONCURRENCY = 8;
  const hits = new Map(); // key -> [titles]
  let cursor = 0;
  await Promise.all(
    Array.from({ length: SEARCH_CONCURRENCY }, async () => {
      while (cursor < groups.length) {
        const g = groups[cursor++];
        const name = [...g.names][0];
        if (!nameTokens(name).length) continue;
        try {
          const json = await api({ action: "query", list: "search", srsearch: `${name} chicken breed`, srlimit: "3", srnamespace: "0", srprop: "" });
          hits.set(g.key, (json.query?.search || []).map((s) => s.title));
        } catch {
          // one failed search only costs that breed its photo
        }
      }
    }),
  );
  const titles = [...new Set([...hits.values()].flat())];
  const pages = new Map();
  for (const batch of chunk(titles, BATCH)) {
    const json = await api({ action: "query", titles: batch.join("|"), prop: "pageimages|pageprops", piprop: "name", ppprop: "wikibase-shortdesc" });
    for (const p of json.query?.pages || []) if (!p.missing) pages.set(p.title, p);
  }
  const out = new Map();
  for (const g of groups) {
    const tokens = [...new Set([...g.names].flatMap(nameTokens))];
    const hit = (hits.get(g.key) || []).map((t) => pages.get(t)).find((p) => p && isChickenPage(p) && titleOverlaps(p.title, tokens));
    if (hit) out.set(g.key, hit);
  }
  return out;
}

async function pageImages(pageTitles) {
  const out = new Map(pageTitles.map((t) => [t, new Set()]));
  for (const batch of chunk(pageTitles, BATCH)) {
    let cont = {};
    for (let guard = 0; guard < 40; guard++) {
      const json = await api({ action: "query", titles: batch.join("|"), prop: "images", imlimit: "max", ...cont });
      for (const p of json.query?.pages || []) for (const im of p.images || []) out.get(p.title)?.add(im.title.replace(/^File:/, ""));
      if (!json.continue) break;
      cont = json.continue;
    }
  }
  return out;
}

async function imageInfo(files) {
  const out = new Map();
  for (const batch of chunk([...new Set(files)], BATCH)) {
    const json = await api({
      action: "query",
      titles: batch.map((f) => `File:${f}`).join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: String(TARGET_WIDTH),
      iiextmetadatafilter: "Artist|LicenseShortName",
    });
    const norm = new Map((json.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const p of json.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const file = (norm.get(p.title) || p.title).replace(/^File:/, "");
      const strip = (s) => (s ? String(s).replace(/<[^>]+>/g, "").trim() : null);
      out.set(file, {
        file,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        size: ii.size,
        original_url: ii.url,
        download_url: ii.width > TARGET_WIDTH && ii.thumburl ? ii.thumburl : ii.url,
        download_width: ii.width > TARGET_WIDTH && ii.thumbwidth ? ii.thumbwidth : ii.width,
        file_page: ii.descriptionurl,
        author: strip(ii.extmetadata?.Artist?.value),
        licence: strip(ii.extmetadata?.LicenseShortName?.value),
      });
    }
  }
  return out;
}

/** Streamed download with Range resume and a stall abort. */
async function download(url, file) {
  const part = `${file}.part`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let have = 0;
    try {
      have = (await stat(part)).size;
    } catch {}
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(new Error("stall")), STALL_MS);
    try {
      const headers = { "User-Agent": UA, ...(have ? { Range: `bytes=${have}-` } : {}) };
      const res = await fetch(url, { headers, signal: controller.signal });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const append = res.status === 206 && have > 0;
      const ws = createWriteStream(part, { flags: append ? "a" : "w" });
      for await (const chunkBuf of res.body) {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(new Error("stall")), STALL_MS);
        if (!ws.write(chunkBuf)) await new Promise((r) => ws.once("drain", r));
      }
      await new Promise((r, j) => ws.end((e) => (e ? j(e) : r())));
      clearTimeout(timer);
      await rename(part, file);
      return (await stat(file)).size;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 5) throw err;
      await sleep(String(err.message).includes("429") ? 20_000 : 1500 * attempt);
    }
  }
  return 0;
}

async function exists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

async function main() {
  const t0 = Date.now();
  const full = JSON.parse(await readFile("data/breeds_global_full.json", "utf8"));
  const links = JSON.parse(await readFile("data/breed-dadis-links.json", "utf8"));
  const covered = new Set(links.flatMap((l) => l.dadis_ids));

  const groups = new Map();
  for (const b of full.breeds) {
    const key = linkKey(b);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, names: new Set(), ids: [], covered: false });
    const g = groups.get(key);
    g.names.add(b.transboundary_name || b.name);
    g.names.add(b.name);
    g.ids.push(b.id);
    if (covered.has(b.id)) g.covered = true;
  }
  const todo = [...groups.values()].filter((g) => !g.covered);
  for (const g of todo) g.titles = [...new Set([...g.names].flatMap(candidateTitles))];
  console.log(`${groups.size} breed name groups, ${groups.size - todo.length} already covered by full breed pages, ${todo.length} to match.`);

  const matched = await matchPages(todo);
  const direct = matched.size;
  const bySearch = await searchPages(todo.filter((g) => !matched.has(g.key)));
  for (const [k, page] of bySearch) matched.set(k, page);
  console.log(`matched ${matched.size} to an English Wikipedia chicken article (${direct} by title, ${bySearch.size} by search, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  const pageTitles = [...new Set([...matched.values()].map((p) => p.title))];
  const imgs = await pageImages(pageTitles);
  const leadByPage = new Map([...matched.values()].map((p) => [p.title, p.pageimage]));
  const allFiles = [...imgs.values()].flatMap((s) => [...s]).filter((f) => /\.jpe?g$/i.test(f));
  const infos = await imageInfo(allFiles);
  console.log(`resolved ${infos.size} JPEG candidates on ${pageTitles.length} pages`);

  const plan = [];
  const noPhoto = [];
  for (const g of todo) {
    const page = matched.get(g.key);
    if (!page || WRONG_MATCHES.has(g.key)) continue;
    const files = [...(imgs.get(page.title) || [])];
    const cands = files.map((f) => infos.get(f)).filter(Boolean).map((i) => ({ ...i, lead: i.file.replace(/ /g, "_") === (leadByPage.get(page.title) || "").replace(/ /g, "_") }));
    const tokens = [...new Set([...g.names].flatMap(nameTokens))];
    const best = pickBest(cands, tokens);
    if (!best) {
      noPhoto.push({ key: g.key, page: page.title });
      continue;
    }
    const slug = g.key.replace(/\s+/g, "-");
    plan.push({ key: g.key, slug, ids: g.ids, page, best, local: path.join(OUT_DIR, `${slug}.jpg`) });
  }

  // several groups can land on the same article; download each file once
  await mkdir(OUT_DIR, { recursive: true });
  const byUrl = new Map();
  for (const p of plan) if (!byUrl.has(p.best.download_url)) byUrl.set(p.best.download_url, p);
  const queue = [...byUrl.values()];
  let bytes = 0;
  let done = 0;
  let cursor = 0;
  const failed = [];
  await Promise.all(
    Array.from({ length: DOWNLOAD_CONCURRENCY }, async () => {
      while (cursor < queue.length) {
        const p = queue[cursor++];
        try {
          if (!(await exists(p.local))) {
            const n = await download(p.best.download_url, p.local);
            bytes += n;
          }
        } catch (err) {
          failed.push({ key: p.key, url: p.best.download_url, error: String(err.message || err) });
        }
        if (++done % 20 === 0) console.log(`  downloaded ${done}/${queue.length} (${(bytes / 1e6).toFixed(1)} MB)`);
      }
    }),
  );
  const failedUrls = new Set(failed.map((f) => f.url));

  const entries = plan
    .filter((p) => !failedUrls.has(p.best.download_url))
    .map((p) => {
      const owner = byUrl.get(p.best.download_url);
      return {
        key: p.key,
        dadis_ids: p.ids.sort(),
        file: path.relative(path.resolve("data"), owner.local).replace(/\\/g, "/"),
        width: p.best.download_width,
        wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.page.title.replace(/ /g, "_"))}`,
        wikipedia_title: p.page.title,
        shortdesc: p.page.pageprops?.["wikibase-shortdesc"] || null,
        source_url: p.best.file_page,
        original_url: p.best.original_url,
        download_url: p.best.download_url,
        author: p.best.author,
        licence: p.best.licence,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  await writeFile(
    MANIFEST,
    JSON.stringify({ generated_at: new Date().toISOString(), method: "en.wikipedia API match + imageinfo, 1920px rendition", count: entries.length, photos: entries, matched_without_photo: noPhoto, failed }, null, 2) + "\n",
    "utf8",
  );
  const breedsWithPhoto = entries.reduce((n, e) => n + e.dadis_ids.length, 0);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${entries.length} name groups with a photo (${breedsWithPhoto} DAD-IS records), ${queue.length - failed.length} files, ${(bytes / 1e6).toFixed(1)} MB downloaded now, ${noPhoto.length} matched without a usable photo, ${failed.length} failed.`);
}

if (process.argv[1]?.endsWith("fetch-global-photos.mjs")) {
  main().catch((err) => {
    console.error("fetch-global-photos failed:", err);
    process.exitCode = 1;
  });
}
