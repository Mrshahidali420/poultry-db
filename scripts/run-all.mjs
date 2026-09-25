#!/usr/bin/env node
// Runs every fetcher that can run in the current environment, then the
// keyword builder, then the LLM enrichment batch. Used both locally and by
// the GitHub Actions cron (.github/workflows/collect.yml).

import { spawn } from "node:child_process";
import path from "node:path";

const SCRIPTS_DIR = path.resolve("scripts");

function run(scriptName) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SCRIPTS_DIR, scriptName)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`Failed to start ${scriptName}: ${err.message}`);
      resolve(1);
    });
  });
}

async function main() {
  const steps = [
    "fetch-breeds.mjs",
    "fetch-diseases.mjs",
    "fetch-nutrition.mjs",
    "build-keywords.mjs",
    "enrich-llm.mjs",
  ];

  const results = {};
  for (const step of steps) {
    console.log(`\n=== Running ${step} ===`);
    const code = await run(step);
    results[step] = code;
    if (code !== 0) {
      console.log(`!!! ${step} exited with code ${code} — continuing with remaining steps.`);
    }
  }

  console.log("\n=== run-all summary ===");
  for (const [step, code] of Object.entries(results)) {
    console.log(`  ${step}: ${code === 0 ? "ok" : `failed (${code})`}`);
  }

  const anyFailed = Object.values(results).some((code) => code !== 0);
  process.exitCode = anyFailed ? 1 : 0;
}

main();
