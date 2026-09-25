import test from "node:test";
import assert from "node:assert/strict";
import { mergeExtractedFields } from "../scripts/merge-extracts.mjs";

test("fills an empty field from a single extract entry", () => {
  const existing = { id: "silkie", egg_color: { value: null, source_url: null } };
  const extract = {
    id: "silkie",
    fields: {
      egg_color: [{ value: "blue", source_url: "https://en.wikipedia.org/wiki/Silkie" }],
    },
  };

  const { record, touched, fieldsFilled, conflicts } = mergeExtractedFields(existing, extract);

  assert.equal(touched, true);
  assert.equal(fieldsFilled, 1);
  assert.equal(conflicts, 0);
  assert.deepEqual(record.egg_color, {
    value: "blue",
    source_url: "https://en.wikipedia.org/wiki/Silkie",
    origin: "extract",
  });
  assert.equal(record.needs_review, true);
});

test("marks a conflict when the extract itself has 2+ differing values", () => {
  const existing = { id: "orpington", egg_color: { value: null, source_url: null } };
  const extract = {
    id: "orpington",
    fields: {
      egg_color: [
        { value: "brown", source_url: "https://a.example/orpington" },
        { value: "light brown", source_url: "https://b.example/orpington" },
      ],
    },
  };

  const { record, conflicts } = mergeExtractedFields(existing, extract);

  assert.equal(conflicts, 1);
  assert.equal(record.egg_color.value, "brown");
  assert.equal(record.egg_color.conflict, true);
  assert.equal(record.egg_color.alternatives.length, 2);
  assert.deepEqual(
    record.egg_color.alternatives.map((a) => a.value),
    ["brown", "light brown"]
  );
});

test("never overwrites an existing non-null value; adds a differing one as an alternative", () => {
  const existing = {
    id: "orpington",
    egg_color: { value: "brown", source_url: "https://en.wikipedia.org/wiki/Orpington_chicken" },
  };
  const extract = {
    id: "orpington",
    fields: {
      egg_color: [{ value: "light brown", source_url: "https://other.example/orpington" }],
    },
  };

  const { record, touched, fieldsFilled, conflicts } = mergeExtractedFields(existing, extract);

  assert.equal(touched, true);
  assert.equal(fieldsFilled, 0);
  assert.equal(conflicts, 1);
  assert.equal(record.egg_color.value, "brown");
  assert.equal(record.egg_color.source_url, "https://en.wikipedia.org/wiki/Orpington_chicken");
  assert.equal(record.egg_color.conflict, true);
  assert.deepEqual(record.egg_color.alternatives, [
    { value: "light brown", source_url: "https://other.example/orpington", origin: "extract" },
  ]);
});

test("treats matching values as equal (case/whitespace for strings, exact for numbers, sorted sets for arrays)", () => {
  const existing = {
    id: "orpington",
    egg_color: { value: "Brown ", source_url: "https://en.wikipedia.org/wiki/Orpington_chicken" },
    varieties: { value: ["black", "blue", "buff"], source_url: "https://en.wikipedia.org/wiki/Orpington_chicken" },
  };
  const extract = {
    id: "orpington",
    fields: {
      egg_color: [{ value: " brown", source_url: "https://other.example/orpington" }],
      varieties: [{ value: ["buff", "blue", "black"], source_url: "https://other.example/orpington" }],
    },
  };

  const { record, touched } = mergeExtractedFields(existing, extract);

  assert.equal(touched, false);
  assert.equal(record.egg_color.conflict, undefined);
  assert.equal(record.varieties.conflict, undefined);
});

test("is idempotent: running the same merge twice gives identical output", () => {
  const existing = {
    id: "orpington",
    egg_color: { value: "brown", source_url: "https://en.wikipedia.org/wiki/Orpington_chicken" },
    hen_weight_kg: { value: null, source_url: null },
  };
  const extract = {
    id: "orpington",
    fields: {
      egg_color: [
        { value: "light brown", source_url: "https://other.example/orpington" },
        { value: "tinted", source_url: "https://third.example/orpington" },
      ],
      hen_weight_kg: [{ value: "3.2", source_url: "https://other.example/orpington" }],
    },
  };

  const first = mergeExtractedFields(existing, extract);
  const second = mergeExtractedFields(first.record, extract);

  assert.deepEqual(first.record, second.record);
  assert.equal(second.touched, false);
  assert.equal(second.fieldsFilled, 0);
  assert.equal(second.conflicts, 0);
  assert.equal(first.record.egg_color.alternatives.length, 2);
});

test("adds a field the record shape does not have yet", () => {
  const existing = { id: "silkie" };
  const extract = {
    id: "silkie",
    fields: {
      history_summary: [{ value: "An old Chinese breed.", source_url: "https://en.wikipedia.org/wiki/Silkie" }],
    },
  };

  const { record, fieldsFilled } = mergeExtractedFields(existing, extract);

  assert.equal(fieldsFilled, 1);
  assert.deepEqual(record.history_summary, {
    value: "An old Chinese breed.",
    source_url: "https://en.wikipedia.org/wiki/Silkie",
    origin: "extract",
  });
});

test("copies relevant_to_backyard_chickens onto disease records", () => {
  const existing = { id: "coccidiosis", relevant_to_backyard_chickens: null };
  const extract = { id: "coccidiosis", relevant_to_backyard_chickens: true, fields: {} };

  const { record, touched } = mergeExtractedFields(existing, extract, { isDisease: true });

  assert.equal(record.relevant_to_backyard_chickens, true);
  assert.equal(touched, true);
  assert.equal(record.needs_review, true);
});

test("does not touch a disease record when the relevance flag is unchanged", () => {
  const existing = { id: "coccidiosis", relevant_to_backyard_chickens: null, needs_review: undefined };
  const extract = { id: "coccidiosis", relevant_to_backyard_chickens: null, fields: {} };

  const { record, touched } = mergeExtractedFields(existing, extract, { isDisease: true });

  assert.equal(touched, false);
  assert.equal(record.needs_review, undefined);
});
