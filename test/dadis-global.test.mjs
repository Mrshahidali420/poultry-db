import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBreedDadisLinks,
  buildGlobalByName,
  buildSourceUrl,
  humanizeCamel,
  normalizeDadisRecord,
  slugify,
} from "../scripts/lib/dadis-global.mjs";
import { buildBreedIndex } from "../scripts/lib/match.mjs";

// Trimmed but structurally real fixture, shaped like
// Data/breeds/USA/Chicken/New Hampshire.json from the public DAD-IS
// Firebase API.
const NEW_HAMPSHIRE_RAW = {
  General: {
    CryoStatus: "sufficient",
    Name: { Description: "", Language: "eng.", MostCommonName: "New Hampshire", TransboundaryOrBrandName: "New Hampshire" },
    Risk: { breedRisk: "unknown", breedRiskDetail: "unknown" },
    Uses: {
      CulturalUse: { Fancy: false, Fighting: false },
      ProvisionUse: { Eggs: true, Meat: true, Milk: false },
      RegulationAndMaintenanceUse: { PestControl: false },
    },
    Images: {
      "--valImages-id_1383": {
        Caption: "New Hampshire Rooster",
        Caption_i18n: { en: "New Hampshire Rooster" },
        FileName: "New Hampshire_brId_50004782_imId_1383.jpeg",
        Gender: "male",
        PathImg: "https://firebasestorage.googleapis.com/v0/b/dadis-training.appspot.com/o/img1.jpeg?alt=media",
        PhotoCredit: "",
      },
      "--valImages-id_broken": { Caption: "no path", PathImg: "" },
    },
  },
  Morphology: {
    BirdSpecific: { CombType: "Single", EggShellColour: "Brown", PlumageColour: "red", SkinColour: "Yellow" },
    Colour: { ColorComments: "", EfabisMainColour: "" },
    Morphology: { WeightFemales: 2.94, WeightMales: 3.85, OtherSpecificVisibleTraits: "Single comb, medium to large." },
  },
  Performance: {
    Eggs: undefined,
    Performance: { CommentsManagmentConditions: "" },
  },
  Population: {
    2003: { populationSizeMin: 3933, populationSizeMax: 3933, year: 2003, trend: "unknown" },
    2015: { populationSizeMin: 3315, populationSizeMax: 3315, year: 2015, trend: "decreasing" },
  },
  OriginAndDevelopment: {
    BreedClassification: "Native",
    DescriptionOfOrigin: "developed in the USA",
    DomesticationStatus: "Domestic",
    YearOfOrigin: "",
  },
  id: "02f79bcb-d154-4b6d-8264-9be40488a57d",
  lastUpdate: { Node: "Conservation", Timestamp: "Fri Mar 04 2022 14:13:01 GMT+0000 (Coordinated Universal Time)" },
};

const SILKIE_RAW = {
  General: {
    Name: { MostCommonName: "Silkie", TransboundaryOrBrandName: "Silkie" },
    Risk: { breedRisk: "notAtRisk", breedRiskDetail: "notAtRisk" },
    OtherNames: {
      a: { OtherNames: "Bairiong" },
      b: { OtherNames: "Wushan" },
    },
    Uses: { ProvisionUse: { Eggs: false, Meat: false }, CulturalUse: { Fancy: true } },
  },
  Morphology: {
    BirdSpecific: { CombType: "Walnut" },
    Morphology: { WeightFemales: 1.34, WeightMales: 1.65 },
  },
  Performance: { Eggs: { eggWeight: 39.76, eggsPerYearAVG: "" } },
  Population: {},
  id: "19d3edbf",
};

test("normalizeDadisRecord builds a flat record with the fields we care about", () => {
  const r = normalizeDadisRecord(NEW_HAMPSHIRE_RAW, { iso3: "USA", countryName: "United States of America", breedName: "New Hampshire" });
  assert.equal(r.id, "usa-new-hampshire");
  assert.equal(r.name, "New Hampshire");
  assert.equal(r.transboundary_name, undefined, "same as name, so omitted");
  assert.equal(r.country_iso3, "USA");
  assert.equal(r.country_name, "United States of America");
  assert.equal(r.risk_status, undefined, "unknown risk is omitted");
  assert.deepEqual(r.main_uses, ["eggs", "meat"]);
  assert.deepEqual(r.population, { year: 2015, size_min: 3315, size_max: 3315, size: 3315, trend: "decreasing" });
  assert.deepEqual(r.adult_weights, { male_kg: 3.85, female_kg: 2.94 });
  assert.equal(r.morphology.comb, "Single");
  assert.equal(r.morphology.plumage_colour, "red");
  assert.equal(r.eggs.shell_colour, "Brown");
  assert.equal(r.origin.description, "developed in the USA");
  assert.equal(r.origin.classification, "native");
  assert.equal(r.images.length, 1, "the image with an empty PathImg is skipped");
  assert.equal(r.images[0].url, "https://firebasestorage.googleapis.com/v0/b/dadis-training.appspot.com/o/img1.jpeg?alt=media");
  assert.equal(r.images[0].caption, "New Hampshire Rooster");
  assert.equal(r.last_update, "Fri Mar 04 2022 14:13:01 GMT+0000 (Coordinated Universal Time)");
  assert.equal(r.source_url, "https://dadis-breed-datasheet-ws.web.app/?country=USA&specie=Chicken&breed=New%20Hampshire&lang=en");
});

test("normalizeDadisRecord skips empty strings and collects other names, risk status", () => {
  const r = normalizeDadisRecord(SILKIE_RAW, { iso3: "CHN", countryName: "China", breedName: "Silkie" });
  assert.equal(r.id, "chn-silkie");
  assert.equal(r.risk_status, "not_at_risk");
  assert.deepEqual(r.other_names.sort(), ["Bairiong", "Wushan"]);
  assert.equal(r.eggs.weight_g, 39.76);
  assert.equal(r.eggs.per_year_avg, undefined, "empty string is skipped, not coerced to 0/NaN");
  assert.equal(r.population, undefined, "empty Population object yields no population field");
  assert.deepEqual(r.main_uses, ["fancy"]);
});

test("normalizeDadisRecord returns null for missing raw data", () => {
  assert.equal(normalizeDadisRecord(null, { iso3: "USA", breedName: "X" }), null);
});

test("slugify and humanizeCamel", () => {
  assert.equal(slugify("New Hampshire"), "new-hampshire");
  assert.equal(slugify("Naked Neck (Turken)"), "naked-neck-turken");
  assert.equal(humanizeCamel("notAtRisk"), "not at risk");
  assert.equal(humanizeCamel("GeneralCrossbreeding"), "general crossbreeding");
});

test("buildSourceUrl matches the DAD-IS datasheet app's query params", () => {
  assert.equal(
    buildSourceUrl("ETH", "Horro"),
    "https://dadis-breed-datasheet-ws.web.app/?country=ETH&specie=Chicken&breed=Horro&lang=en",
  );
});

test("buildGlobalByName groups populations across countries by normalized breed name", () => {
  const a = normalizeDadisRecord(NEW_HAMPSHIRE_RAW, { iso3: "USA", countryName: "United States of America", breedName: "New Hampshire" });
  const b = normalizeDadisRecord(NEW_HAMPSHIRE_RAW, { iso3: "CAN", countryName: "Canada", breedName: "New Hampshire" });
  const c = normalizeDadisRecord(SILKIE_RAW, { iso3: "CHN", countryName: "China", breedName: "Silkie" });
  const groups = buildGlobalByName([a, b, c]);
  const nh = groups.find((g) => g.record_ids.includes(a.id));
  assert.deepEqual(nh.countries, ["CAN", "USA"]);
  assert.equal(nh.record_ids.length, 2);
  const silkie = groups.find((g) => g.record_ids.includes(c.id));
  assert.deepEqual(silkie.countries, ["CHN"]);
});

test("buildBreedDadisLinks cross-links breeds.json ids by name without mutating breeds.json", () => {
  const breeds = [{ id: "silkie", name: "Silkie", altnames: [] }];
  const index = buildBreedIndex(breeds);
  const silkie = normalizeDadisRecord(SILKIE_RAW, { iso3: "CHN", countryName: "China", breedName: "Silkie" });
  const unmatched = normalizeDadisRecord(NEW_HAMPSHIRE_RAW, { iso3: "USA", countryName: "United States of America", breedName: "New Hampshire" });
  const links = buildBreedDadisLinks([silkie, unmatched], index);
  assert.deepEqual(links, [{ breed_id: "silkie", dadis_ids: ["chn-silkie"] }]);
});
