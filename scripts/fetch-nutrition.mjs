#!/usr/bin/env node
// Builds data/foods_index.json from the research markdown, then downloads
// the USDA SR Legacy CSV bundle (no API key needed) and matches each food
// to its best SR Legacy item, extracting per-100g nutrition facts.
//
// USDA has been observed unreachable (connection refused) from some
// networks this pipeline runs on, but reachable from others (including
// GitHub Actions runners). A network failure here is handled gracefully:
// log "skipped: USDA unreachable" and exit 0 rather than failing the run.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFoodsFromResearch, buildFoodsIndexFromCurated } from "./lib/foods.mjs";
import { politeFetch } from "./lib/http.mjs";
import { listZipEntries, readZipEntry } from "./lib/minizip.mjs";
import { parseCsvLines } from "./lib/csv.mjs";
import { pickBestMatch, bestScoreFor, BEST_SCORE } from "./lib/usda-match.mjs";

const DATA_DIR = path.resolve("data");
const CACHE_DIR = path.resolve("cache");
const FOODS_INDEX_FILE = path.join(DATA_DIR, "foods_index.json");
const NUTRITION_FILE = path.join(DATA_DIR, "nutrition.json");
const UNMATCHED_FILE = path.join(DATA_DIR, "nutrition_unmatched.json");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");

const USDA_ZIP_URL =
  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip";

// nutrient.csv "name" substrings we care about, mapped to our output keys.
// Matched case-insensitively against the full nutrient name.
const NUTRIENT_WANT = [
  { key: "energy_kcal", match: (n, u) => /^energy$/i.test(n) && /kcal/i.test(u) },
  { key: "protein_g", match: (n) => /^protein$/i.test(n) },
  { key: "fat_g", match: (n) => /total lipid \(fat\)/i.test(n) },
  { key: "carbs_g", match: (n) => /carbohydrate, by difference/i.test(n) },
  { key: "fiber_g", match: (n) => /fiber, total dietary/i.test(n) },
  { key: "sugars_g", match: (n) => /sugars, total/i.test(n) },
  { key: "calcium_mg", match: (n) => /^calcium, ca$/i.test(n) },
  { key: "phosphorus_mg", match: (n) => /^phosphorus, p$/i.test(n) },
  { key: "vitamin_a_iu", match: (n) => /vitamin a, iu/i.test(n) },
  { key: "vitamin_a_rae", match: (n) => /vitamin a, rae/i.test(n) },
  { key: "vitamin_c_mg", match: (n) => /vitamin c, total ascorbic acid/i.test(n) },
  { key: "potassium_mg", match: (n) => /^potassium, k$/i.test(n) },
  { key: "water_g", match: (n) => /^water$/i.test(n) },
];

// Rebuilt every run so it always follows its source: the curated
// food-safety table when present, else the research notes.
async function ensureFoodsIndex() {
  await mkdir(DATA_DIR, { recursive: true });
  const curated = await buildFoodsIndexFromCurated();
  const foods = curated ?? (await parseFoodsFromResearch());
  await writeFile(FOODS_INDEX_FILE, JSON.stringify(foods, null, 2) + "\n", "utf8");
  console.log(`Built foods_index.json with ${foods.length} foods from ${curated ? "data/curated/food-safety.json" : "research notes"}.`);
  return foods;
}

async function writePlaceholdersAndExit(foods) {
  try {
    await readFile(NUTRITION_FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") await writeFile(NUTRITION_FILE, "[]\n", "utf8");
  }
  try {
    await readFile(UNMATCHED_FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await writeFile(
        UNMATCHED_FILE,
        JSON.stringify(foods.map((f) => ({ id: f.id, name: f.name, reason: "usda_unreachable" })), null, 2) + "\n",
        "utf8"
      );
    }
  }
}

function findEntryByExactBasename(entries, basename) {
  return entries.find((e) => e.name.split("/").pop() === basename);
}

async function main() {
  const foods = await ensureFoodsIndex();

  console.log("Downloading USDA SR Legacy CSV bundle...");
  let zipBuffer;
  try {
    const response = await politeFetch(USDA_ZIP_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    zipBuffer = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.log(`skipped: USDA unreachable (${err.message})`);
    await writePlaceholdersAndExit(foods);
    process.exitCode = 0;
    return;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  console.log(`Downloaded ${zipBuffer.length} bytes. Extracting CSVs...`);

  const entries = listZipEntries(zipBuffer);
  const foodCsvEntry = findEntryByExactBasename(entries, "food.csv");
  const nutrientCsvEntry = findEntryByExactBasename(entries, "nutrient.csv");
  const foodNutrientCsvEntry = findEntryByExactBasename(entries, "food_nutrient.csv");

  if (!foodCsvEntry || !nutrientCsvEntry || !foodNutrientCsvEntry) {
    console.log("skipped: USDA unreachable (expected CSV members not found in zip)");
    await writePlaceholdersAndExit(foods);
    process.exitCode = 0;
    return;
  }

  const foodRows = parseCsvLines(readZipEntry(zipBuffer, foodCsvEntry).toString("utf8"));
  const nutrientRows = parseCsvLines(readZipEntry(zipBuffer, nutrientCsvEntry).toString("utf8"));
  const foodNutrientRows = parseCsvLines(readZipEntry(zipBuffer, foodNutrientCsvEntry).toString("utf8"));

  // food.csv: fdc_id, data_type, description, food_category_id, publication_date
  const foodDescById = new Map();
  for (let i = 1; i < foodRows.length; i++) {
    const [fdcId, , description] = foodRows[i];
    if (fdcId && description) foodDescById.set(fdcId, description);
  }
  console.log(`  food.csv: ${foodDescById.size} foods`);

  // nutrient.csv: id, name, unit_name, nutrient_nbr, rank
  const wantedNutrientIdToKey = new Map();
  for (let i = 1; i < nutrientRows.length; i++) {
    const [id, name, unitName] = nutrientRows[i];
    for (const wanted of NUTRIENT_WANT) {
      if (wanted.match(name, unitName)) {
        wantedNutrientIdToKey.set(id, wanted.key);
      }
    }
  }
  console.log(`  nutrient.csv: matched ${wantedNutrientIdToKey.size}/${NUTRIENT_WANT.length} wanted nutrients`);

  // food_nutrient.csv: id, fdc_id, nutrient_id, amount, ...
  const nutrientsByFdcId = new Map();
  for (let i = 1; i < foodNutrientRows.length; i++) {
    const row = foodNutrientRows[i];
    const fdcId = row[1];
    const nutrientId = row[2];
    const amount = row[3];
    const key = wantedNutrientIdToKey.get(nutrientId);
    if (!key || !fdcId || amount === "") continue;
    if (!nutrientsByFdcId.has(fdcId)) nutrientsByFdcId.set(fdcId, {});
    nutrientsByFdcId.get(fdcId)[key] = Number(amount);
  }
  console.log(`  food_nutrient.csv: ${foodNutrientRows.length - 1} rows scanned, ${nutrientsByFdcId.size} foods with matched nutrients`);

  const matched = [];
  const unmatched = [];

  // Only items that actually carry nutrient values can be matched.
  const candidates = [...foodDescById].filter(([fdcId]) => nutrientsByFdcId.has(fdcId));

  for (const food of foods) {
    const terms = food.search_terms?.length ? food.search_terms : [food.name];
    const match = pickBestMatch(terms, candidates);
    if (!match) {
      const closest = bestScoreFor(terms, candidates);
      unmatched.push({
        id: food.id,
        name: food.name,
        reason: "no_confident_match",
        best_score: Number.isFinite(closest) ? Math.round(closest * 100) / 100 : null,
      });
      continue;
    }
    const { id: bestFdcId, description: bestDescription, score: bestScore } = match;
    const confidence = Math.round(Math.min(1, Math.max(0, bestScore / BEST_SCORE)) * 100) / 100;

    const n = nutrientsByFdcId.get(bestFdcId) ?? {};
    const vitaminA = n.vitamin_a_rae != null
      ? { unit: "rae_mcg", value: n.vitamin_a_rae }
      : n.vitamin_a_iu != null
        ? { unit: "iu", value: n.vitamin_a_iu }
        : { unit: null, value: null };

    matched.push({
      id: food.id,
      fdc_id: bestFdcId,
      description: bestDescription,
      match_confidence: confidence,
      matched_term: match.term,
      // Generic foods ("cheese", "milk") can only land on one variety; a person should check those.
      needs_review: confidence < 0.95,
      energy_kcal: n.energy_kcal ?? null,
      protein_g: n.protein_g ?? null,
      fat_g: n.fat_g ?? null,
      carbs_g: n.carbs_g ?? null,
      fiber_g: n.fiber_g ?? null,
      sugars_g: n.sugars_g ?? null,
      calcium_mg: n.calcium_mg ?? null,
      phosphorus_mg: n.phosphorus_mg ?? null,
      ca_p_ratio: n.calcium_mg && n.phosphorus_mg ? Math.round((n.calcium_mg / n.phosphorus_mg) * 100) / 100 : null,
      vitamin_a: vitaminA,
      vitamin_c_mg: n.vitamin_c_mg ?? null,
      potassium_mg: n.potassium_mg ?? null,
      water_g: n.water_g ?? null,
      fetched_at: new Date().toISOString(),
    });
  }

  matched.sort((a, b) => a.id.localeCompare(b.id));
  unmatched.sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(NUTRITION_FILE, JSON.stringify(matched, null, 2) + "\n", "utf8");
  await writeFile(UNMATCHED_FILE, JSON.stringify(unmatched, null, 2) + "\n", "utf8");

  let sourceRecords = [];
  try {
    sourceRecords = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const sourceMap = new Map(sourceRecords.map((s) => [s.url, s]));
  if (!sourceMap.has(USDA_ZIP_URL)) {
    sourceMap.set(USDA_ZIP_URL, {
      url: USDA_ZIP_URL,
      type: "nutrition_dataset",
      license: "Public domain (US government work)",
      fetched_at: new Date().toISOString(),
    });
  }
  const mergedSources = [...sourceMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  await writeFile(SOURCES_FILE, JSON.stringify(mergedSources, null, 2) + "\n", "utf8");

  console.log(`Done. Matched: ${matched.length}, unmatched: ${unmatched.length}`);
}

main().catch((err) => {
  console.error("fetch-nutrition failed:", err);
  process.exitCode = 1;
});
