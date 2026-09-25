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

test("an alias never shares its slug with a real breed id (no shadowing)", async () => {
  const breeds = await loadJson("breeds.json");
  const aliases = await loadJson("breed-aliases.json");
  const breedIds = new Set(breeds.map((b) => b.id));

  const shadowed = aliases
    .filter((a) => breedIds.has(a.alias_slug) && a.alias_slug !== a.breed_id)
    .map((a) => a.alias_slug);

  assert.deepEqual(shadowed, [], `alias_slug collides with an unrelated breed id: ${shadowed.join(", ")}`);
});
