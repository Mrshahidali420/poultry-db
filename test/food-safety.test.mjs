import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const foodsText = read("../data/curated/food-safety.json");
const reviewsText = read("../data/reviews/food-safety-reviews.json");
const foods = JSON.parse(foodsText);
const reviews = JSON.parse(reviewsText);
const byId = new Map(reviews.map((r) => [r.food_id, r]));

const VERDICTS = ["safe", "moderation", "limit", "unsafe"];
const STATUSES = ["approved", "fixed", "needs-human"];
const regDomain = (url) => new URL(url).hostname.split(".").slice(-2).join(".");

test("food-safety.json: unique, sorted kebab-case ids", () => {
  const ids = foods.map((f) => f.id);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)), "not sorted by id");
});

test("food-safety.json: verdicts and part verdicts use the four-step scale", () => {
  for (const f of foods) {
    assert.ok(VERDICTS.includes(f.verdict), `${f.id} verdict ${f.verdict}`);
    assert.ok(f.verdict_reason.trim().length > 0, `${f.id} has no short answer`);
    for (const p of f.parts) assert.ok(VERDICTS.includes(p.verdict), `${f.id} part ${p.part} verdict ${p.verdict}`);
  }
});

test("every food has exactly one review entry, and every review has a food", () => {
  assert.equal(reviews.length, foods.length);
  assert.equal(byId.size, reviews.length, "duplicate review entry");
  for (const f of foods) assert.ok(byId.has(f.id), `${f.id} has no review entry`);
  for (const r of reviews) assert.ok(foods.some((f) => f.id === r.food_id), `review for unknown food ${r.food_id}`);
});

test("review entries are complete", () => {
  for (const r of reviews) {
    assert.ok(STATUSES.includes(r.status), `${r.food_id} status ${r.status}`);
    assert.equal(r.reviewed_by, "claude-opus");
    assert.match(r.reviewed_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(typeof r.changes === "string" && r.changes.length > 0, `${r.food_id} changes`);
    assert.ok(Array.isArray(r.sources_checked) && r.sources_checked.length > 0, `${r.food_id} sources_checked`);
    for (const u of r.sources_checked) assert.match(u, /^https:\/\//, `${r.food_id} bad url ${u}`);
  }
});

test("needs_review is false only when the review approved it on 2+ independent page-level sources", () => {
  for (const f of foods) {
    const r = byId.get(f.id);
    if (r.status === "needs-human") {
      assert.equal(f.needs_review, true, `${f.id} is needs-human but needs_review is false`);
      continue;
    }
    assert.equal(f.needs_review, false, `${f.id} is ${r.status} but still needs_review`);
    assert.ok(f.sources.every((s) => s.source_confidence === "page"), `${f.id} has a domain-level source`);
    const domains = new Set(f.sources.map((s) => regDomain(s.url)));
    assert.ok(domains.size >= 2, `${f.id} has ${domains.size} independent publisher(s)`);
  }
});

test("every food lists 2+ distinct source URLs", () => {
  for (const f of foods) {
    const urls = new Set(f.sources.map((s) => s.url));
    assert.ok(urls.size >= 2, `${f.id} has ${urls.size} source URL(s)`);
    for (const s of f.sources) assert.ok(s.publisher && ["page", "domain"].includes(s.source_confidence), `${f.id} bad source`);
  }
});

test("every unsafe food names what is toxic and says do not feed", () => {
  for (const f of foods.filter((x) => x.verdict === "unsafe")) {
    assert.ok(f.toxic_compounds.length > 0, `${f.id} is unsafe but names no toxic compound`);
    for (const t of f.toxic_compounds) assert.ok(t.compound.trim(), `${f.id} has an empty compound`);
    assert.match(f.serving_guidance, /^Do not feed\./, `${f.id} serving guidance`);
    assert.match(f.serving_guidance, /vet/, `${f.id} serving guidance should point to a vet`);
  }
});

test("every unsafe part gives a reason", () => {
  for (const f of foods) {
    for (const p of f.parts.filter((x) => x.verdict === "unsafe")) {
      assert.ok(p.reason.trim().length > 0, `${f.id} unsafe part ${p.part} has no reason`);
    }
  }
});

test("no alias or name points at two different foods", () => {
  const seen = new Map();
  for (const f of foods) {
    for (const term of [f.name, ...f.aliases]) {
      const key = term.toLowerCase().replace(/s$/, "");
      const owner = seen.get(key);
      assert.ok(!owner || owner === f.id, `"${term}" is on both ${owner} and ${f.id}`);
      seen.set(key, f.id);
    }
  }
});

test("published text uses US spelling", () => {
  const british = /\b(mould|colour|flavour|favourite|fibre|moult|fertilis|anaem|haemag|sulphur|yoghurt)/i;
  for (const f of foods) {
    const text = [f.name, f.verdict_reason, f.serving_guidance, ...f.preparation, ...f.benefits,
      ...f.parts.flatMap((p) => [p.part, p.reason]), ...f.toxic_compounds.flatMap((t) => [t.compound, t.note])].join(" ");
    assert.doesNotMatch(text, british, `${f.id} has British spelling`);
  }
});

test("no em dash in the food data or the reviews", () => {
  assert.ok(!foodsText.includes("—"), "em dash in food-safety.json");
  assert.ok(!reviewsText.includes("—"), "em dash in food-safety-reviews.json");
});

test("foods_index.json lists every curated food", () => {
  const index = JSON.parse(read("../data/foods_index.json"));
  assert.deepEqual(index.map((f) => f.id), foods.map((f) => f.id));
});
