# FrameBranch Engine — Benchmark Report

> **Generated:** 2026-08-05
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

> **Four merge variants, all on the standard/split-heavy timelines above** (2026-08-05 lock —
> every row states its own real conflict count, see Results): **independent-edits** — each side
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
| computeDiff @ 1k | 631 µs | 387 µs | 2.49 ms |
| computeDiff @ 10k | 3.20 ms | 2.63 ms | 3.39 ms |
| startMerge @ 1k (19 conflicts) | 59.91 ms | 59.24 ms | 61.03 ms |
| startMerge @ 10k (251 conflicts) | 724.75 ms | 713.73 ms | 761.52 ms |
| startMerge split-heavy @ 1k (32 conflicts) | 61.57 ms | 60.64 ms | 63.47 ms |
| startMerge split-heavy @ 10k (338 conflicts) | 791.62 ms | 783.10 ms | 824.09 ms |
| startMerge conflict-heavy @ 1k (50 conflicts) | 60.51 ms | 59.27 ms | 75.87 ms |
| startMerge conflict-heavy @ 10k (500 conflicts) | 687.81 ms | 679.83 ms | 727.30 ms |
| startMerge independent-edits @ 1k (0 conflicts) | 60.65 ms | 59.43 ms | 80.81 ms |
| startMerge independent-edits @ 10k (4 conflicts) | 698.75 ms | 691.73 ms | 791.05 ms |
| applyCommand trim (single) | 320 µs | 306 µs | 661 µs |
| applyCommand split (single) | 240 µs | 239 µs | 272 µs |
| applyCommand move (single) | 335 µs | 310 µs | 425 µs |
| restore replay (10 steps) | 577 µs | 555 µs | 1.08 ms |

## Headline

> **Semantic diff of a 10,000-clip timeline in 3.20 ms, 3-way merge in 724.75 ms, backed by 287 tests and 10,000 fuzz cases.**

## Methodology Notes

- **Warm-up runs (3):** Discarded to let V8 JIT-compile hot paths and stabilize GC.
- **Median (not average):** Garbage collection spikes are outliers; median filters them naturally.
- **Pure in-memory:** No disk I/O, no network — measures raw engine computation only.
- **Reproducible:** Fixed seeds (42/99) produce identical fixtures on any run.
- **Honest framing (HLD #18):** These are MEASURED numbers on the documented hardware.
  Pattern-correctness (stateless pure functions → horizontal scaling) and designed-for
  capacity (V2 Merkle caching, worker offload) are documented, not benchmarked.
