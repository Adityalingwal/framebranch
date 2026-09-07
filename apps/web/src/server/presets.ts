/**
 * presets.ts — the server-side preset registry (G1 / C1(6) / copy #46-#47).
 *
 * "New project" = pick a preset; each preset is an OTIO fixture whose media
 * is really in `public/media` (+ pre-made thumbnails). Today there is
 * exactly ONE real preset — more presets need more media, which is out of
 * B0's scope (do not invent media). Names are placeholders per copy #46.
 *
 * The fixture is read once per process and handed to the engine's
 * importOtio like any user document; a fixture that fails to import is a
 * broken deployment, not a bad request.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { importOtio } from "@framebranch/engine";
import type { ImportWarning, Timeline } from "@framebranch/engine";

import { formatFrames } from "../lib/format";
import { ApiError } from "./envelope";

export type Preset = {
  /** Stable id the API accepts (`POST /api/project/new { preset }`). */
  id: string;
  /** C1(6) — the seed card's name is this, verbatim. */
  name: string;
  /** Relative to `apps/web/`. */
  otioPath: string;
  /** Where the fixture's media lives, relative to `apps/web/`. */
  mediaDir: string;
};

export const PRESETS: readonly Preset[] = [
  {
    id: "travel-vlog",
    name: "Travel vlog",
    otioPath: "fixtures/demo.otio",
    mediaDir: "public/media",
  },
];

/** G1 patch (a): first visit = no choice, today's demo. */
export const DEFAULT_PRESET_ID = "travel-vlog";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function presetById(id: string): Preset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) {
    throw new ApiError("E_BAD_REQUEST", `unknown preset "${id}"`);
  }
  return preset;
}

const otioCache = new Map<string, unknown>();

export function loadPresetOtio(preset: Preset): unknown {
  let json = otioCache.get(preset.id);
  if (json === undefined) {
    json = JSON.parse(readFileSync(join(WEB_ROOT, preset.otioPath), "utf8"));
    otioCache.set(preset.id, json);
  }
  return json;
}

export type ImportedPreset = { timeline: Timeline; warnings: ImportWarning[] };

/**
 * The preset, imported through the engine exactly as a user document would
 * be. Ours and covered by a test; failure = broken deployment.
 */
export function importPreset(preset: Preset): ImportedPreset {
  const imported = importOtio(loadPresetOtio(preset));
  if (!imported.ok) {
    throw new Error(
      `${preset.otioPath} failed to import: ${imported.error.code} ${imported.error.message}`,
    );
  }
  return { timeline: imported.timeline, warnings: imported.warnings };
}

export type PresetSummary = {
  id: string;
  name: string;
  clipCount: number;
  /** 4-part timecode of the last clip end (copy #47). */
  duration: string;
};

/** Copy #47 — `‹N› clips · ‹duration›` data for the picker. */
export function presetSummary(preset: Preset): PresetSummary {
  const { timeline } = importPreset(preset);
  let clipCount = 0;
  let end = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      clipCount += 1;
      end = Math.max(
        end,
        clip.timelineRange.start.value + clip.timelineRange.duration.value,
      );
    }
  }
  return {
    id: preset.id,
    name: preset.name,
    clipCount,
    duration: formatFrames(end, timeline.projectRate),
  };
}
