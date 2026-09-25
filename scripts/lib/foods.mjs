// Parses research/12-chicken-food-pages.md's "Food pages by search volume"
// table into a flat list of individual food entries (splitting combined
// rows like "walnuts / nuts / almonds / pecans" into separate foods).

import { readFile } from "node:fs/promises";
import path from "node:path";

const RESEARCH_FILE = path.resolve("research/12-chicken-food-pages.md");

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
        search_term: `${name} for chickens`,
        source_file: "research/12-chicken-food-pages.md",
      });
    }
  }

  return [...foods.values()].sort((a, b) => a.id.localeCompare(b.id));
}
