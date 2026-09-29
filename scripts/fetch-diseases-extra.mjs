// Extra disease photos for chicken-site disease pages that had no image yet
// (29 Sep 2026 pass). Same machinery as fetch-foods-extra.mjs, writing into
// data/images-original/diseases/<id>/ and data/diseases-extra-photos.json.
//
// Four of these diseases have no distinctive photo on Commons (mostly
// pathogen micrographs or nothing at all), so they share one honest,
// non-specific "health check" photo (a health worker vaccinating a chicken)
// rather than getting a gory or misleading picture; wire-reuse-photos.mjs
// aliases the remaining diseases onto whichever of these four rows fits.
//
//   node scripts/fetch-diseases-extra.mjs

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BATCH_SIZE, CONCURRENCY, fetchWithRetry, mapImageInfoResults, mapWithConcurrency, safeLocalFileName } from "./fetch-originals.mjs";
import { commonsApiPost } from "./lib/commons-edge.mjs";

const DATA_DIR = path.resolve("data");
const OUT_DIR = path.join(DATA_DIR, "images-original", "diseases");
const MANIFEST_FILE = path.join(DATA_DIR, "diseases-extra-photos.json");

// [disease id (matches health.diseases in chicken-site), Commons file name]
export const DISEASES = [
  ["mareks-disease", "Marek's disease, cutaneous, broiler.jpg"],
  ["avian-sarcoma-leukosis-virus", "Chicken - melbourne show 2005.jpg"],
  ["runting-stunting-syndrome-in-broilers", "Broiler Chicken at a farm.jpg"],
  ["avian-infectious-bronchitis", "Chicken vaccination afghanistan.jpg"],
];

async function imageInfo(titles) {
  return commonsApiPost({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    titles: titles.join("|"),
    format: "json",
    formatversion: "2",
  });
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
  const titles = DISEASES.map(([, file]) => `File:${file}`);
  const info = new Map();
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    for (const [t, v] of mapImageInfoResults(await imageInfo(batch), batch)) info.set(t, v);
  }

  let bytes = 0;
  const started = Date.now();
  const rows = await mapWithConcurrency(DISEASES, CONCURRENCY, async ([id, file]) => {
    const meta = info.get(`File:${file}`);
    if (!meta || meta.missing || !meta.url) {
      console.log(`missing on Commons: ${file}`);
      return null;
    }
    const localPath = path.posix.join("data/images-original/diseases", id, safeLocalFileName(file));
    const abs = path.resolve(localPath);
    if (!existsSync(abs)) {
      await download(meta.url, abs);
      bytes += (await stat(abs)).size;
      console.log(`got ${id} (${(meta.size / 1e6).toFixed(1)} MB, ${meta.width}px)`);
    }
    return {
      entity_type: "diseases",
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
  console.log(`${manifest.length}/${DISEASES.length} disease photos listed, ${(bytes / 1e6).toFixed(1)} MB downloaded in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

if (process.argv[1]?.endsWith("fetch-diseases-extra.mjs")) {
  await mkdir(OUT_DIR, { recursive: true });
  await main();
}
