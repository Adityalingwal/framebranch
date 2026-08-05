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
