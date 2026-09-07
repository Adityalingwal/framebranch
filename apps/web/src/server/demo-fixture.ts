/**
 * demo-fixture.ts — the default preset's OTIO, for tests and callers that
 * predate the preset registry (server/presets.ts owns the file now).
 *
 * Shape: 24fps, 3 tracks (V1 video / A1 audio / T1 text), 5 clips —
 * Interview, B-roll, Logo (an image — unbounded duration), Music, and the
 * text clip "Welcome" — plus the b-roll media the agent's addClip needs.
 * Imports with zero warnings.
 */

import { DEFAULT_PRESET_ID, loadPresetOtio, presetById } from "./presets";

export function demoOtioJson(): unknown {
  return loadPresetOtio(presetById(DEFAULT_PRESET_ID));
}
