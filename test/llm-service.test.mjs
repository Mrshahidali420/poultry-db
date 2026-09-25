import { test } from "node:test";
import assert from "node:assert/strict";
import { callGithubModelsJson, ServiceUnavailableError, RateLimitError } from "../scripts/lib/llm.mjs";

function withFetch(response, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

const args = { token: "t", systemPrompt: "s", userPrompt: "u" };

test("a retired endpoint answering 200 text/plain 'OK' is a service failure, not a bad item", () =>
  withFetch(new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } }), () =>
    assert.rejects(callGithubModelsJson(args), ServiceUnavailableError)
  ));

test("JSON with no choices array is a service failure", () =>
  withFetch(Response.json({ ok: true }), () =>
    assert.rejects(callGithubModelsJson(args), ServiceUnavailableError)
  ));

test("429 is still a rate limit", () =>
  withFetch(new Response("slow down", { status: 429 }), () =>
    assert.rejects(callGithubModelsJson(args), RateLimitError)
  ));

test("a normal chat completion is parsed", () =>
  withFetch(Response.json({ choices: [{ message: { content: '{"a":1}' } }] }), async () =>
    assert.deepEqual(await callGithubModelsJson(args), { a: 1 })
  ));
