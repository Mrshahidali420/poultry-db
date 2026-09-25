// Minimal .xlsx reader (no dependency): reads the first worksheet via the
// zip reader, resolving shared strings and inline strings. Returns rows as
// objects keyed by the header row. Enough for a DAD-IS spreadsheet export.

import { listZipEntries, readZipEntry } from "./minizip.mjs";
import { decodeEntities } from "./html.mjs";

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(xml) {
  return decodeEntities([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
}

/**
 * @param {Buffer} buffer .xlsx file contents
 * @returns {Array<Record<string,string>>}
 */
export function readXlsxRows(buffer) {
  const entries = listZipEntries(buffer);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const sheetEntry = byName.get("xl/worksheets/sheet1.xml") ??
    entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheetEntry) throw new Error("No worksheet found in .xlsx");

  const shared = [];
  const sharedEntry = byName.get("xl/sharedStrings.xml");
  if (sharedEntry) {
    const xml = readZipEntry(buffer, sharedEntry).toString("utf8");
    for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(si[1]));
  }

  const sheet = readZipEntry(buffer, sheetEntry).toString("utf8");
  const grid = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1";
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(inner);
      else if (v !== undefined) value = decodeEntities(v);
      cells[columnIndex(ref)] = value;
    }
    grid.push(cells);
  }

  const nonEmpty = grid.filter((r) => r.some((v) => v && String(v).trim()));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => String(h ?? "").trim());
  return nonEmpty.slice(1).map((cells) => {
    const obj = {};
    header.forEach((key, idx) => {
      if (key) obj[key] = String(cells[idx] ?? "").trim();
    });
    return obj;
  });
}
