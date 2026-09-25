// Breed-name matching across sources. Wikipedia titles look like
// "Brahma chicken" or "Silkie (chicken breed)"; other sources say "Brahma"
// or "Silkie". breedKey() reduces all of them to a comparable key.

// Spelling variants seen across sources, mapped to the Wikipedia spelling.
const ALIASES = {
  barnvelder: "barnevelder",
  "barred rock": "plymouth rock",
  "barred plymouth rock": "plymouth rock",
  "white rock": "plymouth rock",
  "rhode island white": "rhode island white",
  "buff orpington": "orpington",
  "black australorp": "australorp",
  "speckled sussex": "sussex",
  "light sussex": "sussex",
  "salmon faverolles": "faverolles",
  "white leghorn": "leghorn",
  "brown leghorn": "leghorn",
  "silky": "silkie",
  "americana": "ameraucana",
  "turken": "naked neck",
  "cochin bantam": "cochin",
  maran: "marans",
  "black copper marans": "marans",
  "light brahma": "brahma",
  "cream legbar": "legbar",
  favorelles: "faverolles",
  "egyptian fayoumi": "fayoumi",
  "rosecomb bantam": "rosecomb",
  appenzeller: "appenzeller spitzhauben",
  cornish: "indian game",
  andalusian: "blue andalusian",
  nankin: "nankin bantam",
  bresse: "bresse gauloise",
  bielefelder: "bielefelder kennhuhn",
  "belgian antwerp d anvers": "barbu d anvers",
  friesan: "friesian",
  "swedish flower blommehona": "swedish flower",
  chabo: "japanese bantam",
};

/**
 * Normalize a breed name to a comparable key.
 * @param {string} name
 * @returns {string}
 */
export function breedKey(name) {
  if (!name) return "";
  let key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\((chicken breed|chicken|breed|bird|poultry)\)/g, " ")
    .replace(/\b(chickens?|breed|hen|fowl)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ALIASES[key]) key = ALIASES[key];
  return key;
}

/**
 * Build a lookup from breedKey -> breed id, using each breed's Wikipedia
 * name and its altnames.
 * @param {Array<{id:string,name:string,altnames?:string[]}>} breeds
 * @returns {Map<string,string>}
 */
export function buildBreedIndex(breeds) {
  const index = new Map();
  // Primary names first so an altname never shadows a real title.
  for (const breed of breeds) {
    const key = breedKey(breed.name);
    if (key && !index.has(key)) index.set(key, breed.id);
  }
  for (const breed of breeds) {
    for (const alt of breed.altnames ?? []) {
      const key = breedKey(alt);
      if (key && !index.has(key)) index.set(key, breed.id);
    }
  }
  return index;
}

/**
 * Normalize a disease name: "Botulism in Poultry" and "Botulism" match.
 * @param {string} name
 */
export function diseaseKey(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\((disease|poultry|bird|birds)\)/g, " ")
    .replace(/\bin (poultry|birds|chickens)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a lookup from diseaseKey -> disease id.
 * @param {Array<{id:string,name:string}>} diseases
 */
export function buildDiseaseIndex(diseases) {
  const index = new Map();
  for (const d of diseases) {
    const key = diseaseKey(d.name);
    if (key && !index.has(key)) index.set(key, d.id);
  }
  return index;
}

/**
 * Resolve a free-text breed name to a breed id, or null.
 * @param {Map<string,string>} index
 * @param {string} name
 */
export function resolveBreedId(index, name) {
  return index.get(breedKey(name)) ?? null;
}
