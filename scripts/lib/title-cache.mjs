// Remembers, per candidate Wikipedia title, what checking it produced: the
// id of the record it resolved to, or null when it was rejected (not a
// breed, missing page). Without this, every run re-fetches the ~500 titles
// the breed list links to that are not breeds, plus every title that
// redirects to a page with a different name.
//
// Stored in state/wiki_titles.json: { [scope]: { [title]: { id, checked_at } } }

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve("state/wiki_titles.json");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function loadTitleCache() {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export async function saveTitleCache(cache) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const sorted = {};
  for (const scope of Object.keys(cache).sort()) {
    sorted[scope] = Object.fromEntries(Object.entries(cache[scope]).sort(([a], [b]) => a.localeCompare(b)));
  }
  await writeFile(FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

/**
 * Look up a title checked in the last 30 days.
 * @returns {{id: string|null}|null}  null when unknown or stale
 */
export function recentTitle(cache, scope, title, now = Date.now()) {
  const entry = cache[scope]?.[title];
  if (!entry) return null;
  if (now - new Date(entry.checked_at).getTime() >= THIRTY_DAYS_MS) return null;
  return { id: entry.id };
}

export function recordTitle(cache, scope, title, id, now = new Date()) {
  cache[scope] ??= {};
  cache[scope][title] = { id, checked_at: now.toISOString() };
  return cache;
}
