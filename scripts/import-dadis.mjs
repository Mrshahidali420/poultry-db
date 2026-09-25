#!/usr/bin/env node
// FAO DAD-IS chicken breed populations -> data/breeds_global.json.
//
// This step is MANUAL-THEN-PARSE. The DAD-IS export is a browser app
// (https://dadis-hub-ws.web.app/?app=breeds-export), not a fetchable file,
// and we don't automate a browser session for it. Export by hand (steps in
// README), drop the file in imports/dad-is/ (.csv or .xlsx), then run this.
// With no export present it logs that and exits 0.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./lib/csv.mjs";
import { readXlsxRows } from "./lib/xlsx.mjs";
import { parseDadisRows, DADIS_URL } from "./lib/dadis.mjs";
import { buildBreedIndex } from "./lib/match.mjs";

const EXPORT_DIR = path.resolve("imports/dad-is");
const DATA_DIR = path.resolve("data");
const OUT_FILE = path.join(DATA_DIR, "breeds_global.json");

async function main() {
  await mkdir(EXPORT_DIR, { recursive: true });
  const files = (await readdir(EXPORT_DIR)).filter((f) => /\.(csv|xlsx)$/i.test(f)).sort();
  if (!files.length) {
    console.log("skipped: no DAD-IS export in imports/dad-is/ (manual export step, see README)");
    try {
      await readFile(OUT_FILE, "utf8");
    } catch {
      await writeFile(OUT_FILE, "[]\n", "utf8");
    }
    return;
  }

  const breeds = JSON.parse(await readFile(path.join(DATA_DIR, "breeds.json"), "utf8"));
  const index = buildBreedIndex(breeds);
  const rows = [];
  for (const file of files) {
    const full = path.join(EXPORT_DIR, file);
    const parsed = file.toLowerCase().endsWith(".xlsx")
      ? readXlsxRows(await readFile(full))
      : parseCsv(await readFile(full, "utf8"));
    console.log(`  ${file}: ${parsed.length} rows`);
    rows.push(...parsed);
  }

  const records = parseDadisRows(rows, index);
  await writeFile(OUT_FILE, JSON.stringify(records, null, 2) + "\n", "utf8");

  const sourcesFile = path.join(DATA_DIR, "sources.json");
  const sources = JSON.parse(await readFile(sourcesFile, "utf8").catch(() => "[]"));
  if (!sources.some((s) => s.url === DADIS_URL)) {
    sources.push({ url: DADIS_URL, type: "breed_populations", publisher: "FAO DAD-IS", license: "FAO terms of use", fetched_at: new Date().toISOString() });
    sources.sort((a, b) => a.url.localeCompare(b.url));
    await writeFile(sourcesFile, JSON.stringify(sources, null, 2) + "\n", "utf8");
  }

  const linked = records.filter((r) => r.breed_id).length;
  console.log(`Done. ${records.length} chicken breed populations, ${linked} linked to data/breeds.json.`);
}

main().catch((err) => {
  console.error("import-dadis failed:", err);
  process.exitCode = 1;
});
