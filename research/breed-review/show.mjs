// Print everything the repo already holds about one breed, for the reviewer.
// Usage: node research/breed-review/show.mjs <breed_id>
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const J = (rel) => JSON.parse(readFileSync(new URL(rel, root), "utf8"));
const id = process.argv[2];
if (!id) throw new Error("usage: show.mjs <breed_id>");

const extra = J("data/breeds_extra.json").find((r) => r.id === id);
const base = J("data/breeds.json").find((r) => r.id === id);
if (!extra || !base) throw new Error(`unknown breed ${id}`);

const compact = {};
for (const [k, v] of Object.entries(extra)) {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
    if (v.value === null || v.value === "") continue;
    compact[k] = { value: v.value, src: v.source_url };
    if (v.conflict) compact[k].alternatives = v.alternatives;
  } else compact[k] = v;
}
const { image, fetched_at, license_note, ...baseRest } = base;
console.log("== breeds.json");
console.log(JSON.stringify(baseRest, null, 1));
console.log("photo in breeds.json:", image ? image.file : "none");
console.log("\n== breeds_extra.json (filled fields)");
console.log(JSON.stringify(compact, null, 1));

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\((chicken|chicken breed|poultry)\)/g, "").replace(/\bchicken\b/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const names = [base.name, ...(base.altnames || [])].map(slug).filter((s) => s.length > 2);
const words = new Set(names.flatMap((n) => n.split("-")).filter((w) => w.length > 3 && !["bantam", "game", "hen", "fowl", "blue", "black", "white", "red"].includes(w)));

const files = [];
for (const dir of ["cache/articles/breeds", "cache/articles/hybrids", "cache/sources"]) {
  const u = new URL(dir + "/", root);
  if (!existsSync(u)) continue;
  for (const f of readdirSync(u)) {
    const stem = f.replace(/\.txt$/, "");
    const hit = dir !== "cache/sources"
      ? stem.split(".")[0] === id
      : (stem.startsWith("livestock-conservancy") || stem.startsWith("poultry-club-gb")) &&
        (names.some((n) => stem.endsWith("-" + n) || stem.endsWith("-" + n + "-chicken")) ||
          [...words].some((w) => stem.split("-").includes(w)));
    if (hit) files.push(`${dir}/${f}`);
  }
}
const refs = J("data/reference_sources.json");
const urlOf = (f) => {
  const r = refs.find((x) => x.cache_file === f);
  if (r) return `${r.publisher}: ${r.final_url || r.url}${(r.entity_ids || []).includes(id) ? " (linked to this breed)" : ""}`;
  try {
    const m = readFileSync(new URL(f, root), "utf8").match(/^SOURCE: (\S+)/m);
    return m ? m[1] : "";
  } catch { return ""; }
};
for (const r of refs) if ((r.entity_ids || []).includes(id) && r.cache_file && !files.includes(r.cache_file)) files.push(r.cache_file);
console.log("\n== cached source texts (read with Read or ctx_execute_file; the URL after -> is the citation)");
for (const f of files) console.log(`${f} -> ${urlOf(f)}`);

const links = J("data/breed-dadis-links.json").find((l) => l.breed_id === id);
if (links) {
  const g = J("data/breeds_global.json");
  console.log("\n== DAD-IS records linked (FAO, publisher fao.org)");
  for (const d of links.dadis_ids) {
    const r = g.find((x) => x.id === d);
    if (!r) continue;
    console.log(JSON.stringify({ id: r.id, name: r.name, country: r.country_name, risk: r.risk_status,
      uses: r.main_uses, origin: r.origin?.description, morphology: r.morphology?.notes,
      images: (r.images || []).length, source_url: r.source_url }));
  }
}
const aliases = J("data/breed-aliases.json").filter((a) => a.breed_id === id);
if (aliases.length) console.log("\n== aliases", aliases.map((a) => `${a.alias} (${a.kind})`).join(", "));
const shard = new URL(`research/breed-review/breeds/${id}.json`, root);
console.log("\nshard exists:", existsSync(shard));
