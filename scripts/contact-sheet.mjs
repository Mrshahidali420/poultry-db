// Prints a compact contact sheet (top candidate per query: title, width,
// mime) for a JSON list of queries, so picks can be reviewed cheaply before
// committing to a download list.
//   node scripts/contact-sheet.mjs queries.json
import { readFile } from "node:fs/promises";
import { pickBestPhoto } from "./lib/commons-edge.mjs";

const file = process.argv[2];
const items = JSON.parse(await readFile(file, "utf8"));

for (const [id, query] of items) {
  try {
    const { picks } = await pickBestPhoto(query);
    if (picks.length === 0) {
      console.log(`${id} :: NO PICK for "${query}"`);
      continue;
    }
    const top = picks.slice(0, 3).map((p) => `${p.title} (${p.width}x${p.height})`).join(" | ");
    console.log(`${id} :: ${top}`);
  } catch (e) {
    console.log(`${id} :: ERROR ${e.message}`);
  }
}
