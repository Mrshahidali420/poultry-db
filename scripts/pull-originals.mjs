// Downloads the original-image zips from the "images-original" GitHub release
// into tmp-release/, resuming any partial file with an HTTP Range request,
// then unpacks each finished zip into data/images-original/.
// Usage: node scripts/pull-originals.mjs

import { createWriteStream } from "node:fs";
import { mkdir, stat, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO = "Mrshahidali420/poultry-db";
const TAG = "images-original";
const OUT_DIR = "tmp-release";
const IMAGES_DIR = path.join("data", "images-original");
const MAX_TRIES = 200;
const STALL_MS = 60_000;

function listAssets() {
  const json = execFileSync("gh", ["release", "view", TAG, "-R", REPO, "--json", "assets"], { encoding: "utf8" });
  // Small files first, so the credits list and small groups land early.
  return JSON.parse(json).assets.sort((a, b) => a.size - b.size);
}

async function sizeOnDisk(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function downloadResumable(asset) {
  const done = path.join(OUT_DIR, asset.name);
  if ((await sizeOnDisk(done)) === asset.size) return done;
  const part = `${done}.part`;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    const have = await sizeOnDisk(part);
    if (have === asset.size) break;
    // A connection can go silent without closing; abort it when no bytes
    // arrive for STALL_MS, and the next try resumes from the .part size.
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(new Error("stalled")), STALL_MS);
    const resetTimer = new Transform({
      transform(chunk, _enc, cb) {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(new Error("stalled")), STALL_MS);
        cb(null, chunk);
      },
    });
    try {
      const res = await fetch(asset.url, {
        headers: have ? { Range: `bytes=${have}-` } : {},
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const append = have > 0 && res.status === 206;
      await pipeline(Readable.fromWeb(res.body), resetTimer, createWriteStream(part, { flags: append ? "a" : "w" }));
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      console.log(`${asset.name}: try ${attempt} stopped (${err.cause?.code ?? err.message}), resuming...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if ((await sizeOnDisk(part)) !== asset.size) throw new Error(`${asset.name}: incomplete after ${MAX_TRIES} tries`);
  await rename(part, done);
  return done;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });
  const assets = listAssets();
  const totalMb = assets.reduce((s, a) => s + a.size, 0) / 1e6;
  console.log(`${assets.length} files, ${totalMb.toFixed(0)} MB in total.`);

  const started = Date.now();
  let doneMb = 0;
  for (const asset of assets) {
    const file = await downloadResumable(asset);
    doneMb += asset.size / 1e6;
    const rate = doneMb / ((Date.now() - started) / 60000);
    console.log(`Got ${asset.name} (${(asset.size / 1e6).toFixed(0)} MB). ${doneMb.toFixed(0)}/${totalMb.toFixed(0)} MB, ${rate.toFixed(1)} MB/min.`);
    if (asset.name.endsWith(".zip")) {
      execFileSync("tar", ["-xf", file, "-C", IMAGES_DIR]);
      console.log(`Unpacked ${asset.name} into ${IMAGES_DIR}.`);
    } else {
      await rename(file, path.join("data", asset.name));
    }
  }
  console.log("All originals are on disk.");
}

main().catch((err) => {
  console.error("pull-originals failed:", err);
  process.exit(1);
});
