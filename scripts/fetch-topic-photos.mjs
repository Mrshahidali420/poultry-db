// Topic photos: one hand-picked Wikimedia Commons original per non-breed
// topic (broody hen, egg float test, chicks in a brooder, layer pellets...),
// for the site's egg, feed, chick-care, FAQ and about pages.
//
// Reuses fetch-originals.mjs: imageinfo by POST (50 titles a request), the
// same User-Agent and retry rules, originals streamed to disk 6 at a time.
// Files land in data/images-original/topics/<id>/ (gitignored like the other
// originals) and the manifest, same entry shape as images-original.json, is
// data/topic-photos.json.
//
// Each pick was chosen by eye from Commons search results: the largest sharp
// real photo that fits the topic. Add a row to TOPICS and rerun; existing
// files are not downloaded again.
//
//   node scripts/fetch-topic-photos.mjs

import https from "node:https";
import path from "node:path";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  BATCH_SIZE,
  COMMONS_API,
  CONCURRENCY,
  UPLOAD_HOST_UA,
  fetchWithRetry,
  mapImageInfoResults,
  mapWithConcurrency,
  safeLocalFileName,
} from "./fetch-originals.mjs";

const DATA_DIR = path.resolve("data");
const OUT_DIR = path.join(DATA_DIR, "images-original", "topics");
const MANIFEST_FILE = path.join(DATA_DIR, "topic-photos.json");

// [id, Commons file name]
export const TOPICS = [
  ["broody-hen", "A brooding scene 2.JPG"],
  ["broody-hen-nest-box", "-2019-05-18 Broody Bantam chicken, Trimingham (1).JPG"],
  ["hens-nest-boxes", "Pondeuses bourbonnaises.JPG"],
  ["hen-nest-eggs", "Kuluçkada yatan bir tavuk .jpg"],
  ["egg-float-test", "\"Study of body floatation as a function of salinity\".jpg"],
  ["egg-candling", "20181107-FPAC-PJK-2541 TONED (45862537831).jpg"],
  ["eggs-carton", "Eierkarton 10 (fcm).jpg"],
  ["eggs-basket", "A basket of fresh eggs (9339949261).jpg"],
  ["egg-colors", "Natural Easter Colored Eggs.jpg"],
  ["egg-anatomy", "Anatomy of an egg labeled.jpg"],
  ["soft-shelled-egg", "Soft egg shell of duck.jpg"],
  ["dirty-eggs", "Dirty Cayuga Duck Eggs.jpg"],
  ["hen-snow", "Black chicken in snow 01.jpg"],
  ["layer-pellets", "Bush-based animal feed pellets.jpg"],
  ["feed-pellets-hands", "Animal feed from bush biomass.jpg"],
  ["hens-pecking-grain", "Chickens feeding.jpg"],
  ["hens-scratch", "Chickens eating.jpg"],
  ["hen-chicks-melon", "A Mother's Strength.jpg"],
  ["chicks-brooder", "Chicks 1.jpg"],
  ["brooder-box-lamp", "Wooden brooder box.jpg"],
  ["chick-in-bowl", "1 day old chick hatchling 2.jpg"],
  ["two-chicks", "In an ARS study, day-old chicks are fed dietary supplements to boost their immune systems (50637557478).jpg"],
  ["chick-shavings", "Day old chick.jpg"],
  ["chick-drinking", "Week old chick drinking water in Kenya.jpg"],
  ["chickens-ducks", "Ducks and Chickens Living Together! (8165745054).jpg"],
  ["hens-eating", "Backyard heritage chickens eating kitchen food waste.jpg"],
  ["backyard-coop-run", "Backyard chicken coop with green roof.jpg"],
  ["hen-in-run", "Chicken Coop I.jpg"],
  ["coop-winter-flock", "Chicken coop in winter.jpg"],
  ["chick-in-hand", "Kluse - Swedish Flower Hen chick 01 up ies.jpg"],
  ["rooster-held", "US, Ghana veterinarians provide animal healthcare at African Lion 2025 (9054241).jpg"],
  ["white-chick-straw", "Gallus gallus domesticus - Vogelpark Steinen 03.jpg"],
  ["young-hen-grass", "G. gallus domesticus, Neuss (DE) -- 2023 -- 0062.jpg"],
  ["farm-coop", "Hen run, Cotton Stones - geograph.org.uk - 3793882.jpg"],
  // Added for the health/symptoms + faq/tools photo pass (29 Sep 2026):
  // one close-up hen face/comb, one bumblefoot foot, one egg incubator, one
  // crowing rooster. These four plus the reused ids appended by
  // wire-reuse-photos.mjs cover the symptom checker's 45 symptom pages and
  // a handful of faq/tools pages.
  ["hen-comb-closeup", "A close-up view of a hen inside a barn coop, showcasing its vibrant comb and eye.jpg"],
  ["bumblefoot-foot", "Pododermatitis (Bumblefoot) in a rooster.jpg"],
  ["egg-incubator", "Small Chicken Egg Incubator overhead.jpg"],
  ["rooster-crowing", "Rooster crowing close-up.jpg"],
];

// Some networks reset TLS for the commons.wikimedia.org name only. Every
// Wikimedia wiki is served by the same edge, so on a reset the same POST is
// sent over a connection named en.wikipedia.org with the real Host header.
function postViaWikipediaEdge(body) {
  const u = new URL(COMMONS_API);
  const payload = body.toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        host: "en.wikipedia.org",
        servername: "en.wikipedia.org",
        path: u.pathname,
        headers: {
          host: u.host,
          "user-agent": UPLOAD_HOST_UA,
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(Buffer.concat(chunks).toString())) : reject(new Error(`HTTP ${res.statusCode}`))));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function imageInfo(titles) {
  const body = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    titles: titles.join("|"),
    format: "json",
    formatversion: "2",
  });
  try {
    const res = await fetchWithRetry(COMMONS_API, { method: "POST", body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return postViaWikipediaEdge(body);
  }
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
  const titles = TOPICS.map(([, file]) => `File:${file}`);
  const info = new Map();
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    for (const [t, v] of mapImageInfoResults(await imageInfo(batch), batch)) info.set(t, v);
  }

  let bytes = 0;
  const started = Date.now();
  const rows = await mapWithConcurrency(TOPICS, CONCURRENCY, async ([id, file]) => {
    const meta = info.get(`File:${file}`);
    if (!meta || meta.missing || !meta.url) {
      console.log(`missing on Commons: ${file}`);
      return null;
    }
    const localPath = path.posix.join("data/images-original/topics", id, safeLocalFileName(file));
    const abs = path.resolve(localPath);
    if (!existsSync(abs)) {
      await download(meta.url, abs);
      bytes += (await stat(abs)).size;
      console.log(`got ${id} (${(meta.size / 1e6).toFixed(1)} MB, ${meta.width}px)`);
    }
    return {
      entity_type: "topics",
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
  console.log(`${manifest.length}/${TOPICS.length} topic photos listed, ${(bytes / 1e6).toFixed(1)} MB downloaded in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

if (process.argv[1]?.endsWith("fetch-topic-photos.mjs")) {
  await mkdir(OUT_DIR, { recursive: true });
  await main();
}
