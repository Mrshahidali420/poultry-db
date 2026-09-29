import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTransboundaryLinks,
  collectUsesByGroup,
  en,
  latestTrend,
  normalizeFull,
  populationHistory,
  summarize,
} from "../scripts/lib/dadis-full.mjs";
import { buildJobs } from "../scripts/fetch-dadis-full.mjs";
import { candidateTitles, isChickenPage, nameTokens, pickBest } from "../scripts/fetch-global-photos.mjs";

// Trimmed but structurally real, shaped like Data/breeds/THA/Chicken/Kai Naresuan.json
const RAW = {
  General: {
    CryoStatus: "noMaterial",
    Name: {
      MostCommonName: "Kai Naresuan",
      TransboundaryOrBrandName: "",
      Description: "Thai original",
      Description_i18n: { en: "Fighting cock history", es: "Historia" },
    },
    OtherNames: { a: { OtherNames: "Naresuan fowl", Language: "Thai" }, b: { OtherNames: "Kai Naresuan" } },
    Risk: { breedRisk: "notAtRisk", breedRiskDetail: "notAtRisk" },
    Uses: {
      ProvisionUse: { Eggs: false, Meat: true },
      CulturalUse: { Fighting: true, Fancy: false },
      RegulationAndMaintenanceUse: { PestControl: true },
    },
    Images: { x: { PathImg: "https://example.org/a.jpg", Gender: "male", Caption: "" } },
  },
  Population: {
    1989: { year: 1989, populationSizeMin: 100, populationSizeMax: 100, trend: "", deleted: "N", reliability: "reliable" },
    1990: { year: 1990, populationSizeMin: 100, populationSizeMax: 200, trend: "increasing", deleted: "N", breedingFemale: 60 },
    1991: { year: 1991, populationSizeMin: 5, populationSizeMax: 5, trend: "decreasing", deleted: "Y" },
    1992: { year: 1992, populationSizeMin: "", populationSizeMax: "", trend: "undefined", deleted: "N" },
  },
  OriginAndDevelopment: { DescriptionOfOrigin: "Phitsanulok", BreedClassification: "native", YearOfOrigin: "" },
  Morphology: {
    Morphology: { WeightMales: "3.5", WeightFemales: "0", OtherSpecificVisibleTraits: "" },
    BirdSpecific: { CombType: "pea", EggShellColour: "cream", ShankAndFootColour: "yellow" },
    Colour: {},
  },
  Performance: { Eggs: { eggsPerYearAVG: "60", eggWeight: "" }, Performance: { carcassWeight: "1.8", dailyGain: "0" } },
  AdditionalInformation: { DistinctiveTraits: { SpecificResistanceOrTolerance: "disease resistance" } },
  Conservation: { InVivoProgramme: { Programme: { isInPlace: true, description: "in situ" } } },
  BreedingProgramme: { performanceRecording: "Yes", pedigreeRecording: "No" },
  Geodistribution: { Features: { f1: { admNameLevel1: "Phitsanulok", populationSize: 500, year: 2020 } } },
  lastUpdate: { Timestamp: "2022-07-09" },
};

test("en prefers the English translation", () => {
  assert.equal(en(RAW.General.Name, "Description"), "Fighting cock history");
  assert.equal(en({ A: "plain" }, "A"), "plain");
  assert.equal(en({ A: "" }, "A"), null);
});

test("uses are grouped and only true flags kept", () => {
  assert.deepEqual(collectUsesByGroup(RAW.General.Uses), { provision: ["meat"], cultural: ["fighting"], regulation: ["pest_control"] });
});

test("population history drops deleted and empty rows and keeps valid trends", () => {
  const h = populationHistory(RAW.Population);
  assert.deepEqual(h.map((r) => r.year), [1989, 1990]);
  assert.equal(h[1].size, 150);
  assert.equal(h[1].breeding_females, 60);
  assert.equal(h[0].trend, undefined);
  assert.deepEqual(latestTrend(h), { trend: "increasing", year: 1990 });
});

test("normalizeFull keeps the full record and drops zero values", () => {
  const r = normalizeFull(RAW, { iso3: "THA", breedName: "Kai Naresuan", countryName: "Thailand", region: "Asia" });
  assert.equal(r.id, "tha-kai-naresuan");
  assert.equal(r.region, "Asia");
  assert.deepEqual(r.other_names, [{ name: "Naresuan fowl", language: "Thai" }]);
  assert.equal(r.risk_status, "not_at_risk");
  assert.equal(r.cryo_status, "no_material");
  assert.deepEqual(r.population_latest, { year: 1990, size: 150 });
  assert.deepEqual(r.main_uses, ["fighting", "meat", "pest_control"]);
  assert.deepEqual(r.adult_weights, { male_kg: 3.5 });
  assert.deepEqual(r.eggs, { per_year_avg: 60, shell_colour: "cream" });
  assert.deepEqual(r.performance, { carcass_weight: 1.8 });
  assert.equal(r.morphology.comb, "pea");
  assert.equal(r.distinctive_traits.resistance, "disease resistance");
  assert.equal(r.conservation.in_vivo, true);
  assert.deepEqual(r.breeding_programme, ["performance_recording"]);
  assert.deepEqual(r.distribution, [{ area: "Phitsanulok", population: 500, year: 2020 }]);
  assert.match(r.source_url, /country=THA/);
  assert.equal(normalizeFull(null, { iso3: "THA", breedName: "x" }), null);
});

test("transboundary links join the same breed across countries, not within one", () => {
  const recs = [
    { id: "gbr-sussex", name: "Sussex", country_iso3: "GBR", country_name: "United Kingdom" },
    { id: "deu-sussex", name: "Sussex", country_iso3: "DEU", country_name: "Germany" },
    { id: "deu-other", name: "Other", country_iso3: "DEU", country_name: "Germany" },
  ];
  const out = addTransboundaryLinks(recs);
  assert.deepEqual(out[0].same_breed_elsewhere.map((x) => x.id), ["deu-sussex"]);
  assert.equal(out[2].same_breed_elsewhere, undefined);
  assert.equal(recs[0].same_breed_elsewhere, undefined, "input not mutated");
  const s = summarize(out);
  assert.equal(s.world.total, 3);
  assert.equal(s.countries.DEU.breeds, 2);
  assert.equal(s.countries.DEU.transboundary, 1);
});

test("buildJobs gives colliding slugs a numeric suffix", () => {
  const jobs = buildJobs({ NZL: { "Aseal Asil": 1, "Aseal - Asil": 1 } });
  assert.deepEqual(jobs.map((j) => j.fileSlug).sort(), ["aseal-asil", "aseal-asil-2"]);
});

test("photo matching helpers", () => {
  assert.deepEqual(candidateTitles("ayam cemani"), ["Ayam cemani chicken", "Ayam cemani (chicken)", "Ayam cemani"]);
  assert.deepEqual(candidateTitles("Polish chicken"), ["Polish chicken"]);
  assert.equal(isChickenPage({ pageprops: { "wikibase-shortdesc": "Breed of chicken from Indonesia" } }), true);
  assert.equal(isChickenPage({ pageprops: { "wikibase-shortdesc": "Island of Indonesia" } }), false);
  assert.equal(isChickenPage({ pageprops: { "wikibase-shortdesc": "Chicken dish" } }), false);
  assert.deepEqual(nameTokens("Ayam Cemani"), ["ayam", "cemani"]);
});

test("pickBest prefers a big lead JPEG, else the biggest named JPEG, and skips maps", () => {
  const lead = { file: "Poule.jpg", width: 3000, height: 2000, mime: "image/jpeg", lead: true };
  const named = { file: "Ayam_cemani_rooster.jpg", width: 2400, height: 1800, mime: "image/jpeg" };
  const map = { file: "Cemani_map.jpg", width: 5000, height: 4000, mime: "image/jpeg" };
  const png = { file: "Cemani.png", width: 5000, height: 4000, mime: "image/png" };
  assert.equal(pickBest([lead, named, map, png], ["cemani"]).file, "Poule.jpg");
  const smallLead = { ...lead, width: 900, height: 700 };
  assert.equal(pickBest([smallLead, named, map], ["cemani"]).file, "Ayam_cemani_rooster.jpg");
  assert.equal(pickBest([map, png], ["cemani"]), null);
});
