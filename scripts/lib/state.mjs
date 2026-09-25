// Resumable-queue state: state/queue.json holds a per-item processing status
// so the LLM enrichment step (and any other batchable step) can pick up
// where it left off across GitHub Actions runs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_DIR = path.resolve("state");
const QUEUE_FILE = path.join(STATE_DIR, "queue.json");

/** @typedef {"pending"|"done"|"error"} QueueStatus */
/** @typedef {{id: string, status: QueueStatus, attempts: number, last_error: string|null, updated_at: string}} QueueItem */

/**
 * Load the full queue file: { [queueName]: { [id]: QueueItem } }.
 * @returns {Promise<Record<string, Record<string, QueueItem>>>}
 */
export async function loadQueueFile() {
  try {
    const raw = await readFile(QUEUE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Persist the full queue file, sorted for deterministic diffs.
 * @param {Record<string, Record<string, QueueItem>>} queues
 */
export async function saveQueueFile(queues) {
  await mkdir(STATE_DIR, { recursive: true });
  const sorted = {};
  for (const queueName of Object.keys(queues).sort()) {
    const items = queues[queueName];
    const sortedItems = {};
    for (const id of Object.keys(items).sort()) {
      sortedItems[id] = items[id];
    }
    sorted[queueName] = sortedItems;
  }
  await writeFile(QUEUE_FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

/**
 * Ensure every id in `ids` has an entry in the named queue (default: pending),
 * without disturbing existing entries. Returns the updated queues object.
 * @param {Record<string, Record<string, QueueItem>>} queues
 * @param {string} queueName
 * @param {string[]} ids
 */
export function ensureQueueItems(queues, queueName, ids) {
  const queue = queues[queueName] ?? {};
  for (const id of ids) {
    if (!queue[id]) {
      queue[id] = {
        id,
        status: "pending",
        attempts: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
    }
  }
  queues[queueName] = queue;
  return queues;
}

/**
 * Get ids in a queue with a given status, in stable (sorted) order.
 * @param {Record<string, Record<string, QueueItem>>} queues
 * @param {string} queueName
 * @param {QueueStatus} status
 */
export function getIdsByStatus(queues, queueName, status) {
  const queue = queues[queueName] ?? {};
  return Object.values(queue)
    .filter((item) => item.status === status)
    .map((item) => item.id)
    .sort();
}

/**
 * Mark an item's outcome and bump its attempt counter.
 * @param {Record<string, Record<string, QueueItem>>} queues
 * @param {string} queueName
 * @param {string} id
 * @param {QueueStatus} status
 * @param {string|null} [error]
 */
export function markItem(queues, queueName, id, status, error = null) {
  const queue = queues[queueName] ?? {};
  const existing = queue[id] ?? { id, status: "pending", attempts: 0, last_error: null };
  queue[id] = {
    id,
    status,
    attempts: (existing.attempts ?? 0) + 1,
    last_error: error,
    updated_at: new Date().toISOString(),
  };
  queues[queueName] = queue;
  return queues;
}
