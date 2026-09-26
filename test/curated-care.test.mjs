import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = ["chick-care-by-week.json", "feed-guide.json", "laying-guide.json", "lifecycle-faq.json"];
const dir = new URL("../data/curated/", import.meta.url);
const load = (name) => {
  const text = readFileSync(new URL(name, dir), "utf8");
  return { text, records: JSON.parse(text) };
};

for (const name of FILES) {
  test(`${name} parses as a non-empty array`, () => {
    const { records } = load(name);
    assert.ok(Array.isArray(records) && records.length > 0);
  });

  test(`${name} has unique kebab-case ids`, () => {
    const { records } = load(name);
    const ids = records.map((r) => r.id);
    for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
    assert.equal(new Set(ids).size, ids.length, "duplicate id");
  });

  test(`${name}: every record has 2+ distinct source URLs and needs_review`, () => {
    const { records } = load(name);
    for (const r of records) {
      assert.ok(Array.isArray(r.sources), `${r.id} has no sources`);
      const urls = new Set(r.sources.map((s) => s.url));
      assert.ok(urls.size >= 2, `${r.id} has ${urls.size} source URL(s)`);
      for (const s of r.sources) {
        assert.match(s.url, /^https?:\/\//, `${r.id} bad url`);
        assert.ok(s.name && s.publisher, `${r.id} source missing name or publisher`);
      }
      // needs_review may be false after the W1-04 review; curated-reviews.test.mjs checks when.
      assert.equal(typeof r.needs_review, "boolean", `${r.id} needs_review`);
      assert.equal(typeof r.conflict, "boolean", `${r.id} conflict flag`);
    }
  });

  test(`${name} has no em dash`, () => {
    assert.ok(!load(name).text.includes("—"));
  });
}

test("lifecycle-faq has 30 to 50 questions", () => {
  const n = load("lifecycle-faq.json").records.length;
  assert.ok(n >= 30 && n <= 50, `got ${n}`);
});

test("chick-care-by-week covers hatch to point of lay in order", () => {
  const recs = load("chick-care-by-week.json").records.slice().sort((a, b) => a.order - b.order);
  assert.equal(recs[0].age_days_min, 0);
  assert.equal(recs.at(-1).age_days_max, null);
  for (let i = 1; i < recs.length; i++) {
    assert.ok(recs[i].age_days_min > recs[i - 1].age_days_min, `${recs[i].id} out of order`);
  }
});
