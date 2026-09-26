// Merge breed review shards into data/breeds_extra.json and rebuild
// data/reviews/breeds-reviews.json. Safe to re-run: every fix sets an
// absolute value, so applying the same shards twice gives the same files.
// Usage: node research/breed-review/apply.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { validateShard } from "../../scripts/lib/breed-review.mjs";

const root = new URL("../../", import.meta.url);
const J = (rel) => JSON.parse(readFileSync(new URL(rel, root), "utf8"));
const write = (rel, data) => writeFileSync(new URL(rel, root), JSON.stringify(data, null, 2) + "\n");

const REVIEWED_BY = "claude-opus";
const REVIEWED_ON = "2026-09-26";
const ORIGIN = "review:claude-opus";

const extra = J("data/breeds_extra.json");
const order = J("research/breed-review/order.json");
const fields = new Set(extra.flatMap((r) => Object.keys(r)).filter((k) => !["id", "tags", "needs_review", "summary", "sources"].includes(k)));
const shardDir = new URL("research/breed-review/breeds/", root);
const shards = new Map(readdirSync(shardDir).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(new URL(f, shardDir), "utf8"))]));

const problems = [];
const updated = extra.map((rec) => {
  const shard = shards.get(rec.id);
  if (!shard) return rec;
  const errs = validateShard(shard, { id: rec.id, fields });
  if (errs.length) { problems.push(...errs); return rec; }

  const next = { ...rec };
  for (const [field, fix] of Object.entries(shard.fixes || {})) {
    if (fix === null || fix.value === null) { next[field] = { value: null, source_url: null }; continue; }
    const { note, ...rest } = fix;
    next[field] = { ...rest, origin: fix.origin || ORIGIN };
  }
  const supported = new Set(shard.sources.flatMap((s) => s.supports));
  if (!shard.needs_review) {
    for (const f of supported) {
      if (next[f] && typeof next[f] === "object" && next[f].needs_review) next[f] = { ...next[f], needs_review: false };
    }
  }
  next.sources = shard.sources.map(({ url, publisher, source_confidence, supports }) => ({ url, publisher, source_confidence, supports }));
  next.summary = { value: shard.summary.value, sources: shard.summary.sources };
  next.needs_review = shard.needs_review;
  return next;
});

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`${problems.length} problem(s); those shards were not applied`);
  process.exitCode = 1;
}

const rank = new Map(order.map((id, i) => [id, i]));
const reviews = [...shards.entries()]
  .filter(([id]) => extra.some((r) => r.id === id) && !problems.some((p) => p.startsWith(`${id}:`)))
  .sort(([a], [b]) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9))
  .map(([id, s]) => ({
    breed_id: id,
    status: s.status,
    changes: s.changes,
    reviewed_by: REVIEWED_BY,
    reviewed_on: REVIEWED_ON,
    sources_checked: s.sources_checked,
  }));

write("data/breeds_extra.json", updated);
write("data/reviews/breeds-reviews.json", reviews);
const count = (st) => reviews.filter((r) => r.status === st).length;
console.log(`applied ${reviews.length}/${extra.length}: approved ${count("approved")}, fixed ${count("fixed")}, needs-human ${count("needs-human")}; cleared ${updated.filter((r) => r.needs_review === false).length}`);
