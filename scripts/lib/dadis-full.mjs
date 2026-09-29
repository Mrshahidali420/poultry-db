// Full normalization of FAO DAD-IS chicken breed records.
//
// scripts/fetch-dadis.mjs keeps a slim record per national population for
// data/breeds_global.json. This module keeps everything a breed page can use:
// the whole population history, uses by group, origin, morphology,
// performance, distinctive traits, conservation, where in the country the
// breed lives, publications, and the same breed as recorded by other
// countries (transboundary links). Pure functions only, so it is testable
// without the network.

import { breedKey } from "./match.mjs";
import { buildSourceUrl, humanizeCamel, slugify } from "./dadis-global.mjs";

function isNonEmpty(v) {
  return v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "undefined";
}

export function num(v) {
  if (!isNonEmpty(v)) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function snake(str) {
  return humanizeCamel(str).replace(/\s+/g, "_");
}

/** English text of a DAD-IS field, preferring the <field>_i18n.en translation. */
export function en(obj, field) {
  if (!obj || typeof obj !== "object") return null;
  const i18n = obj[`${field}_i18n`];
  const text = (i18n && isNonEmpty(i18n.en) && i18n.en) || obj[field];
  return isNonEmpty(text) ? String(text).trim() : null;
}

function setIf(target, key, value) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value) && !value.length) return;
  if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return;
  target[key] = value;
}

const USE_GROUPS = {
  ProvisionUse: "provision",
  CulturalUse: "cultural",
  RegulationAndMaintenanceUse: "regulation",
};

export function collectUsesByGroup(uses) {
  const out = {};
  if (!uses || typeof uses !== "object") return out;
  for (const [bucket, flags] of Object.entries(uses)) {
    const group = USE_GROUPS[bucket];
    if (!group || !flags || typeof flags !== "object") continue;
    const list = Object.entries(flags)
      .filter(([, v]) => v === true)
      .map(([k]) => snake(k))
      .sort();
    if (list.length) out[group] = list;
  }
  return out;
}

function clean(value) {
  return isNonEmpty(value) ? String(value).trim() : null;
}

const TREND_OK = new Set(["increasing", "decreasing", "stable"]);

/** Every non-deleted yearly population entry, oldest first. */
export function populationHistory(populationObj) {
  if (!populationObj || typeof populationObj !== "object") return [];
  const rows = [];
  for (const e of Object.values(populationObj)) {
    if (!e || typeof e !== "object" || e.deleted === "Y") continue;
    const year = num(e.year);
    if (year === null) continue;
    const min = num(e.populationSizeMin);
    const max = num(e.populationSizeMax);
    const row = { year };
    if (min !== null) row.min = min;
    if (max !== null) row.max = max;
    if (min !== null || max !== null) {
      row.size = min !== null && max !== null ? Math.round((min + max) / 2) : (min ?? max);
    }
    if (TREND_OK.has(e.trend)) row.trend = e.trend;
    setIf(row, "breeding_females", num(e.breedingFemale));
    setIf(row, "breeding_males", num(e.breedingMale));
    setIf(row, "herds", num(e.herds));
    const rel = clean(e.reliability);
    if (rel && rel !== "unknown") row.reliability = rel;
    setIf(row, "based_on", clean(e.populationFiguresBasedOn));
    if (e.inSituConservationProgrammesInPlace === "yes") row.in_situ_conservation = true;
    if (Object.keys(row).length > 1) rows.push(row);
  }
  // one row per year: keep the last entry written for that year
  const byYear = new Map();
  for (const r of rows) byYear.set(r.year, { ...(byYear.get(r.year) || {}), ...r });
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export function latestTrend(history) {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].trend) return { trend: history[i].trend, year: history[i].year };
  return null;
}

export function latestSize(history) {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].size !== undefined) return history[i];
  return null;
}

function collectOtherNames(otherNamesObj, exclude) {
  const out = [];
  const seen = new Set(exclude.filter(Boolean).map((n) => n.toLowerCase()));
  if (!otherNamesObj || typeof otherNamesObj !== "object") return out;
  for (const entry of Object.values(otherNamesObj)) {
    const name = entry && clean(entry.OtherNames);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const item = { name };
    setIf(item, "language", clean(entry.Language));
    out.push(item);
  }
  return out;
}

function trueKeys(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}

function collectImages(imagesObj) {
  if (!imagesObj || typeof imagesObj !== "object") return [];
  const out = [];
  for (const img of Object.values(imagesObj)) {
    if (!img || !isNonEmpty(img.PathImg)) continue;
    const image = { url: img.PathImg };
    setIf(image, "caption", en(img, "Caption"));
    setIf(image, "credit", clean(img.PhotoCredit));
    setIf(image, "gender", clean(img.Gender));
    out.push(image);
  }
  return out;
}

function collectGeo(features) {
  if (!features || typeof features !== "object") return [];
  const out = [];
  for (const f of Object.values(features)) {
    if (!f || typeof f !== "object") continue;
    const area = clean(f.admNameLevel2) ? `${clean(f.admNameLevel2)}, ${clean(f.admNameLevel1)}` : clean(f.admNameLevel1);
    if (!area) continue;
    const row = { area };
    setIf(row, "population", num(f.populationSize));
    setIf(row, "year", num(f.year));
    out.push(row);
  }
  return out.sort((a, b) => (b.population || 0) - (a.population || 0) || a.area.localeCompare(b.area));
}

function collectPublications(pubs) {
  if (!pubs || typeof pubs !== "object") return [];
  const out = [];
  for (const p of Object.values(pubs)) {
    if (!p || !isNonEmpty(p.title)) continue;
    const row = { title: String(p.title).trim() };
    setIf(row, "author", clean(p.author));
    setIf(row, "date", clean(p.date));
    setIf(row, "url", /^https?:\/\//.test(String(p.url || "").trim()) ? String(p.url).trim() : null);
    out.push(row);
  }
  return out;
}

const PERFORMANCE_FIELDS = {
  AgeMaturityFemales: "age_maturity_females",
  AgeMaturityMales: "age_maturity_males",
  ageBreedingFemales: "age_breeding_females",
  ageBreedingMales: "age_breeding_males",
  carcassWeight: "carcass_weight",
  dressingPercentage: "dressing_percentage",
  dailyGain: "daily_gain",
  lengthProductiveLife: "productive_life",
  birthWeightFemales: "hatch_weight_females",
  birthWeightMales: "hatch_weight_males",
};

function collectPerformance(perf) {
  const out = {};
  if (!perf || typeof perf !== "object") return out;
  for (const [src, dst] of Object.entries(PERFORMANCE_FIELDS)) {
    const v = num(perf[src]);
    if (v !== null && v > 0) out[dst] = v;
  }
  setIf(out, "management_notes", en(perf, "CommentsManagmentConditions"));
  setIf(out, "other", en(perf, "additionalPerformanceParameters"));
  return out;
}

/**
 * Normalize one raw DAD-IS record into the full shape.
 * @param {object} raw JSON at Data/breeds/<ISO3>/Chicken/<name>.json
 * @param {{iso3:string, breedName:string, countryName?:string, region?:string}} ctx
 */
export function normalizeFull(raw, ctx) {
  if (!raw || typeof raw !== "object") return null;
  const { iso3, breedName, countryName, region } = ctx;
  const general = raw.General || {};
  const nameInfo = general.Name || {};
  const name = clean(nameInfo.MostCommonName) || breedName;
  const tb = clean(nameInfo.TransboundaryOrBrandName);
  const transboundaryName = tb && tb !== name ? tb : null;

  const r = {
    id: `${iso3.toLowerCase()}-${slugify(name)}`,
    name,
    country_iso3: iso3,
    country_name: countryName || null,
  };
  setIf(r, "region", region || null);
  setIf(r, "transboundary_name", transboundaryName);
  setIf(r, "other_names", collectOtherNames(general.OtherNames, [name, transboundaryName]));

  const risk = general.Risk || {};
  if (isNonEmpty(risk.breedRisk) && risk.breedRisk !== "unknown") r.risk_status = snake(risk.breedRisk);
  if (isNonEmpty(risk.breedRiskDetail) && risk.breedRiskDetail !== "unknown") r.risk_detail = snake(risk.breedRiskDetail);
  if (isNonEmpty(general.CryoStatus) && general.CryoStatus !== "noInfo") r.cryo_status = snake(general.CryoStatus);

  const history = populationHistory(raw.Population);
  setIf(r, "population_history", history);
  const latest = latestSize(history);
  if (latest) r.population_latest = { year: latest.year, size: latest.size };
  const trend = latestTrend(history);
  if (trend) r.trend_latest = trend;

  const usesByGroup = collectUsesByGroup(general.Uses);
  setIf(r, "uses", usesByGroup);
  setIf(r, "main_uses", [...new Set(Object.values(usesByGroup).flat())].sort());
  setIf(r, "uses_notes", en(general, "DescriptionOfSpecificUses"));
  setIf(r, "description", en(nameInfo, "Description"));
  setIf(r, "production_systems_notes", en(general, "ProductionEnvironemntAndManagementSystems"));

  const o = raw.OriginAndDevelopment || {};
  const origin = {};
  setIf(origin, "description", en(o, "DescriptionOfOrigin"));
  setIf(origin, "year", clean(o.YearOfOrigin));
  setIf(origin, "classification", isNonEmpty(o.BreedClassification) ? snake(o.BreedClassification) : null);
  setIf(origin, "domestication_status", isNonEmpty(o.DomesticationStatus) ? snake(o.DomesticationStatus) : null);
  setIf(origin, "location_within_country", en(o, "LocationWithinCountry"));
  setIf(origin, "import", en(o, "Import"));
  setIf(origin, "herdbook", clean(o.Herdbook));
  setIf(r, "origin", origin);

  const m = raw.Morphology || {};
  const core = m.Morphology || {};
  const bird = m.BirdSpecific || {};
  const colour = m.Colour || {};
  const morph = {};
  setIf(morph, "avian_class", clean(bird.AvianClassification));
  setIf(morph, "comb", clean(bird.CombType));
  setIf(morph, "plumage_colour", clean(bird.PlumageColour));
  setIf(morph, "feather_pattern", clean(bird.PatternWithinFeather));
  setIf(morph, "shank_foot_colour", clean(bird.ShankAndFootColour) || clean(bird.ShankColour));
  setIf(morph, "skin_colour", clean(bird.SkinColour) || clean(colour.EfabisSkinColour));
  setIf(morph, "main_colour", clean(colour.EfabisMainColour));
  setIf(morph, "colour_notes", en(colour, "ColorComments"));
  setIf(morph, "visible_traits", en(core, "OtherSpecificVisibleTraits"));
  setIf(r, "morphology", morph);

  const weights = {};
  const wm = num(core.WeightMales);
  const wf = num(core.WeightFemales);
  if (wm !== null && wm > 0) weights.male_kg = wm;
  if (wf !== null && wf > 0) weights.female_kg = wf;
  setIf(r, "adult_weights", weights);

  const perfRoot = raw.Performance || {};
  const eggs = perfRoot.Eggs || {};
  const eggsOut = {};
  for (const [src, dst] of [["eggsPerYearAVG", "per_year_avg"], ["eggsPerYearMIN", "per_year_min"], ["eggsPerYearMAX", "per_year_max"], ["eggWeight", "weight_g"]]) {
    const v = num(eggs[src]);
    if (v !== null && v > 0) eggsOut[dst] = v;
  }
  setIf(eggsOut, "shell_colour", clean(bird.EggShellColour));
  setIf(r, "eggs", eggsOut);
  setIf(r, "performance", collectPerformance(perfRoot.Performance));

  const mc = perfRoot.ManagementConditions || {};
  const mgmt = {};
  setIf(mgmt, "systems", trueKeys(mc.managementSystem));
  setIf(mgmt, "feeding", trueKeys(mc.feedingOfAdults));
  setIf(mgmt, "mobility", trueKeys(mc.mobility));
  setIf(r, "management", mgmt);

  const ai = raw.AdditionalInformation || {};
  const dt = ai.DistinctiveTraits || {};
  const traits = {};
  setIf(traits, "adaptability", en(dt, "AdaptabilityToSpecificEnvironment"));
  setIf(traits, "resistance", en(dt, "SpecificResistanceOrTolerance"));
  setIf(traits, "product", en(dt, "SpecialCharacteristicOfProduct"));
  setIf(traits, "reproduction", en(dt, "SpecificReproductiveCharacteristic"));
  setIf(traits, "other", en(dt, "OtherSpecialQualities"));
  setIf(r, "distinctive_traits", traits);
  setIf(r, "additional_info", en(ai.AdditionalInformation || {}, "AditionalBreedInformation"));

  const cons = raw.Conservation || {};
  const conservation = {};
  if (cons.InVivoProgramme?.Programme?.isInPlace === true) conservation.in_vivo = true;
  setIf(conservation, "in_vivo_notes", en(cons.InVivoProgramme?.Programme || {}, "description"));
  if (cons.Cryo?.Programme?.isInPlace === true) conservation.cryo = true;
  setIf(r, "conservation", conservation);

  const bp = raw.BreedingProgramme || {};
  setIf(r, "breeding_programme", Object.entries(bp).filter(([, v]) => v === "Yes").map(([k]) => snake(k)).sort());

  setIf(r, "distribution", collectGeo(raw.Geodistribution?.Features));
  setIf(r, "publications", collectPublications(raw.Publications));
  setIf(r, "images", collectImages(general.Images));

  const lastUpdate = raw.lastUpdate?.Timestamp || raw.metadataLastUpdate || null;
  setIf(r, "last_update", clean(lastUpdate));
  r.source_url = buildSourceUrl(iso3, breedName);
  return r;
}

/** Name key used to link the same breed across countries. */
export function linkKey(r) {
  return breedKey(r.transboundary_name || r.name);
}

/** Add `same_breed_elsewhere` links (other countries recording the same breed). Returns new records. */
export function addTransboundaryLinks(records) {
  const groups = new Map();
  for (const r of records) {
    const k = linkKey(r);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return records.map((r) => {
    const group = groups.get(linkKey(r)) || [];
    const others = group
      .filter((x) => x.id !== r.id && x.country_iso3 !== r.country_iso3)
      .map((x) => ({ id: x.id, name: x.name, country_iso3: x.country_iso3, country_name: x.country_name }))
      .sort((a, b) => String(a.country_name).localeCompare(String(b.country_name)));
    return others.length ? { ...r, same_breed_elsewhere: others } : { ...r };
  });
}

const RISK_KEYS = ["not_at_risk", "at_risk", "extinct", "cryo_conserved_only"];

function riskCounts(list) {
  const c = { total: list.length, unknown: 0 };
  for (const k of RISK_KEYS) c[k] = 0;
  for (const r of list) {
    if (r.risk_status && r.risk_status in c) c[r.risk_status]++;
    else c.unknown++;
  }
  return c;
}

/** Per-country and world summary figures for comparison text on pages. */
export function summarize(records) {
  const byCountry = new Map();
  for (const r of records) {
    if (!byCountry.has(r.country_iso3)) byCountry.set(r.country_iso3, []);
    byCountry.get(r.country_iso3).push(r);
  }
  const countries = {};
  for (const [iso3, list] of [...byCountry.entries()].sort()) {
    const first = list[0];
    const trends = { increasing: 0, stable: 0, decreasing: 0 };
    for (const r of list) if (r.trend_latest) trends[r.trend_latest.trend]++;
    countries[iso3] = {
      name: first.country_name,
      region: first.region || null,
      breeds: list.length,
      risk: riskCounts(list),
      trends,
      with_population: list.filter((r) => r.population_latest).length,
      transboundary: list.filter((r) => r.same_breed_elsewhere).length,
    };
  }
  const regions = {};
  for (const r of records) {
    const key = r.region || "Unknown";
    if (!regions[key]) regions[key] = [];
    regions[key].push(r);
  }
  const regionOut = {};
  for (const [k, list] of Object.entries(regions).sort()) regionOut[k] = riskCounts(list);
  return { world: riskCounts(records), regions: regionOut, countries };
}
