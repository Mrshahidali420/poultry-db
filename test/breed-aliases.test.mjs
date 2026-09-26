import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");

async function loadJson(file) {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
}

test("every breed alias points at an existing breed id", async () => {
  const breeds = await loadJson("breeds.json");
  const aliases = await loadJson("breed-aliases.json");
  const breedIds = new Set(breeds.map((b) => b.id));

  const missing = aliases
    .filter((a) => !breedIds.has(a.breed_id))
    .map((a) => `${a.alias} -> ${a.breed_id}`);

  assert.deepEqual(missing, [], `alias(es) point at a breed id that does not exist: ${missing.join(", ")}`);
});

test("no breed id is duplicated in breeds.json", async () => {
  const breeds = await loadJson("breeds.json");
  const seen = new Map();
  const duplicates = [];

  for (const b of breeds) {
    if (seen.has(b.id)) duplicates.push(b.id);
    seen.set(b.id, true);
  }

  assert.deepEqual(duplicates, [], `duplicate breed id(s): ${duplicates.join(", ")}`);
});

test("no alias_slug is duplicated in breed-aliases.json", async () => {
  const aliases = await loadJson("breed-aliases.json");
  const seen = new Map();
  const duplicates = [];

  for (const a of aliases) {
    if (seen.has(a.alias_slug)) duplicates.push(a.alias_slug);
    seen.set(a.alias_slug, true);
  }

  assert.deepEqual(duplicates, [], `duplicate alias_slug(s): ${duplicates.join(", ")}`);
});

test("every alias record has the required shape", async () => {
  const aliases = await loadJson("breed-aliases.json");

  for (const a of aliases) {
    assert.equal(typeof a.alias, "string", `alias name missing for ${JSON.stringify(a)}`);
    assert.equal(typeof a.alias_slug, "string", `alias_slug missing for ${a.alias}`);
    assert.equal(typeof a.breed_id, "string", `breed_id missing for ${a.alias}`);
    assert.ok(a.kind === "variety" || a.kind === "alias", `kind must be "variety" or "alias" for ${a.alias}`);
    assert.equal(typeof a.source_url, "string", `source_url missing for ${a.alias}`);
  }
});

test("no dangling breed ids anywhere in the data", async () => {
  const breedIds = new Set((await loadJson("breeds.json")).map((b) => b.id));
  const refs = [];
  const add = (file, ids) => ids.forEach((id) => refs.push([file, id]));

  add("breeds_extra.json", (await loadJson("breeds_extra.json")).map((r) => r.id));
  add("breed-aliases.json", (await loadJson("breed-aliases.json")).map((a) => a.breed_id));
  add("breed-dadis-links.json", (await loadJson("breed-dadis-links.json")).map((d) => d.breed_id));
  add("breed-photos-extra.json", (await loadJson("breed-photos-extra.json")).map((p) => p.breed_id));
  add("reviews/breeds-reviews.json", (await loadJson("reviews/breeds-reviews.json")).map((r) => r.breed_id));
  for (const s of await loadJson("curated/breeds-by-state.json")) {
    add("curated/breeds-by-state.json", s.recommended_breed_ids);
    add("curated/breeds-by-state.json", s.why.map((w) => w.breed_id));
  }
  for (const file of ["images.json", "image-list.json", "images-original.json", "images_failed.json", "images-original-failed.json"]) {
    add(file, (await loadJson(file)).filter((r) => r.entity_type === "breeds").map((r) => r.entity_id));
  }

  const dangling = refs.filter(([, id]) => !breedIds.has(id)).map(([file, id]) => `${file}: ${id}`);
  assert.deepEqual([...new Set(dangling)], [], `unknown breed id(s): ${[...new Set(dangling)].join(", ")}`);
});

test("breeds_extra.json has exactly one record per breed", async () => {
  const breedIds = (await loadJson("breeds.json")).map((b) => b.id).sort();
  const extraIds = (await loadJson("breeds_extra.json")).map((r) => r.id).sort();
  assert.deepEqual(extraIds, breedIds);
});

test("merged and retired breed ids are aliases or production types, not breeds", async () => {
  const breedIds = new Set((await loadJson("breeds.json")).map((b) => b.id));
  const aliasTo = new Map((await loadJson("breed-aliases.json")).map((a) => [a.alias_slug, a.breed_id]));
  const expected = { "golden-comet": "red-sex-link", "isa-brown": "red-sex-link", isbar: "silverudd-blue" };
  for (const [slug, target] of Object.entries(expected)) {
    assert.ok(!breedIds.has(slug), `${slug} should not be a breed id`);
    assert.equal(aliasTo.get(slug), target, `${slug} should alias ${target}`);
  }
  assert.ok(!breedIds.has("broiler"), "broiler is a production type, not a breed");
  const types = await loadJson("curated/production-types.json");
  assert.ok(types.some((t) => t.id === "broiler"), "production-types.json keeps the broiler facts");
});

test("an alias never shares its slug with a real breed id (no shadowing)", async () => {
  const breeds = await loadJson("breeds.json");
  const aliases = await loadJson("breed-aliases.json");
  const breedIds = new Set(breeds.map((b) => b.id));

  const shadowed = aliases
    .filter((a) => breedIds.has(a.alias_slug) && a.alias_slug !== a.breed_id)
    .map((a) => a.alias_slug);

  assert.deepEqual(shadowed, [], `alias_slug collides with an unrelated breed id: ${shadowed.join(", ")}`);
});
