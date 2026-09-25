// FAOSTAT QCL (Crops and livestock products), normalized bulk CSV.
// Columns: Area Code, Area Code (M49), Area, Item Code, Item Code (CPC), Item,
//          Element Code, Element, Year Code, Year, Unit, Value, Flag, Note
// We keep four series and pivot them to one row per country and year.

import { splitCsvLine } from "./csv.mjs";

// [item code, element code] -> output field
const SERIES = {
  "1057|5112": "chickens_head",       // Chickens, Stocks
  "1062|5313": "egg_laying_hens",     // Hen eggs in shell, fresh, Laying
  "1062|5510": "eggs_tonnes",         // Hen eggs in shell, fresh, Production (t)
  "1058|5510": "chicken_meat_tonnes", // Meat of chickens, fresh or chilled, Production (t)
};
const FIELDS = ["chickens_head", "egg_laying_hens", "eggs_tonnes", "chicken_meat_tonnes"];
// FAOSTAT area codes of 5000 and up are regional/world aggregates, not countries.
const AGGREGATE_AREA_CODE = 5000;

function unitMultiplier(unit) {
  const u = (unit ?? "").toLowerCase();
  if (/^1000\b/.test(u)) return 1000;
  if (/^100\b/.test(u)) return 100;
  return 1;
}

/** Accumulates FAOSTAT CSV lines into { "country|year": row }. */
export class FaostatAccumulator {
  constructor() {
    this.columns = null;
    this.rows = new Map();
  }

  addLine(line) {
    if (!line.trim()) return;
    const cells = splitCsvLine(line);
    if (!this.columns) {
      this.columns = Object.fromEntries(cells.map((name, idx) => [name.trim(), idx]));
      return;
    }
    const col = (name) => cells[this.columns[name]];
    const field = SERIES[`${col("Item Code")}|${col("Element Code")}`];
    if (!field) return;
    const areaCode = Number(col("Area Code"));
    if (!Number.isFinite(areaCode) || areaCode >= AGGREGATE_AREA_CODE) return;
    const rawValue = col("Value");
    if (rawValue === undefined || rawValue === "") return;
    const year = Number(col("Year"));
    const country = col("Area");
    const key = `${country}|${year}`;
    if (!this.rows.has(key)) {
      this.rows.set(key, {
        country,
        m49_code: (col("Area Code (M49)") ?? "").replace(/^'/, ""),
        year,
        chickens_head: null,
        egg_laying_hens: null,
        eggs_tonnes: null,
        chicken_meat_tonnes: null,
      });
    }
    this.rows.get(key)[field] = Math.round(Number(rawValue) * unitMultiplier(col("Unit")));
  }

  /**
   * @param {{minYear?: number, years?: number}} opts  minYear wins; otherwise keep the latest `years` years
   */
  result({ minYear, years = 10 } = {}) {
    const all = [...this.rows.values()].filter((r) => FIELDS.some((f) => r[f] !== null));
    const latest = all.reduce((max, r) => Math.max(max, r.year), 0);
    const floor = minYear ?? latest - years + 1;
    return all
      .filter((r) => r.year >= floor)
      .sort((a, b) => a.country.localeCompare(b.country) || a.year - b.year);
  }
}

/** Convenience wrapper for already-loaded CSV text (used in tests). */
export function parseFaostatRows(csvText, opts) {
  const acc = new FaostatAccumulator();
  for (const line of csvText.split("\n")) acc.addLine(line.replace(/\r$/, ""));
  return acc.result(opts);
}
