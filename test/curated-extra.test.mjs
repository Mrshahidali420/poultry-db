import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dataDir = new URL("../data/", import.meta.url);
const curatedDir = new URL("../data/curated/", import.meta.url);

const loadText = (url) => readFileSync(url, "utf8");
const loadJson = (url) => JSON.parse(loadText(url));

test("chicken-names.json parses and has a lists array plus 800+ unique names", () => {
  const data = loadJson(new URL("chicken-names.json", curatedDir));
  assert.ok(Array.isArray(data.lists) && data.lists.length > 0);
  assert.ok(Array.isArray(data.names));
  assert.ok(data.names.length >= 800, `expected 800+ names, got ${data.names.length}`);
});

test("chicken-names.json: unique ids, valid list refs, no duplicate name within a list", () => {
  const data = loadJson(new URL("chicken-names.json", curatedDir));
  const listIds = new Set(data.lists.map((l) => l.id));

  const ids = data.names.map((n) => n.id);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate name id");

  const perList = new Map();
  for (const n of data.names) {
    assert.ok(Array.isArray(n.lists) && n.lists.length > 0, `${n.id} has no lists`);
    assert.ok(["hen", "rooster", "any"].includes(n.gender), `${n.id} bad gender`);
    for (const l of n.lists) {
      assert.ok(listIds.has(l), `${n.id} references unknown list ${l}`);
      const set = perList.get(l) || new Set();
      const key = n.name.toLowerCase();
      assert.ok(!set.has(key), `duplicate name "${n.name}" within list ${l}`);
      set.add(key);
      perList.set(l, set);
    }
  }
});

test("chicken-names.json lists metadata is complete", () => {
  const data = loadJson(new URL("chicken-names.json", curatedDir));
  for (const l of data.lists) {
    assert.match(l.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad list id ${l.id}`);
    assert.ok(l.title && l.description && l.search_phrase, `list ${l.id} missing metadata`);
  }
  assert.equal(new Set(data.lists.map((l) => l.id)).size, data.lists.length, "duplicate list id");
});

test("chicken-names.json has no em dash", () => {
  assert.ok(!loadText(new URL("chicken-names.json", curatedDir)).includes("—"));
});

test("symptom-checker.json parses as a non-empty array with 40+ symptoms", () => {
  const data = loadJson(new URL("symptom-checker.json", curatedDir));
  assert.ok(Array.isArray(data) && data.length >= 40, `expected 40+ symptoms, got ${data.length}`);
});

test("symptom-checker.json: unique kebab-case ids, needs_review, 2+ sources, valid disease_ids, safe urgency/first_steps", () => {
  const symptoms = loadJson(new URL("symptom-checker.json", curatedDir));
  const diseasesExtra = loadJson(new URL("diseases_extra.json", dataDir));
  const diseaseIds = new Set(diseasesExtra.map((d) => d.id));

  const ids = symptoms.map((s) => s.id);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate symptom id");

  const validUrgency = new Set(["emergency", "see-vet-soon", "watch", "care-at-home"]);

  for (const s of symptoms) {
    assert.equal(s.needs_review, true, `${s.id} needs_review`);
    assert.ok(validUrgency.has(s.urgency), `${s.id} bad urgency ${s.urgency}`);
    assert.ok(Array.isArray(s.first_steps) && s.first_steps.length > 0, `${s.id} needs first_steps`);
    assert.ok(typeof s.when_to_call_vet === "string" && s.when_to_call_vet.length > 0, `${s.id} needs when_to_call_vet`);
    assert.ok(Array.isArray(s.also_searched_as), `${s.id} needs also_searched_as array`);

    assert.ok(Array.isArray(s.sources), `${s.id} has no sources`);
    const urls = new Set(s.sources.map((src) => src.url));
    assert.ok(urls.size >= 2, `${s.id} has ${urls.size} source URL(s), need 2+`);
    for (const src of s.sources) {
      assert.match(src.url, /^https?:\/\//, `${s.id} bad source url`);
      assert.ok(src.name, `${s.id} source missing name`);
    }

    assert.ok(Array.isArray(s.possible_causes) && s.possible_causes.length > 0, `${s.id} needs possible_causes`);
    for (const c of s.possible_causes) {
      assert.ok(c.cause_name, `${s.id} cause missing cause_name`);
      if (c.disease_id !== null) {
        assert.ok(diseaseIds.has(c.disease_id), `${s.id} references unknown disease_id ${c.disease_id}`);
      }
    }

    // no drug dosing language in first steps
    for (const step of s.first_steps) {
      assert.ok(!/\bmg\b|\bml\b|\bcc\b|dosage|dose of/i.test(step), `${s.id} first_steps look like a drug dose: "${step}"`);
    }
  }
});

test("symptom-checker.json has no em dash", () => {
  assert.ok(!loadText(new URL("symptom-checker.json", curatedDir)).includes("—"));
});

test("breeds-by-state.json covers all 50 states plus DC with unique ids and valid breed refs", () => {
  const states = loadJson(new URL("breeds-by-state.json", curatedDir));
  const breeds = loadJson(new URL("breeds.json", dataDir));
  const breedIds = new Set(breeds.map((b) => b.id));

  assert.equal(states.length, 51, `expected 51 state records, got ${states.length}`);

  const ids = states.map((s) => s.id);
  assert.match(ids.join(","), /^[a-z, ]+$/);
  for (const id of ids) assert.match(id, /^[a-z]{2}$/, `bad state id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate state id");

  for (const s of states) {
    assert.equal(s.needs_review, true, `${s.id} needs_review`);
    assert.ok(Array.isArray(s.recommended_breed_ids), `${s.id} needs recommended_breed_ids`);
    assert.ok(
      s.recommended_breed_ids.length >= 8 && s.recommended_breed_ids.length <= 12,
      `${s.id} has ${s.recommended_breed_ids.length} recommended breeds, expected 8-12`,
    );
    for (const bid of s.recommended_breed_ids) {
      assert.ok(breedIds.has(bid), `${s.id} references unknown breed id ${bid}`);
    }
    assert.ok(Array.isArray(s.sources) && s.sources.length > 0, `${s.id} needs sources`);
    for (const src of s.sources) {
      assert.match(src.url, /^https?:\/\//, `${s.id} bad source url`);
      assert.ok(src.name, `${s.id} source missing name`);
    }
    assert.ok(typeof s.climate_summary === "string" && s.climate_summary.length > 0, `${s.id} needs climate_summary`);
    assert.ok(typeof s.usda_hardiness_zones === "string" && s.usda_hardiness_zones.length > 0, `${s.id} needs usda_hardiness_zones`);
    assert.ok(["low", "medium", "high"].includes(s.humidity), `${s.id} bad humidity`);
  }
});

test("breeds-by-state.json has no em dash", () => {
  assert.ok(!loadText(new URL("breeds-by-state.json", curatedDir)).includes("—"));
});

test("state-climate.json (source table) has no em dash and 51 unique states", () => {
  const text = loadText(new URL("state-climate.json", curatedDir));
  assert.ok(!text.includes("—"));
  const rows = JSON.parse(text);
  assert.equal(rows.length, 51);
  assert.equal(new Set(rows.map((r) => r.id)).size, 51);
});
