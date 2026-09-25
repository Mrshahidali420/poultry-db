#!/usr/bin/env node
// USDA NASS Quick Stats, chickens and eggs by US state. The Quick Stats API
// needs a key, but NASS also publishes keyless bulk files at
// https://www.nass.usda.gov/datasets/. The animals/products file is ~440 MB
// gzipped, so it is streamed and filtered on the fly and never written to disk.
//
// Kept: SURVEY data, STATE level, ANNUAL, DOMAIN TOTAL, commodity CHICKENS or
// EGGS, latest 10 years. Output data/stats_us_states.json in long form
// (one row per state/year/series) so no series names are guessed.
// Public domain (US government work). Skips when under 30 days old.

import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { politeFetch } from "./lib/http.mjs";

const DATASETS_URL = "https://www.nass.usda.gov/datasets/";
const DATA_DIR = path.resolve("data");
const OUT_FILE = path.join(DATA_DIR, "stats_us_states.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const YEARS = 10;
const FORCE = process.argv.includes("--force");

async function isFresh() {
  if (FORCE) return false;
  try {
    return Date.now() - (await stat(OUT_FILE)).mtimeMs < THIRTY_DAYS_MS;
  } catch {
    return false;
  }
}

async function findBulkUrl() {
  const response = await politeFetch(DATASETS_URL);
  const html = await response.text();
  const match = /href="([^"]*qs\.animals_products_\d{8}\.txt\.gz)"/i.exec(html);
  return match ? new URL(match[1], DATASETS_URL).toString() : null;
}

const MAX_RECONNECTS = 5;

/**
 * Yield the file's bytes; if the server drops the connection mid-file,
 * reconnect with a Range header from the last byte received, so the gzip
 * stream continues where it stopped instead of starting over.
 */
async function* resumableBytes(url) {
  let offset = 0;
  let reconnects = 0;
  while (true) {
    const response = await politeFetch(url, offset ? { headers: { Range: `bytes=${offset}-` } } : {});
    if (offset === 0 && !response.ok) throw new Error(`HTTP ${response.status}`);
    if (offset > 0 && response.status !== 206) throw new Error(`server ignored Range resume (HTTP ${response.status})`);
    try {
      for await (const chunk of response.body) {
        offset += chunk.length;
        yield chunk;
      }
      return;
    } catch (err) {
      reconnects += 1;
      if (reconnects > MAX_RECONNECTS) throw err;
      console.log(`  connection dropped at ${(offset / 1e6).toFixed(0)} MB (${err.message}); resuming (${reconnects}/${MAX_RECONNECTS})`);
    }
  }
}

function parseValue(raw) {
  const cleaned = raw.replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null; // "(D)" = withheld
}

async function main() {
  if (await isFresh()) {
    console.log("stats_us_states.json is under 30 days old; skipping (use --force to refresh).");
    return;
  }

  let url;
  try {
    url = await findBulkUrl();
  } catch (err) {
    console.log(`skipped: NASS unreachable (${err.message})`);
    return;
  }
  if (!url) {
    console.log("skipped: no qs.animals_products bulk file listed on the NASS datasets page");
    return;
  }

  console.log(`Streaming ${url} ...`);
  const gunzip = createGunzip();
  let streamError = null;
  // Awaited after the read loop, so a failed download can never be mistaken
  // for a complete file (readline can end quietly when its input dies).
  const piping = pipeline(Readable.from(resumableBytes(url)), gunzip);
  piping.catch(() => {}); // handled below; avoids an unhandled-rejection crash meanwhile
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });

  let columns = null;
  let scanned = 0;
  const kept = [];
  try {
    for await (const line of lines) {
      handleLine(line);
    }
  } catch (err) {
    streamError ??= err;
  }
  try {
    await piping;
  } catch (err) {
    streamError ??= err;
  }
  if (streamError) {
    console.log(`skipped: NASS stream failed (${streamError.message}); keeping any previous stats_us_states.json`);
    return;
  }

  function handleLine(line) {
    const cells = line.split("\t");
    if (!columns) {
      columns = Object.fromEntries(cells.map((name, idx) => [name.trim(), idx]));
      return;
    }
    scanned += 1;
    const col = (name) => cells[columns[name]] ?? "";
    if (col("SOURCE_DESC") !== "SURVEY" || col("AGG_LEVEL_DESC") !== "STATE") return;
    if (col("FREQ_DESC") !== "ANNUAL" || col("DOMAIN_DESC") !== "TOTAL") return;
    const commodity = col("COMMODITY_DESC");
    if (commodity !== "CHICKENS" && commodity !== "EGGS") return;
    kept.push({
      state: col("STATE_NAME"),
      state_alpha: col("STATE_ALPHA"),
      year: Number(col("YEAR")),
      series: col("SHORT_DESC"),
      reference_period: col("REFERENCE_PERIOD_DESC"),
      unit: col("UNIT_DESC"),
      value: parseValue(col("VALUE")),
      value_raw: col("VALUE").trim(),
    });
  }

  const latest = kept.reduce((max, r) => Math.max(max, r.year), 0);
  const rows = kept
    .filter((r) => r.year > latest - YEARS)
    .sort((a, b) =>
      a.state.localeCompare(b.state) || a.year - b.year ||
      a.series.localeCompare(b.series) || a.reference_period.localeCompare(b.reference_period)
    );
  await writeFile(OUT_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");

  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8").catch(() => "[]"));
  if (!sources.some((s) => s.url === DATASETS_URL)) {
    sources.push({ url: DATASETS_URL, type: "statistics_dataset", publisher: "USDA NASS Quick Stats (bulk)", license: "Public domain (US government work)", fetched_at: new Date().toISOString() });
    sources.sort((a, b) => a.url.localeCompare(b.url));
    await writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2) + "\n", "utf8");
  }

  const series = new Set(rows.map((r) => r.series)).size;
  const states = new Set(rows.map((r) => r.state)).size;
  console.log(`Done. Scanned ${scanned} lines, kept ${rows.length} rows (${states} states, ${series} series, years ${latest - YEARS + 1}-${latest}).`);
}

main().catch((err) => {
  console.error("fetch-nass failed:", err);
  process.exitCode = 1;
});
