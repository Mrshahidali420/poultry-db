// Parses the free-form keyword/volume/KD notes out of the research markdown
// files into structured rows: { entity_type, entity_id, keyword_or_label,
// volume, kd, source_file }.

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parse a volume string like "14,800", "1.9K", "33.1K", "2,555,020" into a number.
 * @param {string} raw
 * @returns {number|null}
 */
export function parseVolume(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const match = /^(\d+(?:\.\d+)?)\s*([kKmM])?$/.exec(cleaned);
  if (!match) return null;
  let value = Number(match[1]);
  if (match[2]?.toLowerCase() === "k") value *= 1000;
  if (match[2]?.toLowerCase() === "m") value *= 1_000_000;
  return Math.round(value);
}

/**
 * Parse a KD (keyword difficulty) cell, which may be a plain number, a
 * range "13-17" (returns the average), or a dash/blank (returns null).
 * @param {string} raw
 * @returns {number|null}
 */
export function parseKd(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[()%]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(cleaned);
  if (rangeMatch) {
    return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  }
  const single = /^(\d+(?:\.\d+)?)/.exec(cleaned);
  return single ? Number(single[1]) : null;
}

/**
 * Parse a markdown pipe table into rows of cell arrays, given the raw text
 * and the exact expected first header cell (case-insensitive) to locate it.
 * Skips the header row and the "---" separator row.
 * @param {string} text
 * @param {string} headerFirstCell
 * @returns {string[][]}
 */
export function parsePipeTable(text, headerFirstCell) {
  const lines = text.split("\n");
  const rows = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inTable) break;
      continue;
    }
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === 0 && arr[0] === "") && !(idx === arr.length - 1 && arr[arr.length - 1] === ""));

    if (!inTable) {
      if (cells[0]?.toLowerCase() === headerFirstCell.toLowerCase()) {
        inTable = true;
      }
      continue;
    }
    // Skip the "---|---|---" separator row.
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

/**
 * Extract "<label> <volume>/<kd>" style entries from free text, e.g.
 * "grapes 14,800/28 · tomatoes 12,100/19" or "brahma 33.1K/32".
 * Entries are separated by "·", newlines, or sit on their own line.
 * @param {string} text
 * @returns {Array<{label: string, volume: number|null, kd: number|null}>}
 */
export function parseInlineKeywordList(text) {
  const results = [];
  const pattern = /([a-z][a-z0-9 ,'/-]{1,60}?)\s+([\d,]+(?:\.\d+)?[kKmM]?)\s*\/\s*(\d+(?:\.\d+)?)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const label = match[1].trim().replace(/^[·,\s]+/, "");
    if (!label || /^\s*$/.test(label)) continue;
    results.push({
      label,
      volume: parseVolume(match[2]),
      kd: parseKd(match[3]),
    });
  }
  return results;
}
