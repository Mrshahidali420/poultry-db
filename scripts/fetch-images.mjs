#!/usr/bin/env node
// Builds a much larger local image library under data/images/, with a
// manifest at data/images.json. Four kinds of images:
//   1. Breed gallery images from each breed's Wikimedia Commons category
//      (up to 6 per breed, in addition to the existing lead image).
//   2. Every Harris730/Chicken_breed_dataset image (~108 files), linked to
//      the breed it matches.
//   3. One lead image each for foods, predators, toxic/safe plants and
//      diseases, from Wikipedia/Commons.
//
// Skips files already downloaded. Logs failures to data/images_failed.json.
// Sequential and polite (scripts/lib/http.mjs rate-limits + retries).

import { mkdir, readFile, writeFile, access, readdir } from "node:fs/promises";
import path from "node:path";
import { politeFetch } from "./lib/http.mjs";
import {
  fetchWikidataItem,
  fetchCommonsCategoryFromWikidata,
  fetchCommonsCategoryImages,
  fetchCommonsImageInfo,
  fetchPageLeadImage,
} from "./lib/wiki.mjs";
import { loadHarris730Rows } from "./import-github-datasets.mjs";
import { ORIGIN_HARRIS730 } from "./lib/provenance.mjs";

const DATA_DIR = path.resolve("data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(DATA_DIR, "images.json");
const FAILED_FILE = path.join(DATA_DIR, "images_failed.json");
const HARRIS_REPO = "Harris730/Chicken_breed_dataset";
const THUMB_WIDTH = 1200;
const MAX_GALLERY_PER_BREED = 6;
const FORCE = process.argv.includes("--force");

/**
 * Turn a name into a filesystem-safe, lower-kebab-case component.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

/**
 * Candidate Wikimedia Commons category names to try for a breed, in order,
 * before falling back to the P373 Commons-category lookup via Wikidata.
 * @param {string} breedName e.g. "Brahma (chicken)" or "Ancona"
 * @returns {string[]}
 */
export function guessCommonsCategoryNames(breedName) {
  const base = breedName.replace(/\s*\(chicken\)\s*$/i, "").trim();
  return [
    `${base} chicken`,
    `${base} chickens`,
    `${base} (chicken)`,
    base,
  ];
}

/**
 * Build a manifest row for an image.
 * @param {object} params
 * @returns {object}
 */
export function buildManifestEntry({
  entityType,
  entityId,
  file,
  width = null,
  height = null,
  sourceUrl,
  commonsPage = null,
  author = null,
  license = null,
  licenseUrl = null,
  origin,
  role,
}) {
  return {
    entity_type: entityType,
    entity_id: entityId,
    file,
    width,
    height,
    source_url: sourceUrl,
    commons_page: commonsPage,
    author,
    license,
    license_url: licenseUrl,
    origin,
    role,
  };
}

/**
 * Extension from a Commons/Wikipedia file name, defaulting to .jpg.
 * @param {string} fileName
 * @returns {string}
 */
export function extFromFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ext && /^\.(jpg|jpeg|png|webp|gif|svg)$/.test(ext) ? ext : ".jpg";
}

/**
 * Cap and dedupe a list of Commons file titles for a gallery, dropping any
 * that match names already used elsewhere (e.g. the main image).
 * @param {string[]} fileTitles
 * @param {Set<string>} exclude bare file names to exclude
 * @param {number} max
 * @returns {string[]}
 */
export function selectGalleryFiles(fileTitles, exclude, max) {
  const seen = new Set();
  const out = [];
  for (const title of fileTitles) {
    const bare = title.replace(/^File:/, "");
    if (exclude.has(bare) || seen.has(bare)) continue;
    seen.add(bare);
    out.push(bare);
    if (out.length >= max) break;
  }
  return out;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function downloadTo(url, localFile) {
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await mkdir(path.dirname(localFile), { recursive: true });
  await writeFile(localFile, Buffer.from(await response.arrayBuffer()));
}

function relPath(file) {
  return path.relative(process.cwd(), file).replace(/\\/g, "/");
}

async function resolveCommonsCategory(breedName) {
  for (const candidate of guessCommonsCategoryNames(breedName)) {
    try {
      const files = await fetchCommonsCategoryImages(candidate, MAX_GALLERY_PER_BREED + 2);
      if (files.length) return files;
    } catch {
      // try next candidate
    }
  }
  try {
    const qid = await fetchWikidataItem(breedName);
    const category = await fetchCommonsCategoryFromWikidata(qid);
    if (category) return await fetchCommonsCategoryImages(category, MAX_GALLERY_PER_BREED + 2);
  } catch {
    // give up
  }
  return [];
}

async function fetchBreedGallery(breed, manifest, failed) {
  const mainFile = breed.image?.file ?? null;
  const exclude = new Set(mainFile ? [mainFile] : []);
  let candidates = [];
  try {
    candidates = await resolveCommonsCategory(breed.name);
  } catch (err) {
    failed.push({ entity_type: "breeds", entity_id: breed.id, kind: "gallery", error: err.message });
    return 0;
  }
  const selected = selectGalleryFiles(candidates, exclude, MAX_GALLERY_PER_BREED);

  let added = 0;
  let n = 1;
  for (const fileName of selected) {
    const dir = path.join(IMAGES_DIR, "breeds", breed.id);
    const localFile = path.join(dir, `${n}${extFromFileName(fileName)}`);
    if (!FORCE && (await exists(localFile))) {
      manifest.push(
        buildManifestEntry({
          entityType: "breeds",
          entityId: breed.id,
          file: relPath(localFile),
          sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
          origin: "wikimedia-commons",
          role: "gallery",
        })
      );
      n += 1;
      continue;
    }
    try {
      const info = await fetchCommonsImageInfo(fileName, { urlWidth: THUMB_WIDTH });
      if (!info || !info.thumb_url) throw new Error("no image info");
      await downloadTo(info.thumb_url, localFile);
      manifest.push(
        buildManifestEntry({
          entityType: "breeds",
          entityId: breed.id,
          file: relPath(localFile),
          width: info.width,
          height: info.height,
          sourceUrl: info.full_url,
          commonsPage: info.commons_url,
          author: info.author,
          license: info.license,
          licenseUrl: info.license_url,
          origin: "wikimedia-commons",
          role: "gallery",
        })
      );
      added += 1;
      n += 1;
    } catch (err) {
      failed.push({ entity_type: "breeds", entity_id: breed.id, kind: "gallery", file: fileName, error: err.message });
    }
  }
  return added;
}

async function fetchHarris730Images(breeds, manifest, failed) {
  const rows = await loadHarris730Rows(breeds);
  if (!rows) {
    console.log("Harris730 CSV not cached; skipping harris730 image set.");
    return 0;
  }
  const dir = path.join(IMAGES_DIR, "harris730");
  await mkdir(dir, { recursive: true });
  let downloaded = 0;
  const seen = new Set();
  for (const row of rows) {
    if (!row.image || seen.has(row.image)) continue;
    seen.add(row.image);
    const localFile = path.join(dir, row.image);
    const rawUrl = `https://raw.githubusercontent.com/${HARRIS_REPO}/HEAD/images/${row.image}`;
    if (!FORCE && (await exists(localFile))) {
      if (row.breed_id) {
        manifest.push(
          buildManifestEntry({
            entityType: "breeds",
            entityId: row.breed_id,
            file: relPath(localFile),
            sourceUrl: rawUrl,
            origin: `github:${HARRIS_REPO}`,
            role: "gallery",
          })
        );
      }
      continue;
    }
    try {
      await downloadTo(rawUrl, localFile);
      downloaded += 1;
      if (row.breed_id) {
        manifest.push(
          buildManifestEntry({
            entityType: "breeds",
            entityId: row.breed_id,
            file: relPath(localFile),
            sourceUrl: rawUrl,
            origin: `github:${HARRIS_REPO}`,
            role: "gallery",
          })
        );
      }
    } catch (err) {
      failed.push({ entity_type: "breeds", entity_id: row.breed_id, kind: "harris730", file: row.image, error: err.message });
    }
  }
  console.log(`Harris730 images: ${seen.size} referenced, ${downloaded} downloaded now.`);
  return downloaded;
}

async function fetchLeadImage(entityType, entity, searchTitle, manifest, failed) {
  const dir = path.join(IMAGES_DIR, entityType);
  try {
    let fileName = await fetchPageLeadImage(searchTitle);
    if (!fileName && entity.scientific_name) {
      fileName = await fetchPageLeadImage(entity.scientific_name);
    }
    if (!fileName) return false;

    const localFile = path.join(dir, `${entity.id}${extFromFileName(fileName)}`);
    if (!FORCE && (await exists(localFile))) {
      manifest.push(
        buildManifestEntry({
          entityType,
          entityId: entity.id,
          file: relPath(localFile),
          sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
          origin: "wikimedia-commons",
          role: "main",
        })
      );
      return true;
    }

    const info = await fetchCommonsImageInfo(fileName, { urlWidth: THUMB_WIDTH });
    if (!info || !info.thumb_url) return false;
    await downloadTo(info.thumb_url, localFile);
    manifest.push(
      buildManifestEntry({
        entityType,
        entityId: entity.id,
        file: relPath(localFile),
        width: info.width,
        height: info.height,
        sourceUrl: info.full_url,
        commonsPage: info.commons_url,
        author: info.author,
        license: info.license,
        licenseUrl: info.license_url,
        origin: "wikimedia-commons",
        role: "main",
      })
    );
    return true;
  } catch (err) {
    failed.push({ entity_type: entityType, entity_id: entity.id, kind: "main", error: err.message });
    return false;
  }
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function dirSizeMb(dir) {
  let total = 0;
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        try {
          total += (await import("node:fs/promises").then((fs) => fs.stat(full))).size;
        } catch {
          // ignore
        }
      }
    }
  }
  await walk(dir);
  return total / (1024 * 1024);
}

const MAX_TOTAL_MB = 500;

async function main() {
  await mkdir(IMAGES_DIR, { recursive: true });

  const breeds = JSON.parse(await readFile(path.join(DATA_DIR, "breeds.json"), "utf8"));
  const diseases = JSON.parse(await readFile(path.join(DATA_DIR, "diseases.json"), "utf8"));
  const loadCurated = async (name) => JSON.parse(await readFile(path.join(DATA_DIR, "curated", `${name}.json`), "utf8"));
  const foods = await loadCurated("food-safety");
  const predators = await loadCurated("predators");
  const toxicPlants = await loadCurated("toxic-plants");
  const safePlants = await loadCurated("safe-forage-plants");

  const existingManifest = await loadManifest();
  const manifest = [...existingManifest];
  const failed = [];

  // Persist as we go: this is a long, network-bound run on a machine that can
  // reap idle background processes under memory pressure, so a kill partway
  // through must not lose every manifest entry gathered so far.
  const persist = async () => {
    const seenKeys = new Set();
    const deduped = [];
    for (const entry of manifest) {
      const key = `${entry.entity_type}|${entry.entity_id}|${entry.file}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      deduped.push(entry);
    }
    await writeFile(MANIFEST_FILE, JSON.stringify(deduped, null, 2) + "\n", "utf8");
    await writeFile(FAILED_FILE, JSON.stringify(failed, null, 2) + "\n", "utf8");
  };

  // 1. Harris730 images (all of them), linked where possible.
  await fetchHarris730Images(breeds, manifest, failed);
  await persist();

  // 2. Breed galleries from Commons categories.
  let gallerySizeMb = await dirSizeMb(IMAGES_DIR);
  let galleryStopped = false;
  let galleryAdded = 0;
  let processedSinceSizeCheck = 0;
  for (const breed of breeds) {
    if (gallerySizeMb >= MAX_TOTAL_MB) {
      galleryStopped = true;
      break;
    }
    const already = existingManifest.filter((m) => m.entity_type === "breeds" && m.entity_id === breed.id && m.role === "gallery" && m.origin === "wikimedia-commons").length;
    if (!FORCE && already >= MAX_GALLERY_PER_BREED) continue;
    const added = await fetchBreedGallery(breed, manifest, failed);
    galleryAdded += added;
    await persist();
    processedSinceSizeCheck += 1;
    if (added && processedSinceSizeCheck >= 5) {
      gallerySizeMb = await dirSizeMb(IMAGES_DIR);
      processedSinceSizeCheck = 0;
    }
  }
  console.log(`Breed gallery images added: ${galleryAdded}${galleryStopped ? " (stopped: data/images over 500 MB)" : ""}.`);

  // 3. Lead images for foods, predators, plants, diseases.
  const leadSets = [
    { type: "foods", entities: foods },
    { type: "predators", entities: predators },
    { type: "toxic-plants", entities: toxicPlants },
    { type: "safe-forage-plants", entities: safePlants },
    { type: "diseases", entities: diseases },
  ];
  for (const { type, entities } of leadSets) {
    let count = 0;
    for (const entity of entities) {
      const localFileGlob = path.join(IMAGES_DIR, type);
      const hasAny = manifest.some((m) => m.entity_type === type && m.entity_id === entity.id && m.role === "main");
      if (!FORCE && hasAny) continue;
      const searchTitle = entity.wikipedia_title ?? entity.name;
      const ok = await fetchLeadImage(type, entity, searchTitle, manifest, failed);
      if (ok) count += 1;
      await persist();
      void localFileGlob;
    }
    console.log(`${type}: ${count} new lead image(s) fetched (${entities.length} entities total).`);
  }

  await persist();
  const finalManifest = JSON.parse(await readFile(MANIFEST_FILE, "utf8"));
  finalManifest.sort((a, b) => (a.entity_type + a.entity_id + a.file).localeCompare(b.entity_type + b.entity_id + b.file));
  await writeFile(MANIFEST_FILE, JSON.stringify(finalManifest, null, 2) + "\n", "utf8");

  const totalMb = await dirSizeMb(IMAGES_DIR);
  console.log(`Manifest entries: ${finalManifest.length}. Failures: ${failed.length}. data/images size: ${totalMb.toFixed(1)} MB.`);
}

if (process.argv[1]?.endsWith("fetch-images.mjs")) {
  main().catch((err) => {
    console.error("fetch-images failed:", err);
    process.exitCode = 1;
  });
}
