// Aliases existing downloaded originals onto extra entity ids that need a
// photo but have no distinctive one of their own on Commons — the health
// symptom-checker's 45 symptom pages, symptom-checker itself, seven diseases
// with no photo, and five faq/tools pages (29 Sep 2026 pass, chicken-site
// photo coverage). No new download: each alias row copies an existing row's
// url/credit fields and local_path (so build-images.mjs reads the same file
// already on disk) under a new entity_id.
//
//   node scripts/wire-reuse-photos.mjs

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const DATA_DIR = path.resolve("data");

function alias(source, entityType, entityId) {
  return { ...source, entity_type: entityType, entity_id: entityId };
}

async function loadJson(file) {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
}

const topics = await loadJson("topic-photos.json");
const diseasesExtra = await loadJson("diseases-extra-photos.json");
const topicById = new Map(topics.map((t) => [t.entity_id, t]));
const diseaseById = new Map(diseasesExtra.map((t) => [t.entity_id, t]));

function need(map, id) {
  const row = map.get(id);
  if (!row) throw new Error(`no source row for ${id}`);
  return row;
}

// Seven diseases with nothing distinctive on Commons share the vaccination
// photo fetched for avian-infectious-bronchitis.
const DISEASE_REUSE = [
  "coccidiosis",
  "pullorum-disease",
  "avian-adenovirus",
  "avastrovirus-2",
  "borrelia-anserina",
  "ornithobacterium-rhinotracheale",
  "streptococcal-infection-in-poultry",
];
const diseaseAliases = DISEASE_REUSE.map((id) => alias(need(diseaseById, "avian-infectious-bronchitis"), "diseases", id));

// Every symptom + symptom-checker + five faq/tools pages, mapped to the
// closest existing topic photo (comb/face close-up, a leg/foot photo, a
// cold puffed-up hen, an egg-related topic...). All non-gory per the brief:
// no page here gets an actual blood, wound or dead-bird photo.
const SYMPTOM_TOPIC_MAP = {
  "symptom-checker": "rooster-held",
  sneezing: "hen-comb-closeup",
  "watery-eyes": "hen-comb-closeup",
  diarrhea: "hens-scratch",
  "green-poop": "hens-scratch",
  "bloody-poop": "hens-scratch",
  lethargic: "rooster-held",
  "not-eating": "hens-pecking-grain",
  "puffed-up": "hen-snow",
  limping: "bumblefoot-foot",
  "swollen-foot": "bumblefoot-foot",
  "pale-comb": "hen-comb-closeup",
  "purple-comb": "hen-comb-closeup",
  "losing-feathers": "hen-in-run",
  "bald-spots": "hen-in-run",
  "tail-down": "rooster-held",
  gasping: "hen-comb-closeup",
  "rattling-breathing": "hen-comb-closeup",
  "swollen-face": "hen-comb-closeup",
  "crop-not-emptying": "hen-comb-closeup",
  "egg-bound": "hens-nest-boxes",
  "soft-shell-eggs": "soft-shelled-egg",
  "no-eggs": "eggs-basket",
  "penguin-walk": "rooster-held",
  "head-shaking": "hen-comb-closeup",
  "twisted-neck": "rooster-held",
  paralysis: "rooster-held",
  "white-spots-comb": "hen-comb-closeup",
  "scabs-comb": "hen-comb-closeup",
  mites: "hen-comb-closeup",
  lice: "hen-in-run",
  "worms-in-poop": "hens-scratch",
  coughing: "hen-comb-closeup",
  "weight-loss": "rooster-held",
  "ruffled-feathers": "hen-snow",
  "swollen-joints": "bumblefoot-foot",
  "blood-on-eggshell": "eggs-basket",
  "foul-smell-droppings": "hens-scratch",
  "pasty-butt": "chick-in-bowl",
  shivering: "chicks-brooder",
  panting: "hen-in-run",
  "feather-pecking": "hens-pecking-grain",
  "vent-prolapse": "rooster-held",
  "sudden-death": "backyard-coop-run",
  "loss-of-balance": "rooster-held",
  "swollen-abdomen": "rooster-held",
  // faq / tools
  "faq-chick-health": "chicks-brooder",
  "faq-roosters-and-lifespan": "rooster-crowing",
  "tools-coop-size-calculator": "backyard-coop-run",
  "tools-coop-specs": "hens-nest-boxes",
  "tools-incubation-calculator": "egg-incubator",
};

const topicAliases = Object.entries(SYMPTOM_TOPIC_MAP)
  .filter(([id]) => !topicById.has(id)) // don't clobber a real topic entry
  .map(([id, sourceId]) => alias(need(topicById, sourceId), "topics", id));

const newTopics = [...topics, ...topicAliases];
const newDiseases = [...diseasesExtra, ...diseaseAliases];

await writeFile(path.join(DATA_DIR, "topic-photos.json"), JSON.stringify(newTopics, null, 2) + "\n", "utf8");
await writeFile(path.join(DATA_DIR, "diseases-extra-photos.json"), JSON.stringify(newDiseases, null, 2) + "\n", "utf8");

console.log(`topic-photos.json: ${topics.length} -> ${newTopics.length} (+${topicAliases.length} aliases)`);
console.log(`diseases-extra-photos.json: ${diseasesExtra.length} -> ${newDiseases.length} (+${diseaseAliases.length} aliases)`);
