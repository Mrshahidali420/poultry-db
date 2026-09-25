import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRefsByEntity, harrisTextFor, buildIndexEntry } from "../scripts/fetch-articles.mjs";

const REFERENCE_SOURCES = [
  {
    id: "apa-accepted-breeds",
    entity_type: "breeds",
    entity_ids: ["brahma", "ancona"],
    url: "https://example.com/apa",
    final_url: "https://example.com/apa",
    http_status: 200,
    cache_file: "cache/sources/apa-accepted-breeds.txt",
  },
  {
    id: "dead-link",
    entity_type: "breeds",
    entity_ids: ["brahma"],
    url: "https://example.com/dead",
    http_status: 404,
    cache_file: "cache/sources/dead-link.txt",
  },
  {
    id: "aphis-avian-influenza",
    entity_type: "diseases",
    entity_ids: ["avian-influenza"],
    url: "https://example.com/aphis",
    final_url: "https://example.com/aphis",
    http_status: 200,
    cache_file: "cache/sources/aphis-avian-influenza.txt",
  },
];

test("groupRefsByEntity groups only 200-status refs by entity id", () => {
  const map = groupRefsByEntity(REFERENCE_SOURCES, "breeds");
  assert.deepEqual(map.get("brahma"), [{ url: "https://example.com/apa", cache_file: "cache/sources/apa-accepted-breeds.txt" }]);
  assert.deepEqual(map.get("ancona"), [{ url: "https://example.com/apa", cache_file: "cache/sources/apa-accepted-breeds.txt" }]);
  assert.equal(map.has("some-other-breed"), false);
});

test("groupRefsByEntity filters by entity_type", () => {
  const map = groupRefsByEntity(REFERENCE_SOURCES, "diseases");
  assert.deepEqual(map.get("avian-influenza"), [{ url: "https://example.com/aphis", cache_file: "cache/sources/aphis-avian-influenza.txt" }]);
  assert.equal(map.has("brahma"), false);
});

test("groupRefsByEntity drops refs with no cache_file", () => {
  const map = groupRefsByEntity(
    [{ entity_type: "breeds", entity_ids: ["ancona"], http_status: 200, url: "https://x", cache_file: null }],
    "breeds"
  );
  assert.equal(map.has("ancona"), false);
});

const HARRIS_ROWS = [
  { breed_id: "australorp", description: "Around the same time..." },
  { breed_id: null, description: "Some unmatched breed" },
  { breed_id: "ancona", description: "" },
];

test("harrisTextFor returns the matched description", () => {
  assert.equal(harrisTextFor("australorp", HARRIS_ROWS), "Around the same time...");
});

test("harrisTextFor returns null when no row matches", () => {
  assert.equal(harrisTextFor("brahma", HARRIS_ROWS), null);
});

test("harrisTextFor returns null when the matched row has an empty description", () => {
  assert.equal(harrisTextFor("ancona", HARRIS_ROWS), null);
});

test("harrisTextFor returns null when harrisRows is null (CSV not cached)", () => {
  assert.equal(harrisTextFor("australorp", null), null);
});

test("buildIndexEntry keeps only present (non-null) files", () => {
  const entry = buildIndexEntry({ article: 5000, refs: null, harris: 200 });
  assert.deepEqual(entry, { files: { article: 5000, harris: 200 } });
});

test("buildIndexEntry returns an empty files object when nothing was fetched", () => {
  const entry = buildIndexEntry({ article: null, refs: null, harris: null });
  assert.deepEqual(entry, { files: {} });
});
