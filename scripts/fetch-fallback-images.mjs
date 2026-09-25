#!/usr/bin/env node
// Image fallback for breeds with no Wikimedia Commons image: use the image
// from the Harris730/Chicken_breed_dataset repo (images/<file>), saved to
// data/images/breeds/<id>.jpg and recorded on the breed with its origin.
// Commons stays the first choice: breeds that already have a Commons image
// are never touched.
//
// Runs after fetch-breeds.mjs (which rewrites breeds.json), so it re-applies
// the fallback each time; a file already on disk is not downloaded again
// unless --force.

import { mkdir, readFile, writeFile, access, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { politeFetch } from "./lib/http.mjs";
import { loadHarris730Rows } from "./import-github-datasets.mjs";
import { ORIGIN_HARRIS730 } from "./lib/provenance.mjs";

const REPO = "Harris730/Chicken_breed_dataset";
const DATA_DIR = path.resolve("data");
const IMAGE_DIR = path.join(DATA_DIR, "images", "breeds");
const BREEDS_FILE = path.join(DATA_DIR, "breeds.json");
const FORCE = process.argv.includes("--force");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const breeds = JSON.parse(await readFile(BREEDS_FILE, "utf8"));
  const harrisRows = await loadHarris730Rows(breeds);
  if (!harrisRows) {
    console.log("Harris730 CSV not in cache/ (run scripts/fetch-github-datasets.mjs); skipping image fallback.");
    return;
  }
  const imageByBreed = new Map(harrisRows.filter((r) => r.breed_id && r.image).map((r) => [r.breed_id, r.image]));
  await mkdir(IMAGE_DIR, { recursive: true });

  let applied = 0;
  let downloaded = 0;
  let failed = 0;
  const updated = [];

  for (const breed of breeds) {
    const hasCommons = breed.image && breed.image.origin !== ORIGIN_HARRIS730;
    const file = imageByBreed.get(breed.id);
    if (hasCommons || !file) {
      updated.push(breed);
      continue;
    }
    const repoPath = `images/${file}`;
    const ext = path.extname(file).toLowerCase() || ".jpg";
    const localFile = path.join(IMAGE_DIR, `${breed.id}${ext}`);
    const rawUrl = `https://raw.githubusercontent.com/${REPO}/HEAD/${repoPath}`;

    if (FORCE || !(await exists(localFile))) {
      try {
        const response = await politeFetch(rawUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await writeFile(localFile, Buffer.from(await response.arrayBuffer()));
        downloaded += 1;
      } catch (err) {
        failed += 1;
        console.log(`  could not download ${repoPath} for ${breed.id}: ${err.message}`);
        updated.push(breed);
        continue;
      }
    }

    applied += 1;
    updated.push({
      ...breed,
      image: {
        file,
        origin: ORIGIN_HARRIS730,
        repo: `https://github.com/${REPO}`,
        repo_path: repoPath,
        source_url: rawUrl,
        local_path: path.relative(process.cwd(), localFile).replace(/\\/g, "/"),
        license: null,
        license_note: "Image from the Harris730/Chicken_breed_dataset GitHub repo (breed text there is credited to starmilling.com); no licence stated.",
        attribution_required: null,
      },
    });
  }

  await writeFile(BREEDS_FILE, JSON.stringify(updated, null, 2) + "\n", "utf8");

  // Remove fallback files no breed points at any more (e.g. the breed now
  // has a Commons image). Only this script writes into IMAGE_DIR.
  const referenced = new Set(
    updated.filter((b) => b.image?.origin === ORIGIN_HARRIS730).map((b) => path.basename(b.image.local_path))
  );
  let removed = 0;
  for (const file of await readdir(IMAGE_DIR)) {
    if (!referenced.has(file)) {
      await unlink(path.join(IMAGE_DIR, file));
      removed += 1;
    }
  }
  if (removed) console.log(`Removed ${removed} fallback image(s) no longer used.`);
  const commons = updated.filter((b) => b.image && b.image.origin !== ORIGIN_HARRIS730).length;
  console.log(`Fallback images: ${applied} breeds use a Harris730 image (${downloaded} downloaded now, ${failed} failed). Commons images: ${commons}. Total with image: ${commons + applied}/${updated.length}.`);
}

main().catch((err) => {
  console.error("fetch-fallback-images failed:", err);
  process.exitCode = 1;
});
