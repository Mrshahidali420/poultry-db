import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeImportRow,
  ORIGIN_CHATGPT,
  ORIGIN_CHICKEN_DICTIONARY,
} from "../scripts/lib/provenance.mjs";
import { coerceValue } from "../scripts/merge-imports.mjs";

const empty = { value: null, source_url: null };
const baseRecord = () => ({ id: "brahma-chicken", temperament: { ...empty }, egg_size: { ...empty } });
const row = (overrides = {}) => ({
  entity_id: "brahma-chicken",
  field: "temperament",
  value: "docile",
  source_url: "https://example.org/brahma",
  ...overrides,
});

test("fills a gap when the field is null, and tags origin + needs_review", () => {
  const { record, action } = mergeImportRow({ extraRecord: baseRecord(), infoboxRecord: null, row: row() });
  assert.equal(action, "filled");
  assert.deepEqual(record.temperament, {
    value: "docile",
    source_url: "https://example.org/brahma",
    origin: ORIGIN_CHATGPT,
    needs_review: true,
  });
});

test("defaults origin to chatgpt-import when a row has none", () => {
  const { record } = mergeImportRow({ extraRecord: baseRecord(), infoboxRecord: null, row: row({ origin: undefined }) });
  assert.equal(record.temperament.origin, "chatgpt-import");
});

test("keeps a given origin (chicken-dictionary) on the stored fact", () => {
  const { record } = mergeImportRow({
    extraRecord: baseRecord(),
    infoboxRecord: null,
    row: row({ origin: ORIGIN_CHICKEN_DICTIONARY }),
  });
  assert.equal(record.temperament.origin, ORIGIN_CHICKEN_DICTIONARY);
  assert.equal(record.temperament.needs_review, true);
});

test("overwrite is blocked when the Wikipedia infobox already has the field", () => {
  const extraRecord = { id: "brahma-chicken", comb: { ...empty } };
  const { record, action } = mergeImportRow({
    extraRecord,
    infoboxRecord: { id: "brahma-chicken", comb: "pea" },
    row: row({ field: "comb", value: "single" }),
  });
  assert.equal(action, "blocked");
  assert.equal(record, extraRecord, "record must be returned untouched");
});

test("overwrite is blocked when an extracted fact with its own source_url exists", () => {
  const extraRecord = {
    ...baseRecord(),
    temperament: { value: "calm", source_url: "https://en.wikipedia.org/wiki/Brahma_chicken", origin: "wikipedia" },
  };
  const { record, action } = mergeImportRow({ extraRecord, infoboxRecord: null, row: row() });
  assert.equal(action, "blocked");
  assert.equal(record.temperament.value, "calm");
});

test("chicken-dictionary (lowest priority) cannot overwrite a chatgpt-import value", () => {
  const first = mergeImportRow({ extraRecord: baseRecord(), infoboxRecord: null, row: row({ value: "gentle" }) });
  const second = mergeImportRow({
    extraRecord: first.record,
    infoboxRecord: null,
    row: row({ value: "flighty", origin: ORIGIN_CHICKEN_DICTIONARY }),
  });
  assert.equal(second.action, "blocked");
  assert.equal(second.record.temperament.value, "gentle");
});

test("a chatgpt-import value replaces a weaker chicken-dictionary value", () => {
  const first = mergeImportRow({
    extraRecord: baseRecord(),
    infoboxRecord: null,
    row: row({ value: "flighty", origin: ORIGIN_CHICKEN_DICTIONARY }),
  });
  const second = mergeImportRow({ extraRecord: first.record, infoboxRecord: null, row: row({ value: "gentle" }) });
  assert.equal(second.action, "replaced-weaker");
  assert.equal(second.record.temperament.origin, ORIGIN_CHATGPT);
});

test("re-merging the same row is a no-op (idempotent)", () => {
  const first = mergeImportRow({ extraRecord: baseRecord(), infoboxRecord: null, row: row() });
  const second = mergeImportRow({ extraRecord: first.record, infoboxRecord: null, row: row() });
  assert.equal(second.action, "unchanged");
});

test("the input record is never mutated", () => {
  const extraRecord = baseRecord();
  const snapshot = JSON.stringify(extraRecord);
  mergeImportRow({ extraRecord, infoboxRecord: null, row: row() });
  assert.equal(JSON.stringify(extraRecord), snapshot);
});

test("coerceValue turns CSV strings into booleans, numbers and arrays", () => {
  assert.equal(coerceValue("true"), true);
  assert.equal(coerceValue("FALSE"), false);
  assert.equal(coerceValue("250"), 250);
  assert.equal(coerceValue("4.5"), 4.5);
  assert.deepEqual(coerceValue('["light","dark"]'), ["light", "dark"]);
  assert.equal(coerceValue(""), null);
  assert.equal(coerceValue("docile"), "docile");
});
