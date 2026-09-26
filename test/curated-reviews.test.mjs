import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Expert review (W1-04) of the non-food curated files. Each file has a review
// file in data/reviews/<stem>-reviews.json with one entry per record.
const STEMS = [
  "chick-care-by-week",
  "coop-specs",
  "egg-facts",
  "feed-guide",
  "incubation",
  "laying-guide",
  "lifecycle-faq",
  "predators",
  "safe-forage-plants",
  "toxic-plants",
];
const STATUSES = ["approved", "fixed", "needs-human"];

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Registrable domain: last two labels, or last three under a two-part public
// suffix such as gov.uk or org.uk, so food.gov.uk and gov.uk count as two
// publishers but extension.psu.edu and psu.edu count as one.
const SECOND_LEVEL = new Set(["ac", "co", "gov", "org", "net", "nhs", "com", "edu"]);
export const regDomain = (url) => {
  const labels = new URL(url).hostname.toLowerCase().replace(/^www\./, "").split(".");
  const n = labels.length;
  const twoPart = n >= 3 && labels[n - 1].length === 2 && SECOND_LEVEL.has(labels[n - 2]);
  return labels.slice(twoPart ? -3 : -2).join(".");
};

test("regDomain splits publishers the way the review counts them", () => {
  assert.equal(regDomain("https://extension.psu.edu/x"), "psu.edu");
  assert.equal(regDomain("https://www.merckvetmanual.com/"), "merckvetmanual.com");
  assert.equal(regDomain("https://www.food.gov.uk/a"), "food.gov.uk");
  assert.equal(regDomain("https://www.bhwt.org.uk/"), "bhwt.org.uk");
  assert.notEqual(regDomain("https://www.rspca.org.uk/"), regDomain("https://www.bhwt.org.uk/"));
});

for (const stem of STEMS) {
  const dataText = read(`../data/curated/${stem}.json`);
  const reviewText = read(`../data/reviews/${stem}-reviews.json`);
  const records = JSON.parse(dataText);
  const reviews = JSON.parse(reviewText);
  const byId = new Map(reviews.map((r) => [r.record_id, r]));

  test(`${stem}: every record has exactly one review entry, and every review has a record`, () => {
    assert.ok(Array.isArray(reviews));
    assert.equal(byId.size, reviews.length, "duplicate review entry");
    assert.equal(reviews.length, records.length, "review count differs from record count");
    for (const r of records) assert.ok(byId.has(r.id), `${r.id} has no review entry`);
    for (const r of reviews) assert.ok(records.some((x) => x.id === r.record_id), `review for unknown record ${r.record_id}`);
  });

  test(`${stem}: review entries are complete`, () => {
    for (const r of reviews) {
      assert.ok(STATUSES.includes(r.status), `${r.record_id} status ${r.status}`);
      assert.equal(r.reviewed_by, "claude-opus");
      assert.match(r.reviewed_on, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(typeof r.changes === "string" && r.changes.trim().length > 0, `${r.record_id} changes`);
      assert.ok(Array.isArray(r.sources_checked) && r.sources_checked.length > 0, `${r.record_id} sources_checked`);
      for (const u of r.sources_checked) assert.match(u, /^https:\/\//, `${r.record_id} bad url ${u}`);
    }
  });

  test(`${stem}: needs_review is false only on an approved or fixed review with 2+ page-level sources from 2+ publishers`, () => {
    for (const rec of records) {
      const r = byId.get(rec.id);
      assert.equal(typeof rec.needs_review, "boolean", `${rec.id} needs_review`);
      assert.ok(Array.isArray(rec.sources) && rec.sources.length > 0, `${rec.id} has no sources`);
      for (const s of rec.sources) {
        assert.match(s.url, /^https?:\/\//, `${rec.id} bad source url`);
        assert.ok(s.publisher, `${rec.id} source missing publisher`);
        assert.ok(["page", "domain"].includes(s.source_confidence), `${rec.id} bad source_confidence`);
      }
      if (!r || r.status === "needs-human") {
        assert.equal(rec.needs_review, true, `${rec.id} is needs-human but needs_review is false`);
        continue;
      }
      if (rec.needs_review) continue;
      assert.ok(rec.sources.every((s) => s.source_confidence === "page"), `${rec.id} has a domain-level source`);
      const domains = new Set(rec.sources.map((s) => regDomain(s.url)));
      assert.ok(domains.size >= 2, `${rec.id} has ${domains.size} independent publisher(s)`);
    }
  });

  test(`${stem}: approved or fixed records are cleared for publishing`, () => {
    for (const rec of records) {
      const r = byId.get(rec.id);
      if (r && r.status !== "needs-human") assert.equal(rec.needs_review, false, `${rec.id} is ${r.status} but still needs_review`);
    }
  });

  test(`${stem}: no em dash in the data or the review`, () => {
    assert.ok(!dataText.includes("—"), `em dash in ${stem}.json`);
    assert.ok(!reviewText.includes("—"), `em dash in ${stem}-reviews.json`);
  });

  test(`${stem}: no drug doses`, () => {
    // Water and feed volumes (for example "250 to 500 ml per hen per day") are
    // fine; milligram amounts, per-kilo amounts and dose wording are not.
    assert.doesNotMatch(dataText, /\b\d+(\.\d+)?\s?(mg|mcg|cc|mg\/kg|ml\/kg)\b|\bdosage\b|\bdoses?\s+of\b/i, `${stem}.json looks like it gives a drug dose`);
  });
}
