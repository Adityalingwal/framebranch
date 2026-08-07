# FrameBranch Engine — Benchmark Report

> **Generated:** 2026-08-07
> **Method:** 3 warm-up runs (discarded) + 10 measurement runs → **median**.
> Benchmarks run locally (NOT CI — CI hardware is too inconsistent for stable benchmark numbers).

## Environment

| Property | Value |
| :--- | :--- |
| **CPU** | Apple M3 |
| **OS** | Darwin 25.6.0 (arm64) |
| **RAM** | 8.0 GB |
| **Node.js** | v24.19.0 |

## Fixture Shape

| Scale | Standard Clips | Split-Heavy Clips | Tracks | Edit % (ours/theirs) |
| :--- | :--- | :--- | :--- | :--- |
| **1k** | 1,000 | ~1,000 (2–3 pieces/family) | 4 (2 video, 1 audio, 1 text) | 5% random edits per side |
| **10k** | 10,000 | ~10,000 (2–3 pieces/family) | 4 (2 video, 1 audio, 1 text) | 5% random edits per side |

> **Four merge variants, all on the standard/split-heavy timelines above**
> (every row states its own real conflict count, see Results): **independent-edits** — each side
> edits independently with `move` excluded (overlap-safe atoms only), lowest measured conflict
> count of the four but not guaranteed zero; **standard** — each side edits independently
> including `move`, which can add incidental overlap conflicts against an unedited neighbour;
> **split-heavy** — same independent-edit shape, applied to the split-heavy base timeline;
> **conflict-heavy** — `ours`/`theirs` edit the SAME 5% of clips on the SAME atom (property
> change or trim-end shorten, never `move`) with DIFFERENT values, so every edited clip is a
> guaranteed conflict.

## Results

| Metric | Median | Min | Max |
| :--- | ---: | ---: | ---: |
| computeDiff @ 1k | 549 µs | 529 µs | 727 µs |
| computeDiff @ 10k | 5.23 ms | 4.37 ms | 8.13 ms |
| startMerge @ 1k (19 conflicts) | 45.42 ms | 43.80 ms | 49.42 ms |
| startMerge @ 10k (251 conflicts) | 550.01 ms | 529.18 ms | 577.59 ms |
| startMerge split-heavy @ 1k (32 conflicts) | 44.65 ms | 44.09 ms | 65.34 ms |
| startMerge split-heavy @ 10k (338 conflicts) | 591.15 ms | 571.99 ms | 612.56 ms |
| startMerge conflict-heavy @ 1k (50 conflicts) | 42.83 ms | 42.34 ms | 56.02 ms |
| startMerge conflict-heavy @ 10k (500 conflicts) | 503.96 ms | 490.18 ms | 563.54 ms |
| startMerge independent-edits @ 1k (0 conflicts) | 44.31 ms | 43.81 ms | 45.44 ms |
| startMerge independent-edits @ 10k (4 conflicts) | 500.70 ms | 494.25 ms | 540.54 ms |
| applyCommand trim (single) | 205 µs | 197 µs | 223 µs |
| applyCommand split (single) | 190 µs | 189 µs | 200 µs |
| applyCommand move (single) | 200 µs | 190 µs | 247 µs |
| restore replay (10 steps) | 268 µs | 264 µs | 285 µs |

## Headline

> **Semantic diff of a 10,000-clip timeline in 5.23 ms, 3-way merge in 550.01 ms, backed by 287 tests and 10,000 fuzz cases.**

## Methodology Notes

- **Warm-up runs (3):** Discarded to let V8 JIT-compile hot paths and stabilize GC.
- **Median (not average):** Garbage collection spikes are outliers; median filters them naturally.
- **Pure in-memory:** No disk I/O, no network — measures raw engine computation only.
- **Reproducible:** Fixed seeds (42/99) produce identical fixtures on any run.
- **Honest framing:** These are MEASURED numbers on the documented hardware.
  Pattern-correctness (stateless pure functions → horizontal scaling) and designed-for
  capacity (V2 Merkle caching, worker offload) are documented, not benchmarked.
