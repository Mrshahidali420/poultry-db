import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dataDir = new URL("../data/", import.meta.url);
const load = (name) => {
  const text = readFileSync(new URL(name, dataDir), "utf8");
  return { text, records: JSON.parse(text) };
};

const { text: productsText, records: products } = load("products.json");
const { text: categoriesText, records: categories } = load("product-categories.json");
const { text: hatcheriesText, records: hatcheries } = load("hatcheries.json");

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test("products.json parses as a non-empty array", () => {
  assert.ok(Array.isArray(products) && products.length > 0);
});

test("product-categories.json parses as a non-empty array", () => {
  assert.ok(Array.isArray(categories) && categories.length > 0);
});

test("hatcheries.json parses as a non-empty array", () => {
  assert.ok(Array.isArray(hatcheries) && hatcheries.length > 0);
});

test("has 120+ products", () => {
  assert.ok(products.length >= 120, `only ${products.length} products`);
});

test("has 20+ hatcheries", () => {
  assert.ok(hatcheries.length >= 20, `only ${hatcheries.length} hatcheries`);
});

test("product ids are unique kebab-case", () => {
  const ids = products.map((p) => p.id);
  for (const id of ids) assert.match(id, idPattern, `bad id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate product id");
});

test("category ids are unique kebab-case", () => {
  const ids = categories.map((c) => c.id);
  for (const id of ids) assert.match(id, idPattern, `bad id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate category id");
});

test("hatchery ids are unique kebab-case", () => {
  const ids = hatcheries.map((h) => h.id);
  for (const id of ids) assert.match(id, idPattern, `bad id ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate hatchery id");
});

test("every product's category exists in product-categories.json", () => {
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const p of products) {
    assert.ok(categoryIds.has(p.category), `${p.id} has unknown category ${p.category}`);
  }
});

test("every product has a category and at least one source or a search URL", () => {
  for (const p of products) {
    assert.ok(p.category && typeof p.category === "string", `${p.id} missing category`);
    const hasSource = Array.isArray(p.sources) && p.sources.length > 0;
    const hasSearchUrl = typeof p.amazon_url_search === "string" && p.amazon_url_search.length > 0;
    assert.ok(hasSource || hasSearchUrl, `${p.id} has neither a source nor a search URL`);
    if (hasSearchUrl) assert.match(p.amazon_url_search, /^https?:\/\//, `${p.id} bad search url`);
    if (hasSource) {
      for (const s of p.sources) {
        assert.match(s.url, /^https?:\/\//, `${p.id} bad source url`);
        assert.ok(s.name, `${p.id} source missing name`);
      }
    }
  }
});

test("every product has name, brand, subcategory, price_range_usd, pros, cons, who_its_for", () => {
  for (const p of products) {
    assert.ok(p.name, `${p.id} missing name`);
    assert.ok(p.brand, `${p.id} missing brand`);
    assert.ok(p.subcategory, `${p.id} missing subcategory`);
    assert.ok(p.price_range_usd, `${p.id} missing price_range_usd`);
    assert.equal(p.price_checked, "2026-09-26", `${p.id} price_checked mismatch`);
    assert.ok(Array.isArray(p.pros) && p.pros.length > 0, `${p.id} missing pros`);
    assert.ok(Array.isArray(p.cons) && p.cons.length > 0, `${p.id} missing cons`);
    assert.ok(p.who_its_for, `${p.id} missing who_its_for`);
    assert.ok("amazon_asin" in p, `${p.id} missing amazon_asin field`);
  }
});

test("amazon_asin is either null or a plausible ASIN string", () => {
  for (const p of products) {
    if (p.amazon_asin !== null) {
      assert.match(p.amazon_asin, /^[A-Z0-9]{10}$/, `${p.id} has malformed asin ${p.amazon_asin}`);
    }
  }
});

test("every category has buyer_guide_points and a search_phrase", () => {
  for (const c of categories) {
    assert.ok(c.title, `${c.id} missing title`);
    assert.ok(Array.isArray(c.buyer_guide_points) && c.buyer_guide_points.length >= 4, `${c.id} needs 4+ buyer guide points`);
    assert.ok(c.search_phrase, `${c.id} missing search_phrase`);
  }
});

test("every hatchery has a website and required review fields", () => {
  for (const h of hatcheries) {
    assert.ok(h.name, `${h.id} missing name`);
    assert.match(h.website, /^https?:\/\//, `${h.id} bad website url`);
    assert.ok(Array.isArray(h.sources) && h.sources.length > 0, `${h.id} missing sources`);
    for (const s of h.sources) {
      assert.match(s.url, /^https?:\/\//, `${h.id} bad source url`);
      assert.ok(s.name, `${h.id} source missing name`);
    }
    assert.equal(h.needs_review, true, `${h.id} needs_review must be true`);
    assert.equal(h.last_checked, "2026-09-26", `${h.id} last_checked mismatch`);
    assert.ok(Array.isArray(h.sells), `${h.id} sells must be an array`);
  }
});

test("no em dash in products.json, product-categories.json, or hatcheries.json", () => {
  assert.ok(!productsText.includes("—"), "em dash found in products.json");
  assert.ok(!categoriesText.includes("—"), "em dash found in product-categories.json");
  assert.ok(!hatcheriesText.includes("—"), "em dash found in hatcheries.json");
});
