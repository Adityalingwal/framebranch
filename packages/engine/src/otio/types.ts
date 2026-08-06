import type { EngineError, MediaKind, Timeline, TrackKind } from "../types";

export type OtioJson = Record<string, unknown>;

/** O8 — structured warnings; tests assert on `code`, never on prose. */
export type ImportWarningCode =
  | "skipped-unsupported"
  | "skipped-media-length-missing"
  | "skipped-unknown-clip"
  | "rate-fallback-empty-timeline";

export type ImportWarning = {
  code: ImportWarningCode;
  detail: string;
  count: number;
};

export type ImportResult =
  | { ok: true; timeline: Timeline; warnings: ImportWarning[] }
  | { ok: false; error: EngineError };

// ---------------------------------------------------------------------------
// Locked constants
// ---------------------------------------------------------------------------

/**
 * O7 — the version whitelist: exactly the labels verified against the real
 * sample (AcademySoftwareFoundation/OpenTimelineIO
 * tests/sample_data/multitrack.otio). A STRUCTURAL schema at an unknown
 * version aborts the whole import; an unsupported item TYPE only skips.
 */
const SCHEMA_WHITELIST: Readonly<Record<string, number>> = {
  Timeline: 1,
  Stack: 1,
  Track: 1,
  Clip: 1,
  Gap: 1,
  TimeRange: 1,
  RationalTime: 1,
  ExternalReference: 1,
  MissingReference: 1,
};

/** O9 — media kind comes from the file extension (case-insensitive). */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
]);

/** N1 (A3.6) — which track kind each media kind belongs on. Mirrors verbs.ts. */
const TRACK_KIND_FOR_MEDIA: Readonly<Record<MediaKind, TrackKind>> = {
  video: "video",
  audio: "audio",
  image: "video", // visual → video lane; audio/text lanes refuse it
};

/** O6 edge — empty file with no `global_start_time` → 24 + warning. */
const FALLBACK_RATE = 24;

/** BC.5 storage rule (mirrors verbs.ts; untrusted JSON is validated here). */
const COLOR_RE = /^#[0-9a-f]{6}$/;

const MAX_TEXT_CONTENT = 500; // A3.6


export { SCHEMA_WHITELIST, IMAGE_EXTENSIONS, TRACK_KIND_FOR_MEDIA, FALLBACK_RATE, COLOR_RE, MAX_TEXT_CONTENT };
