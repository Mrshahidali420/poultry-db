// Parses research/12-chicken-food-pages.md's "Food pages by search volume"
// table into a flat list of individual food entries (splitting combined
// rows like "walnuts / nuts / almonds / pecans" into separate foods).

import { readFile } from "node:fs/promises";
import path from "node:path";

const RESEARCH_FILE = path.resolve("research/12-chicken-food-pages.md");
const CURATED_FILE = path.resolve("data/curated/food-safety.json");

/**
 * Build the food index from the hand-curated food-safety table (read-only):
 * one entry per food, with its name and aliases as USDA search terms.
 * Returns null when the curated file does not exist.
 * @returns {Promise<Array<{id:string,name:string,search_terms:string[],category:string|null,source_file:string}>|null>}
 */
export async function buildFoodsIndexFromCurated() {
  let foods;
  try {
    foods = JSON.parse(await readFile(CURATED_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  return foods
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: f.id,
      name: f.name,
      search_terms: [...new Set([f.name, ...(f.aliases ?? [])].map((t) => t.trim()).filter(Boolean))],
      category: f.category ?? null,
      source_file: "data/curated/food-safety.json",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip markdown bold/asterisks and a trailing parenthetical like "(+peel, seeds)". */
function cleanFoodCell(cell) {
  return cell
    .replace(/\*\*/g, "")
    .replace(/\(\+[^)]*\)/g, "")
    .replace(/\(.*?\)/g, "")
    .trim();
}

/**
 * Parse the research markdown and return an array of
 * { id, name, search_term, source_file } food entries, deduped by id,
 * sorted by id.
 * @returns {Promise<Array<{id:string,name:string,search_term:string,source_file:string}>>}
 */
export async function parseFoodsFromResearch() {
  const text = await readFile(RESEARCH_FILE, "utf8");
  const lines = text.split("\n");
  const foods = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    // Skip header/separator rows.
    if (/^food$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;

    const foodCell = cleanFoodCell(cells[0]);
    if (!foodCell || foodCell.length > 120) continue;

    // Split combined rows on "/" or "," into individual food names.
    const names = foodCell
      .split(/\s*\/\s*|\s*,\s*(?=[a-z])/i)
      .map((n) => n.trim())
      .filter(Boolean);

    for (const rawName of names) {
      const name = rawName.replace(/^and\s+/i, "").trim();
      if (!name || name.length < 2) continue;
      const id = slugify(name);
      if (!id || foods.has(id)) continue;
      foods.set(id, {
        id,
        name,
        search_terms: [name],
        category: null,
        source_file: "research/12-chicken-food-pages.md",
      });
    }
  }

  return [...foods.values()].sort((a, b) => a.id.localeCompare(b.id));
}
