// Merge per-city shards into poultry-db/data/city-chicken-laws.json (shards override existing records).
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const REPO = "C:/Users/SHAHID ALI/Desktop/Work/poultry-db/data/";
const SHARDS = new URL("./cities/", import.meta.url);
const KEYS = ["id","city","state","population","allowed","max_hens","hens_rule_text","roosters_allowed","permit_required","permit_notes","setback_ft_from_homes","setback_notes","coop_rules","slaughter_allowed","zoning_notes","hoa_note","code_section","sources","confidence","research_notes","last_checked","needs_review"];
const top = JSON.parse(readFileSync(REPO + "us-cities-top150.json", "utf8")).cities;
const rank = new Map(top.map((c) => [c.id, c.rank]));
const outPath = REPO + "city-chicken-laws.json";
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
const byId = new Map(existing.map((r) => [r.id, r]));
const problems = [];
const clean = (v) => typeof v === "string" ? v.replace(/\s*\u2014\s*/g, ", ").replace(/(\d)\u2013(\d)/g, "$1 to $2").replace(/\s*\u2013\s*/g, ", ") : v;
for (const f of readdirSync(SHARDS).filter((f) => f.endsWith(".json"))) {
  let r;
  try { r = JSON.parse(readFileSync(new URL(f, SHARDS), "utf8")); } catch (e) { problems.push(`${f}: bad JSON ${e.message}`); continue; }
  if (!rank.has(r.id)) { problems.push(`${f}: unknown id ${r.id}`); continue; }
  const rec = {};
  for (const k of KEYS) {
    let v = r[k];
    if (k === "sources") v = (v || []).map((s) => ({ name: clean(s.name), url: s.url, type: s.type }));
    rec[k] = clean(v === undefined ? (k === "research_notes" ? "" : null) : v);
  }
  const extra = Object.keys(r).filter((k) => !KEYS.includes(k));
  if (extra.length) problems.push(`${r.id}: dropped extra keys ${extra.join(",")}`);
  byId.set(r.id, rec);
}
const out = [...byId.values()].sort((a, b) => rank.get(a.id) - rank.get(b.id));
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
const count = (k) => out.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});
console.log("records", out.length, "allowed", count("allowed"), "confidence", count("confidence"));
if (problems.length) console.log("PROBLEMS\n" + problems.join("\n"));
