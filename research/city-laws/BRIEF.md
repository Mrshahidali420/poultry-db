# Backyard chicken law research: worker brief

You research backyard chicken rules for a batch of US cities. Output is used for public pages like
"Can you have chickens in Houston?" and people act on it. ACCURACY OVER COVERAGE. Unknown means unknown: never guess.

## Output: one JSON file per city
Write `SHARD_DIR/<id>.json` (SHARD_DIR is given in your prompt) IMMEDIATELY after finishing each city, before
starting the next. If `<id>.json` already exists there, skip that city. Do NOT write any other files anywhere
(no files in the poultry-db repo). Do not run git.

Record shape (exact keys, this order):
```
{
  "id": "houston-tx", "city": "Houston", "state": "TX", "population": 2397315,
  "allowed": "yes" | "no" | "conditional" | "unknown",
  "max_hens": number | null,
  "hens_rule_text": "short plain paraphrase, e.g. up to 4 hens on lots under 1 acre",
  "roosters_allowed": "yes" | "no" | "conditional" | "unknown",
  "permit_required": "yes" | "no" | "unknown",
  "permit_notes": "", "setback_ft_from_homes": number | null, "setback_notes": "",
  "coop_rules": "short", "slaughter_allowed": "yes" | "no" | "unknown",
  "zoning_notes": "",
  "hoa_note": "Homeowners associations, deed restrictions and leases can be stricter than city law. Check yours before getting chickens.",
  "code_section": "Sec. 6-31" (or "" if not found),
  "sources": [{ "name": "...", "url": "https://...", "type": "municipal-code" | "city-website" | "secondary" }],
  "confidence": "high" | "medium" | "low",
  "research_notes": "one or two sentences: how the facts were obtained and what is uncertain",
  "last_checked": "2026-09-26", "needs_review": true
}
```
id, city, state, population come from the prompt; copy exactly.

## Meaning of values
- allowed: "yes" = residential hens allowed by right with only simple limits (count, setback, enclosure).
  "conditional" = allowed only with a permit/license, only in some zones, only on large lots, or only with
  neighbor consent. "no" = the code bans keeping chickens on ordinary residential lots in the city. "unknown" = could not establish.
- max_hens: the number on a typical single-family lot. If it varies by lot size, use the typical/smallest
  residential-lot figure and explain in hens_rule_text. null if no numeric cap or unknown. Don't invent a cap.
- setback_ft_from_homes: distance required from neighbors' dwellings (or from any dwelling other than owner's).
  If the code only states setback from property lines, set null and describe in setback_notes.
- slaughter_allowed: "unknown" unless the code or official page explicitly addresses it.
- roosters: "no" if banned, "conditional" if allowed only by zone/lot size/permit, "yes" if allowed like hens.

## Source rules
Primary = the city's own municipal code (Municode library.municode.com, American Legal codelibrary.amlegal.com,
eCode360, Code Publishing, qcode, Franklin Legal, city-hosted code) or an official city page (.gov animal services FAQ,
zoning/planning FAQ, permit form). Secondary (news, extension, blogs, backyardchickens.com, flockguide, texasrealfood,
realtor sites) may only be used to find the code section. Never cite a secondary site's numbers as fact without saying so.

## Access constraints (important, learned by testing)
- This machine's IP is outside the US. library.municode.com and api.municode.com return 403 (region block).
  codelibrary.amlegal.com, ecode360.com, codepublishing.com, library.qcode.us, r.jina.ai return Cloudflare 403 to node fetch.
- WebFetch is BLOCKED by a hook. Do not call it. Do not use curl/wget in Bash.
- Fetch pages with the ctx tools: `ctx_execute` (language javascript, use `fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'}})`,
  strip tags, print only the relevant paragraphs) or `ctx_fetch_and_index` + `ctx_search`. Keep raw pages out of your context.
- What works:
  1. WebSearch (runs on a US server). Its result summary often quotes municode/amlegal code text with section numbers.
     Use targeted queries like: `"<city>" code of ordinances chickens fowl hens`, `site:library.municode.com <city> fowl`,
     `<city> <state> backyard chickens ordinance roosters permit`, `<city> animal services chickens FAQ`.
  2. Direct fetch of many city .gov websites (e.g. seattle.gov, phoenix.gov, nyc.gov, lacity.gov, chicago.gov, portland.gov worked;
     some time out). Official city PDFs (animal permit forms, FAQ) are excellent.
  3. Wayback Machine copies of American Legal / eCode360 / other code pages: `https://web.archive.org/web/2026/<original-url>`
     (a recent snapshot of the code page counts as reading the municipal code; cite the ORIGINAL url and say "read via Internet Archive copy" in research_notes).
     CDX lookup: `https://web.archive.org/cdx/search/cdx?url=codelibrary.amlegal.com/codes/<client>/*&output=json&limit=50&filter=statuscode:200`.
- Cite the canonical code URL (e.g. the municode nodeId URL returned by search) as the source url.

## Confidence
- "high": you read the actual code text (fetched directly or via a Wayback copy) or an official city page that states the rules plainly, and the key facts (allowed, max_hens, roosters, permit) are all supported.
- "medium": facts come from official sources but only via search-result extracts of the code page (you could not open the full text), or the official text is ambiguous, old, or incomplete.
- "low": only secondary sources found. Say so in research_notes and in the source type.
Be honest. If search extracts disagree with each other, or with secondary sources, prefer the code, lower confidence, and say so.
Watch for recent ordinance changes (2023-2026): search for news of amendments and note them.

## Writing
Plain short paraphrases, no long pasted code text. NO em dashes (U+2014) or en dashes (U+2013) anywhere; use commas, colons or "to".
Budget: roughly 4 to 10 searches/fetches per city. If you cannot establish a field, set unknown/null and explain.

## When done
Reply with a compact table: id | allowed | max_hens | confidence, plus any city you skipped and why.
