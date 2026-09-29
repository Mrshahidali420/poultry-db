// Extra food photos for chicken-site food pages that had no image yet (29
// Sep 2026 pass). Same machinery as fetch-topic-photos.mjs, but writes into
// the "foods" entity type: data/images-original/foods/<id>/ and
// data/foods-extra-photos.json, merged with images-original.json's foods
// rows by build-images.mjs (see wire-reuse-photos.mjs / the chicken-site
// build script for the merge point).
//
//   node scripts/fetch-foods-extra.mjs

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BATCH_SIZE, CONCURRENCY, fetchWithRetry, mapImageInfoResults, mapWithConcurrency, safeLocalFileName } from "./fetch-originals.mjs";
import { commonsApiPost } from "./lib/commons-edge.mjs";

const DATA_DIR = path.resolve("data");
const OUT_DIR = path.join(DATA_DIR, "images-original", "foods");
const MANIFEST_FILE = path.join(DATA_DIR, "foods-extra-photos.json");

// [food id (matches src/data/generated/foods.json), Commons file name]
export const FOODS = [
  ["acorns", "Quercus robur acorns in Tuntorp 1.jpg"],
  ["alcohol", "Beer and pizza on display in a restaurant on a rustic table with focus on the glass of beer.jpg"],
  ["asparagus", "Asparagus soup (spargelsuppe).jpg"],
  ["beans", "Camellia brand dried beans.jpg"],
  ["black-beans", "Black beans, cheese, tortilla close-up.jpg"],
  ["brussels-sprouts", "Roasted Brussels sprouts - December 2023 - Sarah Stierch 01.jpg"],
  ["crackers", "Crackers Food.jpg"],
  ["dates", "Various-dried-dates-kurma.jpg"],
  ["eggs", "A Basket of Brown Eggs at Gold Coast Prime Rib.jpg"],
  ["jalapenos", "Jalapeños on the grill.jpg"],
  ["kiwi", "Kiwifruit cross section.jpg"],
  ["limes", "Lime - whole and halved.jpg"],
  ["mint", "A mint leaves in Yuen Long.jpg"],
  ["peanuts", "Peanuts (Arachis hypogaea) - in shell, shell cracked open, shelled, peeled.jpg"],
  ["persimmon", "Persimmon young fruit 3.jpg"],
  ["pickles", "Pickled-cucumbers-1520638.jpg"],
  ["pinto-beans", "Pinto beans 2.jpg"],
  ["purslane", "Portulaca 02.jpg"],
  ["sage", "White sage (Salvia apiana) (50699659533).jpg"],
  ["sauerkraut", "Belarusian-Russian Sauerkraut-1.jpg"],
  ["squash", "Trombocino Squash - Full grown winter squash.jpg"],
];

async function imageInfo(titles) {
  const res = await commonsApiPost({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    titles: titles.join("|"),
    format: "json",
    formatversion: "2",
  });
  return res;
}

async function download(url, file) {
  await mkdir(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  const res = await fetchWithRetry(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  await rename(part, file);
}

async function main() {
  const titles = FOODS.map(([, file]) => `File:${file}`);
  const info = new Map();
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    for (const [t, v] of mapImageInfoResults(await imageInfo(batch), batch)) info.set(t, v);
  }

  let bytes = 0;
  const started = Date.now();
  const rows = await mapWithConcurrency(FOODS, CONCURRENCY, async ([id, file]) => {
    const meta = info.get(`File:${file}`);
    if (!meta || meta.missing || !meta.url) {
      console.log(`missing on Commons: ${file}`);
      return null;
    }
    const localPath = path.posix.join("data/images-original/foods", id, safeLocalFileName(file));
    const abs = path.resolve(localPath);
    if (!existsSync(abs)) {
      await download(meta.url, abs);
      bytes += (await stat(abs)).size;
      console.log(`got ${id} (${(meta.size / 1e6).toFixed(1)} MB, ${meta.width}px)`);
    }
    return {
      entity_type: "foods",
      entity_id: id,
      file,
      commons_page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
      original_url: meta.url,
      local_path: localPath,
      width: meta.width,
      height: meta.height,
      bytes: meta.size,
      mime: meta.mime,
      artist: meta.artist,
      licence: meta.licence,
      licence_url: meta.licenceUrl,
      description: meta.description,
    };
  });

  const manifest = rows.filter(Boolean);
  await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`${manifest.length}/${FOODS.length} food photos listed, ${(bytes / 1e6).toFixed(1)} MB downloaded in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

if (process.argv[1]?.endsWith("fetch-foods-extra.mjs")) {
  await mkdir(OUT_DIR, { recursive: true });
  await main();
}
