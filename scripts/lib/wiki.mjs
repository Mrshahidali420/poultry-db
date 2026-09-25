// Wikipedia / Wikimedia Commons helpers: wikitext fetch, category listing,
// a generic MediaWiki template parser, a wikitext-to-plain-text stripper,
// and Commons image metadata lookup.

import { politeFetchJson } from "./http.mjs";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

/**
 * Fetch the raw wikitext of a page via action=parse.
 * @param {string} title
 * @returns {Promise<{title: string, wikitext: string}|null>} null if the page does not exist
 */
export async function fetchWikitext(title) {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", title);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("redirects", "1");

  const json = await politeFetchJson(url.toString());
  if (json.error) {
    return null;
  }
  return {
    title: json.parse.title,
    wikitext: json.parse.wikitext,
  };
}

/**
 * Fetch the full plain-text extract of a page via action=query&prop=extracts.
 * Unlike fetchWikitext (raw wikitext), this returns MediaWiki's own
 * plain-text rendering (explaintext=1) of the whole article.
 * @param {string} title
 * @returns {Promise<{title: string, extract: string}|null>} null if the page does not exist
 */
export async function fetchArticleExtract(title) {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await politeFetchJson(url.toString());
  const page = json.query?.pages?.[0];
  if (!page || page.missing) return null;
  return { title: page.title, extract: page.extract ?? "" };
}

/**
 * Look up a page's Wikidata item id (for Commons category resolution) via
 * action=query&prop=pageprops.
 * @param {string} title
 * @returns {Promise<string|null>} e.g. "Q123456"
 */
export async function fetchWikidataItem(title) {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "pageprops");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await politeFetchJson(url.toString());
  const page = json.query?.pages?.[0];
  return page?.pageprops?.wikibase_item ?? null;
}

/**
 * Fetch a Wikidata entity's claims and pull out the Commons category (P373)
 * if present.
 * @param {string} qid e.g. "Q123456"
 * @returns {Promise<string|null>} bare category name, e.g. "Brahma chicken"
 */
export async function fetchCommonsCategoryFromWikidata(qid) {
  if (!qid) return null;
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetclaims");
  url.searchParams.set("entity", qid);
  url.searchParams.set("property", "P373");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await politeFetchJson(url.toString());
  const claims = json.claims?.P373;
  const value = claims?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? value : null;
}

/**
 * List image (File:) titles inside a Commons category (one level, no
 * subcategories), up to `limit`.
 * @param {string} category bare category name (no "Category:" prefix needed)
 * @param {number} [limit]
 * @returns {Promise<string[]>}
 */
export async function fetchCommonsCategoryImages(category, limit = 20) {
  const title = category.startsWith("Category:") ? category : `Category:${category}`;
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "categorymembers");
  url.searchParams.set("cmtitle", title);
  url.searchParams.set("cmtype", "file");
  url.searchParams.set("cmlimit", String(limit));
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await politeFetchJson(url.toString());
  return (json.query?.categorymembers ?? []).map((m) => m.title);
}

/**
 * Look up a page's lead image (pageimages) plus its Commons filename.
 * @param {string} title
 * @returns {Promise<string|null>} bare file name, e.g. "Foo.jpg"
 */
export async function fetchPageLeadImage(title) {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "name");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await politeFetchJson(url.toString());
  const page = json.query?.pages?.[0];
  return page?.pageimage ?? null;
}

/**
 * List all page titles in a category (non-recursive, one level).
 * @param {string} category e.g. "Category:Chicken breeds"
 * @returns {Promise<string[]>}
 */
export async function fetchCategoryMembers(category) {
  const titles = [];
  let cmcontinue;

  do {
    const url = new URL(WIKI_API);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "categorymembers");
    url.searchParams.set("cmtitle", category);
    url.searchParams.set("cmlimit", "500");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    if (cmcontinue) url.searchParams.set("cmcontinue", cmcontinue);

    const json = await politeFetchJson(url.toString());
    for (const member of json.query?.categorymembers ?? []) {
      titles.push(member.title);
    }
    cmcontinue = json.continue?.cmcontinue;
  } while (cmcontinue);

  return titles;
}

/**
 * List subcategories of a category (one level).
 * @param {string} category
 * @returns {Promise<string[]>}
 */
export async function fetchSubcategories(category) {
  const members = await fetchCategoryMembers(category);
  return members.filter((title) => title.startsWith("Category:"));
}

/**
 * Split a MediaWiki template's raw parameter string into pipe-separated
 * segments, respecting nested {{ }}, [[ ]] and <ref>...</ref> so commas and
 * pipes inside those do not break the split.
 * @param {string} body text between the first "|" and the closing "}}"
 * @returns {string[]}
 */
function splitTemplateParams(body) {
  const parts = [];
  let depthBrace = 0;
  let depthBracket = 0;
  let current = "";

  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{") {
      depthBrace += 1;
      current += two;
      i += 1;
      continue;
    }
    if (two === "}}") {
      depthBrace = Math.max(0, depthBrace - 1);
      current += two;
      i += 1;
      continue;
    }
    if (two === "[[") {
      depthBracket += 1;
      current += two;
      i += 1;
      continue;
    }
    if (two === "]]") {
      depthBracket = Math.max(0, depthBracket - 1);
      current += two;
      i += 1;
      continue;
    }
    if (body[i] === "|" && depthBrace === 0 && depthBracket === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += body[i];
  }
  if (current.length) parts.push(current);
  return parts;
}

/**
 * Find and parse the first invocation of a given template in wikitext.
 * Handles nested {{ }} / [[ ]] inside parameter values.
 * @param {string} wikitext
 * @param {string} templateName e.g. "infobox poultry breed" (case/space/underscore insensitive)
 * @returns {Record<string,string>|null} field map (unset keys absent), or null if not found
 */
export function parseTemplate(wikitext, templateName) {
  const normalizedTarget = templateName.trim().toLowerCase().replace(/_/g, " ");

  // Find candidate start positions of "{{" and check the template name after it.
  for (let i = 0; i < wikitext.length; i++) {
    if (wikitext[i] !== "{" || wikitext[i + 1] !== "{") continue;

    // Extract the name right after "{{" up to the first "|" or "}}" at depth 0,
    // ignoring newlines/whitespace.
    let j = i + 2;
    let nameEnd = -1;
    for (let k = j; k < wikitext.length - 1; k++) {
      if (wikitext[k] === "|" || (wikitext[k] === "}" && wikitext[k + 1] === "}")) {
        nameEnd = k;
        break;
      }
    }
    if (nameEnd === -1) continue;
    const candidateName = wikitext.slice(j, nameEnd).trim().toLowerCase().replace(/_/g, " ");
    if (candidateName !== normalizedTarget) continue;

    // Walk forward tracking brace depth to find the matching closing "}}".
    let depth = 1;
    let pos = i + 2;
    while (pos < wikitext.length && depth > 0) {
      if (wikitext[pos] === "{" && wikitext[pos + 1] === "{") {
        depth += 1;
        pos += 2;
        continue;
      }
      if (wikitext[pos] === "}" && wikitext[pos + 1] === "}") {
        depth -= 1;
        pos += 2;
        continue;
      }
      pos += 1;
    }
    const fullMatch = wikitext.slice(i, pos); // "{{...}}"
    const inner = fullMatch.slice(2, -2);
    const pipeIndex = inner.indexOf("|");
    if (pipeIndex === -1) return {};
    const body = inner.slice(pipeIndex + 1);
    const segments = splitTemplateParams(body);

    const fields = {};
    let positionalIndex = 1;
    for (const segment of segments) {
      const eqIndex = findTopLevelEquals(segment);
      if (eqIndex === -1) {
        fields[String(positionalIndex)] = segment.trim();
        positionalIndex += 1;
      } else {
        const key = segment.slice(0, eqIndex).trim().toLowerCase();
        const value = segment.slice(eqIndex + 1).trim();
        fields[key] = value;
      }
    }
    return fields;
  }
  return null;
}

/** Find the first "=" not inside {{}} or [[]]. */
function findTopLevelEquals(segment) {
  let depthBrace = 0;
  let depthBracket = 0;
  for (let i = 0; i < segment.length; i++) {
    const two = segment.slice(i, i + 2);
    if (two === "{{") { depthBrace += 1; i += 1; continue; }
    if (two === "}}") { depthBrace = Math.max(0, depthBrace - 1); i += 1; continue; }
    if (two === "[[") { depthBracket += 1; i += 1; continue; }
    if (two === "]]") { depthBracket = Math.max(0, depthBracket - 1); i += 1; continue; }
    if (segment[i] === "=" && depthBrace === 0 && depthBracket === 0) return i;
  }
  return -1;
}

/**
 * Strip common wiki markup down to plain text:
 * {{r|...}} refs, [[link|text]] and [[link]], '''bold'''/''italic'',
 * <ref>...</ref> footnotes, <!--comments-->, remaining {{templates}}, HTML tags.
 * @param {string} text
 * @returns {string}
 */
export function stripWikiMarkup(text) {
  if (!text) return "";
  let out = text;

  // Remove HTML comments.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // Remove <ref>...</ref> and self-closing <ref .../>.
  out = out.replace(/<ref[^>]*\/>/gi, "");
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // Remove any remaining templates {{...}}, handling one level of nesting.
  out = removeTemplates(out);
  // [[link|text]] -> text ; [[link]] -> link
  out = out.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2");
  out = out.replace(/\[\[([^\]]*)\]\]/g, "$1");
  // External links [http://... text] -> text
  out = out.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1");
  out = out.replace(/\[https?:\/\/[^\s\]]+\]/g, "");
  // Bold/italic markers.
  out = out.replace(/'''''/g, "").replace(/'''/g, "").replace(/''/g, "");
  // Remaining HTML tags.
  out = out.replace(/<[^>]+>/g, "");
  // Collapse whitespace.
  out = out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  return out;
}

/** Remove {{templates}}, including nested ones. */
function removeTemplates(text) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (text[i] === "}" && text[i + 1] === "}") {
      if (depth > 0) depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0) out += text[i];
  }
  return out;
}

/**
 * Extract the first plain-text paragraph (the lead summary) from article
 * wikitext, skipping infoboxes/templates/tables/leading blank lines.
 * @param {string} wikitext
 * @returns {string}
 */
export function extractSummary(wikitext) {
  let body = removeTemplates(wikitext);
  // Drop wiki tables {| ... |}
  body = body.replace(/\{\|[\s\S]*?\|\}/g, "");
  const lines = body.split("\n").map((l) => l.trim());
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("=") || line.startsWith("[[File:") || line.startsWith("[[Image:")) continue;
    const plain = stripWikiMarkup(line);
    if (plain.length > 40) return plain;
  }
  return "";
}

/**
 * Full article plain text for the LLM: drops templates, tables, file
 * links and the trailing References / See also / External links sections,
 * keeps section headings as plain lines.
 * @param {string} wikitext
 * @returns {string}
 */
export function articlePlainText(wikitext) {
  let body = wikitext.split(/\n==\s*(References|Notes|See also|External links|Further reading|Sources|Bibliography)\s*==/i)[0];
  body = removeTemplates(body)
    .replace(/\{\|[\s\S]*?\|\}/g, "")
    .replace(/\[\[(File|Image):[^\]]*(\[\[[^\]]*\]\][^\]]*)*\]\]/gi, "")
    .replace(/^=+\s*(.*?)\s*=+\s*$/gm, "\n$1:");
  return stripWikiMarkup(body).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Parse a raw numeric weight-in-kg from a free-text weight field such as
 * "5.5 kg", "3-4 kg", "8 lb", "3–4 lb 8 oz", "7-9 lbs". Returns the average
 * of a range, converting pounds to kilograms as needed.
 * @param {string} raw
 * @returns {number|null}
 */
export function parseWeightKg(raw) {
  if (!raw) return null;
  const text = stripWikiMarkup(raw).toLowerCase();

  // Collect all numbers found, and detect unit.
  const isLb = /\blbs?\.?\b|\bpounds?\b/.test(text) && !/\bkg\b|\bkilograms?\b/.test(text);
  const numberMatches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (numberMatches.length === 0) return null;

  let valueInOriginalUnit;
  if (numberMatches.length >= 2) {
    // Could be a range "3-4" or a range like "7 lb 8 oz" -> not a simple range.
    // Heuristic: if unit is lb and there appear to be two ranges of the same
    // magnitude, average them as a range.
    valueInOriginalUnit = (numberMatches[0] + numberMatches[1]) / 2;
  } else {
    valueInOriginalUnit = numberMatches[0];
  }

  const kg = isLb ? valueInOriginalUnit * 0.453592 : valueInOriginalUnit;
  return Math.round(kg * 100) / 100;
}

/**
 * Look up Commons image metadata (URL, license, author) for a file name.
 * @param {string} fileName e.g. "Brahma hen.jpg" (with or without "File:" prefix)
 * @param {{urlWidth?: number}} [options] pass urlWidth to get a thumbnail URL/size at that width
 * @returns {Promise<object|null>}
 */
export async function fetchCommonsImageInfo(fileName, options = {}) {
  const title = fileName.startsWith("File:") || fileName.startsWith("Image:")
    ? fileName
    : `File:${fileName}`;

  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|extmetadata");
  if (options.urlWidth) url.searchParams.set("iiurlwidth", String(options.urlWidth));
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await politeFetchJson(url.toString());
  const page = json.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo?.length) return null;

  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const licenseName = meta.LicenseShortName?.value ?? null;
  const licenseUrl = meta.LicenseUrl?.value ?? null;
  const author = meta.Artist?.value ? stripWikiMarkup(meta.Artist.value) : null;
  const requiresAttribution = !(licenseName && /public domain|pd-/i.test(licenseName));

  return {
    file: fileName.replace(/^File:|^Image:/, ""),
    commons_url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    thumb_url: info.thumburl ?? info.url ?? null,
    full_url: info.url ?? null,
    width: info.thumburl ? info.thumbwidth ?? info.width ?? null : info.width ?? null,
    height: info.thumburl ? info.thumbheight ?? info.height ?? null : info.height ?? null,
    license: licenseName,
    license_url: licenseUrl,
    author,
    attribution_required: requiresAttribution,
  };
}

export { removeTemplates };
