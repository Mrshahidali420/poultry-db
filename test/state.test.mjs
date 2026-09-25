import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureQueueItems, getIdsByStatus, markItem } from "../scripts/lib/state.mjs";

test("ensureQueueItems seeds new ids as pending without touching existing ones", () => {
  let queues = {};
  queues = ensureQueueItems(queues, "breeds_extra", ["brahma", "silkie"]);
  assert.equal(queues.breeds_extra.brahma.status, "pending");
  assert.equal(queues.breeds_extra.silkie.status, "pending");

  queues = markItem(queues, "breeds_extra", "brahma", "done");
  queues = ensureQueueItems(queues, "breeds_extra", ["brahma", "silkie", "cochin"]);

  assert.equal(queues.breeds_extra.brahma.status, "done", "existing done item must not be reset");
  assert.equal(queues.breeds_extra.cochin.status, "pending", "new id must be added as pending");
});

test("getIdsByStatus returns sorted ids matching the given status", () => {
  let queues = {};
  queues = ensureQueueItems(queues, "diseases_extra", ["newcastle-disease", "avian-influenza"]);
  queues = markItem(queues, "diseases_extra", "newcastle-disease", "error", "boom");

  const pending = getIdsByStatus(queues, "diseases_extra", "pending");
  const errored = getIdsByStatus(queues, "diseases_extra", "error");

  assert.deepEqual(pending, ["avian-influenza"]);
  assert.deepEqual(errored, ["newcastle-disease"]);
});

test("markItem increments attempts and records the error message", () => {
  let queues = ensureQueueItems({}, "q", ["a"]);
  queues = markItem(queues, "q", "a", "error", "first failure");
  assert.equal(queues.q.a.attempts, 1);
  assert.equal(queues.q.a.last_error, "first failure");

  queues = markItem(queues, "q", "a", "error", "second failure");
  assert.equal(queues.q.a.attempts, 2);
  assert.equal(queues.q.a.last_error, "second failure");

  queues = markItem(queues, "q", "a", "done");
  assert.equal(queues.q.a.status, "done");
  assert.equal(queues.q.a.last_error, null);
});
