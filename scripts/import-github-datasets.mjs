#!/usr/bin/env node
// Turns the two cached GitHub breed datasets into facts (no LLM needed here):
//
// Harris730/Chicken_breed_dataset (chicken_breeds.csv, text from starmilling.com)
//   - breed_category ("BROWN LAYERS", ...) becomes a tag on breeds_extra.json
//   - breeds not in data/breeds.json go to data/breeds_missing.json for review
//   - the description text itself stays in cache/; enrich-llm.mjs reads it as
//     an extra source and extracts facts with source_url = starmilling.com
//
// iamthechickenlady-netizen/chicken-dictionary (src/breeds.ts)
//   - parsed straight into imports/github-chicken-dictionary.json rows
//     (entity_id, field, value, source_url, origin); merge-imports.mjs merges
//     them at the lowest priority.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./lib/csv.mjs";
import { buildBreedIndex, resolveBreedId } from "./lib/match.mjs";
import { parseChickenDictionary, toImportRows } from "./lib/chicken-dictionary.mjs";
import { ORIGIN_HARRIS730 } from "./lib/provenance.mjs";
import { BREED_EXTRA_SCHEMA, emptyBreedExtra, toProvenanceShape } from "./lib/schemas.mjs";

const DATA_DIR = path.resolve("data");
const IMPORTS_DIR = path.resolve("imports");
const HARRIS_CSV = path.resolve("cache/github/harris730-chicken_breeds.csv");
const DICTIONARY_TS = path.resolve("cache/github/chicken-dictionary-breeds.ts");
export const STARMILLING_URL = "https://starmilling.com/poultry-chicken-breeds/";

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Parse the cached Harris730 CSV and resolve each row to a breed id (or null). */
export async function loadHarris730Rows(breeds) {
  const text = await readOptional(HARRIS_CSV);
  if (!text) return null;
  const index = buildBreedIndex(breeds);
  return parseCsv(text)
    .filter((row) => row.breed_name)
    .map((row) => ({
      breed_name: row.breed_name.trim(),
      breed_category: row.breed_category?.trim() || null,
      description: row.description ?? "",
      image: row.image?.trim() || null,
      breed_id: resolveBreedId(index, row.breed_name),
    }));
}

async function main() {
  const breeds = JSON.parse(await readFile(path.join(DATA_DIR, "breeds.json"), "utf8"));
  const extraFile = path.join(DATA_DIR, "breeds_extra.json");
  const extra = JSON.parse(await readFile(extraFile, "utf8"));
  const extraById = new Map(extra.map((r) => [r.id, toProvenanceShape(r, BREED_EXTRA_SCHEMA)]));
  for (const b of breeds) if (!extraById.has(b.id)) extraById.set(b.id, emptyBreedExtra(b.id));

  // Harris730: tags + missing list.
  const harrisRows = await loadHarris730Rows(breeds);
  if (!harrisRows) {
    console.log("Harris730 CSV not in cache/ (run scripts/fetch-github-datasets.mjs); skipping it.");
  } else {
    const missing = new Map();
    let tagged = 0;
    for (const row of harrisRows) {
      if (!row.breed_id) {
        missing.set(row.breed_name.toLowerCase(), {
          name: row.breed_name,
          breed_category: row.breed_category,
          origin: ORIGIN_HARRIS730,
          source_url: STARMILLING_URL,
        });
        continue;
      }
      if (!row.breed_category) continue;
      const record = extraById.get(row.breed_id);
      const tags = new Set(record.tags ?? []);
      if (!tags.has(row.breed_category)) tagged += 1;
      tags.add(row.breed_category);
      extraById.set(row.breed_id, { ...record, tags: [...tags].sort() });
    }
    const missingList = [...missing.values()].sort((a, b) => a.name.localeCompare(b.name));
    await writeFile(path.join(DATA_DIR, "breeds_missing.json"), JSON.stringify(missingList, null, 2) + "\n", "utf8");
    const matched = harrisRows.filter((r) => r.breed_id).length;
    console.log(`Harris730: ${harrisRows.length} rows, ${matched} matched to data/breeds.json, ${missingList.length} missing (data/breeds_missing.json), ${tagged} new tags.`);
  }

  const sortedExtra = [...extraById.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(extraFile, JSON.stringify(sortedExtra, null, 2) + "\n", "utf8");

  // chicken-dictionary: import rows.
  const ts = await readOptional(DICTIONARY_TS);
  if (!ts) {
    console.log("chicken-dictionary breeds.ts not in cache/; skipping it.");
    return;
  }
  const index = buildBreedIndex(breeds);
  const parsed = parseChickenDictionary(ts);
  const rows = [];
  const unmatched = [];
  for (const breed of parsed) {
    const id = resolveBreedId(index, breed.name);
    if (!id) {
      unmatched.push(breed.name);
      continue;
    }
    rows.push(...toImportRows(id, breed));
  }
  rows.sort((a, b) => a.entity_id.localeCompare(b.entity_id) || a.field.localeCompare(b.field));
  await mkdir(IMPORTS_DIR, { recursive: true });
  await writeFile(path.join(IMPORTS_DIR, "github-chicken-dictionary.json"), JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`chicken-dictionary: ${parsed.length} breeds parsed, ${parsed.length - unmatched.length} matched, ${rows.length} import rows written.`);
  if (unmatched.length) console.log(`  unmatched: ${unmatched.join(", ")}`);
}

if (process.argv[1]?.endsWith("import-github-datasets.mjs")) {
  main().catch((err) => {
    console.error("import-github-datasets failed:", err);
    process.exitCode = 1;
  });
}
