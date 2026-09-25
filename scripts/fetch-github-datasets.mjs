#!/usr/bin/env node
// Downloads two small third-party breed datasets from GitHub into cache/
// (gitignored: their raw text is third-party content and is never committed).
// Only facts extracted from them (plus source_url and origin) reach data/.
//
// 1. Harris730/Chicken_breed_dataset  chicken_breeds.csv  (text from starmilling.com)
// 2. iamthechickenlady-netizen/chicken-dictionary  src/breeds.ts

import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { politeFetch } from "./lib/http.mjs";

const CACHE_DIR = path.resolve("cache/github");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE = process.argv.includes("--force");

export const GITHUB_DATASETS = [
  {
    id: "harris730-chicken-breeds",
    repo: "Harris730/Chicken_breed_dataset",
    path: "chicken_breeds.csv",
    cacheFile: "harris730-chicken_breeds.csv",
  },
  {
    id: "chicken-dictionary-breeds",
    repo: "iamthechickenlady-netizen/chicken-dictionary",
    path: "src/breeds.ts",
    cacheFile: "chicken-dictionary-breeds.ts",
  },
];

export function cachePathFor(dataset) {
  return path.join(CACHE_DIR, dataset.cacheFile);
}

async function isFresh(file) {
  if (FORCE) return false;
  try {
    const s = await stat(file);
    return Date.now() - s.mtimeMs < THIRTY_DAYS_MS;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  let failures = 0;

  for (const dataset of GITHUB_DATASETS) {
    const file = cachePathFor(dataset);
    if (await isFresh(file)) {
      console.log(`[${dataset.id}] cached copy is fresh, skipping download.`);
      continue;
    }
    const url = `https://raw.githubusercontent.com/${dataset.repo}/HEAD/${dataset.path}`;
    try {
      const response = await politeFetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      await writeFile(file, text, "utf8");
      console.log(`[${dataset.id}] downloaded ${text.length} chars to cache/.`);
    } catch (err) {
      failures += 1;
      console.log(`[${dataset.id}] download failed (${err.message}); later steps will skip this source.`);
    }
  }

  if (failures) console.log(`${failures} dataset download(s) failed; not fatal.`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("fetch-github-datasets.mjs")) {
  main().catch((err) => {
    console.error("fetch-github-datasets failed:", err);
    process.exitCode = 1;
  });
}
