/**
 * Keep each Vitest worker below its 60-second RPC window while preserving one
 * deterministic seed/case universe for the package-level T3 command.
 *
 * [AMENDED 2026-08-04, CI speed optimization] Chunks now run CONCURRENTLY
 * (bounded by FRAMEBRANCH_FUZZ_CONCURRENCY / core count) instead of one at a
 * time via spawnSync. Determinism is preserved by construction: each case's
 * RNG seed is caseSeed(masterSeed, globalIndex), where globalIndex =
 * OFFSET + i — identical no matter which chunk or shard runs it, and no
 * matter the finish order of concurrent chunks. See docs/12 T5 amendment
 * (2026-08-04) and IMPLEMENTATION-NOTES.md for the concurrency-default and
 * output-ordering assumptions.
 */

/* global console, process */

import { spawn } from "node:child_process";
import os from "node:os";

const environment = process.env;
const defaultCases = environment.CI === "true" ? 10_000 : 500;
const totalCases = parseInteger(
  "FRAMEBRANCH_FUZZ_CASES",
  environment.FRAMEBRANCH_FUZZ_CASES,
  defaultCases,
  1,
);
const offset = parseInteger(
  "FRAMEBRANCH_FUZZ_OFFSET",
  environment.FRAMEBRANCH_FUZZ_OFFSET,
  0,
  0,
);
const replayCase = environment.FRAMEBRANCH_FUZZ_CASE;
const seed =
  parseInteger(
    "FRAMEBRANCH_FUZZ_SEED",
    environment.FRAMEBRANCH_FUZZ_SEED,
    0x4d345f54,
    0,
  ) >>> 0;
// 500 keeps each worker comfortably inside Vitest's 60-second RPC window —
// the strengthened N3/I4 harness pushed a 1,000-case chunk past it.
const chunkSize = 500;

// Global universe size passed to children so replay/message numbering stays
// global even when this process only owns a shard's slice of it.
const globalTotal = parseInteger(
  "FRAMEBRANCH_FUZZ_TOTAL",
  environment.FRAMEBRANCH_FUZZ_TOTAL,
  offset + totalCases,
  offset + totalCases,
);

function parseInteger(name, raw, fallback, minimum) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `${name} must be an integer >= ${minimum}; received ${raw}`,
    );
  }
  return value;
}

function resolveConcurrency() {
  const explicit = environment.FRAMEBRANCH_FUZZ_CONCURRENCY;
  if (explicit !== undefined) {
    return parseInteger("FRAMEBRANCH_FUZZ_CONCURRENCY", explicit, 1, 1);
  }
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  // CI shard machines are dedicated: use every core. Local machines default
  // to half the cores (floor, minimum 2) so the developer's machine stays
  // usable while a fuzz run is in flight.
  return environment.CI === "true" ? cores : Math.max(2, Math.floor(cores / 2));
}

/**
 * Runs one chunk as a child process, capturing stdout+stderr instead of
 * inheriting them (concurrent "inherit" would interleave into garbage).
 * Resolves with the chunk's result; never rejects (spawn errors are folded
 * into the result so the scheduler can treat them uniformly).
 */
function runChunk(chunkOffset, cases) {
  return new Promise((resolve) => {
    const chunkTotal = replayCase === undefined ? globalTotal : 1;
    const child = spawn(
      "pnpm",
      ["exec", "vitest", "run", "tests/fuzz.test.ts", "--testTimeout", "600000"],
      {
        cwd: process.cwd(),
        env: {
          ...environment,
          FRAMEBRANCH_FUZZ_CASES: String(cases),
          FRAMEBRANCH_FUZZ_OFFSET: String(chunkOffset),
          FRAMEBRANCH_FUZZ_SEED: String(seed),
          FRAMEBRANCH_FUZZ_TOTAL: String(chunkTotal),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));

    child.on("error", (error) => {
      resolve({
        offset: chunkOffset,
        cases,
        status: 1,
        output: output + `\n${error.stack ?? String(error)}`,
      });
    });
    child.on("close", (status) => {
      resolve({ offset: chunkOffset, cases, status: status ?? 1, output });
    });
  });
}

/**
 * Runs all chunks with at most `concurrency` in flight at a time. After the
 * first failing chunk, stops launching new chunks but lets in-flight ones
 * finish (never kills a running child). Returns every chunk's result.
 */
async function runAllChunks(chunkPlan, concurrency) {
  const results = [];
  let nextIndex = 0;
  let failed = false;
  let completed = 0;

  async function worker() {
    for (;;) {
      if (failed) return;
      const index = nextIndex;
      if (index >= chunkPlan.length) return;
      nextIndex += 1;
      const { chunkOffset, cases } = chunkPlan[index];
      const result = await runChunk(chunkOffset, cases);
      results[index] = result;
      completed += 1;
      const chunkEnd = chunkOffset + cases - 1;
      if (result.status === 0) {
        console.log(
          `chunk ${index + 1}/${chunkPlan.length} ok (cases ${chunkOffset}-${chunkEnd})`,
        );
      } else {
        failed = true;
      }
    }
  }

  const workerCount = Math.min(concurrency, chunkPlan.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { results: results.filter(Boolean), completed };
}

async function main() {
  if (offset > 0) {
    console.log(
      replayCase === undefined
        ? `T3 fuzz seed ${seed}: ${totalCases} case(s), cases ${offset}-${offset + totalCases - 1} of ${globalTotal}`
        : `T3 fuzz seed ${seed}: replay case ${replayCase}`,
    );
  } else {
    console.log(
      replayCase === undefined
        ? `T3 fuzz seed ${seed}: ${totalCases} case(s)`
        : `T3 fuzz seed ${seed}: replay case ${replayCase}`,
    );
  }

  if (replayCase !== undefined) {
    const result = await runChunk(0, 1);
    if (result.status !== 0) {
      console.log(result.output);
      process.exit(result.status);
    }
    return;
  }

  const chunkPlan = [];
  for (let chunkOffset = offset; chunkOffset < offset + totalCases; chunkOffset += chunkSize) {
    chunkPlan.push({
      chunkOffset,
      cases: Math.min(chunkSize, offset + totalCases - chunkOffset),
    });
  }

  const concurrency = resolveConcurrency();
  const { results } = await runAllChunks(chunkPlan, concurrency);

  const failedResults = results
    .filter((result) => result.status !== 0)
    .sort((a, b) => a.offset - b.offset);

  if (failedResults.length > 0) {
    for (const result of failedResults) {
      console.log(result.output);
    }
    process.exit(failedResults[0].status || 1);
  }
}

await main();
