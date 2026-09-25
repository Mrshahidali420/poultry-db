// Parser for a FAO DAD-IS breeds export (CSV or XLSX, exported by hand from
// https://www.fao.org/dad-is/data/data-export/en). Column names in the
// export are matched loosely, so small wording changes don't break it.

import { breedKey } from "./match.mjs";

export const DADIS_URL = "https://www.fao.org/dad-is/data/data-export/en";

// Normalized header -> our field. Headers are lowercased with non-letters removed.
const HEADER_MAP = {
  name: ["mostcommonnameofbreed", "mostcommonname", "breedname", "breed", "name", "localbreedname"],
  other_names: ["othernames", "othernamesofbreed", "othername", "synonyms", "localnames"],
  country: ["country", "countryname", "countryterritory"],
  species: ["species", "speciesname"],
  transboundary_name: ["transboundaryname", "transboundarybreed", "transboundary", "transboundarybreedname"],
  risk_status: ["riskstatus", "riskstatuscalculated", "risk", "riskstatusofbreed"],
  population_size: ["populationsize", "population", "totalpopulation", "populationsizelatest", "populationtotal"],
  population_min: ["populationsizemin", "populationmin", "minpopulation"],
  population_max: ["populationsizemax", "populationmax", "maxpopulation"],
  population_trend: ["populationtrend", "trend"],
  population_year: ["populationyear", "yearofpopulationdata", "year", "populationdatayear"],
  main_uses: ["mainuses", "mainuse", "uses", "use", "purpose", "mainpurpose"],
};

function normalizeHeader(h) {
  return String(h).toLowerCase().replace(/[^a-z]/g, "");
}

function buildColumnMap(headers) {
  const byNorm = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const map = {};
  for (const [field, candidates] of Object.entries(HEADER_MAP)) {
    const hit = candidates.find((c) => byNorm.has(c));
    if (hit) map[field] = byNorm.get(hit);
  }
  return map;
}

function toNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(/[,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

function splitList(raw) {
  if (!raw) return [];
  return String(raw).split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
}

function slugify(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Turn exported rows into breeds_global records, keeping only chicken rows.
 * @param {Array<Record<string,string>>} rows
 * @param {Map<string,string>} breedIndex  breedKey -> data/breeds.json id
 */
export function parseDadisRows(rows, breedIndex) {
  if (!rows.length) return [];
  const cols = buildColumnMap(Object.keys(rows[0]));
  if (!cols.name) throw new Error(`DAD-IS export has no recognisable breed-name column (headers: ${Object.keys(rows[0]).join(", ")})`);
  const get = (row, field) => (cols[field] ? String(row[cols[field]] ?? "").trim() : "");

  const out = new Map();
  for (const row of rows) {
    const species = get(row, "species");
    if (cols.species && !/chicken|gallus/i.test(species)) continue;
    const name = get(row, "name");
    if (!name) continue;
    const country = get(row, "country") || null;
    const id = slugify(`${name}-${country ?? "unknown"}`);
    const otherNames = splitList(get(row, "other_names"));
    const transboundary = get(row, "transboundary_name") || null;

    const candidates = [name, transboundary, ...otherNames].filter(Boolean);
    const breedId = candidates.map((n) => breedIndex.get(breedKey(n))).find(Boolean) ?? null;

    const size = toNumber(get(row, "population_size"));
    const min = toNumber(get(row, "population_min"));
    const max = toNumber(get(row, "population_max"));

    out.set(id, {
      id,
      name,
      other_names: otherNames,
      country,
      transboundary_name: transboundary,
      risk_status: get(row, "risk_status") || null,
      population_size: size,
      population_min: min,
      population_max: max,
      population_trend: get(row, "population_trend") || null,
      population_year: toNumber(get(row, "population_year")),
      main_uses: splitList(get(row, "main_uses")),
      breed_id: breedId,
      source_url: DADIS_URL,
    });
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}
