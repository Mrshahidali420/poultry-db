// One photo for every breed that has none yet.
//
// A breed "has a photo" when breeds.json carries a Commons image, or a file
// listed in data/images-original.json or data/images.json exists on disk, or
// data/breed-photos-extra.json already holds one. For the rest, sources are
// tried in this order, and only the first usable image is downloaded (the
// user's connection is slow):
//   1. FAO DAD-IS images (data/breeds_global.json, via breed-dadis-links.json,
//      or an exact name match on the DAD-IS name / other names)
//   2. the Harris730 dataset images already in data/images/harris730
//   3. Wikimedia Commons file search by breed name, a 1200 px wide version
// Files go under data/images-original/breeds/<id>/ (gitignored); records go to
// data/breed-photos-extra.json. Licences are recorded as stated, never filtered.
// Usage: node scripts/fetch-breed-photos.mjs [--dry-run] [id ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, openSync, readSync, closeSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "./fetch-originals.mjs";

const COMMONS_SEARCH = "https://api.wikimedia.org/core/v1/commons/search/page";
const FILE_INFO_API = "https://en.wikipedia.org/w/api.php";
const CHICKEN_WORDS = /chicken|\bhens?\b|rooster|cockerel|pullet|\bcock\b|gallus|poultry|huhn|h[üu]hner|poule|coq|gallina|gallo|galinha|kip|kippen|ayam|kokoš|kura|tyúk|høne|hona|fowl|bantam/i;

const ROOT = new URL("../", import.meta.url);
const abs = (rel) => new URL(rel, ROOT);
const J = (rel) => JSON.parse(readFileSync(abs(rel), "utf8"));
const OUT = "data/breed-photos-extra.json";
const THUMB_WIDTH = 1200;
const MIN_WIDTH = 500;

// Harris730 file names that differ from the breed id.
export const HARRIS_FILES = {
  "55-flowery-hen": "55-flowery-hen.jpg", barbezieux: "barbezieux.jpg", "basque-hen": "basque.jpg",
  brakel: "brakel.jpg", brussbar: "brussbar.jpg", "california-grey": "california-grey.jpg",
  crevecoeur: "crevecoeur.jpg", dampierre: "dampierre.jpg", deathlayer: "deathlayer.jpg",
  "easter-egger": "easter-egger.jpg", empordanesa: "empordanesa.jpg", "gallina-di-saluzzo": "gallina-di-saluzzo.jpg",
  gournay: "gournay.jpg", holland: "holland.jpg", isbar: "isbar.jpg", lyonnaise: "lyonnaise.jpg",
  "norwegian-jaerhon": "norwegian-jaehorn.jpg", "olive-egger": "olive-egger.jpg", orust: "orust.jpg",
  pavlovskaya: "pavlovskaya.jpg", "red-shaver": "red-shaver.jpg", rhodebar: "rhodebar.jpg", shamo: "shamo.jpg",
  speckledy: "speckledy.jpg", "swedish-black": "swedish-black.jpg", thuringian: "thuringian.jpg",
  twentse: "twentse.jpg", "whiting-true-blue": "whiting-true-blue.jpg",
  // The "Black Star / Red Star" file shows a red sex-link hen, so it only
  // serves the red sex-link. Cinnamon Queen is a different hybrid from the
  // Golden Comet, so it is not reused there.
  "red-sex-link": "black-red-star.jpg",
};
const HARRIS_RAW = "https://raw.githubusercontent.com/Harris730/Chicken_breed_dataset/HEAD/images/";

// Width and height from a JPEG, PNG, GIF or WebP header.
export function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0x47 && buf[1] === 0x49) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return { width: null, height: null };
}

const sizeOfFile = (file) => {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(256 * 1024);
  const n = readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  return imageSize(buf.subarray(0, n));
};

const extOf = (mime, url) => {
  if (/png/.test(mime)) return ".png";
  if (/webp/.test(mime)) return ".webp";
  if (/gif/.test(mime)) return ".gif";
  if (/jpe?g/.test(mime)) return ".jpg";
  const m = url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
};

async function download(url, relDir, stem) {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const mime = res.headers.get("content-type") || "";
  if (!/^image\//.test(mime)) throw new Error(`not an image (${mime}) ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const rel = `${relDir}/${stem}${extOf(mime, url)}`;
  mkdirSync(abs(relDir), { recursive: true });
  await writeFile(abs(rel), buf);
  return { local_path: rel, ...imageSize(buf) };
}

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\((chicken|chicken breed|poultry)\)/g, "").replace(/\b(chicken|hen|fowl)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function dadisCandidates(breed, links, global) {
  const ids = links.find((l) => l.breed_id === breed.id)?.dadis_ids || [];
  let recs = ids.map((d) => global.get(d)).filter(Boolean);
  if (!recs.length) {
    const names = new Set([breed.name, ...(breed.altnames || [])].map(norm).filter(Boolean));
    recs = [...global.values()].filter((r) => [r.name, ...(r.other_names || [])].some((n) => names.has(norm(n))));
  }
  const out = [];
  for (const r of recs) for (const img of r.images || []) out.push({ rec: r, img });
  // Prefer images that name a photographer, then the breed's home country record.
  return out.sort((a, b) => (b.img.credit ? 1 : 0) - (a.img.credit ? 1 : 0));
}

const stripHtml = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// Extra Commons search names for breeds whose page title is not what photo
// uploaders call them.
const COMMONS_NAMES = { "golden-comet": ["Gold Comet", "Golden Comet hen"], "red-sex-link": ["Red Star"], "black-sex-link": ["Black Star"] };

async function commonsCandidate(breed) {
  const names = [breed.name, ...(breed.altnames || []), ...(COMMONS_NAMES[breed.id] || [])];
  for (const name of names) {
    const hit = await commonsSearch(name);
    if (hit) return hit;
  }
  return null;
}

async function commonsSearch(name) {
  const base = name.replace(/\s*\((chicken|chicken breed|poultry)\)\s*/i, "").replace(/\s+chicken$/i, "");
  const tokens = norm(base).split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return null;
  for (const q of [`${base} chicken filetype:bitmap`, `${base} hen filetype:bitmap`, `${base} filetype:bitmap`]) {
    // commons.wikimedia.org resets connections from this network, so search
    // through the Wikimedia REST gateway and read file info through
    // en.wikipedia.org, which serves Commons files as a shared repository.
    const res = await fetchWithRetry(`${COMMONS_SEARCH}?q=${encodeURIComponent(q)}&limit=20`);
    if (!res.ok) continue;
    // The breed name must appear as a phrase in the file name.
    const phrase = ` ${tokens.join(" ")} `;
    const titles = ((await res.json()).pages || []).map((p) => p.title).filter((t) => /^File:/.test(t))
      .filter((t) => ` ${norm(t.replace(/^File:/, "").replace(/\.\w+$/, ""))} `.includes(phrase));
    if (!titles.length) continue;
    const info = await fetchWithRetry(`${FILE_INFO_API}?action=query&format=json&titles=${encodeURIComponent(titles.join("|"))}` +
      `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${THUMB_WIDTH}`);
    if (!info.ok) continue;
    const byTitle = new Map(Object.values((await info.json()).query?.pages || {}).map((p) => [p.title, p]));
    for (const t of titles) {
      const p = byTitle.get(t);
      if (!p) continue;
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime) || ii.width < MIN_WIDTH) continue;
      const meta = ii.extmetadata || {};
      // And the file has to be about a bird: a chicken word in the file name,
      // description or categories.
      const about = `${p.title} ${stripHtml(meta.ImageDescription?.value)} ${meta.Categories?.value || ""}`;
      if (!CHICKEN_WORDS.test(about)) continue;
      return {
        url: ii.thumburl || ii.url,
        page: ii.descriptionurl,
        credit: stripHtml(meta.Artist?.value) || "Wikimedia Commons contributor",
        license: stripHtml(meta.LicenseShortName?.value) || "not stated",
        license_url: meta.LicenseUrl?.value || null,
      };
    }
  }
  return null;
}

async function photoFor(breed, links, global) {
  const dir = `data/images-original/breeds/${breed.id}`;
  for (const { rec, img } of dadisCandidates(breed, links, global)) {
    try {
      const got = await download(img.url, dir, `dadis-${rec.id}`);
      return { breed_id: breed.id, ...got, source_url: img.url, page_url: rec.source_url,
        // DAD-IS credits sometimes carry a full postal address; keep the name part.
        credit: (img.credit || "").split(";")[0].trim() || `FAO DAD-IS, ${rec.country_name} national breed record`,
        license: "not stated (FAO DAD-IS)", origin: "dad-is", caption: img.caption || null };
    } catch (err) { console.warn(`  ${breed.id}: DAD-IS ${err.message}`); }
  }
  const h = HARRIS_FILES[breed.id];
  if (h && existsSync(abs(`data/images/harris730/${h}`))) {
    const rel = `${dir}/harris730-${h}`;
    mkdirSync(abs(dir), { recursive: true });
    copyFileSync(abs(`data/images/harris730/${h}`), abs(rel));
    return { breed_id: breed.id, local_path: rel, ...sizeOfFile(abs(rel)), source_url: HARRIS_RAW + h,
      page_url: "https://github.com/Harris730/Chicken_breed_dataset",
      credit: "Harris730/Chicken_breed_dataset (GitHub)", license: "not stated", origin: "github:Harris730/Chicken_breed_dataset" };
  }
  const c = await commonsCandidate(breed);
  if (c) {
    const got = await download(c.url, dir, "commons");
    return { breed_id: breed.id, ...got, source_url: c.url, page_url: c.page, credit: c.credit,
      license: c.license, license_url: c.license_url, origin: "wikimedia-commons" };
  }
  return null;
}

export function breedsWithoutPhoto(breeds, imagesOriginal, images, extra, exists = (p) => existsSync(abs(p))) {
  const has = (id) => imagesOriginal.some((i) => i.entity_type === "breeds" && i.entity_id === id && i.local_path && exists(i.local_path)) ||
    images.some((i) => i.entity_type === "breeds" && i.entity_id === id && exists(i.file)) ||
    extra.some((p) => p.breed_id === id && exists(p.local_path));
  return breeds.filter((b) => !b.image && !has(b.id));
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const only = args.filter((a) => !a.startsWith("--"));
  const breeds = J("data/breeds.json");
  const io = existsSync(abs("data/images-original.json")) ? J("data/images-original.json") : [];
  const extra = existsSync(abs(OUT)) ? J(OUT) : [];
  const links = J("data/breed-dadis-links.json");
  const global = new Map(J("data/breeds_global.json").map((r) => [r.id, r]));
  let todo = breedsWithoutPhoto(breeds, io, J("data/images.json"), extra);
  if (only.length) todo = todo.filter((b) => only.includes(b.id));
  console.log(`${todo.length} breeds without a photo`);
  const records = extra.filter((p) => existsSync(abs(p.local_path)));
  const missing = [];
  for (const b of todo) {
    if (dry) { console.log(b.id); continue; }
    try {
      const rec = await photoFor(b, links, global);
      if (!rec) { missing.push(b.id); console.log(`  ${b.id}: nothing found`); continue; }
      records.push(rec);
      writeFileSync(abs(OUT), JSON.stringify(records, null, 2) + "\n");
      console.log(`  ${b.id}: ${rec.origin} ${rec.width}x${rec.height}`);
    } catch (err) { missing.push(b.id); console.warn(`  ${b.id}: ${err.message}`); }
  }
  if (!dry) {
    writeFileSync(abs(OUT), JSON.stringify(records, null, 2) + "\n");
    console.log(`photos recorded ${records.length}; still none: ${missing.join(" ") || "none"}`);
  }
}

if (process.argv[1]?.endsWith("fetch-breed-photos.mjs")) {
  main().catch((err) => { console.error("fetch-breed-photos failed:", err); process.exitCode = 1; });
}
