import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseTemplate, stripWikiMarkup, extractSummary, parseWeightKg } from "../scripts/lib/wiki.mjs";

const fixturePath = path.resolve("test/fixtures/brahma-wikitext.txt");

test("parseTemplate extracts infobox poultry breed fields from the Brahma fixture", async () => {
  const wikitext = await readFile(fixturePath, "utf8");
  const fields = parseTemplate(wikitext, "infobox poultry breed");

  assert.ok(fields, "expected infobox to be found");
  assert.equal(fields.name, "Brahma");
  assert.equal(fields.country, "United States");
  assert.equal(fields.eggcolor, "brown");
  assert.equal(fields.comb, "pea");
  assert.match(fields.maleweight, /5\.5 kg/);
  assert.match(fields.femaleweight, /4\.5 kg/);
  assert.match(fields.altname, /Brahma Pootra/);
});

test("parseTemplate returns null when the template is not present", () => {
  const fields = parseTemplate("Just some plain text with no templates.", "infobox poultry breed");
  assert.equal(fields, null);
});

test("parseTemplate handles nested templates and links inside values", () => {
  const wikitext = "{{Infobox poultry breed|name=Test|country=[[United States|USA]]|use={{unbulleted list|eggs|meat}}}}";
  const fields = parseTemplate(wikitext, "infobox poultry breed");
  assert.equal(fields.name, "Test");
  assert.equal(fields.country, "[[United States|USA]]");
  assert.equal(fields.use, "{{unbulleted list|eggs|meat}}");
});

test("stripWikiMarkup strips refs, links, bold/italic and templates", () => {
  const input = "The '''Brahma''' is a [[list of chicken breeds|breed]] of [[chicken]].{{r|roberts|page=78}}";
  const out = stripWikiMarkup(input);
  assert.equal(out, "The Brahma is a breed of chicken.");
});

test("extractSummary pulls the first real paragraph, skipping the infobox", async () => {
  const wikitext = await readFile(fixturePath, "utf8");
  const summary = extractSummary(wikitext);
  assert.match(summary, /^The Brahma is an American breed of chicken/);
});

test("parseWeightKg handles plain kg values", () => {
  assert.equal(parseWeightKg("5.5 kg"), 5.5);
});

test("parseWeightKg handles kg ranges with an en dash", () => {
  assert.equal(parseWeightKg("3–4 kg"), 3.5);
});

test("parseWeightKg converts pounds to kilograms", () => {
  const kg = parseWeightKg("8 lb");
  assert.ok(Math.abs(kg - 3.63) < 0.02);
});

test("parseWeightKg returns null for empty input", () => {
  assert.equal(parseWeightKg(""), null);
  assert.equal(parseWeightKg(null), null);
});
