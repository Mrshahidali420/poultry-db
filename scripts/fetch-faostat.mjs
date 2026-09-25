#!/usr/bin/env node
// FAOSTAT (CC BY 4.0): chicken stocks, laying hens, hen egg production and
// chicken meat production by country and year, from the QCL bulk download.
// Output: data/stats_by_country.json, latest 10 years available.
// Skips when the output is under 30 days old unless --force. Exits 0 with a
// clear message if FAOSTAT cannot be reached.

import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { politeFetch } from "./lib/http.mjs";
import { listZipEntries, forEachZipEntryLine } from "./lib/minizip.mjs";
import { FaostatAccumulator } from "./lib/faostat.mjs";

const BULK_URL = "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip";
const DATA_DIR = path.resolve("data");
const OUT_FILE = path.join(DATA_DIR, "stats_by_country.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE = process.argv.includes("--force");

async function isFresh() {
  if (FORCE) return false;
  try {
    const s = await stat(OUT_FILE);
    return Date.now() - s.mtimeMs < THIRTY_DAYS_MS;
  } catch {
    return false;
  }
}

async function main() {
  if (await isFresh()) {
    console.log("stats_by_country.json is under 30 days old; skipping (use --force to refresh).");
    return;
  }

  console.log("Downloading FAOSTAT QCL bulk file...");
  let buffer;
  try {
    const response = await politeFetch(BULK_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.log(`skipped: FAOSTAT unreachable (${err.message})`);
    return;
  }

  const entry = listZipEntries(buffer).find((e) => /All_Data_\(Normalized\)\.csv$/i.test(e.name));
  if (!entry) {
    console.log("skipped: FAOSTAT zip did not contain the expected normalized CSV");
    return;
  }

  const acc = new FaostatAccumulator();
  await forEachZipEntryLine(buffer, entry, (line) => acc.addLine(line));
  const rows = acc.result({ years: 10 });
  await writeFile(OUT_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");

  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8").catch(() => "[]"));
  if (!sources.some((s) => s.url === BULK_URL)) {
    sources.push({ url: BULK_URL, type: "statistics_dataset", publisher: "FAOSTAT", license: "CC BY 4.0", fetched_at: new Date().toISOString() });
    sources.sort((a, b) => a.url.localeCompare(b.url));
    await writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2) + "\n", "utf8");
  }

  const countries = new Set(rows.map((r) => r.country)).size;
  const years = [...new Set(rows.map((r) => r.year))].sort();
  console.log(`Done. ${rows.length} rows, ${countries} countries, years ${years[0]}-${years.at(-1)}.`);
}

main().catch((err) => {
  console.error("fetch-faostat failed:", err);
  process.exitCode = 1;
});
