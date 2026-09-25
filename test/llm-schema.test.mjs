import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSchema, SchemaValidationError } from "../scripts/lib/llm.mjs";

const BREED_SCHEMA = {
  eggs_per_year_min: "number|null",
  temperament: "string|null",
  varieties: "array",
  cold_hardy: "boolean|null",
};

test("validateSchema accepts a fully-populated valid object", () => {
  assert.doesNotThrow(() =>
    validateSchema(
      { eggs_per_year_min: 150, temperament: "docile", varieties: ["light", "dark"], cold_hardy: true },
      BREED_SCHEMA
    )
  );
});

test("validateSchema accepts nulls for nullable fields", () => {
  assert.doesNotThrow(() =>
    validateSchema(
      { eggs_per_year_min: null, temperament: null, varieties: [], cold_hardy: null },
      BREED_SCHEMA
    )
  );
});

test("validateSchema rejects a non-object payload", () => {
  assert.throws(() => validateSchema([1, 2, 3], BREED_SCHEMA), SchemaValidationError);
  assert.throws(() => validateSchema(null, BREED_SCHEMA), SchemaValidationError);
});

test("validateSchema rejects a wrong type for a field", () => {
  assert.throws(
    () => validateSchema({ eggs_per_year_min: "a lot", temperament: null, varieties: [], cold_hardy: null }, BREED_SCHEMA),
    SchemaValidationError
  );
});

test("validateSchema rejects null for a non-nullable array field", () => {
  assert.throws(
    () => validateSchema({ eggs_per_year_min: null, temperament: null, varieties: null, cold_hardy: null }, BREED_SCHEMA),
    SchemaValidationError
  );
});
