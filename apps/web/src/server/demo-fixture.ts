/**
 * demo-fixture.ts — the demo.otio seed (M7 lock E).
 *
 * The fixture lives at `apps/web/fixtures/demo.otio` (next to the app that
 * seeds from it, not inside the pure engine package, which may not touch
 * the filesystem — C7). It is read once per process and parsed once; the
 * parsed JSON is handed to the engine's `importOtio`, exactly like any
 * user-supplied document would be.
 *
 * Shape follows C8: 24fps, 3 tracks (video / audio / text), 5 clips —
 * A interview, B b-roll, C logo, music bed, caption "Welcome" — plus the
 * b-roll media the agent's step-3 `addClip` of clip D needs. It imports
 * with ZERO warnings (C8 step 1: "fixture clean"), which is asserted by a
 * test, not by eyeballing.
 *
 * C is `logo.png` — an IMAGE, not a video [AMENDED 2026-08-05, M7a owner
 * triage]. C8's fixture line says "3 short videos + 1 audio", but the same
 * doc calls this clip a logo and elsewhere (docs/11 A2.1 discussion) writes
 * "logo.png 5s dikhao ya 5min — dono valid". A logo is an image in any real
 * edit, and making it one means the demo actually exercises the image rules
 * we designed: O1 (`durationInSource: null` — unbounded, so `available_range`
 * is null here) and O3 (slip on an image is E_NOT_APPLICABLE). Media count
 * is unchanged; only this one URL and its available_range moved.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "demo.otio",
);

let cached: unknown = null;

export function demoOtioJson(): unknown {
  if (cached === null) {
    cached = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  }
  return cached;
}
