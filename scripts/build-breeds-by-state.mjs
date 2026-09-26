// Matches chicken breeds to US states by climate, using the hand-made
// data/curated/state-climate.json table and the cold_hardy / heat_tolerant /
// beginner_friendly / purpose facts already extracted in data/breeds_extra.json.
//
// Re-run with `node scripts/build-breeds-by-state.mjs` whenever breed facts
// or the climate table change.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const stateClimate = readJson(path.join(dataDir, "curated", "state-climate.json"));
const breeds = readJson(path.join(dataDir, "breeds.json"));
const breedsExtra = readJson(path.join(dataDir, "breeds_extra.json"));

const nameById = new Map(breeds.map((b) => [b.id, b.name]));

const SOURCES = [
  { name: "USDA Plant Hardiness Zone Map", url: "https://planthardiness.ars.usda.gov/" },
  { name: "NOAA US Climate Normals", url: "https://www.ncei.noaa.gov/access/us-climate-normals/" },
];

const COLD_LOW_F = 25; // avg winter low at or below this counts as a cold-risk state
const HEAT_HIGH_F = 90; // avg summer high at or above this counts as a heat-risk state

function normTrait(value) {
  if (value === true || value === "yes") return 1;
  if (value === "partly") return 0.5;
  if (value === false || value === "no") return 0;
  return null; // unknown, not stated by any source
}

// Only consider breeds where at least one relevant trait is known; otherwise
// there is nothing in the data to justify a recommendation.
const candidates = breedsExtra
  .map((b) => {
    const cold = normTrait(b.cold_hardy?.value);
    const heat = normTrait(b.heat_tolerant?.value);
    const beginner = normTrait(b.beginner_friendly?.value);
    const purpose = b.purpose?.value || null;
    return { id: b.id, name: nameById.get(b.id) || b.id, cold, heat, beginner, purpose };
  })
  .filter((b) => b.cold !== null || b.heat !== null || b.beginner !== null);

function scoreBreed(breed, risks, humidity) {
  let score = 0;
  if (risks.includes("cold")) score += (breed.cold ?? 0.3) * 3;
  else score += 0.5;

  if (risks.includes("heat") || humidity === "high") score += (breed.heat ?? 0.3) * 3;
  else score += 0.5;

  score += (breed.beginner ?? 0.3) * 1.5;
  return score;
}

function describeWhy(breed, risks, humidity, stateName) {
  const bits = [];
  if (risks.includes("cold") && breed.cold >= 1) bits.push("cold-hardy");
  else if (risks.includes("cold") && breed.cold === 0.5) bits.push("somewhat cold-tolerant");
  if ((risks.includes("heat") || humidity === "high") && breed.heat >= 1) bits.push("heat-tolerant");
  else if ((risks.includes("heat") || humidity === "high") && breed.heat === 0.5) bits.push("somewhat heat-tolerant");
  if (breed.beginner >= 1) bits.push("beginner-friendly");

  const purpose = breed.purpose ? `${breed.purpose}-purpose` : "general-purpose";
  const traits = bits.length ? `${bits.join(", ")} ` : "";
  return `A ${traits}${purpose} breed that fits ${stateName}'s climate.`;
}

const RECOMMEND_COUNT = 10;

const output = stateClimate.map((s) => {
  const risks = [];
  if (s.avg_winter_low_f <= COLD_LOW_F) risks.push("cold");
  if (s.avg_summer_high_f >= HEAT_HIGH_F) risks.push("heat");
  if (s.humidity === "high") risks.push("humidity");

  const ranked = candidates
    .map((b) => ({ breed: b, score: scoreBreed(b, risks, s.humidity) }))
    .sort((a, b) => b.score - a.score || a.breed.name.localeCompare(b.breed.name));

  const picked = ranked.slice(0, RECOMMEND_COUNT).map((r) => r.breed);

  return {
    id: s.id,
    state: s.state,
    climate_summary: s.climate_summary,
    usda_hardiness_zones: s.usda_hardiness_zones,
    avg_winter_low_f: s.avg_winter_low_f,
    avg_summer_high_f: s.avg_summer_high_f,
    humidity: s.humidity,
    main_risks: risks,
    recommended_breed_ids: picked.map((b) => b.id),
    why: picked.map((b) => ({ breed_id: b.id, note: describeWhy(b, risks, s.humidity, s.state) })),
    sources: SOURCES,
    needs_review: true,
  };
});

writeFileSync(
  path.join(dataDir, "curated", "breeds-by-state.json"),
  JSON.stringify(output, null, 2) + "\n",
);

console.log(`Wrote ${output.length} state records to data/curated/breeds-by-state.json`);
