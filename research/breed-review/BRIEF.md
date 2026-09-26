# Breed fact review (W2-08): worker brief

You review a batch of chicken breed records for a public breed website (US readers, AdSense).
ACCURACY OVER COVERAGE. Never invent a fact. If you cannot verify something, say so.

Repo: `C:\Users\SHAHID ALI\Desktop\Work\poultry-db`. Do not run git. The ONLY files you write are
`research/breed-review/breeds/<breed_id>.json` (one per breed). Never edit data/*.json yourself; the
orchestrator merges shards with `research/breed-review/apply.mjs`.

Worked example: `research/breed-review/breeds/brahma-chicken.json`. Read it first.

## Per breed, in the order you were given

1. Skip the breed if its shard already exists (`node research/breed-review/show.mjs <id>` prints
   `shard exists: true`).
2. `node research/breed-review/show.mjs <id>` prints the breeds.json row, every filled field in
   data/breeds_extra.json with its source, cached source texts on disk (with the citation URL after
   `->`), and linked FAO DAD-IS records. Read the cached texts (Wikipedia, Star Milling, Livestock
   Conservancy, Poultry Club of Great Britain). Read them with Read; they are short.
3. Check every filled field against the source it cites. Wrong or unsupported values get fixed.
   Typical faults: extraction errors (words cut out), weights in the wrong unit or taken from a
   bantam line, purpose wrong, a temperament value that is really a list of looks, hybrid facts
   copied onto the wrong breed, conflicts where one alternative is simply the other converted.
4. Find a second reliable publisher for the key facts: eggs_per_year_min/max, egg_color, egg_size,
   hen_weight_kg, rooster_weight_kg, temperament, cold_hardy, heat_tolerant, origin_country.
   Good sources, roughly in this order: Livestock Conservancy
   (`https://livestockconservancy.org/heritage-breeds/heritage-breeds-list/<name>-chicken/`), Poultry
   Club of Great Britain, Oklahoma State Breeds of Livestock (`breeds.okstate.edu`), university
   extension pages, FAO DAD-IS (the linked records; cite the `source_url` shown, publisher FAO), Meyer
   Hatchery blog breed spotlights (`blog.meyerhatchery.com`), My Pet Chicken, Murray McMurray, Cackle,
   Hoover's, Ideal Poultry, Purely Poultry, Omlet, Stromberg's, the breed club's own site. Hatchery
   product pages often 403; their blogs usually work. Wikipedia counts as one publisher, Star Milling
   as one. Forums, AI content farms, Pinterest, Quora and Reddit do not count.
   Web: use `WebSearch` to find pages, then `mcp__context-mode__ctx_fetch_and_index` (url + a source
   label) and `mcp__context-mode__ctx_search` to read them. WebFetch is blocked. The user's internet is
   slow, so fetch at most 3 pages per breed; stop when two publishers agree. Web searches are capped
   per session (about 200), so use at most 2 searches per breed and prefer guessing a Livestock
   Conservancy or okstate URL directly.
5. Resolve conflicts: when two or more good sources agree, set that value and drop the conflict.
   When good sources really differ (for example US and UK standard weights), keep the main value and
   put the other in `alternatives` with `conflict: true`; the site shows both. Weights are kg
   (1 lb = 0.4536 kg, round to 1 decimal); large fowl, never bantam, unless the breed is a true bantam.
6. Write the summary (see below).
7. Write the shard, then run `node research/breed-review/check.mjs <id>` and fix every error it
   prints. Write each shard as soon as the breed is done, before starting the next.

## Shard format (exact keys)

```
{
  "breed_id": "<id>",
  "status": "approved" | "fixed" | "needs-human",
  "changes": "plain sentence(s): what you fixed, from what to what, and why; or what you confirmed",
  "sources_checked": ["https://... every page you actually read"],
  "fixes": { "<field>": { "value": ..., "source_url": "https://...", "conflict": true?, "alternatives": [{ "value": ..., "source_url": "https://..." }]? } | null },
  "sources": [ { "url": "https://...", "publisher": "The Livestock Conservancy", "source_confidence": "page", "supports": ["egg_color", "hen_weight_kg", ...] } ],
  "needs_review": true | false,
  "summary": { "value": "...", "sources": ["https://..."] }
}
```

- `fixes` holds only fields you change; the object REPLACES the field. `null` clears a field that no
  source supports. Field names must be existing breeds_extra fields. Keep the existing value styles:
  weights and egg counts are numbers; broodiness "low" | "medium" | "high"; cold_hardy, heat_tolerant,
  beginner_friendly "yes" | "no" | "partly"; purpose "eggs" | "meat" | "dual" | "ornamental" |
  "exhibition" | "fighting"; egg_size "small" | "medium" | "large" | "extra large" or a range like
  "medium to large"; temperament a short lowercase phrase ("calm, docile"). You may add a missing key
  fact (for example heat_tolerant) as a fix when a source states it plainly.
- `sources`: every publisher you rely on, including the existing ones you confirmed, each with the
  fields it supports. `source_confidence` is "page" when the page is about this breed, "domain" when
  it is a general page.
- `status`: "fixed" if `fixes` is not empty; "approved" if every fact checked out and nothing changed;
  "needs-human" if a key fact is contradicted and you could not settle it, the record looks like a
  duplicate or the wrong breed, or the only source is unreliable.
- `needs_review: false` ONLY when 2+ page-level sources from 2+ different publishers support the key
  facts (the check script enforces at least 2 publishers). Otherwise true. For obscure breeds with only
  Wikipedia, true is the honest answer; still review and still write the summary.
- Known duplicates: california-gray / california-grey, crevecoeur / cr-vec-ur-chicken,
  brakel / braekel. Review both; say "possible duplicate of <id>" in changes.
- No em dash (U+2014) anywhere in the shard. Avoid en dashes too; write "to".

## Summary rules (this replaces copied Wikipedia text, which is duplicate content)

- 90 to 160 words, plain US English, in your own words. Short sentences, ordinary words.
- Built only from facts in the sources you cite: what the breed is and where it comes from, what it
  looks like, eggs (number, color, size), temperament, and who it suits (cold or hot climates,
  beginners, families, small yards, exhibition). Skip a topic the sources do not cover; never fill a
  gap with a guess.
- Use pounds for weights (US readers), with numbers from the sources.
- Never copy: the check script rejects any 8-word run shared with the Wikipedia text or other cached
  source texts. Do not paraphrase sentence by sentence either; write it fresh.
- No hype ("stunning", "majestic", "truly"), no second-person sales copy, no em dashes, no "In
  conclusion". Do not mention the site, sources or Wikipedia in the text.
- `summary.sources`: the URLs the summary's facts come from.

## When you finish

Reply with: breeds done, counts of approved / fixed / needs-human, cleared (needs_review false), the
most important fixes in one line each, and any breed you could not finish.
