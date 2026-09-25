import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestMatch, singular } from "../scripts/lib/usda-match.mjs";

function best(terms, descriptions) {
  return pickBestMatch(terms, descriptions.map((d, i) => [String(i), d]))?.description ?? null;
}

test("aliases are a fallback: used only when the name finds nothing (kiwi -> kiwifruit)", () => {
  assert.equal(best(["Kiwi", "kiwifruit"], ["Kiwifruit, green, raw"]), "Kiwifruit, green, raw");
});

test("hyphenated words stay whole (grass does not match grass-fed beef)", () => {
  assert.equal(best(["Grass"], ["Beef, grass-fed, ground, raw"]), null);
});

test("singular handles -s, -es and -ies plurals", () => {
  assert.equal(singular("bananas"), "banana");
  assert.equal(singular("tomatoes"), "tomato");
  assert.equal(singular("cherries"), "cherry");
  assert.equal(singular("grass"), "grass");
});

test("the food's own name beats an alias (bananas, not plantains)", () => {
  assert.equal(best(["Bananas", "plantains"], ["Plantains, green, raw", "Bananas, raw"]), "Bananas, raw");
});

test("the whole fruit beats a part (grapes, not grape leaves)", () => {
  assert.equal(
    best(["Grapes"], ["Grape leaves, raw", "Grapes, red or green (European type, such as Thompson seedless), raw"]),
    "Grapes, red or green (European type, such as Thompson seedless), raw"
  );
});

test("a closer head word wins (potatoes, not sweet potato)", () => {
  assert.equal(best(["Potatoes"], ["Sweet potato, raw, unprepared", "Potatoes, flesh and skin, raw"]), "Potatoes, flesh and skin, raw");
});

test("USDA boilerplate does not create a match (cat food)", () => {
  assert.equal(best(["Cat food"], ["Pears, raw, bartlett (Includes foods for USDA's Food Distribution Program)"]), null);
});

test("words spread across a fast-food item do not match (dog food)", () => {
  assert.equal(best(["Dog food"], ["Fast foods, hot dog, plain"]), null);
});

test("raw legumes beat a stew liquid (kidney beans)", () => {
  assert.equal(
    best(["Kidney beans"], ["Beans, liquid from stewed kidney beans", "Beans, kidney, all types, mature seeds, raw"]),
    "Beans, kidney, all types, mature seeds, raw"
  );
});

test("the real food beats an imitation (bacon)", () => {
  assert.equal(best(["Bacon"], ["Bacon, meatless", "Pork, cured, bacon, unprepared"]), "Pork, cured, bacon, unprepared");
});

test("a brand item loses to the plain food (sage)", () => {
  assert.equal(best(["Sage"], ["Sage Valley, Gluten Free Vanilla Sandwich Cookies", "Spices, sage, ground"]), "Spices, sage, ground");
});

test("a brand that IS the food still matches (Cheerios)", () => {
  assert.equal(best(["Cheerios"], ["Cereals ready-to-eat, GENERAL MILLS, CHEERIOS"]), "Cereals ready-to-eat, GENERAL MILLS, CHEERIOS");
});

test("'without peel' does not count as naming a part (lemons)", () => {
  assert.equal(best(["Lemons"], ["Lemon peel, raw", "Lemons, raw, without peel"]), "Lemons, raw, without peel");
});

test("a brand whose name contains the food still loses (olives, not OLIVE GARDEN)", () => {
  assert.equal(best(["Olives"], ["OLIVE GARDEN, lasagna classico", "Olives, ripe, canned (small-extra large)"]), "Olives, ripe, canned (small-extra large)");
});

test("a one-word term that is only the tail of another food's name does not match (grass)", () => {
  assert.equal(best(["Grass"], ["Lemon grass (citronella), raw"]), null);
});

test("a parenthetical gloss is the same food (cilantro)", () => {
  assert.equal(best(["Cilantro"], ["Coriander (cilantro) leaves, raw"]), "Coriander (cilantro) leaves, raw");
});

test("USDA's word for bell peppers is 'sweet'", () => {
  assert.equal(best(["Bell peppers", "peppers"], ["Peppers, jalapeno, raw", "Peppers, sweet, red, raw"]), "Peppers, sweet, red, raw");
});

test("the name beats an alias even when the alias heads the description (kelp)", () => {
  assert.equal(best(["Kelp", "seaweed"], ["Seaweed, irishmoss, raw", "Seaweed, kelp, raw"]), "Seaweed, kelp, raw");
});

test("seed foods are not penalised for naming seeds (flaxseed, sunflower seeds)", () => {
  assert.equal(best(["Flaxseed"], ["Seeds, flaxseed"]), "Seeds, flaxseed");
  assert.equal(best(["Sunflower seeds"], ["Seeds, sunflower seed kernels, dried"]), "Seeds, sunflower seed kernels, dried");
});

test("the plain food beats a 'with' dish (cottage cheese)", () => {
  assert.equal(
    best(["Cottage cheese"], ["Cheese, cottage, with vegetables", "Cheese, cottage, creamed, large or small curd"]),
    "Cheese, cottage, creamed, large or small curd"
  );
});

test("a restaurant item loses even when its last segment is the food (french fries)", () => {
  assert.equal(best(["French fries"], ["DENNY'S, french fries", "McDONALD'S, french fries"]), null);
});

test("a condiment named after the food is not the food (hot dogs)", () => {
  assert.equal(best(["Hot dogs", "frankfurter"], ["Pickle relish, hot dog", "Frankfurter, beef, unheated"]), "Frankfurter, beef, unheated");
});

test("a dangling '-fry' fragment is not the word fry (french fries alias 'fries')", () => {
  assert.equal(best(["French fries", "fries"], ["Tortillas, ready-to-bake or -fry, corn"]), null);
});
