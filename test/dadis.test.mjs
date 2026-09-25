import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { parseCsv } from "../scripts/lib/csv.mjs";
import { parseDadisRows } from "../scripts/lib/dadis.mjs";
import { buildBreedIndex } from "../scripts/lib/match.mjs";
import { readXlsxRows } from "../scripts/lib/xlsx.mjs";

const index = buildBreedIndex([{ id: "brahma-chicken", name: "Brahma chicken", altnames: [] }]);

test("parseDadisRows keeps chicken rows, maps loose headers and links to breeds.json", () => {
  const rows = parseCsv([
    "Species,Most common name of breed,Other names,Country,Transboundary name,Risk status,Population size,Population trend,Main uses",
    "Chicken,Brahma,Brahmapootra;Burnham,United States of America,Brahma,Not at risk,\"12,000\",Stable,Meat;Eggs",
    "Cattle,Holstein,,Netherlands,Holstein-Friesian,Not at risk,100000,Stable,Milk",
    "Chicken,Aseel,,Pakistan,,Unknown,,,Fighting",
  ].join("\n"));
  const out = parseDadisRows(rows, index);
  assert.equal(out.length, 2, "cattle row dropped");
  const brahma = out.find((r) => r.name === "Brahma");
  assert.equal(brahma.breed_id, "brahma-chicken");
  assert.equal(brahma.population_size, 12000);
  assert.deepEqual(brahma.other_names, ["Brahmapootra", "Burnham"]);
  assert.deepEqual(brahma.main_uses, ["Meat", "Eggs"]);
  assert.equal(brahma.risk_status, "Not at risk");
  const aseel = out.find((r) => r.name === "Aseel");
  assert.equal(aseel.breed_id, null);
  assert.equal(aseel.population_size, null);
});

test("parseDadisRows throws a clear error when no breed-name column exists", () => {
  assert.throws(() => parseDadisRows([{ Foo: "x" }], index), /breed-name column/);
});

// Build a tiny valid .xlsx in memory (stored/deflated zip entries).
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, "utf8"));
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

test("readXlsxRows reads shared strings, inline strings and numbers", () => {
  const xlsx = makeZip({
    "xl/sharedStrings.xml": '<sst><si><t>Species</t></si><si><t>Breed</t></si><si><t>Chicken</t></si><si><t>Brahma</t></si></sst>',
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Population size</t></is></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>500</v></c></row>' +
      '</sheetData></worksheet>',
  });
  const rows = readXlsxRows(xlsx);
  assert.deepEqual(rows, [{ Species: "Chicken", Breed: "Brahma", "Population size": "500" }]);
});
