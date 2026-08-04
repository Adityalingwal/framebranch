# FrameBranch Engine — Benchmark Report

> **Generated:** 2026-08-04
> **Method:** 3 warm-up runs (discarded) + 10 measurement runs → **median** (T4 locked spec).
> Benchmarks run locally (NOT CI — HLD #16: CI hardware inconsistent).

## Environment

| Property | Value |
| :--- | :--- |
| **CPU** | Apple M3 |
| **OS** | Darwin 25.6.0 (arm64) |
| **RAM** | 8.0 GB |
| **Node.js** | v20.19.6 |

## Fixture Shape

| Scale | Standard Clips | Split-Heavy Clips | Tracks | Edit % (ours/theirs) |
| :--- | :--- | :--- | :--- | :--- |
| **1k** | 1,000 | ~1,000 (2–3 pieces/family) | 4 (2 video, 1 audio, 1 text) | 5% random edits per side |
| **10k** | 10,000 | ~10,000 (2–3 pieces/family) | 4 (2 video, 1 audio, 1 text) | 5% random edits per side |

## Results

| Metric | Median | Min | Max |
| :--- | ---: | ---: | ---: |
| computeDiff @ 1k | 991 µs | 653 µs | 27.24 ms |
| computeDiff @ 10k | 6.08 ms | 4.52 ms | 9.76 ms |
| startMerge @ 1k | 102.23 ms | 101.23 ms | 104.04 ms |
| startMerge @ 10k | 1.26 s | 1.22 s | 1.31 s |
| startMerge split-heavy @ 1k | 102.74 ms | 101.66 ms | 146.79 ms |
| startMerge split-heavy @ 10k | 1.36 s | 1.32 s | 1.39 s |
| applyCommand trim (single) | 614 µs | 528 µs | 867 µs |
| applyCommand split (single) | 411 µs | 407 µs | 558 µs |
| applyCommand move (single) | 545 µs | 527 µs | 627 µs |
| restore replay (10 steps) | 1.02 ms | 942 µs | 1.84 ms |

## Headline

> **Semantic diff of a 10,000-clip timeline in 6.08 ms, 3-way merge in 1.26 s, backed by 245 tests and 10,000 fuzz cases.**

## Methodology Notes

- **Warm-up runs (3):** Discarded to let V8 JIT-compile hot paths and stabilize GC.
- **Median (not average):** Garbage collection spikes are outliers; median filters them naturally.
- **Pure in-memory:** No disk I/O, no network — measures raw engine computation only.
- **Reproducible:** Fixed seeds (42/99) produce identical fixtures on any run.
- **Honest framing (HLD #18):** These are MEASURED numbers on the documented hardware.
  Pattern-correctness (stateless pure functions → horizontal scaling) and designed-for
  capacity (V2 Merkle caching, worker offload) are documented, not benchmarked.
