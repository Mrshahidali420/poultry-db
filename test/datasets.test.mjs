import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../scripts/lib/csv.mjs";
import { breedKey, buildBreedIndex, resolveBreedId, diseaseKey } from "../scripts/lib/match.mjs";
import { parseChickenDictionary, parseEggBand, toImportRows, CHICKEN_DICTIONARY_URL } from "../scripts/lib/chicken-dictionary.mjs";
import { htmlToText, extractLinks } from "../scripts/lib/html.mjs";
import { parseFaostatRows } from "../scripts/lib/faostat.mjs";

test("parseCsv handles quoted commas, doubled quotes and embedded newlines", () => {
  const rows = parseCsv('breed_category,breed_name,description,image\nBROWN LAYERS,Australorp,"Lays 250 eggs, ""light brown"".\nSecond line.",australorp.jpg\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].breed_name, "Australorp");
  assert.equal(rows[0].description, 'Lays 250 eggs, "light brown".\nSecond line.');
  assert.equal(rows[0].image, "australorp.jpg");
});

test("breedKey makes Wikipedia titles and plain names comparable", () => {
  assert.equal(breedKey("Silkie (chicken breed)"), "silkie");
  assert.equal(breedKey("Brahma chicken"), "brahma");
  assert.equal(breedKey("Indian Game (poultry)"), "indian game");
  assert.equal(breedKey("Barnvelder"), "barnevelder");
  assert.equal(breedKey("Black Copper Marans"), "marans");
});

test("resolveBreedId matches by name and by altname", () => {
  const index = buildBreedIndex([
    { id: "brahma-chicken", name: "Brahma chicken", altnames: ["Brahma Pootra"] },
    { id: "marans", name: "Marans", altnames: [] },
  ]);
  assert.equal(resolveBreedId(index, "Light Brahma"), "brahma-chicken");
  assert.equal(resolveBreedId(index, "Brahma Pootra"), "brahma-chicken");
  assert.equal(resolveBreedId(index, "Maran"), "marans");
  assert.equal(resolveBreedId(index, "Easter Egger"), null);
});

test("diseaseKey matches 'X in Poultry' to 'X'", () => {
  assert.equal(diseaseKey("Botulism in Poultry"), diseaseKey("Botulism"));
});

const TS_FIXTURE = `
export const breedData: Breed[] = [
  {
    id: "silkie",
    name: "Silkie",
    origin: "China",
    size: "Bantam",
    eggColor: "Cream / Tinted",
    eggProduction: "Low (under 100/year)",
    eggSize: "Small",
    temperament: ["Docile", "Friendly"],
    hardiness: "Needs Shelter",
    combType: "Walnut",
    foraging: "Poor",
    noiseLevel: "Whisper Quiet",
    colorTheme: {
      bg: "bg-teal-50/60",
      text: "text-teal-900"
    }
  },
  {
    id: "leghorn",
    name: "Leghorn",
    origin: "Italy",
    size: "Standard",
    eggColor: "Bright White",
    eggProduction: "Superb (250-300+/year)",
    eggSize: "Large",
    temperament: ["Active"],
    hardiness: "Heat Tolerant",
    combType: "Single",
    foraging: "Excellent",
    noiseLevel: "Vocal & Chatty",
    colorTheme: { bg: "x" }
  }
];`;

test("parseChickenDictionary reads top-level fields and ignores colorTheme", () => {
  const breeds = parseChickenDictionary(TS_FIXTURE);
  assert.equal(breeds.length, 2);
  assert.equal(breeds[0].name, "Silkie");
  assert.deepEqual(breeds[0].temperament, ["Docile", "Friendly"]);
  assert.equal(breeds[1].hardiness, "Heat Tolerant");
  assert.equal(breeds[0].bg, undefined);
});

test("parseEggBand turns production bands into min/max", () => {
  assert.deepEqual(parseEggBand("Superb (250-300+/year)"), { min: 250, max: 300 });
  assert.deepEqual(parseEggBand("Low (under 100/year)"), { min: null, max: 100 });
});

test("toImportRows emits import-schema rows with origin and needs_review", () => {
  const [, leghorn] = parseChickenDictionary(TS_FIXTURE);
  const rows = toImportRows("leghorn-chicken", leghorn);
  const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
  assert.equal(byField.eggs_per_year_min.value, 250);
  assert.equal(byField.heat_tolerant.value, true);
  assert.equal(byField.cold_hardy, undefined);
  assert.equal(byField.egg_size.value, "large");
  for (const r of rows) {
    assert.equal(r.entity_id, "leghorn-chicken");
    assert.equal(r.source_url, CHICKEN_DICTIONARY_URL);
    assert.equal(r.origin, "github:iamthechickenlady-netizen/chicken-dictionary");
    assert.equal(r.needs_review, true);
  }
});

test("htmlToText drops scripts/nav and keeps readable text", () => {
  const text = htmlToText("<html><nav>Menu</nav><main><h1>Botulism</h1><p>Caused by a toxin &amp; more.</p><script>x()</script></main></html>");
  assert.match(text, /Botulism/);
  assert.match(text, /Caused by a toxin & more\./);
  assert.doesNotMatch(text, /Menu|x\(\)/);
});

test("extractLinks resolves relative links with their anchor text", () => {
  const links = extractLinks('<a href="/breeds/chickens/soft-feather-heavy/australorp/">Australorp</a>', "https://www.poultryclub.org/breeds/chickens/");
  assert.deepEqual(links, [{ url: "https://www.poultryclub.org/breeds/chickens/soft-feather-heavy/australorp/", text: "Australorp" }]);
});

test("parseFaostatRows pivots items into one row per country and year", () => {
  const csv = [
    '"Area Code","Area Code (M49)","Area","Item Code","Item Code (CPC)","Item","Element Code","Element","Year Code","Year","Unit","Value","Flag","Note"',
    '2,"\'004","Afghanistan",1057,"\'02151","Chickens",5112,"Stocks",2022,2022,"1000 An",13000,"E",""',
    '2,"\'004","Afghanistan",1062,"\'0231","Hen eggs in shell, fresh",5510,"Production",2022,2022,"t",20000,"E",""',
    '2,"\'004","Afghanistan",1062,"\'0231","Hen eggs in shell, fresh",5313,"Laying",2022,2022,"1000 An",9000,"E",""',
    '2,"\'004","Afghanistan",1058,"\'21121","Meat of chickens, fresh or chilled",5510,"Production",2022,2022,"t",30000,"E",""',
    '2,"\'004","Afghanistan",1057,"\'02151","Chickens",5112,"Stocks",2010,2010,"1000 An",1,"E",""',
  ].join("\n");
  const rows = parseFaostatRows(csv, { minYear: 2015 });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    country: "Afghanistan",
    m49_code: "004",
    year: 2022,
    chickens_head: 13000000,
    egg_laying_hens: 9000000,
    eggs_tonnes: 20000,
    chicken_meat_tonnes: 30000,
  });
});
