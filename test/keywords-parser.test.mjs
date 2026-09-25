import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseVolume, parseKd, parsePipeTable, parseInlineKeywordList, slugify } from "../scripts/lib/keywords.mjs";

test("parseVolume parses plain, comma-separated and K-suffixed numbers", () => {
  assert.equal(parseVolume("14,800"), 14800);
  assert.equal(parseVolume("1.9K"), 1900);
  assert.equal(parseVolume("33.1K"), 33100);
  assert.equal(parseVolume(""), null);
});

test("parseKd parses plain numbers, ranges (averaged) and dashes", () => {
  assert.equal(parseKd("28"), 28);
  assert.equal(parseKd("13-17"), 15);
  assert.equal(parseKd("-"), null);
  assert.equal(parseKd(""), null);
});

test("parsePipeTable extracts data rows and skips header/separator", async () => {
  const text = await readFile(path.resolve("test/fixtures/keywords-sample.md"), "utf8");
  const rows = parsePipeTable(text, "Food");
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], "grapes");
  assert.equal(rows[0][1], "16,270");
  assert.ok(rows[1][0].includes("pumpkin"));
});

test("parseInlineKeywordList extracts label/volume/kd triples separated by middle dots", () => {
  const entries = parseInlineKeywordList("grapes 14,800/28 · tomatoes 12,100/19 · bananas 9,900/10");
  assert.equal(entries.length, 3);
  assert.equal(entries[0].label, "grapes");
  assert.equal(entries[0].volume, 14800);
  assert.equal(entries[0].kd, 28);
  assert.equal(entries[2].label, "bananas");
});

test("slugify produces kebab-case ids", () => {
  assert.equal(slugify("Black Copper Marans"), "black-copper-marans");
  assert.equal(slugify("Ayam Cemani's"), "ayam-cemanis");
});
