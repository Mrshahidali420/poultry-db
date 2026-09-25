// Field schemas for the enriched datasets. Every field is stored as a
// provenance fact { value, source_url, origin?, conflict?, values? }.
// The type here is the type of `value`.

export const BREED_EXTRA_SCHEMA = {
  eggs_per_year_min: "number",
  eggs_per_year_max: "number",
  egg_size: "string",
  egg_color: "string",
  temperament: "string",
  broodiness: "string",
  cold_hardy: "boolean",
  heat_tolerant: "boolean",
  beginner_friendly: "boolean",
  purpose: "string",
  bantam_available: "boolean",
  varieties: "array",
  lifespan_years: "number",
  hen_weight_kg: "number",
  rooster_weight_kg: "number",
  autosexing: "boolean",
  notes: "string",
};

export const DISEASE_EXTRA_SCHEMA = {
  cause_type: "string",
  contagious: "boolean",
  zoonotic: "boolean",
  key_symptoms: "array",
  prevention: "array",
  vaccine_available: "boolean",
  notifiable_in_us_uk: "string",
};

export function emptyFact(type) {
  return { value: type === "array" ? [] : null, source_url: null };
}

function isFactShaped(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "value" in value;
}

/**
 * Bring a record to the provenance shape: every schema field becomes a
 * fact. Older bare values (from before provenance existed) carry no source,
 * so they are reset to empty facts rather than kept without a source_url.
 * Non-schema fields (tags, imported extras) are kept as they are.
 * @param {object} record
 * @param {Record<string,string>} schema
 */
export function toProvenanceShape(record, schema) {
  // Pre-provenance records carried one record-level "source" string; each
  // fact now names its own source_url, so the old key is dropped.
  const { source: _legacySource, ...next } = record;
  for (const [field, type] of Object.entries(schema)) {
    if (!isFactShaped(next[field])) next[field] = emptyFact(type);
  }
  return next;
}

export function emptyBreedExtra(id) {
  return toProvenanceShape({ id, tags: [], needs_review: true }, BREED_EXTRA_SCHEMA);
}

export function emptyDiseaseExtra(id) {
  return toProvenanceShape(
    { id, needs_review: true, disclaimer: "Not veterinary advice" },
    DISEASE_EXTRA_SCHEMA
  );
}
