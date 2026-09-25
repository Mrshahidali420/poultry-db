// Minimal ZIP reader (no external dependency): parses the End Of Central
// Directory + Central Directory records, then reads each requested entry's
// local file header and inflates it with Node's built-in zlib. Supports
// STORED (0) and DEFLATE (8) compression, which covers USDA's SR Legacy
// CSV bundle. Not a general-purpose ZIP64 implementation.

import { inflateRawSync, createInflateRaw } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

/**
 * Stream one DEFLATE/STORED entry line by line without holding the whole
 * decompressed file in memory (FAOSTAT's CSV is hundreds of MB unpacked).
 * @param {Buffer} buffer
 * @param {{localHeaderOffset:number, method:number, compressedSize:number, name:string}} entry
 * @param {(line: string) => void} onLine
 */
export async function forEachZipEntryLine(buffer, entry, onLine) {
  const off = entry.localHeaderOffset;
  const nameLength = buffer.readUInt16LE(off + 26);
  const extraLength = buffer.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  const source = Readable.from([compressed]);
  let stream = source;
  if (entry.method === 8) stream = source.pipe(createInflateRaw());
  else if (entry.method !== 0) throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) onLine(line);
}

/**
 * @param {Buffer} buffer full zip file contents
 * @returns {Array<{name: string, compressedSize: number, uncompressedSize: number, localHeaderOffset: number, method: number}>}
 */
export function listZipEntries(buffer) {
  // Find End Of Central Directory record (signature 0x06054b50), scanning
  // from the end since a comment field may follow it.
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP file (EOCD not found)");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let offset = centralDirOffset;
  const CENTRAL_SIG = 0x02014b50;

  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIG) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Extract and decompress one entry's data given its central-directory record.
 * @param {Buffer} buffer
 * @param {{localHeaderOffset:number, method:number, compressedSize:number}} entry
 * @returns {Buffer}
 */
export function readZipEntry(buffer, entry) {
  const LOCAL_SIG = 0x04034b50;
  const off = entry.localHeaderOffset;
  if (buffer.readUInt32LE(off) !== LOCAL_SIG) {
    throw new Error(`Bad local file header for ${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(off + 26);
  const extraLength = buffer.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}
