#!/usr/bin/env node
// Parses the three copied research markdown files into data/keywords.json.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify, parseVolume, parseKd, parsePipeTable, parseInlineKeywordList } from "./lib/keywords.mjs";

const RESEARCH_DIR = path.resolve("research");
const DATA_DIR = path.resolve("data");
const OUT_FILE = path.join(DATA_DIR, "keywords.json");

const FILE_11 = "11-backyard-chickens.md";
const FILE_12 = "12-chicken-food-pages.md";
const FILE_13 = "13-chicken-breed-pages.md";

/** Split markdown text into sections keyed by their "## heading" text. */
function splitSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let current = { heading: "(preamble)", body: [] };
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      sections.push(current);
      current = { heading: line.replace(/^##\s+/, "").trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push(current);
  return sections.map((s) => ({ heading: s.heading, text: s.body.join("\n") }));
}

function cleanLabelToFoodNames(cell) {
  const cleaned = cell
    .replace(/\*\*/g, "")
    .replace(/\(\+[^)]*\)/g, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  return cleaned
    .split(/\s*\/\s*|\s*,\s*(?=[a-z])/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

async function parseFoodFile() {
  const text = await readFile(path.join(RESEARCH_DIR, FILE_12), "utf8");
  const rows = parsePipeTable(text, "Food");
  const out = [];
  for (const cells of rows) {
    if (cells.length < 3) continue;
    const [foodCell, volCell, kdCell] = cells;
    const names = cleanLabelToFoodNames(foodCell);
    const volume = parseVolume(volCell.replace(/\*\*/g, ""));
    const kd = parseKd(kdCell.replace(/\*\*/g, ""));
    for (const name of names) {
      out.push({
        entity_type: "food",
        entity_id: slugify(name),
        keyword_or_label: name,
        volume,
        kd,
        source_file: FILE_12,
      });
    }
  }
  return out;
}

async function parseBreedFile() {
  const text = await readFile(path.join(RESEARCH_DIR, FILE_13), "utf8");
  const rows = parsePipeTable(text, "Breed");
  const out = [];
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const [breedCell, mainTermCell] = cells;
    const breedNames = breedCell
      .replace(/\*\*/g, "")
      .split(/\s*\/\s*/)
      .map((n) => n.replace(/\(.*?\)/g, "").trim())
      .filter(Boolean);

    const termMatch = /([\d,]+(?:\.\d+)?[kK]?)\s*\(?(\d+)?\)?/.exec(mainTermCell);
    const volume = termMatch ? parseVolume(termMatch[1]) : null;
    const kd = termMatch && termMatch[2] ? parseKd(termMatch[2]) : null;

    for (const name of breedNames) {
      out.push({
        entity_type: "breed",
        entity_id: slugify(name),
        keyword_or_label: name,
        volume,
        kd,
        source_file: FILE_13,
      });
    }
  }
  return out;
}

/** File 11 has inline "label N/KD" lists inside sections; classify by heading. */
async function parseNicheFile() {
  const text = await readFile(path.join(RESEARCH_DIR, FILE_11), "utf8");
  const sections = splitSections(text);
  const out = [];

  const headingType = (heading) => {
    const h = heading.toLowerCase();
    if (h.includes("food")) return "food";
    if (h.includes("breed")) return "breed";
    return "topic";
  };

  for (const section of sections) {
    const type = headingType(section.heading);
    if (!/page list|market|money/i.test(section.heading)) continue;
    const entries = parseInlineKeywordList(section.text);
    for (const entry of entries) {
      out.push({
        entity_type: type,
        entity_id: slugify(entry.label),
        keyword_or_label: entry.label,
        volume: entry.volume,
        kd: entry.kd,
        source_file: FILE_11,
      });
    }
  }
  return out;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const [foodRows, breedRows, nicheRows] = await Promise.all([
    parseFoodFile(),
    parseBreedFile(),
    parseNicheFile(),
  ]);

  const all = [...foodRows, ...breedRows, ...nicheRows];

  // Dedupe identical rows (same type+id+label+source), keep first occurrence.
  const seen = new Set();
  const deduped = [];
  for (const row of all) {
    const key = `${row.entity_type}|${row.entity_id}|${row.keyword_or_label}|${row.source_file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  deduped.sort((a, b) => {
    if (a.entity_type !== b.entity_type) return a.entity_type.localeCompare(b.entity_type);
    if (a.entity_id !== b.entity_id) return a.entity_id.localeCompare(b.entity_id);
    return a.keyword_or_label.localeCompare(b.keyword_or_label);
  });

  await writeFile(OUT_FILE, JSON.stringify(deduped, null, 2) + "\n", "utf8");
  console.log(`Wrote ${deduped.length} keyword rows to ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`  food: ${deduped.filter((r) => r.entity_type === "food").length}`);
  console.log(`  breed: ${deduped.filter((r) => r.entity_type === "breed").length}`);
  console.log(`  topic: ${deduped.filter((r) => r.entity_type === "topic").length}`);
}

main().catch((err) => {
  console.error("build-keywords failed:", err);
  process.exitCode = 1;
});
