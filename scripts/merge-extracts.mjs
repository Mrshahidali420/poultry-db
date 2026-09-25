#!/usr/bin/env node
// Merges per-entity extract files (extract/breeds/<id>.json,
// extract/diseases/<id>.json) into data/breeds_extra.json and
// data/diseases_extra.json.
//
// Each extract file looks like:
//   { "id": "...", "fields": { "<field>": [ {"value","source_url"}, ... ] } }
// (diseases also carry "relevant_to_backyard_chickens": true|false|null)
//
// Rules:
//   - an empty existing value gets filled from the extract; if the extract
//     itself has 2+ differing values for a field, the first fills the value
//     and every distinct value is kept in `alternatives`, with conflict: true
//   - an existing non-null value (Wikipedia infobox, LLM extraction, an
//     import, ...) is NEVER overwritten; a differing extracted value is
//     appended to `alternatives` instead, with conflict: true
//   - filled/added facts carry origin: "extract"; any record touched gets
//     needs_review: true
//   - fields the extract mentions that the record shape does not have yet
//     (varieties, notable_traits, history_summary, summary, key_symptoms, ...)
//     are added with the same {value, source_url} shape
//   - running this twice produces byte-identical output (no duplicate
//     alternatives, no re-touching of records that gained nothing new)

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BREED_EXTRA_SCHEMA, DISEASE_EXTRA_SCHEMA, emptyBreedExtra, emptyDiseaseExtra } from "./lib/schemas.mjs";

const DATA_DIR = path.resolve("data");
const EXTRACT_DIR = path.resolve("extract");
const EXTRACT_ORIGIN = "extract";

/** True when a stored value is "nothing yet": null, undefined, "", or []. */
export function isEmptyValue(value) {
  return value === null || value === undefined || value === "" ||
    (Array.isArray(value) && value.length === 0);
}

function isEmptyFact(fact) {
  if (fact === null || fact === undefined) return true;
  if (typeof fact !== "object" || Array.isArray(fact)) return isEmptyValue(fact);
  return isEmptyValue(fact.value);
}

/**
 * Normalize a value for equality comparison: numbers compare exactly,
 * strings compare case-insensitively and trimmed, arrays compare as sorted
 * sets of normalized elements.
 */
function normalizeForCompare(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(normalizeForCompare).sort());
  }
  if (value && typeof value === "object") {
    // Plain objects (e.g. {min, max} weight ranges) compare structurally,
    // key order independent, rather than by reference.
    const keys = Object.keys(value).sort();
    return JSON.stringify(keys.map((k) => [k, normalizeForCompare(value[k])]));
  }
  return value;
}

export function valuesEqual(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Merge one field's extracted entries into its existing fact. Pure: returns
 * a new fact object, or the same object reference when nothing changed
 * (used by the caller to decide whether the record was touched).
 * @param {object|undefined} existingFact
 * @param {Array<{value:any, source_url:any}>} entries  non-empty extract entries
 * @returns {{fact:object, filled:boolean, conflict:boolean}}
 */
export function mergeField(existingFact, entries) {
  // Dedupe by normalized value, keeping the first entry (and its source) seen.
  const uniqueByValue = [];
  for (const entry of entries) {
    if (!uniqueByValue.some((u) => valuesEqual(u.value, entry.value))) uniqueByValue.push(entry);
  }

  const hasExisting = !isEmptyFact(existingFact);

  if (!hasExisting) {
    const [first, ...rest] = uniqueByValue;
    const fact = { value: first.value, source_url: first.source_url ?? null, origin: EXTRACT_ORIGIN };
    if (uniqueByValue.length > 1) {
      fact.conflict = true;
      fact.alternatives = uniqueByValue.map((u) => ({
        value: u.value,
        source_url: u.source_url ?? null,
        origin: EXTRACT_ORIGIN,
      }));
    }
    return { fact, filled: true, conflict: uniqueByValue.length > 1 };
  }

  // Existing non-null value: never overwrite it. Only differing extracted
  // values are new information, appended to `alternatives`.
  const differing = uniqueByValue.filter((u) => !valuesEqual(u.value, existingFact.value));
  if (differing.length === 0) {
    return { fact: existingFact, filled: false, conflict: false };
  }

  const existingAlts = Array.isArray(existingFact.alternatives) ? existingFact.alternatives : [];
  const nextAlts = [...existingAlts];
  for (const d of differing) {
    const already = nextAlts.some(
      (a) => valuesEqual(a.value, d.value) && a.source_url === (d.source_url ?? null)
    );
    if (!already) nextAlts.push({ value: d.value, source_url: d.source_url ?? null, origin: EXTRACT_ORIGIN });
  }
  if (nextAlts.length === existingAlts.length) {
    // Every differing value was already recorded from an earlier run.
    return { fact: existingFact, filled: false, conflict: false };
  }
  return {
    fact: { ...existingFact, conflict: true, alternatives: nextAlts },
    filled: false,
    conflict: true,
  };
}

/**
 * Merge one extract file's fields into one existing extra record. Pure.
 * @param {object} existingRecord  a breeds_extra / diseases_extra row
 * @param {{id:string, fields:Record<string,Array>, relevant_to_backyard_chickens?:any}} extract
 * @param {{isDisease?:boolean}} [options]
 * @returns {{record:object, touched:boolean, fieldsFilled:number, conflicts:number}}
 */
export function mergeExtractedFields(existingRecord, extract, { isDisease = false } = {}) {
  const record = { ...existingRecord };
  let touched = false;
  let fieldsFilled = 0;
  let conflicts = 0;

  for (const [field, rawEntries] of Object.entries(extract.fields ?? {})) {
    const entries = (rawEntries ?? []).filter((e) => e && !isEmptyValue(e.value));
    if (entries.length === 0) continue;

    const existingFact = record[field];
    const { fact, filled, conflict } = mergeField(existingFact, entries);
    if (fact === existingFact) continue;

    record[field] = fact;
    touched = true;
    if (filled) fieldsFilled += 1;
    if (conflict) conflicts += 1;
  }

  if (isDisease && "relevant_to_backyard_chickens" in extract) {
    if (record.relevant_to_backyard_chickens !== extract.relevant_to_backyard_chickens) {
      record.relevant_to_backyard_chickens = extract.relevant_to_backyard_chickens;
      touched = true;
    }
  }

  if (touched) record.needs_review = true;

  return { record, touched, fieldsFilled, conflicts };
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function loadExtracts(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const extracts = [];
  for (const file of files) {
    extracts.push(JSON.parse(await readFile(path.join(dir, file), "utf8")));
  }
  return extracts;
}

async function mergeEntityType({ extractDir, extraFile, schema, emptyRecord, isDisease }) {
  const extracts = await loadExtracts(extractDir);
  const extraRows = await loadJson(extraFile, []);
  const byId = new Map(extraRows.map((r) => [r.id, r]));

  let recordsTouched = 0;
  let fieldsFilled = 0;
  let conflicts = 0;

  for (const extract of extracts) {
    const existing = byId.get(extract.id) ?? emptyRecord(extract.id);
    const result = mergeExtractedFields(existing, extract, { isDisease });
    byId.set(extract.id, result.record);
    if (result.touched) recordsTouched += 1;
    fieldsFilled += result.fieldsFilled;
    conflicts += result.conflicts;
  }

  const sorted = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(extraFile, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  return { extractCount: extracts.length, recordsTouched, fieldsFilled, conflicts };
}

async function main() {
  const breeds = await mergeEntityType({
    extractDir: path.join(EXTRACT_DIR, "breeds"),
    extraFile: path.join(DATA_DIR, "breeds_extra.json"),
    schema: BREED_EXTRA_SCHEMA,
    emptyRecord: emptyBreedExtra,
    isDisease: false,
  });

  const diseases = await mergeEntityType({
    extractDir: path.join(EXTRACT_DIR, "diseases"),
    extraFile: path.join(DATA_DIR, "diseases_extra.json"),
    schema: DISEASE_EXTRA_SCHEMA,
    emptyRecord: emptyDiseaseExtra,
    isDisease: true,
  });

  console.log(
    `breeds: ${breeds.extractCount} extracts, ${breeds.recordsTouched} records touched, ` +
      `${breeds.fieldsFilled} fields filled, ${breeds.conflicts} conflicts`
  );
  console.log(
    `diseases: ${diseases.extractCount} extracts, ${diseases.recordsTouched} records touched, ` +
      `${diseases.fieldsFilled} fields filled, ${diseases.conflicts} conflicts`
  );
}

if (process.argv[1]?.endsWith("merge-extracts.mjs")) {
  main().catch((err) => {
    console.error("merge-extracts failed:", err);
    process.exitCode = 1;
  });
}
