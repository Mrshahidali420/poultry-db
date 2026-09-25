import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  chunkArray,
  mapImageInfoResults,
  safeLocalFileName,
  shouldSkipMime,
  isAlreadyDownloaded,
} from "../scripts/fetch-originals.mjs";

test("chunkArray splits into chunks of the given size", () => {
  const items = Array.from({ length: 120 }, (_, i) => `File:${i}.jpg`);
  const chunks = chunkArray(items, 50);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 50);
  assert.equal(chunks[1].length, 50);
  assert.equal(chunks[2].length, 20);
});

test("chunkArray returns a single chunk when items fit within size", () => {
  const chunks = chunkArray(["a", "b"], 50);
  assert.deepEqual(chunks, [["a", "b"]]);
});

test("chunkArray returns no chunks for an empty array", () => {
  assert.deepEqual(chunkArray([], 50), []);
});

test("mapImageInfoResults resolves a normal file with imageinfo", () => {
  const requested = ["File:Brahma hen.jpg"];
  const json = {
    query: {
      pages: [
        {
          title: "File:Brahma hen.jpg",
          imageinfo: [
            {
              url: "https://upload.wikimedia.org/wikipedia/commons/1/11/Brahma_hen.jpg",
              width: 4000,
              height: 3000,
              mime: "image/jpeg",
              size: 5_000_000,
              extmetadata: {
                Artist: { value: "Jane Doe" },
                LicenseShortName: { value: "CC BY-SA 4.0" },
                LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                ImageDescription: { value: "A Brahma hen in a garden." },
              },
            },
          ],
        },
      ],
    },
  };
  const results = mapImageInfoResults(json, requested);
  const info = results.get("File:Brahma hen.jpg");
  assert.equal(info.missing, false);
  assert.equal(info.url, "https://upload.wikimedia.org/wikipedia/commons/1/11/Brahma_hen.jpg");
  assert.equal(info.width, 4000);
  assert.equal(info.size, 5_000_000);
  assert.equal(info.artist, "Jane Doe");
  assert.equal(info.licence, "CC BY-SA 4.0");
  assert.equal(info.description, "A Brahma hen in a garden.");
});

test("mapImageInfoResults follows a normalized title to its page entry", () => {
  const requested = ["File:brahma hen.jpg"];
  const json = {
    query: {
      normalized: [{ from: "File:brahma hen.jpg", to: "File:Brahma hen.jpg" }],
      pages: [
        {
          title: "File:Brahma hen.jpg",
          imageinfo: [{ url: "https://upload.wikimedia.org/x.jpg", width: 100, height: 100, mime: "image/jpeg", size: 100 }],
        },
      ],
    },
  };
  const results = mapImageInfoResults(json, requested);
  const info = results.get("File:brahma hen.jpg");
  assert.equal(info.missing, false);
  assert.equal(info.url, "https://upload.wikimedia.org/x.jpg");
});

test("mapImageInfoResults marks a missing page as missing", () => {
  const requested = ["File:Does not exist.jpg"];
  const json = {
    query: {
      pages: [{ title: "File:Does not exist.jpg", missing: true }],
    },
  };
  const results = mapImageInfoResults(json, requested);
  assert.deepEqual(results.get("File:Does not exist.jpg"), { missing: true });
});

test("mapImageInfoResults treats a page absent from the response as missing", () => {
  const results = mapImageInfoResults({ query: { pages: [] } }, ["File:Ghost.jpg"]);
  assert.deepEqual(results.get("File:Ghost.jpg"), { missing: true });
});

test("safeLocalFileName sanitizes the base name and keeps the extension", () => {
  assert.equal(safeLocalFileName("Poule d'Alsace F SDA2013.JPG"), "poule-d-alsace-f-sda2013.jpg");
  assert.equal(safeLocalFileName("Été été.webp"), "ete-ete.webp");
});

test("shouldSkipMime skips known non-image mimes", () => {
  assert.equal(shouldSkipMime("application/pdf", 1000), true);
  assert.equal(shouldSkipMime("audio/ogg", 1000), true);
  assert.equal(shouldSkipMime("video/webm", 1000), true);
});

test("shouldSkipMime skips oversized tiff but keeps small tiff", () => {
  assert.equal(shouldSkipMime("image/tiff", 60 * 1024 * 1024), true);
  assert.equal(shouldSkipMime("image/tiff", 10 * 1024 * 1024), false);
});

test("shouldSkipMime keeps ordinary image mimes", () => {
  assert.equal(shouldSkipMime("image/jpeg", 5_000_000), false);
  assert.equal(shouldSkipMime(null, null), false);
});

test("isAlreadyDownloaded returns false when the file does not exist", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "poultry-resume-"));
  try {
    const missingFile = path.join(dir, "nope.jpg");
    assert.equal(await isAlreadyDownloaded(missingFile, 1234), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isAlreadyDownloaded returns true only when size matches expected bytes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "poultry-resume-"));
  try {
    const file = path.join(dir, "photo.jpg");
    await writeFile(file, Buffer.alloc(100));
    assert.equal(await isAlreadyDownloaded(file, 100), true);
    assert.equal(await isAlreadyDownloaded(file, 200), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isAlreadyDownloaded accepts any non-empty file when expected size is unknown", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "poultry-resume-"));
  try {
    const file = path.join(dir, "photo.jpg");
    await writeFile(file, Buffer.alloc(50));
    assert.equal(await isAlreadyDownloaded(file, null), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
