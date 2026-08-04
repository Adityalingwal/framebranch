/**
 * Keep each Vitest worker below its 60-second RPC window while preserving one
 * deterministic seed/case universe for the package-level T3 command.
 */

/* global console, process */

import { spawnSync } from "node:child_process";

const environment = process.env;
const defaultCases = environment.CI === "true" ? 10_000 : 500;
const totalCases = parseInteger(
  "FRAMEBRANCH_FUZZ_CASES",
  environment.FRAMEBRANCH_FUZZ_CASES,
  defaultCases,
  1,
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

function runChunk(offset, cases) {
  const child = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "tests/fuzz.test.ts", "--testTimeout", "600000"],
    {
      cwd: process.cwd(),
      env: {
        ...environment,
        FRAMEBRANCH_FUZZ_CASES: String(cases),
        FRAMEBRANCH_FUZZ_OFFSET: String(offset),
        FRAMEBRANCH_FUZZ_SEED: String(seed),
        FRAMEBRANCH_FUZZ_TOTAL: String(
          replayCase === undefined ? totalCases : 1,
        ),
      },
      stdio: "inherit",
    },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}

console.log(
  replayCase === undefined
    ? `T3 fuzz seed ${seed}: ${totalCases} case(s)`
    : `T3 fuzz seed ${seed}: replay case ${replayCase}`,
);

if (replayCase !== undefined) {
  runChunk(0, 1);
} else {
  for (let offset = 0; offset < totalCases; offset += chunkSize) {
    runChunk(offset, Math.min(chunkSize, totalCases - offset));
  }
}
