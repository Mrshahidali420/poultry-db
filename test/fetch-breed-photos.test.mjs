import { test } from "node:test";
import assert from "node:assert/strict";
import { imageSize, breedsWithoutPhoto, HARRIS_FILES } from "../scripts/fetch-breed-photos.mjs";

test("imageSize reads a JPEG SOF0 header", () => {
  // Minimal JPEG: SOI, APP0, SOF0 (height=2, width=3), rest irrelevant.
  const buf = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0, // APP0
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00, // SOF0: height=2, width=3
  ]);
  assert.deepEqual(imageSize(buf), { width: 3, height: 2 });
});

test("imageSize reads a PNG IHDR header", () => {
  const buf = Buffer.alloc(24);
  buf.write("\x89PNG\r\n\x1a\n", 0, "binary");
  buf.writeUInt32BE(100, 16);
  buf.writeUInt32BE(50, 20);
  assert.deepEqual(imageSize(buf), { width: 100, height: 50 });
});

test("imageSize returns nulls for an unrecognized format", () => {
  assert.deepEqual(imageSize(Buffer.from("not an image")), { width: null, height: null });
});

test("breedsWithoutPhoto skips a breed that already carries an inline image", () => {
  const breeds = [{ id: "ancona", image: "ancona.jpg" }, { id: "brahma" }];
  const result = breedsWithoutPhoto(breeds, [], [], [], () => false);
  assert.deepEqual(result.map((b) => b.id), ["brahma"]);
});

test("breedsWithoutPhoto skips a breed with an images-original.json entry that exists on disk", () => {
  const breeds = [{ id: "ancona" }, { id: "brahma" }];
  const io = [{ entity_type: "breeds", entity_id: "ancona", local_path: "data/images-original/breeds/ancona/1.jpg" }];
  const result = breedsWithoutPhoto(breeds, io, [], [], () => true);
  assert.deepEqual(result.map((b) => b.id), ["brahma"]);
});

test("breedsWithoutPhoto skips a breed whose images.json file exists on disk", () => {
  const breeds = [{ id: "ancona" }, { id: "brahma" }];
  const images = [{ entity_type: "breeds", entity_id: "ancona", file: "data/images/breeds/ancona/1.jpg" }];
  const result = breedsWithoutPhoto(breeds, [], images, [], () => true);
  assert.deepEqual(result.map((b) => b.id), ["brahma"]);
});

test("breedsWithoutPhoto skips a breed already recorded in breed-photos-extra.json", () => {
  const breeds = [{ id: "ancona" }, { id: "brahma" }];
  const extra = [{ breed_id: "ancona", local_path: "data/images-original/breeds/ancona/commons.jpg" }];
  const result = breedsWithoutPhoto(breeds, [], [], extra, () => true);
  assert.deepEqual(result.map((b) => b.id), ["brahma"]);
});

test("breedsWithoutPhoto does not skip when the recorded local_path is missing on disk", () => {
  const breeds = [{ id: "ancona" }];
  const extra = [{ breed_id: "ancona", local_path: "data/images-original/breeds/ancona/commons.jpg" }];
  const result = breedsWithoutPhoto(breeds, [], [], extra, () => false);
  assert.deepEqual(result.map((b) => b.id), ["ancona"]);
});

test("HARRIS_FILES maps every entry to a .jpg file name", () => {
  for (const file of Object.values(HARRIS_FILES)) {
    assert.match(file, /\.jpg$/);
  }
});
