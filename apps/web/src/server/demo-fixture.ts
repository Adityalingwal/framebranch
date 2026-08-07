/**
 * demo-fixture.ts — the demo.otio seed. The fixture is read once per process
 * and handed to the engine's importOtio like any user-supplied document.
 *
 * Shape: 24fps, 3 tracks (video / audio / text), 5 clips — A interview,
 * B b-roll, C logo (an image, not a video — exercises unbounded duration
 * and image-specific rules), music bed, caption "Welcome" — plus the b-roll
 * media the agent's addClip of clip D needs. Imports with zero warnings.
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
