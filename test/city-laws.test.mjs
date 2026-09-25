import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const raw = (name) => readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8");

const TRI = ["yes", "no", "unknown"];
const QUAD = ["yes", "no", "conditional", "unknown"];
const CONFIDENCE = ["high", "medium", "low"];
const SOURCE_TYPES = ["municipal-code", "city-website", "secondary"];

const cities = load("city-chicken-laws.json");
const topCities = load("us-cities-top150.json");

test("city-chicken-laws.json parses to a non-empty array", () => {
  assert.ok(Array.isArray(cities));
  assert.ok(cities.length > 0);
});

test("city ids are unique and match the top-150 Census list", () => {
  const ids = cities.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Map(topCities.cities.map((c) => [c.id, c]));
  for (const c of cities) {
    const ref = known.get(c.id);
    assert.ok(ref, `${c.id} is not in us-cities-top150.json`);
    assert.equal(c.state, ref.state, c.id);
    assert.equal(c.population, ref.population, c.id);
  }
});

test("every city record has at least one source with an http(s) URL", () => {
  for (const c of cities) {
    assert.ok(Array.isArray(c.sources) && c.sources.length > 0, `${c.id} has no sources`);
    for (const s of c.sources) {
      assert.match(s.url, /^https?:\/\//, `${c.id} source url`);
      assert.ok(SOURCE_TYPES.includes(s.type), `${c.id} source type ${s.type}`);
      assert.ok(s.name, `${c.id} source name`);
    }
  }
});

test("enumerated fields use allowed values", () => {
  for (const c of cities) {
    assert.ok(QUAD.includes(c.allowed), `${c.id} allowed=${c.allowed}`);
    assert.ok(QUAD.includes(c.roosters_allowed), `${c.id} roosters_allowed=${c.roosters_allowed}`);
    assert.ok(TRI.includes(c.permit_required), `${c.id} permit_required=${c.permit_required}`);
    assert.ok(TRI.includes(c.slaughter_allowed), `${c.id} slaughter_allowed=${c.slaughter_allowed}`);
    assert.ok(c.max_hens === null || (Number.isInteger(c.max_hens) && c.max_hens >= 0), `${c.id} max_hens`);
    assert.ok(c.setback_ft_from_homes === null || typeof c.setback_ft_from_homes === "number", `${c.id} setback`);
  }
});

test("confidence, review flag, date and HOA note are set", () => {
  for (const c of cities) {
    assert.ok(CONFIDENCE.includes(c.confidence), `${c.id} confidence=${c.confidence}`);
    assert.equal(c.needs_review, true, c.id);
    assert.match(c.last_checked, /^\d{4}-\d{2}-\d{2}$/, c.id);
    assert.ok(c.hoa_note && /HOA|homeowners/i.test(c.hoa_note), `${c.id} hoa_note`);
  }
});

test("high confidence records cite an official source", () => {
  for (const c of cities) {
    if (c.confidence !== "high") continue;
    assert.ok(c.sources.some((s) => s.type !== "secondary"), `${c.id} is high confidence without an official source`);
  }
});

test("no em dashes in the chicken law datasets", () => {
  for (const name of ["city-chicken-laws.json", "state-chicken-laws.json"]) {
    assert.ok(!raw(name).includes("—"), `${name} contains an em dash`);
  }
});

test("state-chicken-laws.json covers all 50 states and DC with sources", () => {
  const data = load("state-chicken-laws.json");
  const states = data.states;
  assert.equal(states.length, 51);
  assert.equal(new Set(states.map((s) => s.state)).size, 51);
  for (const s of states) {
    assert.ok(s.summary, `${s.state} summary`);
    assert.ok(["researched", "not-researched"].includes(s.research_status), `${s.state} research_status`);
    if (s.research_status === "not-researched") {
      assert.equal(s.confidence, "unknown", `${s.state} unresearched state must not claim confidence`);
      assert.equal(s.state_rules.length, 0, `${s.state} unresearched state must not list rules`);
      continue;
    }
    assert.ok(Array.isArray(s.sources) && s.sources.length > 0, `${s.state} sources`);
    for (const src of s.sources) assert.match(src.url, /^https?:\/\//, `${s.state} source url`);
    for (const r of s.state_rules) assert.match(r.url, /^https?:\/\//, `${s.state} rule url`);
    assert.ok(CONFIDENCE.includes(s.confidence), `${s.state} confidence`);
  }
});

test("us-cities-top150.json lists 150 cities with population and a Census source", () => {
  assert.equal(topCities.cities.length, 150);
  assert.match(topCities.source.url, /census\.gov/);
  for (const c of topCities.cities) {
    assert.ok(c.name && c.state && Number.isInteger(c.population), c.id);
  }
});
