import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateProvenanceResult,
  normalizeProvenanceResult,
  applyExtractedFacts,
  isEmptyFact,
} from "../scripts/lib/provenance.mjs";
import { SchemaValidationError } from "../scripts/lib/llm.mjs";
import { toProvenanceShape, emptyBreedExtra, BREED_EXTRA_SCHEMA } from "../scripts/lib/schemas.mjs";

const WIKI = "https://en.wikipedia.org/wiki/Brahma_chicken";
const STAR = "https://starmilling.com/poultry-chicken-breeds/";
const SCHEMA = { eggs_per_year_min: "number", temperament: "string", varieties: "array", cold_hardy: "boolean" };
const allowed = new Map([[WIKI, "wikipedia"], [STAR, "github:Harris730/Chicken_breed_dataset"]]);

test("validateProvenanceResult accepts {value, source_url} facts and null facts", () => {
  assert.doesNotThrow(() =>
    validateProvenanceResult(
      {
        eggs_per_year_min: { value: 150, source_url: WIKI },
        temperament: { value: null, source_url: null },
        varieties: { value: ["light", "dark", "buff"], source_url: WIKI },
        cold_hardy: { value: true, source_url: STAR },
      },
      SCHEMA
    )
  );
});

test("validateProvenanceResult rejects a bare value (no provenance object)", () => {
  assert.throws(() => validateProvenanceResult({ temperament: "docile" }, SCHEMA), SchemaValidationError);
});

test("validateProvenanceResult rejects a value with no source_url", () => {
  assert.throws(
    () => validateProvenanceResult({ temperament: { value: "docile", source_url: null } }, SCHEMA),
    SchemaValidationError
  );
});

test("validateProvenanceResult rejects a wrong value type", () => {
  assert.throws(
    () => validateProvenanceResult({ eggs_per_year_min: { value: "lots", source_url: WIKI } }, SCHEMA),
    SchemaValidationError
  );
});

test("validateProvenanceResult rejects a conflict with fewer than two values", () => {
  assert.throws(
    () => validateProvenanceResult(
      { temperament: { value: "docile", source_url: WIKI, conflict: true, values: [{ value: "docile", source_url: WIKI }] } },
      SCHEMA
    ),
    SchemaValidationError
  );
});

test("normalizeProvenanceResult attaches origin and fills missing fields with empty facts", () => {
  const facts = normalizeProvenanceResult({ temperament: { value: "docile", source_url: WIKI } }, SCHEMA, allowed);
  assert.deepEqual(facts.temperament, { value: "docile", source_url: WIKI, origin: "wikipedia" });
  assert.deepEqual(facts.eggs_per_year_min, { value: null, source_url: null });
  assert.deepEqual(facts.varieties, { value: [], source_url: null });
});

test("normalizeProvenanceResult drops a value citing a URL that was not provided (never invent)", () => {
  const facts = normalizeProvenanceResult(
    { temperament: { value: "docile", source_url: "https://made-up.example/page" } },
    SCHEMA,
    allowed
  );
  assert.deepEqual(facts.temperament, { value: null, source_url: null });
});

test("normalizeProvenanceResult keeps both disagreeing values with conflict: true", () => {
  const facts = normalizeProvenanceResult(
    {
      eggs_per_year_min: {
        value: 150,
        source_url: WIKI,
        conflict: true,
        values: [{ value: 150, source_url: WIKI }, { value: 200, source_url: STAR }],
      },
    },
    SCHEMA,
    allowed
  );
  const fact = facts.eggs_per_year_min;
  assert.equal(fact.conflict, true);
  assert.equal(fact.value, 150);
  assert.deepEqual(fact.values, [
    { value: 150, source_url: WIKI, origin: "wikipedia" },
    { value: 200, source_url: STAR, origin: "github:Harris730/Chicken_breed_dataset" },
  ]);
});

test("normalizeProvenanceResult drops conflict: true when the values actually agree", () => {
  const facts = normalizeProvenanceResult(
    {
      temperament: {
        value: "docile",
        source_url: WIKI,
        conflict: true,
        values: [{ value: "docile", source_url: WIKI }, { value: "docile", source_url: STAR }],
      },
    },
    SCHEMA,
    allowed
  );
  assert.equal(facts.temperament.conflict, undefined);
});

test("applyExtractedFacts: an extracted value replaces, an empty extraction keeps an imported value", () => {
  const existing = {
    id: "x",
    temperament: { value: "gentle", source_url: "https://example.org", origin: "chatgpt-import", needs_review: true },
    cold_hardy: { value: null, source_url: null },
  };
  const next = applyExtractedFacts(existing, {
    temperament: { value: null, source_url: null },
    cold_hardy: { value: true, source_url: WIKI, origin: "wikipedia" },
  });
  assert.equal(next.temperament.value, "gentle", "empty extraction must not wipe the import");
  assert.equal(next.cold_hardy.value, true);
  assert.equal(existing.cold_hardy.value, null, "input not mutated");
});

test("toProvenanceShape converts old bare values to empty facts and keeps extra fields", () => {
  const shaped = toProvenanceShape({ id: "x", temperament: "docile", varieties: [], tags: ["BROWN LAYERS"] }, BREED_EXTRA_SCHEMA);
  assert.deepEqual(shaped.temperament, { value: null, source_url: null });
  assert.deepEqual(shaped.varieties, { value: [], source_url: null });
  assert.deepEqual(shaped.tags, ["BROWN LAYERS"]);
  assert.ok(isEmptyFact(emptyBreedExtra("y").notes));
});
