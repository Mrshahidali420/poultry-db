import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFilename,
  guessCommonsCategoryNames,
  buildManifestEntry,
  extFromFileName,
  selectGalleryFiles,
} from "../scripts/fetch-images.mjs";

test("sanitizeFilename lower-kebab-cases a name and strips accents", () => {
  assert.equal(sanitizeFilename("Poulet de Bresse"), "poulet-de-bresse");
  assert.equal(sanitizeFilename("Été"), "ete");
  assert.equal(sanitizeFilename("  --Weird!! Name__"), "weird-name");
});

test("sanitizeFilename never returns an empty string", () => {
  assert.equal(sanitizeFilename("###"), "file");
});

test("guessCommonsCategoryNames builds candidate category names in order", () => {
  const candidates = guessCommonsCategoryNames("Brahma (chicken)");
  assert.deepEqual(candidates, ["Brahma chicken", "Brahma chickens", "Brahma (chicken)", "Brahma"]);
});

test("guessCommonsCategoryNames handles a plain breed name with no suffix", () => {
  const candidates = guessCommonsCategoryNames("Ancona");
  assert.deepEqual(candidates, ["Ancona chicken", "Ancona chickens", "Ancona (chicken)", "Ancona"]);
});

test("buildManifestEntry fills every field, defaulting optional ones to null", () => {
  const entry = buildManifestEntry({
    entityType: "breeds",
    entityId: "ancona",
    file: "data/images/breeds/ancona/1.jpg",
    sourceUrl: "https://example.com/img.jpg",
    origin: "wikimedia-commons",
    role: "gallery",
  });
  assert.equal(entry.entity_type, "breeds");
  assert.equal(entry.entity_id, "ancona");
  assert.equal(entry.file, "data/images/breeds/ancona/1.jpg");
  assert.equal(entry.width, null);
  assert.equal(entry.height, null);
  assert.equal(entry.commons_page, null);
  assert.equal(entry.author, null);
  assert.equal(entry.role, "gallery");
});

test("extFromFileName keeps a known image extension and defaults to .jpg", () => {
  assert.equal(extFromFileName("Brahma hen.PNG"), ".png");
  assert.equal(extFromFileName("Ancona.webp"), ".webp");
  assert.equal(extFromFileName("no-extension"), ".jpg");
  assert.equal(extFromFileName("Foo.docx"), ".jpg");
});

test("selectGalleryFiles excludes a name, dedupes and caps at max", () => {
  const files = ["File:A.jpg", "File:B.jpg", "File:A.jpg", "File:C.jpg", "File:D.jpg"];
  const selected = selectGalleryFiles(files, new Set(["B.jpg"]), 2);
  assert.deepEqual(selected, ["A.jpg", "C.jpg"]);
});

test("selectGalleryFiles returns fewer than max when not enough candidates", () => {
  const files = ["File:A.jpg"];
  const selected = selectGalleryFiles(files, new Set(), 6);
  assert.deepEqual(selected, ["A.jpg"]);
});
