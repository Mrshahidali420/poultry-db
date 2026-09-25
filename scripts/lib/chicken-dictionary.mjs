// Parser for iamthechickenlady-netizen/chicken-dictionary src/breeds.ts.
// The file is a typed array of plain object literals, so we read the
// fields with regexes instead of evaluating third-party code.

import { ORIGIN_CHICKEN_DICTIONARY } from "./provenance.mjs";

export const CHICKEN_DICTIONARY_URL =
  "https://github.com/iamthechickenlady-netizen/chicken-dictionary/blob/HEAD/src/breeds.ts";

/**
 * Parse breeds.ts into plain objects with the fields we use.
 * @param {string} source
 * @returns {Array<{name:string, origin?:string, eggColor?:string, eggProduction?:string, eggSize?:string, hardiness?:string, combType?:string, foraging?:string, noiseLevel?:string, size?:string, temperament:string[]}>}
 */
export function parseChickenDictionary(source) {
  const start = source.indexOf("breedData");
  if (start === -1) return [];
  const body = source.slice(start);
  // Each breed object starts with its id field.
  const blocks = body.split(/\n\s*\{\s*\n(?=\s*id:)/).slice(1);

  return blocks.map((block) => {
    // Cut off the nested colorTheme object so its keys are not read.
    const top = block.split(/colorTheme\s*:/)[0];
    const field = (key) => {
      const m = new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(top);
      return m ? m[1].replace(/\\"/g, '"') : undefined;
    };
    const temperamentMatch = /\btemperament:\s*\[([^\]]*)\]/.exec(top);
    const temperament = temperamentMatch
      ? [...temperamentMatch[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
      : [];
    return {
      name: field("name"),
      origin: field("origin"),
      size: field("size"),
      eggColor: field("eggColor"),
      eggProduction: field("eggProduction"),
      eggSize: field("eggSize"),
      hardiness: field("hardiness"),
      combType: field("combType"),
      foraging: field("foraging"),
      noiseLevel: field("noiseLevel"),
      temperament,
    };
  }).filter((b) => b.name);
}

/** "Excellent (200-250/year)" -> {min: 200, max: 250}; "Low (under 100/year)" -> {min: null, max: 100}. */
export function parseEggBand(band) {
  if (!band) return { min: null, max: null };
  const range = /(\d+)\s*-\s*(\d+)/.exec(band);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const under = /under\s*(\d+)/i.exec(band);
  if (under) return { min: null, max: Number(under[1]) };
  return { min: null, max: null };
}

/**
 * Turn one parsed breed into imports/-schema rows for a resolved entity id.
 * @param {string} entityId
 * @param {ReturnType<typeof parseChickenDictionary>[number]} breed
 */
export function toImportRows(entityId, breed) {
  const rows = [];
  const add = (field, value) => {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return;
    rows.push({
      entity_type: "breed",
      entity_id: entityId,
      field,
      value,
      source_url: CHICKEN_DICTIONARY_URL,
      origin: ORIGIN_CHICKEN_DICTIONARY,
      needs_review: true,
    });
  };

  const band = parseEggBand(breed.eggProduction);
  add("egg_production_band", breed.eggProduction);
  add("eggs_per_year_min", band.min);
  add("eggs_per_year_max", band.max);
  add("egg_size", breed.eggSize?.toLowerCase());
  add("egg_color", breed.eggColor);
  add("comb", breed.combType?.toLowerCase());
  add("country", breed.origin);
  add("temperament", breed.temperament.length ? breed.temperament.join(", ") : undefined);
  add("foraging", breed.foraging);
  add("noise_level", breed.noiseLevel);
  add("hardiness", breed.hardiness);
  if (breed.hardiness === "Cold Hardy" || breed.hardiness === "All-Weather Hardy") add("cold_hardy", true);
  if (breed.hardiness === "Heat Tolerant" || breed.hardiness === "All-Weather Hardy") add("heat_tolerant", true);
  if (breed.size === "Bantam") add("bantam_available", true);
  return rows;
}
