// Per-field provenance for enriched records, and the merge rules that
// decide which source wins a field.
//
// A fact is { value, source_url, origin?, needs_review?, conflict?, values? }.
// On a conflict the first value stays in `value`/`source_url` and every
// disagreeing value is kept in `values: [{value, source_url, origin}]`.
//
// Source strength, strongest first:
//   wikipedia-infobox  (a non-null field in data/breeds.json)
//   LLM-extracted fact with its own source_url (Wikipedia, reference pages,
//     the Harris730 CSV text)
//   chatgpt-import     (rows dropped into imports/)
//   github:iamthechickenlady-netizen/chicken-dictionary  (lowest)
// Imports only fill empty fields and never overwrite a stronger source.

import { SchemaValidationError } from "./llm.mjs";

export const ORIGIN_CHATGPT = "chatgpt-import";
export const ORIGIN_CHICKEN_DICTIONARY = "github:iamthechickenlady-netizen/chicken-dictionary";
export const ORIGIN_HARRIS730 = "github:Harris730/Chicken_breed_dataset";

const RANK_INFOBOX = 100;
const RANK_EXTRACTED = 80;
const ORIGIN_RANK = {
  "wikipedia-infobox": RANK_INFOBOX,
  [ORIGIN_CHATGPT]: 20,
  [ORIGIN_CHICKEN_DICTIONARY]: 10,
};

/** Rank for an import origin; unknown import origins sit with chatgpt-import. */
export function originRank(origin) {
  return ORIGIN_RANK[origin] ?? ORIGIN_RANK[ORIGIN_CHATGPT];
}

function isEmptyValue(value) {
  return value === null || value === undefined || value === "" ||
    (Array.isArray(value) && value.length === 0);
}

/** True when a stored fact carries no value (or is not a fact at all). */
export function isEmptyFact(fact) {
  if (fact === null || fact === undefined) return true;
  if (typeof fact !== "object" || Array.isArray(fact)) return isEmptyValue(fact);
  return isEmptyValue(fact.value);
}

/** Strength of a stored fact. Extracted facts carry a source_url and no import origin. */
export function factRank(fact) {
  if (isEmptyFact(fact)) return 0;
  if (fact.origin && ORIGIN_RANK[fact.origin] !== undefined) return ORIGIN_RANK[fact.origin];
  if (fact.source_url) return RANK_EXTRACTED;
  return 0;
}

/**
 * Apply one import row to an enriched record. Pure: returns a new record.
 * @param {object} params
 * @param {object} params.extraRecord  current breeds_extra / diseases_extra row
 * @param {object|null} params.infoboxRecord  matching data/breeds.json row, if any
 * @param {{entity_id:string, field:string, value:any, source_url:string, origin?:string}} params.row
 * @returns {{record: object, action: "filled"|"updated"|"unchanged"|"replaced-weaker"|"blocked"}}
 */
export function mergeImportRow({ extraRecord, infoboxRecord, row }) {
  const origin = row.origin || ORIGIN_CHATGPT;
  const field = row.field;

  if (infoboxRecord && !isEmptyValue(infoboxRecord[field])) {
    return { record: extraRecord, action: "blocked" };
  }

  const existing = extraRecord[field];
  const incoming = {
    value: row.value,
    source_url: row.source_url ?? null,
    origin,
    needs_review: true,
  };

  if (!isEmptyFact(existing)) {
    if (existing.origin === origin) {
      const same = JSON.stringify(existing.value) === JSON.stringify(row.value) &&
        existing.source_url === incoming.source_url;
      if (same) return { record: extraRecord, action: "unchanged" };
      return { record: { ...extraRecord, [field]: incoming }, action: "updated" };
    }
    if (factRank(existing) < originRank(origin)) {
      return { record: { ...extraRecord, [field]: incoming }, action: "replaced-weaker" };
    }
    return { record: extraRecord, action: "blocked" };
  }

  return { record: { ...extraRecord, [field]: incoming }, action: "filled" };
}

function typeOf(value) {
  return Array.isArray(value) ? "array" : typeof value;
}

/**
 * Validate a model response where every schema field is a provenance fact.
 * schema maps field -> base type ("string" | "number" | "boolean" | "array").
 * @param {object} data
 * @param {Record<string,string>} schema
 */
export function validateProvenanceResult(data, schema) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SchemaValidationError("Expected a JSON object", data);
  }
  for (const [field, baseType] of Object.entries(schema)) {
    const fact = data[field];
    if (fact === undefined || fact === null) continue; // treated as "not stated"
    if (typeof fact !== "object" || Array.isArray(fact)) {
      throw new SchemaValidationError(`Field "${field}" must be a {value, source_url} object`, data);
    }
    const checkPair = (value, sourceUrl, label) => {
      if (isEmptyValue(value)) return;
      if (typeOf(value) !== baseType) {
        throw new SchemaValidationError(`${label} expected ${baseType}, got ${typeOf(value)}`, data);
      }
      if (typeof sourceUrl !== "string" || !sourceUrl) {
        throw new SchemaValidationError(`${label} has a value but no source_url`, data);
      }
    };
    checkPair(fact.value, fact.source_url, `Field "${field}"`);
    if (fact.conflict === true) {
      if (!Array.isArray(fact.values) || fact.values.length < 2) {
        throw new SchemaValidationError(`Field "${field}" is a conflict but has fewer than 2 values`, data);
      }
      fact.values.forEach((v, idx) => checkPair(v?.value, v?.source_url, `Field "${field}" values[${idx}]`));
    }
  }
  return true;
}

/**
 * Normalize a validated model response into stored facts: fill missing
 * fields with empty facts, drop any value citing a URL we did not give the
 * model (never keep an invented source), and attach each fact's origin.
 * @param {object} data
 * @param {Record<string,string>} schema
 * @param {Map<string,string>} allowedSources  source_url -> origin
 * @returns {Record<string, object>}
 */
export function normalizeProvenanceResult(data, schema, allowedSources) {
  const empty = (field) => ({ value: schema[field] === "array" ? [] : null, source_url: null });
  const out = {};

  for (const field of Object.keys(schema)) {
    const fact = data[field];
    if (!fact || isEmptyValue(fact.value) || !allowedSources.has(fact.source_url)) {
      out[field] = empty(field);
      continue;
    }
    const stored = {
      value: fact.value,
      source_url: fact.source_url,
      origin: allowedSources.get(fact.source_url),
    };
    if (fact.conflict === true && Array.isArray(fact.values)) {
      const values = fact.values
        .filter((v) => v && !isEmptyValue(v.value) && allowedSources.has(v.source_url))
        .map((v) => ({ value: v.value, source_url: v.source_url, origin: allowedSources.get(v.source_url) }));
      const distinct = new Set(values.map((v) => JSON.stringify(v.value)));
      if (values.length >= 2 && distinct.size >= 2) {
        stored.conflict = true;
        stored.values = values;
      }
    }
    out[field] = stored;
  }
  return out;
}

/**
 * Merge freshly extracted facts into an existing record. An extracted value
 * replaces whatever was there; an empty extraction keeps an existing
 * imported value rather than wiping it. Pure: returns a new record.
 * @param {object} existing
 * @param {Record<string, object>} facts
 */
export function applyExtractedFacts(existing, facts) {
  const next = { ...existing };
  for (const [field, fact] of Object.entries(facts)) {
    if (!isEmptyFact(fact)) {
      next[field] = fact;
    } else if (isEmptyFact(existing[field])) {
      next[field] = fact;
    }
  }
  return next;
}
