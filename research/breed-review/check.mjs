// Validate breed review shards.
// Usage: node research/breed-review/check.mjs <breed_id> [...]   or   --all
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { validateShard, wordCount } from "../../scripts/lib/breed-review.mjs";

const root = new URL("../../", import.meta.url);
const J = (rel) => JSON.parse(readFileSync(new URL(rel, root), "utf8"));
const extra = J("data/breeds_extra.json");
const base = new Map(J("data/breeds.json").map((r) => [r.id, r]));
const fields = new Set(extra.flatMap((r) => Object.keys(r)).filter((k) => !["id", "tags", "needs_review", "summary", "sources"].includes(k)));
const shardDir = new URL("research/breed-review/breeds/", root);

export function referencesFor(id) {
  const refs = [base.get(id)?.summary || ""];
  for (const dir of ["cache/articles/breeds/", "cache/articles/hybrids/"]) {
    const u = new URL(dir, root);
    if (!existsSync(u)) continue;
    for (const f of readdirSync(u)) if (f.split(".")[0] === id && !f.endsWith(".refs.txt")) refs.push(readFileSync(new URL(f, u), "utf8"));
  }
  return refs;
}

const args = process.argv.slice(2);
const ids = args[0] === "--all"
  ? readdirSync(shardDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
  : args;
let bad = 0;
for (const id of ids) {
  if (!base.has(id)) { console.log(`${id}: not a breed id`); bad++; continue; }
  const file = new URL(`${id}.json`, shardDir);
  if (!existsSync(file)) { console.log(`${id}: no shard`); bad++; continue; }
  let shard;
  try { shard = JSON.parse(readFileSync(file, "utf8")); } catch (err) { console.log(`${id}: invalid JSON ${err.message}`); bad++; continue; }
  const errs = validateShard(shard, { id, fields, references: referencesFor(id) });
  if (errs.length) { bad++; errs.forEach((x) => console.log(x)); }
  else console.log(`${id}: ok (${shard.status}, needs_review ${shard.needs_review}, summary ${wordCount(shard.summary.value)} words)`);
}
console.log(`${ids.length - bad}/${ids.length} valid`);
process.exitCode = bad ? 1 : 0;
