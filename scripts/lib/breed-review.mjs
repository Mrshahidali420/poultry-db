// Shared rules for the breed review (W2-08): the per-breed shard format in
// research/breed-review/breeds/<id>.json, and the checks the apply step and
// the tests both run.

export const STATUSES = ["approved", "fixed", "needs-human"];

// The facts a second publisher has to back before a breed leaves review.
export const KEY_FACTS = [
  "eggs_per_year_min", "eggs_per_year_max", "egg_color", "egg_size",
  "hen_weight_kg", "rooster_weight_kg", "temperament", "cold_hardy",
  "heat_tolerant", "origin_country",
];

export const SUMMARY_MIN_WORDS = 90;
export const SUMMARY_MAX_WORDS = 160;
// A run of this many words shared with the Wikipedia text counts as copied.
export const COPY_RUN_WORDS = 8;

const SECOND_LEVEL = new Set(["ac", "co", "gov", "org", "net", "nhs", "com", "edu"]);

// Registrable domain, so extension.psu.edu and psu.edu count as one publisher
// but food.gov.uk and gov.uk count as two. Same rule as the curated reviews.
export const regDomain = (url) => {
  const labels = new URL(url).hostname.toLowerCase().replace(/^www\./, "").split(".");
  const n = labels.length;
  const twoPart = n >= 3 && labels[n - 1].length === 2 && SECOND_LEVEL.has(labels[n - 2]);
  return labels.slice(twoPart ? -3 : -2).join(".");
};

export const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;

const normWords = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

// First run of `n` consecutive words that `text` shares with `reference`, or null.
export const sharedRun = (text, reference, n = COPY_RUN_WORDS) => {
  const ref = normWords(reference);
  const grams = new Set();
  for (let i = 0; i + n <= ref.length; i++) grams.add(ref.slice(i, i + n).join(" "));
  const words = normWords(text);
  for (let i = 0; i + n <= words.length; i++) {
    const g = words.slice(i, i + n).join(" ");
    if (grams.has(g)) return g;
  }
  return null;
};

const isHttps = (u) => typeof u === "string" && /^https:\/\/\S+$/.test(u);

// Publishers that back the key facts of a shard (page-level sources only).
export const keyFactPublishers = (sources) => new Set(
  (sources || [])
    .filter((s) => s.source_confidence === "page" && (s.supports || []).some((f) => KEY_FACTS.includes(f)))
    .map((s) => regDomain(s.url)),
);

// Returns a list of problems; empty means the shard is valid.
// `fields` is the set of field names a breeds_extra record may carry.
// `references` are texts the summary must not copy from (Wikipedia summary, article).
export function validateShard(shard, { id, fields, references = [] }) {
  const errs = [];
  const e = (m) => errs.push(`${id}: ${m}`);
  if (JSON.stringify(shard).includes("—")) e("contains an em dash");
  if (shard.breed_id !== id) e(`breed_id ${shard.breed_id} does not match ${id}`);
  if (!STATUSES.includes(shard.status)) e(`bad status ${shard.status}`);
  if (typeof shard.changes !== "string" || !shard.changes.trim()) e("changes is empty");
  if (!Array.isArray(shard.sources_checked) || !shard.sources_checked.length) e("sources_checked is empty");
  else for (const u of shard.sources_checked) if (!isHttps(u)) e(`bad sources_checked url ${u}`);

  const fixes = shard.fixes ?? {};
  if (typeof fixes !== "object" || Array.isArray(fixes)) e("fixes must be an object");
  else for (const [k, v] of Object.entries(fixes)) {
    if (!fields.has(k)) e(`fix for unknown field ${k}`);
    if (v === null) continue;
    if (typeof v !== "object" || !("value" in v)) { e(`fix ${k} needs a value`); continue; }
    if (v.value !== null && !isHttps(v.source_url)) e(`fix ${k} needs an https source_url`);
    for (const a of v.alternatives || []) if (!isHttps(a.source_url)) e(`fix ${k} alternative needs a source_url`);
  }

  if (!Array.isArray(shard.sources) || !shard.sources.length) e("sources is empty");
  else for (const s of shard.sources) {
    if (!isHttps(s.url)) e(`bad source url ${s.url}`);
    if (!s.publisher) e(`source ${s.url} has no publisher`);
    if (!["page", "domain"].includes(s.source_confidence)) e(`source ${s.url} bad source_confidence`);
    if (!Array.isArray(s.supports) || !s.supports.length) e(`source ${s.url} supports nothing`);
    else for (const f of s.supports) if (!fields.has(f)) e(`source ${s.url} supports unknown field ${f}`);
  }

  if (typeof shard.needs_review !== "boolean") e("needs_review must be boolean");
  if (shard.needs_review === false) {
    if (shard.status === "needs-human") e("needs-human but needs_review false");
    const pubs = keyFactPublishers(shard.sources);
    if (pubs.size < 2) e(`needs_review false with ${pubs.size} key-fact publisher(s)`);
  }

  const sum = shard.summary;
  if (!sum || typeof sum.value !== "string") e("summary missing");
  else {
    const n = wordCount(sum.value);
    if (n < SUMMARY_MIN_WORDS || n > SUMMARY_MAX_WORDS) e(`summary has ${n} words`);
    if (!Array.isArray(sum.sources) || !sum.sources.length) e("summary has no sources");
    else for (const u of sum.sources) if (!isHttps(u)) e(`bad summary source ${u}`);
    for (const ref of references) {
      const run = ref && sharedRun(sum.value, ref);
      if (run) e(`summary copies "${run}"`);
    }
  }
  return errs;
}
