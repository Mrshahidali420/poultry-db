// Matching a food name ("Bananas", "Cottage cheese") to the best USDA SR
// Legacy description ("Bananas, raw", "Cheese, cottage, creamed..."). A
// wrong match is worse than no match: unmatched foods are listed for a
// person to handle, a wrong one silently ships wrong nutrition numbers.

export function singular(word) {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

// Where USDA uses a different word for the same food.
const SYNONYMS = { bell: "sweet", garbanzo: "chickpea" };

export function tokens(text) {
  return text.toLowerCase()
    .replace(/(^|\s)-[a-z]+/g, " ")      // dangling "-fry" in "ready-to-bake or -fry"
    .replace(/([a-z])-([a-z])/g, "$1$2") // "grass-fed" is one word, not "grass"
    .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
    .map(singular).map((t) => SYNONYMS[t] ?? t);
}

// USDA boilerplate that would otherwise supply a free "food" word match.
const BOILERPLATE = /\((includes|formerly)[^)]*\)/gi;
// Plant/animal parts: only a good match when the term asks for them.
const PART_WORDS = new Set(["leaf", "leave", "juice", "seed", "flour", "oil", "peel", "green", "sprout", "kernel", "butter", "powder", "concentrate", "nectar", "bran", "germ"]);
// First segments that are a category or a restaurant/brand dish, not the food itself.
const GENERIC_HEADS = /^(fast foods?|restaurants?|babyfoods?|baby foods?|snacks?|meals?|entrees?|dish(es)?|school lunch)\b/;

export const MATCH_THRESHOLD = 0.9;
export const BEST_SCORE = 1.35; // all words + head-word bonus + raw bonus

function containsPhrase(haystack, needle) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Score an SR Legacy description against a search term; -Infinity when it
 * is not a valid match at all.
 * @param {string} term
 * @param {string} description
 * @param {boolean} [isAlias]  aliases lose ties to the food's own name
 */
export function scoreMatch(term, description, isAlias = false) {
  const termTokens = tokens(term);
  if (!termTokens.length) return -Infinity;
  const clean = description.replace(BOILERPLATE, " ");
  const segments = clean.split(",").map((s) => tokens(s));
  const allTokens = segments.flat();
  const descSet = new Set(allTokens);

  // Every word of the term must appear.
  if (!termTokens.every((t) => descSet.has(t))) return -Infinity;

  const head = clean.split(",")[0].trim().toLowerCase();
  const firstTwo = new Set([...(segments[0] ?? []), ...(segments[1] ?? [])]);
  if (termTokens.length > 1) {
    const inFirstTwo = termTokens.every((t) => firstTwo.has(t)) && !GENERIC_HEADS.test(head);
    if (!containsPhrase(allTokens, termTokens) && !inFirstTwo) return -Infinity;
  }

  const desc = clean.toLowerCase();
  const termSet = new Set(termTokens);
  const firstSegment = new Set(segments[0] ?? []);
  // Parenthetical glosses ("Coriander (cilantro) leaves") are the same food,
  // so they are left out of the compound check below.
  const headTokens = tokens(clean.split(",")[0].replace(/\([^)]*\)/g, " "));
  let score = 1;
  // "Lemon grass" is not grass, "Sweet potato" is not potatoes: when a
  // one-word term is only the tail of a compound head, it is another food.
  const isCompoundTail = termTokens.length === 1 && headTokens.length > 1 &&
    headTokens.indexOf(termTokens[0]) > 0;
  if (isCompoundTail) {
    score -= 0.35;
  } else if (termTokens.every((t) => firstSegment.has(t))) {
    score += 0.2;
    // Fewer extra words in the head segment means a closer match.
    score -= 0.05 * Math.max(0, firstSegment.size - termTokens.length);
  }
  if (/,\s*raw\b/.test(desc) || /\braw,/.test(desc)) score += 0.15;
  // Dried is the normal state of seeds and nuts, so it only counts against other foods.
  const seedOrNutTerm = termTokens.some((t) => /seed|nut/.test(t));
  const processed = seedOrNutTerm
    ? /cooked|canned|boiled|fried|dehydrated|sauce|syrup|frozen|sweetened/
    : /cooked|canned|boiled|fried|dried|dehydrated|sauce|syrup|frozen|sweetened/;
  if (processed.test(desc)) score -= 0.08;
  // Composite dishes and by-products are not the food itself.
  if (/\b(stew|stewed|liquid|soup|salad|sandwich|breadstick|loaf|extract|casserole|relish|topping|dressing|seasoning|mix)\b/.test(desc)) score -= 0.15;
  // Imitations and substitutes.
  if (/\b(meatless|imitation|substitute|analog)\b/.test(desc)) score -= 0.3;
  // Dishes "with" another ingredient ("Cheese, cottage, with vegetables").
  if (/\bwith (?!skin|peel|salt|added)[a-z]+/.test(desc)) score -= 0.05;
  // Brand and restaurant items are written in capitals (DENNY'S, SILK, OLIVE
  // GARDEN). Exempt only when the food's own name is the capitalised brand
  // segment (CHEERIOS), not a plain segment after a restaurant (DENNY'S, french fries).
  const hasBrand = /[A-Z]{3,}/.test(clean); // a run of capitals, also inside McDONALD'S
  const lastRaw = clean.split(",").at(-1).trim();
  const lastSegment = segments.at(-1) ?? [];
  const brandIsTheFood = lastRaw === lastRaw.toUpperCase() &&
    lastSegment.length === termTokens.length && termTokens.every((t) => lastSegment.includes(t));
  if (hasBrand && !brandIsTheFood) score -= 0.3;
  // Traditional regional foods (Hopi, Navajo, Alaska Native...) lose to the common form.
  if (/\((hopi|navajo|apache|alaska native|northern plains indians|shoshone bannock)\)/i.test(description)) score -= 0.25;
  // Parts count against a match unless the term asks for them; "without peel",
  // "with skin" and "mature seeds" (legumes) describe the whole food.
  const rawTokens = clean.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  // The part is the food itself when the term already names it ("flaxseed"
  // contains "seed"; sunflower seed "kernels" are the seeds).
  const termIsSeedOrNut = termTokens.some((t) => /seed|nut/.test(t));
  const namesPart = rawTokens.some((word, i) => {
    const part = singular(word);
    if (!PART_WORDS.has(part) || termSet.has(part)) return false;
    if (termTokens.some((t) => t.includes(part))) return false;
    if (part === "kernel" && termIsSeedOrNut) return false;
    return !/^(without|with|mature|immature)$/.test(rawTokens[i - 1] ?? "");
  });
  if (namesPart) score -= 0.2;
  if (GENERIC_HEADS.test(head)) score -= 0.15;
  score -= 0.005 * allTokens.length; // shorter, more specific descriptions win ties
  if (isAlias) score -= 0.05;
  return score;
}

function bestFor(term, entries, isAlias) {
  let best = null;
  for (const [id, description] of entries) {
    const score = scoreMatch(term, description, isAlias);
    if (score > (best?.score ?? -Infinity)) best = { id, description, score, term };
  }
  return best;
}

/**
 * Pick the best USDA item for a food. The food's own name is tried first;
 * aliases are only used when the name finds no valid match, so an alias can
 * never beat a good match on the name ("Bananas" never lands on plantains).
 * @param {string[]} terms  [name, ...aliases]
 * @param {Iterable<[string, string]>} entries  [fdc_id, description]
 * @returns {{id:string, description:string, score:number, term:string}|null}
 */
export function pickBestMatch(terms, entries) {
  const list = Array.isArray(entries) ? entries : [...entries];
  const [name, ...aliases] = terms;
  const byName = bestFor(name, list, false);
  if (byName && byName.score >= MATCH_THRESHOLD) return byName;
  let best = byName;
  for (const alias of aliases) {
    const hit = bestFor(alias, list, true);
    if (hit && hit.score > (best?.score ?? -Infinity)) best = hit;
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

/** Best score seen, for reporting how close an unmatched food came. */
export function bestScoreFor(terms, entries) {
  const list = Array.isArray(entries) ? entries : [...entries];
  return Math.max(...terms.map((t, i) => bestFor(t, list, i > 0)?.score ?? -Infinity));
}
