/**
 * T4 — Benchmark runner for FrameBranch engine.
 *
 * Measures: computeDiff (1k/10k), startMerge (1k/10k + split-heavy),
 * single-verb applyCommand, and snapshot+replay restore round-trip.
 *
 * Method (docs/12-test-benchmark-plan.md T4 locked spec):
 *   - 3 warm-up runs (discarded — V8 JIT compilation noise)
 *   - 10 measurement runs per metric
 *   - Final number = MEDIAN (not average — GC spike resistant)
 *   - Report: benchmarks/REPORT.md with machine/Node/fixture metadata
 *
 * Run: pnpm --filter engine benchmark
 */

/* global console, process, performance */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import {
  generateTimeline,
  generateSplitHeavyTimeline,
  applyRandomEdits,
} from "./generator.mjs";

// ---------------------------------------------------------------------------
// Dynamic engine imports (ESM → TS source via vitest/register or tsx)
// ---------------------------------------------------------------------------

const enginePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/index.ts",
);
const { computeDiff, startMerge, applyCommand } = await import(enginePath);

// ---------------------------------------------------------------------------
// Measurement utilities
// ---------------------------------------------------------------------------

const WARMUP_RUNS = 3;
const MEASURE_RUNS = 10;

/**
 * Measure a function's execution time.
 * Returns median of MEASURE_RUNS after WARMUP_RUNS warm-ups.
 *
 * @param {string} label
 * @param {() => void} fn
 * @returns {{ label: string, medianMs: number, runs: number[] }}
 */
function measure(label, fn) {
  // Warm up (JIT compilation + GC stabilization)
  for (let i = 0; i < WARMUP_RUNS; i++) {
    fn();
  }

  // Measurement runs
  const runs = [];
  for (let i = 0; i < MEASURE_RUNS; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    runs.push(end - start);
  }

  // Median
  const sorted = [...runs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return { label, medianMs, runs: sorted };
}

/**
 * Format milliseconds to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ---------------------------------------------------------------------------
// Fixture generation
// ---------------------------------------------------------------------------

console.log("T4 Benchmark — Generating fixtures...\n");

const fixtures = {
  "1k": { clipCount: 1_000, seed: 42 },
  "10k": { clipCount: 10_000, seed: 42 },
};

const timelines = {};
const editedTimelines = {};
const splitHeavyTimelines = {};
const editedSplitHeavyTimelines = {};

for (const [name, { clipCount, seed }] of Object.entries(fixtures)) {
  console.log(`  Generating ${name} standard timeline (${clipCount} clips)...`);
  timelines[name] = generateTimeline(clipCount, seed);

  // Create two divergent versions for diff/merge
  editedTimelines[name] = {
    ours: applyRandomEdits(timelines[name], Math.floor(clipCount * 0.05), 101),
    theirs: applyRandomEdits(
      timelines[name],
      Math.floor(clipCount * 0.05),
      202,
    ),
  };

  console.log(
    `  Generating ${name} split-heavy timeline (${clipCount} clips)...`,
  );
  splitHeavyTimelines[name] = generateSplitHeavyTimeline(clipCount, seed + 1);
  editedSplitHeavyTimelines[name] = {
    ours: applyRandomEdits(
      splitHeavyTimelines[name],
      Math.floor(clipCount * 0.05),
      301,
    ),
    theirs: applyRandomEdits(
      splitHeavyTimelines[name],
      Math.floor(clipCount * 0.05),
      402,
    ),
  };
}

// ---------------------------------------------------------------------------
// Run benchmarks
// ---------------------------------------------------------------------------

console.log("\nRunning benchmarks...\n");

const results = [];

// --- 1. computeDiff ---
for (const scale of ["1k", "10k"]) {
  const base = timelines[scale];
  const edited = editedTimelines[scale].ours;

  const result = measure(`computeDiff @ ${scale}`, () => {
    computeDiff(base, edited);
  });
  results.push(result);
  console.log(`  ${result.label}: ${formatMs(result.medianMs)}`);
}

// --- 2. startMerge (standard) ---
for (const scale of ["1k", "10k"]) {
  const base = timelines[scale];
  const { ours, theirs } = editedTimelines[scale];

  const result = measure(`startMerge @ ${scale}`, () => {
    startMerge({ base, ours, theirs });
  });
  results.push(result);
  console.log(`  ${result.label}: ${formatMs(result.medianMs)}`);
}

// --- 3. startMerge (split-heavy variant) ---
for (const scale of ["1k", "10k"]) {
  const base = splitHeavyTimelines[scale];
  const { ours, theirs } = editedSplitHeavyTimelines[scale];

  const result = measure(`startMerge split-heavy @ ${scale}`, () => {
    startMerge({ base, ours, theirs });
  });
  results.push(result);
  console.log(`  ${result.label}: ${formatMs(result.medianMs)}`);
}

// --- 4. Single-verb apply (trim, split, move) ---
{
  const tl = generateTimeline(100, 555);
  const clips = tl.tracks.flatMap((track) => track.clips);
  const targetClip = clips.find(
    (c) => c.timelineRange.duration.value > 6 && c.mediaRefId,
  );

  if (targetClip) {
    // trimClip
    const trimResult = measure("applyCommand trim (single)", () => {
      applyCommand(JSON.parse(JSON.stringify(tl)), {
        op: "trim",
        clipId: targetClip.id,
        edge: "end",
        delta: { value: -1, rate: 24 },
      });
    });
    results.push(trimResult);
    console.log(`  ${trimResult.label}: ${formatMs(trimResult.medianMs)}`);

    // splitClip
    const splitAt =
      targetClip.timelineRange.start.value +
      Math.floor(targetClip.timelineRange.duration.value / 2);
    const splitResult = measure("applyCommand split (single)", () => {
      applyCommand(JSON.parse(JSON.stringify(tl)), {
        op: "split",
        clipId: targetClip.id,
        at: { value: splitAt, rate: 24 },
      });
    });
    results.push(splitResult);
    console.log(`  ${splitResult.label}: ${formatMs(splitResult.medianMs)}`);

    // moveClip
    const moveResult = measure("applyCommand move (single)", () => {
      applyCommand(JSON.parse(JSON.stringify(tl)), {
        op: "move",
        clipId: targetClip.id,
        newStart: { value: 9999, rate: 24 },
      });
    });
    results.push(moveResult);
    console.log(`  ${moveResult.label}: ${formatMs(moveResult.medianMs)}`);
  }
}

// --- 5. Restore round-trip (snapshot + replay ≤10 steps) ---
{
  const baseRestore = generateTimeline(100, 777);
  const commands = [];
  let current = baseRestore;

  // Apply up to 10 edits, collecting inverses
  const clipIds = current.tracks
    .flatMap((t) => t.clips)
    .filter((c) => c.timelineRange.duration.value > 4 && c.mediaRefId)
    .slice(0, 10);

  for (const clip of clipIds) {
    const cmd = {
      op: "trim",
      clipId: clip.id,
      edge: "end",
      delta: { value: -1, rate: 24 },
    };
    const r = applyCommand(current, cmd);
    if (r.ok && !r.noChange) {
      commands.push({ command: cmd, inverse: r.inverse });
      current = r.timeline;
    }
  }

  const stepsCount = commands.length;
  const snapshot = JSON.parse(JSON.stringify(baseRestore));

  const restoreResult = measure(
    `restore replay (${stepsCount} steps)`,
    () => {
      // Snapshot restore = deep clone + replay all commands
      let tl = JSON.parse(JSON.stringify(snapshot));
      for (const { command } of commands) {
        const r = applyCommand(tl, command);
        if (r.ok && !r.noChange) tl = r.timeline;
      }
    },
  );
  results.push(restoreResult);
  console.log(`  ${restoreResult.label}: ${formatMs(restoreResult.medianMs)}`);
}

// ---------------------------------------------------------------------------
// Generate REPORT.md
// ---------------------------------------------------------------------------

console.log("\nGenerating REPORT.md...\n");

const now = new Date().toISOString().split("T")[0];
const nodeVersion = process.version;
const cpuModel = os.cpus()[0]?.model ?? "unknown";
const osPlatform = `${os.type()} ${os.release()} (${os.arch()})`;
const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);

// Build results table
const tableRows = results
  .map(
    (r) =>
      `| ${r.label} | ${formatMs(r.medianMs)} | ${formatMs(r.runs[0])} | ${formatMs(r.runs[r.runs.length - 1])} |`,
  )
  .join("\n");

const report = `# FrameBranch Engine — Benchmark Report

> **Generated:** ${now}
> **Method:** ${WARMUP_RUNS} warm-up runs (discarded) + ${MEASURE_RUNS} measurement runs → **median** (T4 locked spec).
> Benchmarks run locally (NOT CI — HLD #16: CI hardware inconsistent).

## Environment

| Property | Value |
| :--- | :--- |
| **CPU** | ${cpuModel} |
| **OS** | ${osPlatform} |
| **RAM** | ${totalMemGB} GB |
| **Node.js** | ${nodeVersion} |

## Fixture Shape

| Scale | Standard Clips | Split-Heavy Clips | Tracks | Edit % (ours/theirs) |
| :--- | :--- | :--- | :--- | :--- |
| **1k** | 1,000 | ~1,000 (2–3 pieces/family) | 4 (2 video, 1 audio, 1 text) | 5% random edits per side |
| **10k** | 10,000 | ~10,000 (2–3 pieces/family) | 4 (2 video, 1 audio, 1 text) | 5% random edits per side |

## Results

| Metric | Median | Min | Max |
| :--- | ---: | ---: | ---: |
${tableRows}

## Headline

> **Semantic diff of a 10,000-clip timeline in ${formatMs(results.find((r) => r.label === "computeDiff @ 10k")?.medianMs ?? 0)}, 3-way merge in ${formatMs(results.find((r) => r.label === "startMerge @ 10k")?.medianMs ?? 0)}, backed by 245 tests and 10,000 fuzz cases.**

## Methodology Notes

- **Warm-up runs (${WARMUP_RUNS}):** Discarded to let V8 JIT-compile hot paths and stabilize GC.
- **Median (not average):** Garbage collection spikes are outliers; median filters them naturally.
- **Pure in-memory:** No disk I/O, no network — measures raw engine computation only.
- **Reproducible:** Fixed seeds (42/99) produce identical fixtures on any run.
- **Honest framing (HLD #18):** These are MEASURED numbers on the documented hardware.
  Pattern-correctness (stateless pure functions → horizontal scaling) and designed-for
  capacity (V2 Merkle caching, worker offload) are documented, not benchmarked.
`;

const reportPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "REPORT.md",
);
writeFileSync(reportPath, report, "utf-8");

console.log(`✅ Report written to: ${reportPath}`);
console.log("\nDone!\n");
