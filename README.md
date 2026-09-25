# poultry-db

Data-collection pipeline for a backyard-chicken information website. Gathers
facts from free/licensed sources into JSON files under `data/`. Runs locally
and via a GitHub Actions cron in small, resumable batches.

Node 24, ESM (`"type": "module"`), no heavy dependencies, built-in `fetch`.

## Datasets (`data/`)

| File | Contents | Source | License |
|---|---|---|---|
| `breeds.json` | Every chicken breed article with an `{{Infobox poultry breed}}` template on Wikipedia (from `Category:Chicken breeds` + `List of chicken breeds`). Fields: names, country, APA/ABA/PCGB class, weights, egg colour, comb, status, use, plain-text summary, lead image. | Wikipedia | Text/facts CC BY-SA 4.0 |
| `breeds_extra.json` | LLM-extracted fields per breed (eggs/year, temperament, broodiness, hardiness, purpose, etc.), extracted only from the Wikipedia article text, `null` when not stated. `needs_review: true` on every row. | GitHub Models (from Wikipedia text) | Same as source text |
| `diseases.json` | Every article in `Category:Poultry diseases` and its direct subcategories, with whatever infobox fields the article has, a plain-text summary, and lead image. | Wikipedia | CC BY-SA 4.0 |
| `diseases_extra.json` | LLM-extracted fields (cause type, contagion, symptoms, prevention, vaccine availability). Not veterinary advice. | GitHub Models | Same as source text |
| `foods_index.json` | ~200 food ids/names/search terms for the "can chickens eat X" pages, derived from `research/12-chicken-food-pages.md`. | Internal research | n/a |
| `nutrition.json` | Per-100g nutrition facts matched from the USDA SR Legacy dataset for each food in `foods_index.json`. | USDA FoodData Central | Public domain (US government work) |
| `nutrition_unmatched.json` | Foods that could not be confidently matched to an SR Legacy item. | — | — |
| `keywords.json` | Keyword/volume/KD rows parsed from the three research markdown files in `research/`. | Internal research (Semrush data) | Internal |
| `sources.json` | Every source URL actually used, with its license. | — | — |

Images: each breed/disease image record carries its own Commons license,
license URL, author, and an `attribution_required` flag pulled from the
Commons `imageinfo` API — check it per image before reuse.

`data/curated/` is reserved for hand-written tables (food safety verdicts,
toxic plants, predators, incubation, coop specs) that a person writes and
sources by hand; this pipeline does not generate them.

## Running locally

```
npm install   # no dependencies to install, but keeps npm happy
npm test               # run all node:test suites
npm run fetch:breeds   # full Wikipedia breed crawl (~minutes)
npm run fetch:diseases # full Wikipedia disease crawl
npm run keywords       # parse research/*.md into data/keywords.json
npm run fetch:nutrition # tries USDA; logs "skipped: USDA unreachable" and
                         # exits 0 if the host can't be reached (expected on
                         # some networks — it works from GitHub Actions)
npm run enrich          # LLM enrichment batch; needs GITHUB_TOKEN, otherwise
                         # logs "skipped: no GITHUB_TOKEN" and exits 0
npm run all             # runs everything above in order
```

Fetchers are incremental: an item fetched within the last 30 days is reused
unless you pass `--force` (e.g. `node scripts/fetch-breeds.mjs --force`).

## GitHub Actions cron

`.github/workflows/collect.yml` runs `node scripts/run-all.mjs` on a
`23 */6 * * *` schedule (every 6 hours) and on demand via
`workflow_dispatch`. It has `contents: write` and `models: read` permissions
so it can call GitHub Models for the enrichment step for free, using the
job's own `GITHUB_TOKEN` (no extra secret to configure). The LLM step
processes at most `BATCH` items per run (default 30, ~5s apart) and stops
cleanly on a 429, recording per-item `pending`/`done`/`error` status in
`state/queue.json` so the next scheduled run picks up where it left off.

After a run, it commits any changes under `data/` and `state/` as the
`github-actions[bot]` identity, `git pull --rebase`s first, and never force
pushes. If there is nothing to commit, it exits cleanly without an empty
commit. A `concurrency` group prevents overlapping runs.

## Why USDA nutrition needs CI, not this laptop

The USDA FoodData Central API and bulk CSV downloads are not reachable from
this development machine (connection refused), but are reachable from GitHub
Actions runners. `fetch-nutrition.mjs` probes reachability first and exits 0
with a clear log line when the host can't be reached, instead of failing the
whole pipeline.
