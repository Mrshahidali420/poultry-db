// Minimal CSV line parser handling quoted fields (USDA CSVs quote every
// field and escape quotes by doubling them).

/**
 * Parse a full CSV text into an array of row arrays (including the header
 * row at index 0). Handles quoted fields containing commas/newlines... for
 * USDA's simpler exports (no embedded newlines in fields) a per-line split
 * is sufficient and much faster.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvLines(text) {
  const lines = text.split("\n");
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(splitCsvLine(line));
  }
  return rows;
}

export function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  fields.push(current.replace(/\r$/, ""));
  return fields;
}
