// Normalization for FAO DAD-IS chicken breed records fetched by
// scripts/fetch-dadis.mjs from the public Firebase JSON API.
//
// One raw record = one national population (a breed as recorded by one
// country). normalizeDadisRecord() turns that raw Firebase JSON into a flat,
// snake_case record for data/breeds_global.json.

import { breedKey } from "./match.mjs";

const DATASHEET_BASE = "https://dadis-breed-datasheet-ws.web.app/";

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "notAtRisk" -> "not at risk", "GeneralCrossbreeding" -> "general crossbreeding"
export function humanizeCamel(str) {
  if (!str) return "";
  return String(str)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function toSnake(str) {
  return humanizeCamel(str).replace(/\s+/g, "_");
}

function isNonEmpty(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function num(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildSourceUrl(iso3, breedName) {
  return `${DATASHEET_BASE}?country=${encodeURIComponent(iso3)}&specie=Chicken&breed=${encodeURIComponent(breedName)}&lang=en`;
}

/**
 * Collect the "true" flags across the three Uses buckets into a flat,
 * snake_case list: { ProvisionUse: { Eggs: true, Meat: false } } -> ["eggs"]
 */
function collectUses(uses) {
  if (!uses || typeof uses !== "object") return [];
  const out = [];
  for (const bucket of Object.values(uses)) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [key, value] of Object.entries(bucket)) {
      if (value === true) out.push(toSnake(key));
    }
  }
  return [...new Set(out)].sort();
}

function collectOtherNames(otherNamesObj, mostCommonName, transboundaryName) {
  const names = new Set();
  if (otherNamesObj && typeof otherNamesObj === "object") {
    for (const entry of Object.values(otherNamesObj)) {
      const name = entry && entry.OtherNames;
      if (isNonEmpty(name)) names.add(String(name).trim());
    }
  }
  names.delete(mostCommonName);
  if (transboundaryName) names.delete(transboundaryName);
  return [...names];
}

function latestPopulation(populationObj) {
  if (!populationObj || typeof populationObj !== "object") return null;
  const entries = Object.values(populationObj).filter((e) => e && typeof e === "object");
  if (!entries.length) return null;
  entries.sort((a, b) => num(a.year ?? a.year) - num(b.year));
  const latest = entries[entries.length - 1];
  const min = num(latest.populationSizeMin);
  const max = num(latest.populationSizeMax);
  if (min === null && max === null) return null;
  const out = { year: num(latest.year) };
  if (min !== null) out.size_min = min;
  if (max !== null) out.size_max = max;
  if (min !== null && max !== null) out.size = min === max ? min : Math.round((min + max) / 2);
  if (isNonEmpty(latest.trend) && latest.trend !== "unknown") out.trend = toSnake(latest.trend);
  return out;
}

function collectImages(imagesObj) {
  if (!imagesObj || typeof imagesObj !== "object") return [];
  const out = [];
  for (const img of Object.values(imagesObj)) {
    if (!img || !isNonEmpty(img.PathImg)) continue;
    const caption = (img.Caption_i18n && img.Caption_i18n.en) || img.Caption || "";
    const image = { url: img.PathImg };
    if (isNonEmpty(caption)) image.caption = String(caption).trim();
    if (isNonEmpty(img.PhotoCredit)) image.credit = String(img.PhotoCredit).trim();
    if (isNonEmpty(img.Gender)) image.gender = String(img.Gender).trim();
    out.push(image);
  }
  return out;
}

/**
 * Normalize one raw DAD-IS breed JSON record (one country x breed pair)
 * into a flat record for data/breeds_global.json.
 *
 * @param {object} raw the JSON at Data/breeds/<ISO3>/Chicken/<breed>.json
 * @param {object} ctx { iso3, countryName, breedName } — breedName is the
 *   key used to fetch the record (may differ slightly from General.Name).
 */
export function normalizeDadisRecord(raw, ctx) {
  if (!raw || typeof raw !== "object") return null;
  const { iso3, countryName, breedName } = ctx;
  const general = raw.General || {};
  const nameInfo = general.Name || {};
  const name = (isNonEmpty(nameInfo.MostCommonName) && nameInfo.MostCommonName) || breedName;
  const transboundaryName =
    isNonEmpty(nameInfo.TransboundaryOrBrandName) && nameInfo.TransboundaryOrBrandName !== name
      ? nameInfo.TransboundaryOrBrandName
      : null;

  const morphology = raw.Morphology || {};
  const morphCore = morphology.Morphology || {};
  const birdSpecific = morphology.BirdSpecific || {};
  const colour = morphology.Colour || {};

  const performance = raw.Performance || {};
  const eggs = performance.Eggs || {};

  const origin = raw.OriginAndDevelopment || {};

  const record = {
    id: `${iso3.toLowerCase()}-${slugify(name)}`,
    name,
    country_iso3: iso3,
    country_name: countryName || null,
  };

  if (transboundaryName) record.transboundary_name = transboundaryName;

  const otherNames = collectOtherNames(general.OtherNames, name, transboundaryName);
  if (otherNames.length) record.other_names = otherNames;

  if (general.Risk && isNonEmpty(general.Risk.breedRisk) && general.Risk.breedRisk !== "unknown") {
    record.risk_status = toSnake(general.Risk.breedRisk);
  }

  const population = latestPopulation(raw.Population);
  if (population) record.population = population;

  const mainUses = collectUses(general.Uses);
  if (mainUses.length) record.main_uses = mainUses;

  const originOut = {};
  if (isNonEmpty(origin.DescriptionOfOrigin)) originOut.description = String(origin.DescriptionOfOrigin).trim();
  if (isNonEmpty(origin.YearOfOrigin)) originOut.year = origin.YearOfOrigin;
  if (isNonEmpty(origin.BreedClassification)) originOut.classification = toSnake(origin.BreedClassification);
  if (isNonEmpty(origin.DomesticationStatus)) originOut.domestication_status = toSnake(origin.DomesticationStatus);
  if (Object.keys(originOut).length) record.origin = originOut;

  const eggsOut = {};
  const eggsPerYear = [num(eggs.eggsPerYearMIN), num(eggs.eggsPerYearMAX), num(eggs.eggsPerYearAVG)];
  if (isNonEmpty(eggs.eggsPerYearAVG)) eggsOut.per_year_avg = num(eggs.eggsPerYearAVG);
  if (isNonEmpty(eggs.eggsPerYearMIN)) eggsOut.per_year_min = num(eggs.eggsPerYearMIN);
  if (isNonEmpty(eggs.eggsPerYearMAX)) eggsOut.per_year_max = num(eggs.eggsPerYearMAX);
  if (isNonEmpty(eggs.eggWeight)) eggsOut.weight_g = num(eggs.eggWeight);
  if (isNonEmpty(birdSpecific.EggShellColour)) eggsOut.shell_colour = String(birdSpecific.EggShellColour).trim();
  if (Object.keys(eggsOut).length) record.eggs = eggsOut;
  void eggsPerYear;

  const weightsOut = {};
  if (isNonEmpty(morphCore.WeightMales)) weightsOut.male_kg = num(morphCore.WeightMales);
  if (isNonEmpty(morphCore.WeightFemales)) weightsOut.female_kg = num(morphCore.WeightFemales);
  if (Object.keys(weightsOut).length) record.adult_weights = weightsOut;

  const morphOut = {};
  if (isNonEmpty(birdSpecific.CombType)) morphOut.comb = String(birdSpecific.CombType).trim();
  if (isNonEmpty(birdSpecific.PlumageColour)) morphOut.plumage_colour = String(birdSpecific.PlumageColour).trim();
  if (isNonEmpty(birdSpecific.SkinColour)) morphOut.skin_colour = String(birdSpecific.SkinColour).trim();
  if (isNonEmpty(birdSpecific.ShankColour)) morphOut.shank_colour = String(birdSpecific.ShankColour).trim();
  if (isNonEmpty(colour.EfabisMainColour)) morphOut.main_colour = String(colour.EfabisMainColour).trim();
  if (isNonEmpty(colour.ColorComments)) morphOut.colour_notes = String(colour.ColorComments).trim();
  if (isNonEmpty(morphCore.OtherSpecificVisibleTraits)) morphOut.notes = String(morphCore.OtherSpecificVisibleTraits).trim();
  if (Object.keys(morphOut).length) record.morphology = morphOut;

  const images = collectImages(general.Images);
  if (images.length) record.images = images;

  const lastUpdate = raw.lastUpdate && raw.lastUpdate.Timestamp ? raw.lastUpdate.Timestamp : raw.metadataLastUpdate || null;
  if (isNonEmpty(lastUpdate)) record.last_update = lastUpdate;

  record.source_url = buildSourceUrl(iso3, breedName);

  return record;
}

/**
 * Group normalized records by a name key (breedKey from lib/match.mjs,
 * shared with the Wikipedia matching so the same normalization rules apply)
 * so callers can see every country reporting on what is likely the same
 * breed.
 * @param {Array<object>} records
 */
export function buildGlobalByName(records) {
  const groups = new Map();
  for (const r of records) {
    const key = breedKey(r.transboundary_name || r.name);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { name_key: key, display_name: r.transboundary_name || r.name, countries: [], record_ids: [] });
    }
    const group = groups.get(key);
    group.countries.push(r.country_iso3);
    group.record_ids.push(r.id);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      countries: [...new Set(g.countries)].sort(),
    }))
    .sort((a, b) => a.name_key.localeCompare(b.name_key));
}

/**
 * Cross-link data/breeds.json entries to DAD-IS records by name, without
 * mutating breeds.json. Returns [{ breed_id, dadis_ids }].
 * @param {Array<object>} records normalized dad-is records
 * @param {Map<string,string>} breedIndex breedKey -> breed id (buildBreedIndex from match.mjs)
 */
export function buildBreedDadisLinks(records, breedIndex) {
  const byBreedId = new Map();
  for (const r of records) {
    const candidates = [r.name, r.transboundary_name, ...(r.other_names || [])].filter(Boolean);
    const breedId = candidates.map((n) => breedIndex.get(breedKey(n))).find(Boolean);
    if (!breedId) continue;
    if (!byBreedId.has(breedId)) byBreedId.set(breedId, new Set());
    byBreedId.get(breedId).add(r.id);
  }
  return [...byBreedId.entries()]
    .map(([breed_id, ids]) => ({ breed_id, dadis_ids: [...ids].sort() }))
    .sort((a, b) => a.breed_id.localeCompare(b.breed_id));
}
