# Backyard chicken site: build plan

Written 26 Sep 2026 from the poultry-db data as it stands today, the three
niche-research files (11, 12, 13) and the stack already running on
gta6record.com, aniimoindex.com and manhwaindex.com. Planning only. Nothing
here has been built, bought or pushed.

Data snapshot used (poultry-db `data/`): 193 foods (all with verdict, reason,
3+ sources, 164 with an original photo), 220 breeds (196 with 8+ sourced
facts, 150 with an original photo), 18 colour aliases, 1,606 DAD-IS world
breed names (2,588 country records, 165 linked to our breeds), 73 disease
articles (55 marked relevant to backyard flocks), 44 of 150 city law records,
51 state law records (8 researched in depth), 163 USDA nutrition rows, 12
chick-care age bands, 14 feed types, 21 laying-guide entries, 43 lifecycle
FAQs, 22 predators, 53 toxic plants, 41 safe forage plants, 26 coop specs, 14
egg facts, 10 incubation profiles, 1,029 original Commons photos (2.6 GB, all
credited in `images-original.json`, on the `images-original` GitHub release).

---

## 1. Goal and money model

**Goal.** A sourced reference site for people who keep 3 to 20 chickens in a
yard. Every number on every page names where it came from. The model is
yardroost.com (132 hand-written posts, 9 months old, 2.3K US visits/month,
Authority 12) but built from data, so we launch with 4x its food pages on day
one and the whole breed list it never got to.

**Traffic target.** 12 months: 40K to 60K sessions/month, US-first. The
"can chickens eat" cluster alone is 3.1M searches/month across the topic at
an average KD of 16; the food pages we can build today address roughly
380,000 searches/month (keyword file sums to 466K with variant duplicates).

**Money, in order.**

1. **Amazon Associates** (primary). Buyer intent is real: chicken feed 27.1K
   ($1.00 CPC), chicken treats 8.1K, layer feed 6.6K, chick starter 4.4K,
   grit 4.4K, dust bath 3.6K, toys 3.6K, plus coops, feeders, waterers,
   brooders, incubators. Links are Amazon **search links** (the gta6record
   pattern) so they never 404 or show a stale price. Every food, feed, chick
   care and tool page carries one contextual gear box. Disclosure lives in
   the privacy policy only, never beside a link (hard rule).
2. **AdSense** (secondary, from month 3). Info CPC is $0.01 to $0.33, so it is
   pageview money. The loader script ships in the base layout from day one
   with no slots drawn until approval (gta6record pattern, lesson 3 from
   manhwaindex). Trust pages, author box and thin-page rules below exist so
   the September 2026 "low-value content" rejection does not repeat.
3. Later, if traffic arrives: a hatchery directory with sponsored listings,
   and a printable coop-plan or flock-record PDF.

Not doing: a forum, user accounts, comments, a newsletter at launch, "for
sale / hatchery near me" terms (local, KD 35 to 73).

---

## 2. Launch waves

Ordered by (volume we can win) x (data already finished). Each wave ships
only pages that pass the thin-page rule in section 4.

| Wave | Ships | Pages | Addressable volume/month | Data state |
|---|---|---|---|---|
| **1. Feeding** (weeks 1 to 4) | 193 food pages, /feeding hub, food checker search box, feed guide (14 feeds), toxic plants (1 hub + 53 entries on one page per severity band, not 53 pages), safe forage (1 page), treats 10% rule page, 5 trust pages, About/author, FAQ (43 Q&As grouped into 6 topic pages) | ~215 | ~380K foods + ~45K feed and FAQ | Done. Needs the Opus verdict review pass (task W1-03) |
| **2. Breeds** (weeks 5 to 9) | Breed pages that pass the rule (~190 of 220), /breeds hub with filters, 12 type and comparison pages (black chickens 27.1K, bantam 12.1K, fluffy 8.1K, largest 4.3K, best egg layers 9.8K, egg colour chart 2.5K, rooster vs hen 7.2K, lifespan 6.6K, broiler 7.6K, feathered feet 1.6K, black and white 3.6K, fancy 1.6K), 40 breed-vs-breed comparisons, chicken names (9.9K, KD 9), breed finder quiz, egg colour tool | ~260 | ~410K breeds + ~100K type pages | Done for facts and photos. Names list must be written (curated file) |
| **3. Health and chicks** (weeks 10 to 13) | ~45 disease pages, symptom checker, chick care by week (12 bands as one guide + 12 anchor sections, plus 4 standalone pages: brooder temperature 3.1K, chick grit 2.9K, pasty butt, first week), laying guide (21 entries as 8 pages: not laying, stopped laying, first eggs, winter light, soft shells, egg binding, moulting 4.4K, broody 4.4K), predators (22 entries as 1 hub + "what killed my chicken" finder + 8 pages for the named predators with volume: possums 5.4K, raccoons, hawks, foxes, rats, snakes, dogs, coyotes), egg pages (float test 33.1K/31, washing, storage, egg anatomy) | ~90 | ~180K | Done. Health copy needs the Opus wording pass |
| **4. Laws and places** (weeks 14 to 18) | City law pages (44 now, 150 when research finishes), 51 state law pages, best breeds by state (51), /laws hub with map | ~250 | ~90K ("can you have chickens in <city>", "<state> chicken laws", "backyard chickens <city>") | 44/150 cities, 8/51 states researched. Research is the blocker, see risks |
| **5. Gear and directory** (weeks 19 to 22) | 25 buyer guides (feed, treats, grit, feeders, waterers, coops by flock size, brooders, incubators, heat plates, nest boxes, dust bath, toys, fencing, cameras, egg cartons, scale, first aid kit), hatchery directory (needs new data, 40 to 60 US hatcheries), coop size and feed cost calculators, incubation calculator | ~90 | ~120K with real CPC | Nothing yet. Curated files to write |

Total at wave 5: about 900 pages. Fully static is correct at this size (one
sitemap under 5,000 URLs, no Worker, no sharded search).

---

## 3. URL map

Apex domain, `trailingSlash: 'never'`, `build.format: 'file'`, lower-case
kebab slugs, no dates in URLs. One exported `SECTIONS` constant in
`src/lib/site.mjs` drives routes, nav, hub sitemaps and llms.txt (lesson 2:
never two lists).

```
/                                   home: search box, hubs, seasonal block
/feeding                            hub: food checker + verdict grid
/feeding/can-chickens-eat-<food>    193 food pages (grapes, tomatoes...)
/feeding/feed-guide                 the 14 feed types, one page + anchors
/feeding/feed/<feed>                only for feeds with volume: layer, starter, grower, scratch, all-flock, medicated
/feeding/toxic-plants               one page, grouped by severity
/feeding/safe-forage                one page
/feeding/treats-rule                the 10 percent rule
/breeds                             hub: filterable table (egg colour, eggs/yr, size, climate, temperament)
/breeds/<breed>                     ~190 breed pages (brahma, silkie...)
/breeds/<breed>#<variety>           colour aliases as anchors; /breeds/<alias> 301s here
/breeds/compare/<a>-vs-<b>          40 comparison pages, slugs sorted alphabetically
/breeds/best-egg-layers             type pages, 12 of them
/breeds/black-chickens
/breeds/bantam-chickens
/breeds/egg-color-chart
/breeds/world                       DAD-IS hub: countries table
/breeds/world/<country>             one page per country with 5+ reported breeds (~110 pages, wave 2b)
/health                             hub + symptom checker entry
/health/<disease>                   ~45 disease pages
/health/symptom-checker             tool
/health/chick-care                  the week-by-week guide
/health/chick-care/<topic>          brooder-temperature, chick-grit, pasty-butt, first-week
/eggs                               hub
/eggs/<topic>                       float-test, washing, storage, anatomy, not-laying, first-eggs, winter-light, soft-shells, molting, broody-hen
/predators                          hub + "what killed my chicken" finder
/predators/<predator>               8 pages
/laws                               hub, US map
/laws/<state>                       51 state pages (texas, california...)
/laws/<state>/<city>                city pages (texas/austin)
/laws/<state>/best-breeds           best breeds by state
/gear                               hub
/gear/<guide>                       25 buyer guides (best-chicken-feed, best-chicken-coop-for-6-hens...)
/hatcheries                         directory
/hatcheries/<state>                 by state
/tools                              hub
/tools/coop-size-calculator
/tools/feed-cost-calculator
/tools/breed-finder
/tools/egg-color-chart              (canonical of /breeds/egg-color-chart, pick one: keep /breeds/ version, /tools links to it)
/tools/incubation-calculator
/names                              chicken names hub
/names/<theme>                      funny, pun, pairs, black-hens, rooster, egg-themed (6 pages)
/faq/<topic>                        6 topic pages from lifecycle-faq.json
/about  /editorial-policy  /how-we-check-facts  /sources  /credits  /contact  /privacy  /terms
/search                             Pagefind, noindex
/sitemap.xml  /llms.txt  /robots.txt  /rss.xml
```

Aliases: `/breeds/cream-legbar` 301 to `/breeds/legbar#cream-legbar` unless
the alias gets its own hand-written 300+ words (then it is a full page with
`isPartOf` pointing at the parent). Candidates worth promoting in wave 2b:
light brahma 8.1K, buff brahma 5.4K, dark brahma 4.4K, black copper marans,
lavender orpington, buff orpington, black australorp 2.9K, silver laced
wyandotte.

---

## 4. Page templates and the thin-page rule

Global rules (from LESSONS-FROM-MANHWAINDEX.md, they cost a site once):

- No page ships under **300 words of real body text** (counted from `<main>`
  by `scripts/thin-pages.mjs`, which fails the build, not just prints).
- Every page has a **unique meta description** (CI asserts total == unique,
  as gta6record does).
- Every fact row renders its source as a link. `{value: null}` renders
  nothing, never "unknown" or "N/A".
- `conflict: true` renders both values with both sources: "Sources differ:
  250 (Livestock Conservancy), 200 (Wikipedia)". That is a feature, it is the
  honesty the site sells.
- Author box on every content page (name, one line, link to /about), "Last
  checked" date, "Sources for this page" list at the bottom.
- No em dashes anywhere. `check-copy` step greps dist for U+2014 and fails.

**needs_review: recommendation is FLAG, not hide.** Every record in the
database is `needs_review: true` today, so hiding would mean no site. Rule:

- `needs_review` is an editorial flag, not a reader-facing label. Readers see
  sources and conflicts, not our workflow.
- A curated `reviews.json` (`{entity_type, id, reviewed_by, reviewed_at}`)
  in the site repo flips a record to reviewed. The build prints a count of
  unreviewed pages per section.
- **Launch gate per wave:** every page in the wave is reviewed before the
  wave goes in the sitemap (wave 1 = 193 food verdicts read against their
  sources by Opus, task W1-03). Unreviewed pages build but carry `noindex`
  and are excluded from the sitemap until reviewed. That keeps the crawl
  clean and lets the review happen in batches.
- `confidence: low` records never ship (1 city today).

### Food page (193)

Fields: name, aliases, verdict badge (safe / moderation / limit / unsafe),
verdict reason (the answer in the first 60 words), parts table (part,
verdict, reason), toxic compounds, preparation steps, serving guidance
(never gram amounts, always the 10 percent rule), benefits, chick safety,
USDA nutrition per 100 g (energy, protein, fat, carbs, fibre, calcium,
phosphorus, Ca:P ratio, vitamin A, C, potassium, water) with the FDC id and
match confidence shown, photo with credit, related foods (same category,
same verdict), gear box, sources, FAQ block (3 to 5 Qs built from parts:
"Can chickens eat banana peels?").
Thin rule: verdict + reason + 2 or more sources + (parts or preparation or
benefits non-empty) + nutrition or photo. All 193 pass today.

### Breed page (~190)

Fields: name, alt names, photo gallery (up to 7, each credited), origin
country and period, APA/ABA/PCGB class, purpose, size (standard/bantam),
hen and rooster weight, eggs per year (min to max), egg size and colour
(swatch), temperament, broodiness, cold hardy, heat tolerant, beginner
friendly, autosexing, varieties (anchors), lifespan, comb, skin colour,
conservation status, notable traits, history summary, Wikipedia summary
(CC BY-SA, attributed), "Worldwide" section from DAD-IS (countries reporting,
risk status, population) when linked, similar breeds (3), compare links,
best-for tags, gear box, sources.
Thin rule: **8 or more filled provenance fields in breeds_extra AND a summary
of 80+ words AND at least one photo.** 196 breeds have 8+ facts; roughly 190
also have a photo or a Commons image in breeds.json. The rest (about 30) stay
in the hub table as a row with a "no page yet" state and no link.

### DAD-IS world breeds (1,606)

**Decision: no page per DAD-IS name.** Most are one country, one record,
name-only. They ship as (a) a "Worldwide populations" section on the 165
linked breed pages, (b) `/breeds/world/<country>` pages for countries with
5+ reported breeds (~110 pages, a sortable table with risk status,
population, uses, source link per row, plus FAOSTAT stats for that country
and 150+ words of hand-written intro per page, or the page does not ship),
and (c) a later wave 2c for the 119 names reported by 3+ countries if GSC
shows demand. This is the thin-page rule applied honestly.

### Disease page (~45)

Fields: name, plain-English one-liner, cause type, contagious, zoonotic (with
a clear "can spread to people" line when true), key symptoms, prevention,
vaccine available, notifiable in US/UK, Wikipedia summary, relevant-to-backyard
tag, photo if any, "When to call a vet" box on every page, sources, related
diseases (shared symptoms).
Thin rule: `relevant_to_backyard_chickens === true` AND 4 or more filled
facts AND non-empty key_symptoms. The 13 false and 5 null records (Rajneeshee
attack, salmonella outbreaks, duck viruses, the Animal Health Act) never
build. Wording rules in section 8.

### City law page (44 now, 150 later)

Fields: allowed, max hens, hens rule text, roosters, permit required and
notes, setback feet and notes, coop rules, slaughter, zoning notes, HOA note,
code section (linked), sources, last checked, confidence badge, population,
state page link, nearest 5 covered cities, best breeds for the state.
Thin rule: confidence high or medium AND 1+ source AND code_section present.

### State law page (51)

Summary, state rules table, sources, list of covered cities with allowed /
max hens columns, NASS state numbers (layers, eggs, latest year, from
stats_us_states.json), best breeds by state link.
Thin rule: research_status researched (8 today) or 3+ covered cities in the
state. Others build noindex until researched.

### Comparison page (40)

Two breed cards side by side, a difference table (only fields both have),
"pick A if / pick B if" paragraph (hand-written, 120+ words, in a curated
`comparisons.json`), links to both breed pages. Pairs chosen by shared
search phrases: ameraucana vs araucana vs easter egger, rhode island red vs
new hampshire, barred rock vs dominique, buff orpington vs cochin, silkie vs
frizzle, isa brown vs golden comet, etc.

### Tool page

Tool UI, 200+ words explaining the numbers and their sources, worked example,
gear box, related guides. Data inlined as JSON at build.

---

## 5. Data to page mapping

| Site page | poultry-db file(s) | Notes |
|---|---|---|
| /feeding/can-chickens-eat-* | curated/food-safety.json, nutrition.json, images-original.json, keywords.json | keyword row gives the title variant with most volume ("can chickens eat" vs "can chickens have") |
| /feeding/feed-guide, /feeding/feed/* | curated/feed-guide.json, curated/coop-specs.json (intake rows) | |
| /feeding/toxic-plants, /feeding/safe-forage | curated/toxic-plants.json, curated/safe-forage-plants.json, images | |
| /breeds/* | breeds.json, breeds_extra.json, breed-aliases.json, images-original.json, images.json, breed-dadis-links.json, breeds_global_by_name.json | breeds.json is the identity, breeds_extra the facts |
| /breeds/world/* | breeds_global.json, breeds_global_by_name.json, stats_by_country.json | |
| /breeds/compare/* | breeds_extra.json + new curated/comparisons.json | |
| /breeds/<type pages> | breeds_extra tags and fields (purpose, size, egg_color, plumage from varieties) + hand-written intro | |
| /health/* | diseases.json, diseases_extra.json, images | filter relevant === true |
| /health/chick-care* | curated/chick-care-by-week.json, coop-specs (brooder rows) | |
| /eggs/* | curated/egg-facts.json, curated/laying-guide.json, lifecycle-faq (topic laying) | |
| /predators/* | curated/predators.json, images | |
| /laws/* | city-chicken-laws.json, state-chicken-laws.json, us-cities-top150.json, stats_us_states.json | |
| /laws/<state>/best-breeds | breeds_extra (cold_hardy, heat_tolerant) + new curated/state-climate.json (51 rows: USDA zone range, summer high, winter low) | |
| /gear/* | new curated/gear-guides.json (title, intro, what to look for, Amazon search phrases, related pages) | no product prices ever |
| /hatcheries/* | new curated/hatcheries.json | |
| /names/* | new curated/chicken-names.json (600+ names, themed) | |
| /faq/* | curated/lifecycle-faq.json | 43 Qs grouped by `topic` |
| /tools/* | coop-specs.json, feed-guide.json, incubation.json, breeds_extra.json, diseases_extra.json, egg-facts.json | |
| /sources, /credits | sources.json, reference_sources.json, images-original.json | |

New curated files to write (all in poultry-db `data/curated/`, same
conventions): `comparisons.json`, `state-climate.json`, `gear-guides.json`,
`hatcheries.json`, `chicken-names.json`, `reviews.json` (or keep reviews in
the site repo; recommend the data repo so one place owns editorial state).

How the site gets the data: the site repo checks out poultry-db as a second
`actions/checkout` step at a **pinned commit sha** kept in `src/lib/site.mjs`
(`DATA_SHA`). `scripts/sync-data.mjs` copies the needed JSON into
`src/data/` (gitignored). Bumping the sha is one commit and one deploy, so a
bad data change never ships by surprise. If poultry-db is private, the
checkout needs a fine-grained PAT secret (`DATA_REPO_TOKEN`); public is
simpler and unlimited-minutes, so make poultry-db public too if it is not.

---

## 6. Images pipeline

Originals never enter the site repo. 1,029 files, 2.6 GB, on the
`images-original` release of `Mrshahidali420/poultry-db`, one zip per group
(breeds, foods, diseases, predators, toxic-plants, safe-forage-plants).

**Storage and serving:** Cloudflare R2 bucket `chicken-images` with a custom
domain `img.<domain>` (R2 free tier: 10 GB storage, 10M reads/month, zero
egress). Cache-Control `public, max-age=31536000, immutable`; paths carry a
content hash so a re-encode never serves stale.

**Derivation, in CI, incremental** (`.github/workflows/images.yml`, manual +
on change to `images-original.json`):

1. Download the zips with `gh release download images-original` (fast on the
   GitHub network, same as the collector does).
2. For each image, sharp: AVIF (q50, effort 6) and WebP (q74) at 480, 960
   and 1440 wide, `withoutEnlargement`, plus one 1200x630 JPEG for OG. Same
   code as gta6record `build-images.mjs`, three widths instead of two.
3. Write `images-manifest.json`: `{entity_type, entity_id, key, widths,
   width, height, artist, licence, licence_url, commons_page, description,
   sha}`. Commit this manifest (about 300 KB) to the site repo; it is the only
   image data the Astro build reads.
4. Upload only keys not already in the bucket (list once, diff) using
   `rclone` against R2's S3 API (`wrangler r2 object put` is one call per file
   and too slow for 7,000 objects). Secrets: `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`. Remember: `gh secret set`
   from the `!` shell saves an empty secret; paste them in the GitHub UI.
5. Job runs in under 30 minutes on ubuntu-latest for the full set; later runs
   touch only new files.

**In pages:** `<picture>` with AVIF and WebP `srcset` (480/960/1440), sizes
attribute, width and height set (no layout shift), lazy below the fold, the
first image on the page eager with `fetchpriority=high`. Caption under every
photo: "Photo: {artist}, {licence} (link), via Wikimedia Commons (link)".
The CC BY-SA and GFDL files require that line; keep it even for CC0.
`/credits` lists all 1,029 with the same fields.

OG images: the 1200x630 derivative when the entity has a photo, else a
generated card (gta6record `build-og.mjs` pattern) with the page title and
the verdict badge for foods.

---

## 7. SEO

**Schema.org per template** (JSON-LD, one graph per page, `@id`s that link):

| Template | Types |
|---|---|
| every page | `WebSite` (home only), `BreadcrumbList`, `WebPage` with `author` Person and `publisher` Organization, `dateModified` = last checked |
| food | `Article` + `FAQPage` (the parts questions) + `about: {Thing, name: "<food> for chickens"}`. No `NutritionInformation` (it is for human food) |
| breed | `Article` + `about: {Thing}` with `alternateName`, `subjectOf` the source pages, `image` array. Schema.org has no breed type; do not invent one |
| comparison | `Article` + `ItemList` of the two breeds |
| type page, names, gear guide | `Article` + `ItemList` |
| disease | `Article` only. **Never `MedicalCondition`, `MedicalWebPage` or drug types.** Those invite YMYL scrutiny on veterinary content and are defined for human medicine |
| city and state law | `Article` + `FAQPage` ("Can you keep chickens in Austin?", "How many hens?") + `about: {City / State}` |
| tool | `WebApplication` (applicationCategory Utility, free offer) |
| hatchery directory | `ItemList` of `Organization` with `url` and `address` |
| about | `Person` (Shahid, sameAs to his public profiles) + `Organization` |

**Internal linking, mechanical and complete:**

- Hub to child: every hub lists every shipped child (the filter table on
  /breeds, the verdict grid on /feeding).
- Child to siblings: food page links 6 related foods (3 same category, 3 same
  verdict); breed page links 3 similar breeds (nearest on purpose, size, egg
  colour) and every comparison it is part of; disease page links diseases
  sharing 2+ symptoms; city page links its state and the 5 nearest covered
  cities; state page links its cities and best-breeds page.
- Cross-section: food page to feed guide and treats rule; breed page to best
  breeds by state for its climate tags, to the egg colour chart, to the
  breed finder; chick care to starter feed and brooder gear; disease page to
  the symptom checker; every tool to the pages whose data it uses.
- In-copy links: a build step (`scripts/link-mentions.mjs`, gta6record
  `entity-mentions.mjs`) links the first mention of any breed, food or
  disease name in prose to its page, max 8 per page, never inside headings.
- Footer: the 8 hubs and the trust pages. Nothing else.
- Orphan check in CI: every sitemap URL has 2+ inbound links or the build
  fails.

**Sitemap:** `@astrojs/sitemap` with the same `SECTIONS` list feeding
per-section chunks (feeding, breeds, health, laws, gear, tools, pages), filter
out noindex pages (search, 404, contact, privacy, terms, unreviewed). Under
1,000 URLs per chunk. Submitted as the full URL in a **Domain** property in
GSC (aniimo lesson). IndexNow after deploy, changed URLs only (gta6record
`indexnow.mjs`, reuse as is).

**Canonical:** self-referencing on every page, apex host, no trailing slash,
`www` 301 to apex at Cloudflare. Alias URLs are 301s, never canonical tags to
a different page. Tool page duplicates (egg colour chart) resolved by having
one URL, not two.

**llms.txt:** generated from `SECTIONS` (gta6record `llms.txt.js`): what the
site is, the sourcing promise, then every hub and every shipped page with its
one-line description. `robots.txt` allows all crawlers including AI bots
(same decision as his other sites; a reference site wants to be quoted).

**Titles:** food "Can Chickens Eat Grapes? Safe, How Much, and What to
Avoid"; breed "Brahma Chicken: Eggs, Size, Temperament and Care"; city "Can
You Keep Chickens in Austin, TX? Hen Limits, Permits, Setbacks (2026)". The
keyword row picks "eat" vs "have" per food.

---

## 8. Trust and AdSense pages (day 1, wave 1)

Written by Opus, in Shahid's voice, plain sentences, no em dashes:

- **/about**: who runs it (Shahid Ali, Mianwali; technical SEO by trade, this
  site is a sourced database not a hobby blog), why it exists, what it is not
  (not a vet, not a hatchery), how to reach him. Photo. Links to his other
  reference sites.
- **/how-we-check-facts**: the source hierarchy (extension services, USDA,
  APHIS, Merck, Livestock Conservancy, APA, Wikipedia infoboxes last), the
  rule that nothing is guessed and null stays empty, how conflicts are shown,
  how a record is marked reviewed, how to report an error. Link to the
  poultry-db repo if public.
- **/editorial-policy**: no drug doses, no diagnoses, "see a vet" standard,
  affiliate links do not change verdicts, AI tools used for extraction with
  human review before publish (say it plainly), corrections log.
- **/sources**: the 592 source URLs grouped by publisher with licence notes.
- **/credits**: photo credits, all 1,029.
- **/contact**: email plus a form that posts to a Cloudflare Pages Function
  or a static mailto; no phone, no calls.
- **/privacy**: GA4, AdSense cookies, **the Amazon Associates disclosure
  sentence (the only place it appears)**, no accounts, data retention.
- **/terms**: informational use, no liability for animal outcomes, licence
  of our own text (CC BY-SA 4.0 for pages built on Wikipedia text, or state
  it per page).

Author box: name, "Runs this database", link to /about, last checked date.
One author at launch is fine; it is honest.

**Health wording rules** (apply to diseases, symptom checker, chick care,
laying guide, food pages with unsafe verdicts):

- Every health page opens with what the reader can observe and closes with
  a "When to call a vet" box. The symptom checker output header is "Possible
  causes to discuss with a vet", never "Diagnosis".
- No drug names with doses, no dosing tables, no "treat with". Prevention and
  husbandry are fine (clean water, isolate the bird, biosecurity).
- Zoonotic true renders a plain warning line about people and hand washing.
- Notifiable true renders "Reportable disease: contact your state vet or
  APHIS" with the link.
- Poison verdicts on food pages say "do not feed" and "if eaten, contact a
  vet", nothing about inducing anything.

Ads: AdSense loader in the layout from day one, CSP allowlists the Google ad,
frame and reporting hosts from day one, slots empty until approval. Apply for
AdSense after wave 2 ships and GSC shows 200+ indexed pages, not before.

---

## 9. Tools

All client-side vanilla JS, data inlined at build as JSON, no framework, each
under 30 KB, works without JS for the explanatory copy.

| Tool | Data | Output |
|---|---|---|
| Food checker (search box on /feeding and home) | foods index (name, aliases, verdict, slug) | instant verdict badge + link; unknown food shows "not in our table yet" and a request link |
| Coop size calculator | coop-specs (coop sq ft/bird, run sq ft/bird, roost inches, nest box ratio, ventilation, feeder and waterer space) | floor area, run, roost length, nest boxes, feeder length, with the source per number and a bantam toggle |
| Feed cost calculator | coop-specs intake rows, feed-guide (protein by age), user bag price | lb/day, bags/month, cost per dozen eggs given eggs/week |
| Breed finder quiz | breeds_extra (climate, eggs/yr, temperament, size, broodiness, beginner, purpose) | 5 questions, top 6 breeds with why, links |
| Egg colour chart | breeds egg_color + swatches, egg-facts | filter breeds by colour, colour genetics one-liner per colour |
| Symptom checker | diseases_extra key_symptoms (normalised to ~40 symptom tags at build) | pick symptoms, list diseases by overlap count with the vet box; only relevant diseases |
| What killed my chicken (predator finder) | predators attack_signs, region, active_time | pick signs, time, region; ranked predators with prevention |
| Incubation calculator | incubation.json | set date, get lockdown day, stop-turning day, hatch window, humidity phases |

Wave 1 ships the food checker. Wave 2 the breed finder and egg chart. Wave 3
the symptom checker, predator finder and incubation. Wave 5 the two
calculators (they carry the gear boxes).

---

## 10. Build and deploy

Stack: Astro 5 static, `@astrojs/sitemap`, sharp (images job only),
Pagefind for /search, no UI framework, one `BaseLayout.astro`, `site.mjs` as
the single source of truth (SITE_URL, SITE_NAME, GA id, ADSENSE_CLIENT
`ca-pub-2789392733984505`, AMAZON_TAG, SECTIONS, DATA_SHA).

Repos:

- `Mrshahidali420/poultry-db` (exists): data and collectors. Keep the 6-hour
  collector cron. Add the curated files above.
- `Mrshahidali420/<domain>-site` (new, **public**): the Astro site. Public
  repo means unlimited Actions minutes (the G6-build lesson).

Workflows in the site repo:

- `deploy.yml`: on push to main. Checkout site, checkout poultry-db at
  `DATA_SHA`, `npm install --no-audit --no-fund` (never `npm ci`), `npm run
  build` (= sync-data, build-pages-data, astro build, pagefind, after-build
  checks), then `cloudflare/wrangler-action@v3` `pages deploy dist
  --project-name=<name> --branch=main`, then `indexnow.mjs`. Secrets:
  `CLOUDFLARE_API_TOKEN` (Pages: Edit), `CLOUDFLARE_ACCOUNT_ID`
  (735d0fbab0757142b2c29917563e0626).
- `images.yml`: section 6. Manual and on manifest change.
- `check.yml`: on pull request. Build plus every after-build assertion, no
  deploy.

After-build assertions (all fail the build): unique meta descriptions; no
page under 300 words; no U+2014 in dist; no `undefined`/`null`/`NaN` text in
dist; every sitemap URL exists in dist and has 2+ inbound links; no sitemap
URL carries noindex; every `<img>` has width, height and alt; JSON-LD parses
on every page; dist size and page count printed with per-phase timings
(lesson 7 and 8).

Cloudflare: new Pages project, direct upload via wrangler (the Git-connect
button needs a browser OAuth that dies in this shell). Custom domain apex +
www 301. DNS on Cloudflare. R2 bucket with custom domain `img.`. GSC Domain
property verified by DNS TXT (never the Google-OAuth-to-Cloudflare shortcut).
GA4 property under the existing Shahid Ali account.

Steps in order: 1 register domain (his call, section 12) → 2 create site repo
from a skeleton copied from gta6-site (layout, site.mjs, sitemap config,
after-build, indexnow, thin-pages, build-images, llms.txt) → 3 Pages project
+ secrets → 4 first deploy of a home page + trust pages → 5 images job → 6
wave 1 pages → 7 GSC + GA4 → 8 wave 2 and so on.

---

## 11. Task list

Sizing: S = under half a day for the model named, M = a day, L = two to three
days. Every task reports files changed, tests run, and remaining issues.
Opus for public copy, health wording, schema, canonical, sitemap, image and
deploy plumbing. Sonnet for templates, tools, data scripts, mechanical pages.

### Wave 0: foundation

| Id | Task | Model | Size | Acceptance |
|---|---|---|---|---|
| W0-01 | Create site repo from gta6-site skeleton: BaseLayout, site.mjs with SECTIONS and DATA_SHA, astro.config with section sitemaps, after-build checks, thin-pages as a failing check, check-copy for em dashes | Sonnet | M | `npm run build` passes on an empty site with home + 404; CI check workflow green |
| W0-02 | `scripts/sync-data.mjs` + second checkout of poultry-db at DATA_SHA; page-data builder that joins breeds + extra + aliases + images manifest + keywords into `src/data/*.json` with a `_build-report.json` (counts per section, pages cut by the thin rule and why) | Sonnet | M | report lists 193 foods, ~190 breeds, ~45 diseases, 44 cities with reasons for every cut |
| W0-03 | Images job: release download, sharp derivatives 480/960/1440 AVIF+WebP + OG JPEG, manifest, rclone diff-upload to R2, custom domain | Opus | L | manifest committed; `img.<domain>/...` serves with immutable cache headers; re-run touches 0 files |
| W0-04 | `<Picture>` component with credits caption, `<FactRow>` (value + source link + conflict rendering), `<SourcesList>`, `<AuthorBox>`, `<GearBox>` (Amazon search links, tag from site.mjs), `<VetBox>` | Sonnet | M | components render null-safe; a fact with conflict shows both values; no gear box without a phrase list |
| W0-05 | JSON-LD builder per template (section 7) + CI check that every page's JSON-LD parses and has BreadcrumbList | Opus | M | Rich Results test passes for one page of each template |
| W0-06 | Trust pages copy: about, how-we-check-facts, editorial-policy, contact, privacy (with the Associates line), terms; sources and credits pages generated | Opus | M | check-copy passes; Shahid reads and approves before publish |
| W0-07 | deploy.yml + Pages project + secrets (pasted in GitHub UI) + apex/www + GSC Domain property + GA4 | Opus | S | push to main deploys; `gh run list -w deploy -L 1` green; site 200 on apex, www 301 |
| W0-08 | `reviews.json` mechanism: unreviewed pages build with noindex and drop from the sitemap; build report counts them | Sonnet | S | flipping one id in reviews.json moves the page into the sitemap on the next build |

### Wave 1: feeding

| Id | Task | Model | Size | Acceptance |
|---|---|---|---|---|
| W1-01 | Food page template + /feeding hub with verdict grid and category filters; titles from keywords.json ("eat" vs "have") | Sonnet | M | all 193 build, none under 300 words, unique descriptions, 6 related links each |
| W1-02 | Food checker search box (home + hub) | Sonnet | S | typing "banana peel" resolves to the bananas page via aliases and parts |
| W1-03 | **Verdict review pass**: read all 193 verdicts, reasons, parts and serving guidance against the cited sources; fix wording; flip reviews.json; log disagreements | Opus | L | 193 reviewed entries; a written list of any verdict changed and why |
| W1-04 | Feed guide, treats rule, toxic plants, safe forage pages | Sonnet | M | 4 pages + up to 6 feed subpages, each 300+ words, sources shown |
| W1-05 | FAQ topic pages from lifecycle-faq.json (6 pages) with FAQPage schema | Sonnet | S | 43 Qs all placed, each page 300+ words |
| W1-06 | Missing high-volume foods not in the table: meat (5.2K), eggs (4.3K), nuts group (4.3K), fish (3.0K), bugs/worms (2.6K), banana peels handled as a part, brussels sprouts alias, mangoes alias, green onions part of onions, crab apples part of apples, noodles/spaghetti, citrus group, weeds | Opus (verdicts) then Sonnet (records) | M | 10 to 14 new curated records with 3+ sources each, reviewed |
| W1-07 | Launch: sitemap submitted, IndexNow first run, GSC coverage check after 7 days | Sonnet | S | 200+ URLs discovered in GSC |

### Wave 2: breeds

| Id | Task | Model | Size | Acceptance |
|---|---|---|---|---|
| W2-01 | Breed page template (section 4) + gallery + DAD-IS section + similar breeds | Sonnet | L | ~190 pages, every fact row sourced, cut list in the build report |
| W2-02 | /breeds hub: filterable, sortable table (egg colour, eggs/yr, size, cold/heat, temperament, beginner) that works without JS as a plain table | Sonnet | M | all shipped breeds listed; unshipped rows show no link |
| W2-03 | Colour alias 301s + anchors; promote list for wave 2b | Sonnet | S | `/breeds/turken` 301 to `/breeds/naked-neck`; 18 aliases covered |
| W2-04 | 12 type pages: hand-written intros (200+ words each) + generated lists from tags/fields | Opus | L | each page 500+ words, ItemList schema |
| W2-05 | 40 comparisons: choose pairs from shared search terms, write the pick paragraphs into comparisons.json, template renders the diff table | Opus (copy) + Sonnet (template) | L | 40 pages, no pair where both breeds lack 8 shared fields |
| W2-06 | chicken-names.json (600+ names, 6 themes) + /names pages | Sonnet (list) + Opus (intros) | M | 6 pages, no duplicates, each 300+ words |
| W2-07 | Breed finder quiz + egg colour chart | Sonnet | M | quiz returns 6 breeds for every answer path; chart lists every shipped breed by colour |
| W2-08 | Breed fact review: top 60 breeds by volume read against sources, conflicts resolved or kept as shown-conflicts, reviews.json flipped; remaining breeds reviewed in batches of 40 | Opus | L | top 60 in the sitemap at wave 2 launch, the rest within 3 weeks |
| W2-09 | /breeds/world hub + country pages with 5+ breeds and 150-word intros | Sonnet (build) + Opus (intros) | M | ~110 pages, each with FAOSTAT numbers and a sourced table |

### Wave 3: health, chicks, eggs, predators

| Id | Task | Model | Size | Acceptance |
|---|---|---|---|---|
| W3-01 | Disease template with vet box, zoonotic and notifiable lines, symptom normalisation (~40 tags) | Opus | L | ~45 pages, none names a drug dose, all carry the vet box |
| W3-02 | Symptom checker + predator finder + incubation calculator | Sonnet | M | outputs never say diagnose; every result links a page |
| W3-03 | Chick care guide + 4 subpages; laying guide 8 pages; egg pages 4; predators hub + 8 pages | Sonnet (build) + Opus (copy review) | L | 25 pages, each 300+ words, conflicts shown (brooder temperature has one) |
| W3-04 | Health wording review of every wave 3 page against section 8 | Opus | M | written sign-off list |

### Wave 4: laws and places

| Id | Task | Model | Size | Acceptance |
|---|---|---|---|---|
| W4-01 | Finish city research (106 cities) per research/city-laws/BRIEF.md, in sessions with the web-search cap raised; Municode via a US proxy or the city's own PDF | Sonnet, batches of 15 | L x 7 | 150 records, confidence high or medium, code_section present |
| W4-02 | State research for the remaining 43 states | Sonnet, batches of 10 | L x 4 | research_status researched on 51 |
| W4-03 | City, state, best-breeds templates + /laws hub with an SVG map; state-climate.json | Sonnet | L | all pages pass the thin rule; low-confidence cities excluded |
| W4-04 | Copy review of the law pages (they make claims about the law; wording must say "as of <date>, check the current code") | Opus | M | every page carries the date and the code link |

### Wave 5: gear and directory

| Id | Task | Model | Size | Acceptance |
|---|---|---|---|---|
| W5-01 | gear-guides.json: 25 guides, what to look for, sizing by flock, Amazon search phrases | Opus | L | no prices, no brand claims without a source, 600+ words each |
| W5-02 | hatcheries.json: 40 to 60 US hatcheries from their own sites (name, state, URL, ships chicks, NPIP, min order, breed count) + directory pages | Sonnet | L | every row has a source URL and a checked date |
| W5-03 | Coop size and feed cost calculators | Sonnet | M | numbers match coop-specs rows, each number shows its source |
| W5-04 | AdSense application once GSC shows 200+ indexed and the trust pages are live; CSP verified in a real browser | Opus | S | application submitted, slots wired after approval |

---

## 12. Domain names

Checked 26 Sep 2026 with RDAP (`rdap.verisign.com`, 404 = unregistered).
Nothing registered. His pick.

**Unregistered (12):**

| Domain | Why it fits |
|---|---|
| **coopalmanac.com** | "almanac" says reference and seasons; fits foods, breeds, laws, tools |
| **henatlas.com** | atlas fits breeds by country, laws by state, best breeds by state |
| **cooplore.com** | short, brandable, warm; lore = accumulated knowledge |
| **roostnotes.com** | reads like a keeper's notebook; good for the author-box voice |
| **henlore.com** | shortest of the set, 7 letters |
| hencompass.com | guide feel, pairs with the breed finder and symptom checker tools |
| cluckguide.com | plain, says what it is; a little playful |
| henfacts.com | says "sourced facts", which is the pitch; slightly generic |
| roostindex.com | matches his other sites' naming (aniimoindex, manhwaindex) |
| cluckindex.com | same pattern, more playful |
| peckandroost.com | brandable, but longer to type |
| henfolio.com | brandable, but "folio" says portfolio, not chickens |

**Taken (18):** coopnotes, roostwise, yardhen, coopfacts, henyard,
backyardroost, flockfacts, hendex, coopledger, roostpedia, flockatlas,
coopindex, hennotes, flockledger, hensafe, coopcompass, roostatlas,
flockpedia.

Recommendation: **coopalmanac.com** first, **henatlas.com** second. Both are
two real words, no trademark shape, and neither locks the site into one
section the way "feeding" or "breeds" names would.

---

## 13. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Thin pages | The single cause of the last AdSense rejection and of manhwaindex's audit failure | 300-word floor that fails the build; no page for a record with too few facts; DAD-IS gets tables not 1,606 pages; hand-written intros on every list page |
| Health content is YMYL | A wrong dose or a "treatment" line is a liability and a ranking risk | Section 8 rules, no medical schema, vet box on every page, Opus review of every health page, symptom checker never says diagnose |
| All records are needs_review | Publishing unreviewed LLM-extracted facts under a "we check everything" banner would be false | Reviews gate the sitemap; conflicts are shown, not hidden; wave 1 review is a named task with a written log |
| City law research stalled at 44/150 | Municode blocks non-US traffic; the search cap ends a session | Ship the 44; batch the rest; law pages say "as of date" and link the code; never a page with confidence low |
| Licence attribution | 611 of the photos are CC BY-SA, 13 GFDL; Wikipedia summaries are CC BY-SA | Caption on every photo, /credits page, licence line per page that uses Wikipedia text |
| Seasonality | Chick season is Feb to May; a Q4 launch lands in the trough | Launch waves 1 to 3 by January so the index is warm for spring; chick care and incubation ready before February |
| Old sites own head terms | backyardchickens.com and mypetchicken.com hold "chicken breeds" and the like | Long tail first (single foods, single breeds, single cities), exactly where yardroost wins at 9 months |
| Static rebuild time as pages grow | 900 pages plus 7,000 image objects | Images are a separate job with a manifest; the page build reads JSON only; per-phase timings printed |
| 2.6 GB in the wrong place | A stray commit of originals kills the repo | `data/images-original/` stays gitignored in poultry-db; the site repo never holds an original; CI asserts dist size |
| One author | AdSense reviewers look for who is behind the site | Real name, real photo, real bio, real contact; it is one honest person, which beats invented staff |
