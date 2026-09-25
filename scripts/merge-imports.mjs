#!/usr/bin/env node
// Merges outside research rows from imports/ into breeds_extra.json and
// diseases_extra.json.
//
// Row schema (JSON array of objects, or CSV with this header):
//   entity_id, field, value, source_url   (+ optional entity_type, origin)
//
// Rules (see lib/provenance.mjs):
//   - imported values are tagged with their origin (default "chatgpt-import")
//     and needs_review: true
//   - they only fill fields that are empty; they never overwrite a Wikipedia
//     infobox value or an extracted fact with its own source_url
//   - between imports, a stronger origin may replace a weaker one
//     (chatgpt-import beats github:iamthechickenlady-netizen/chicken-dictionary)

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./lib/csv.mjs";
import { mergeImportRow, originRank, ORIGIN_CHATGPT } from "./lib/provenance.mjs";
import { BREED_EXTRA_SCHEMA, DISEASE_EXTRA_SCHEMA, toProvenanceShape } from "./lib/schemas.mjs";

const DATA_DIR = path.resolve("data");
const IMPORTS_DIR = path.resolve("imports");

/** CSV cells arrive as strings; turn obvious booleans, numbers and JSON arrays into values. */
export function coerceValue(raw) {
  if (typeof raw !== "string") return raw;
  const text = raw.trim();
  if (text === "") return null;
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export async function loadImportRows(dir = IMPORTS_DIR) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => /\.(json|csv)$/i.test(f)).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const rows = [];
  for (const file of files) {
    const text = await readFile(path.join(dir, file), "utf8");
    const parsed = file.toLowerCase().endsWith(".csv") ? parseCsv(text) : JSON.parse(text);
    parsed.forEach((row, index) => {
      if (!row.entity_id || !row.field) return;
      rows.push({
        ...row,
        value: coerceValue(row.value),
        origin: row.origin || ORIGIN_CHATGPT,
        _file: file,
        _index: index,
      });
    });
  }
  // Strongest origin first, so weaker imports only see the gaps left over.
  return rows.sort((a, b) =>
    originRank(b.origin) - originRank(a.origin) ||
    a._file.localeCompare(b._file) ||
    a._index - b._index
  );
}

async function main() {
  const rows = await loadImportRows();
  if (rows.length === 0) {
    console.log("No import rows in imports/; nothing to merge.");
    return;
  }

  const load = async (name) => JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8"));
  const breeds = new Map((await load("breeds.json")).map((b) => [b.id, b]));
  const breedExtra = new Map((await load("breeds_extra.json")).map((r) => [r.id, toProvenanceShape(r, BREED_EXTRA_SCHEMA)]));
  const diseaseExtra = new Map((await load("diseases_extra.json")).map((r) => [r.id, toProvenanceShape(r, DISEASE_EXTRA_SCHEMA)]));

  const tally = {};
  const count = (origin, action) => {
    tally[origin] ??= {};
    tally[origin][action] = (tally[origin][action] ?? 0) + 1;
  };

  for (const row of rows) {
    const { _file, _index, entity_type, needs_review, ...clean } = row;
    const isDisease = entity_type === "disease" || (!breedExtra.has(row.entity_id) && diseaseExtra.has(row.entity_id));
    const target = isDisease ? diseaseExtra : breedExtra;
    const extraRecord = target.get(row.entity_id);
    if (!extraRecord) {
      count(row.origin, "unknown-entity");
      continue;
    }
    const { record, action } = mergeImportRow({
      extraRecord,
      infoboxRecord: isDisease ? null : breeds.get(row.entity_id) ?? null,
      row: clean,
    });
    target.set(row.entity_id, record);
    count(row.origin, action);
  }

  const write = async (name, map) => {
    const sorted = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
    await writeFile(path.join(DATA_DIR, name), JSON.stringify(sorted, null, 2) + "\n", "utf8");
  };
  await write("breeds_extra.json", breedExtra);
  await write("diseases_extra.json", diseaseExtra);

  console.log(`Merged ${rows.length} import rows:`);
  for (const [origin, actions] of Object.entries(tally)) {
    const summary = Object.entries(actions).map(([a, n]) => `${a} ${n}`).join(", ");
    console.log(`  ${origin}: ${summary}`);
  }
}

if (process.argv[1]?.endsWith("merge-imports.mjs")) {
  main().catch((err) => {
    console.error("merge-imports failed:", err);
    process.exitCode = 1;
  });
}
