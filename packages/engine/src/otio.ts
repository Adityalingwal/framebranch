/**
 * otio.ts — M5: the OTIO adapter (public API 6-7/7, docs/11 "M5 — OTIO
 * import/export locks O1-O10").
 *
 * The whole file exists to bridge one model mismatch (docs/11 M5 table):
 *   - OTIO clip positions are IMPLICIT (sum of everything before them);
 *     ours are EXPLICIT `timelineRange` → import walks a cursor (O4),
 *     export writes `Gap.1` back for every empty stretch (O4).
 *   - OTIO carries a rate per time value; we carry ONE `projectRate`
 *     (A1.2) → every value converts once, here, at the import door (O6).
 *   - OTIO has no text clips and no media kind → both live in
 *     `metadata.framebranch` (O5) / the file extension (O9).
 *
 * Pure core (C7): no fs, no network, no deps. `importOtio` takes `unknown`
 * (arbitrary garbage) and NEVER throws — it always returns the result
 * shape. `exportOtio` never fails (OTIO carries pointers, never bytes —
 * docs/09 #12/#13) and never writes internal IDs (docs/09 #11).
 */

import { checkInvariants } from "./invariants";
import { convertRate } from "./time";
import { TEXT_FONT_WHITELIST, TEXT_STYLE_DEFAULTS } from "./verbs";
import type {
  Clip,
  EngineError,
  MediaKind,
  MediaRef,
  RationalTime,
  TextClip,
  TextFont,
  TextStyle,
  Timeline,
  TimeRange,
  Track,
  TrackKind,
} from "./types";

// ---------------------------------------------------------------------------
// Public shapes (docs/11 M5 "Public API shapes")
// ---------------------------------------------------------------------------

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

/** O6 edge — empty file with no `global_start_time` → 24 + warning. */
const FALLBACK_RATE = 24;

/** BC.5 storage rule (mirrors verbs.ts; untrusted JSON is validated here). */
const COLOR_RE = /^#[0-9a-f]{6}$/;

const MAX_TEXT_CONTENT = 500; // A3.6

// ---------------------------------------------------------------------------
// Internal plumbing
// ---------------------------------------------------------------------------

type AnyClip = Clip | TextClip;

/**
 * Import aborts (E_INVALID_OTIO / E_UNSUPPORTED_OTIO_VERSION) unwind
 * through this private error and are caught at the public boundary, so
 * `importOtio` itself can never throw.
 */
class OtioAbortError extends Error {
  readonly engineError: EngineError;

  constructor(engineError: EngineError) {
    super(engineError.message);
    this.name = "OtioAbortError";
    this.engineError = engineError;
  }
}

function invalid(message: string): never {
  throw new OtioAbortError({ code: "E_INVALID_OTIO", message });
}

function unsupportedVersion(label: string): never {
  throw new OtioAbortError({
    code: "E_UNSUPPORTED_OTIO_VERSION",
    message: `unsupported OTIO schema version "${label}"`,
  });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const rt = (value: number, rate: number): RationalTime => ({ value, rate });

const rangeEnd = (r: TimeRange): number => r.start.value + r.duration.value;

type SchemaLabel = { name: string; version: number; raw: string };

/**
 * Read one node's `OTIO_SCHEMA` label and apply O7(a): a whitelisted name
 * at a non-whitelisted version aborts the whole import.
 */
function requireSchema(
  node: Record<string, unknown>,
  where: string,
): SchemaLabel {
  const raw = node.OTIO_SCHEMA;
  if (typeof raw !== "string") {
    invalid(`${where}: missing OTIO_SCHEMA label`);
  }
  const match = /^(.+)\.(\d+)$/.exec(raw);
  if (!match) {
    invalid(`${where}: malformed OTIO_SCHEMA label "${raw}"`);
  }
  const label: SchemaLabel = {
    name: match[1],
    version: Number(match[2]),
    raw,
  };
  const supported = SCHEMA_WHITELIST[label.name];
  if (supported !== undefined && label.version !== supported) {
    unsupportedVersion(label.raw);
  }
  return label;
}

function requireObject(value: unknown, where: string): Record<string, unknown> {
  if (!isObject(value)) invalid(`${where}: expected an object`);
  return value;
}

/** A1.1 — rates and frame counts are integers; floats cannot be stored. */
function requireInteger(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    invalid(`${where}: expected an integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireRate(value: unknown, where: string): number {
  const rate = requireInteger(value, where);
  if (rate <= 0) invalid(`${where}: rate must be > 0`);
  return rate;
}

function parseRationalTime(value: unknown, where: string): RationalTime {
  const node = requireObject(value, where);
  const schema = requireSchema(node, where);
  if (schema.name !== "RationalTime") {
    invalid(`${where}: expected a RationalTime, got "${schema.raw}"`);
  }
  return rt(
    requireInteger(node.value, `${where}.value`),
    requireRate(node.rate, `${where}.rate`),
  );
}

function parseTimeRange(value: unknown, where: string): TimeRange {
  const node = requireObject(value, where);
  const schema = requireSchema(node, where);
  if (schema.name !== "TimeRange") {
    invalid(`${where}: expected a TimeRange, got "${schema.raw}"`);
  }
  return {
    start: parseRationalTime(node.start_time, `${where}.start_time`),
    duration: parseRationalTime(node.duration, `${where}.duration`),
  };
}

/** A1.2/A1.3 — the ONE conversion door: everything lands in projectRate. */
function convertTimeRange(range: TimeRange, rate: number): TimeRange {
  return {
    start: convertRate(range.start, rate),
    duration: convertRate(range.duration, rate),
  };
}

function childrenOf(node: Record<string, unknown>, where: string): unknown[] {
  const children = node.children;
  if (children === undefined || children === null) return [];
  if (!Array.isArray(children)) invalid(`${where}.children: expected an array`);
  return children;
}

/** `metadata.framebranch` — O5's extension door (ours; other tools ignore it). */
function framebranchMeta(
  node: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadata = node.metadata;
  if (!isObject(metadata)) return undefined;
  const fb = metadata.framebranch;
  return isObject(fb) ? fb : undefined;
}

// ---------------------------------------------------------------------------
// Import context (id minting + warning grouping)
// ---------------------------------------------------------------------------

type ImportCtx = {
  rate: number;
  /** key = JSON.stringify([code, detail]) → grouped entry (O8). */
  warnings: Map<string, ImportWarning>;
  mediaByUrl: Map<string, MediaRef>;
  mediaRefs: MediaRef[];
  counters: Map<string, number>;
};

/**
 * Import is always a fresh start (docs/09 #10) — every id is minted here.
 * Deterministic per-document counters: same file in → same ids out, and the
 * ids are `@`-free, so the B1.1 split namespace stays reserved.
 */
function mint(ctx: ImportCtx, prefix: string): string {
  const next = (ctx.counters.get(prefix) ?? 0) + 1;
  ctx.counters.set(prefix, next);
  return `${prefix}-${next}`;
}

function warn(ctx: ImportCtx, code: ImportWarningCode, detail: string): void {
  // NUL as a separator would make git treat this whole file as BINARY
  // (git sniffs the first 8000 bytes) — no diff, no review on GitHub.
  const key = JSON.stringify([code, detail]);
  const existing = ctx.warnings.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  ctx.warnings.set(key, { code, detail, count: 1 });
}

// ---------------------------------------------------------------------------
// O6 — project rate
// ---------------------------------------------------------------------------

/**
 * O6 (2): the rate of the FIRST clip in document order. Deliberately
 * tolerant — it only reads; every real validation (and every abort) is the
 * main walk's job, so a broken document reports its error exactly once.
 */
function firstClipRate(trackNodes: readonly unknown[]): number | null {
  for (const trackNode of trackNodes) {
    if (!isObject(trackNode)) continue;
    const children = trackNode.children;
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      if (!isObject(child)) continue;
      const schema = child.OTIO_SCHEMA;
      if (typeof schema !== "string" || !schema.startsWith("Clip.")) continue;
      const sourceRange = child.source_range;
      if (!isObject(sourceRange)) continue;
      const start = sourceRange.start_time;
      if (!isObject(start)) continue;
      const rate = start.rate;
      if (typeof rate === "number" && Number.isInteger(rate) && rate > 0) {
        return rate;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// O9 — media kind from the target_url extension
// ---------------------------------------------------------------------------

/**
 * O9: `.png .jpg .jpeg .webp` → image; otherwise the track decides. An
 * extension-less URL is treated as VIDEO on purpose — the safe side,
 * because the source-bounds invariant then still applies (documented
 * assumption, IMPLEMENTATION-NOTES 2026-08-04).
 */
function mediaKindFromUrl(url: string, trackKind: TrackKind): MediaKind {
  const path = url.split(/[?#]/)[0];
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return trackKind === "audio" ? "audio" : "video";
}

// ---------------------------------------------------------------------------
// O5 — text clip payload carried in metadata.framebranch
// ---------------------------------------------------------------------------

function parseTextContent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_TEXT_CONTENT) return null;
  return raw;
}

/**
 * BC.5 — missing style fields materialize to the defaults; a field that is
 * PRESENT but invalid makes the clip un-importable (returns null → skip +
 * warning). We never silently "fix" a value we were given.
 */
function parseTextStyle(raw: unknown): TextStyle | null {
  if (raw === undefined || raw === null) return { ...TEXT_STYLE_DEFAULTS };
  if (!isObject(raw)) return null;
  const style: TextStyle = { ...TEXT_STYLE_DEFAULTS };
  if (raw.font !== undefined) {
    if (
      typeof raw.font !== "string" ||
      !(TEXT_FONT_WHITELIST as readonly string[]).includes(raw.font)
    ) {
      return null;
    }
    style.font = raw.font as TextFont;
  }
  if (raw.size !== undefined) {
    if (
      typeof raw.size !== "number" ||
      !Number.isInteger(raw.size) ||
      raw.size < 8 ||
      raw.size > 200
    ) {
      return null;
    }
    style.size = raw.size;
  }
  if (raw.color !== undefined) {
    if (typeof raw.color !== "string" || !COLOR_RE.test(raw.color)) return null;
    style.color = raw.color;
  }
  return style;
}

/**
 * O5/O10 [AMENDED 2026-08-05, owner call] — clip properties travel in the
 * framebranch metadata slot, the same door text clips already use.
 *
 * OTIO core has no volume/opacity/scale/position field, so no other tool can
 * read these either way; writing them is what makes OUR export -> import
 * round-trip lossless (the demo's step-3 volume edit survives step-9 export).
 *
 * Ranges mirror verbs.ts's propertyChange validation exactly. An invalid
 * payload is REFUSED, never repaired (caller skips the clip) — we do not
 * silently "fix" a value we were handed.
 */
function parseProperties(
  raw: unknown,
  allowed: readonly ("volume" | "opacity" | "scale" | "position")[],
): Record<string, unknown> | null {
  if (raw === undefined) return {};
  if (!isObject(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key as (typeof allowed)[number])) return null;
    if (key === "volume" || key === "opacity") {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 100
      ) {
        return null;
      }
    } else if (key === "scale") {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      if (value < 0.1 || value > 10) return null;
    } else {
      if (!isObject(value)) return null;
      const { x, y } = value as { x?: unknown; y?: unknown };
      if (typeof x !== "number" || !Number.isFinite(x)) return null;
      if (typeof y !== "number" || !Number.isFinite(y)) return null;
      if (Object.keys(value).length !== 2) return null;
      out[key] = { x, y };
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Only the keys the shape actually carries (A2.2 / BC.1). */
const MEDIA_PROPERTY_KEYS = ["volume", "opacity", "scale", "position"] as const;
const TEXT_PROPERTY_KEYS = ["opacity", "position"] as const;

// ---------------------------------------------------------------------------
// importOtio (public 6/7)
// ---------------------------------------------------------------------------

export function importOtio(otioJson: unknown): ImportResult {
  try {
    return runImport(otioJson);
  } catch (error) {
    if (error instanceof OtioAbortError) {
      return { ok: false, error: error.engineError };
    }
    // Belt and braces: the input is `unknown`, the result shape is a
    // contract — nothing escapes this function as an exception.
    return {
      ok: false,
      error: {
        code: "E_INVALID_OTIO",
        message: `unreadable OTIO document: ${String(error)}`,
      },
    };
  }
}

function runImport(otioJson: unknown): ImportResult {
  const root = requireObject(otioJson, "document");
  const rootSchema = requireSchema(root, "document");
  if (rootSchema.name !== "Timeline") {
    invalid(`document is not an OTIO Timeline (got "${rootSchema.raw}")`);
  }

  const stack = requireObject(root.tracks, "timeline.tracks");
  const stackSchema = requireSchema(stack, "timeline.tracks");
  if (stackSchema.name !== "Stack") {
    invalid(`timeline.tracks is not a Stack (got "${stackSchema.raw}")`);
  }
  const trackNodes = childrenOf(stack, "timeline.tracks");

  const ctx: ImportCtx = {
    rate: FALLBACK_RATE,
    warnings: new Map(),
    mediaByUrl: new Map(),
    mediaRefs: [],
    counters: new Map(),
  };

  // O6 — (1) global_start_time's RATE (its value is ignored: our timelines
  // always start at 0), (2) else the first clip's rate, (3) else 24 + warning.
  let rate: number | null = null;
  const globalStart = root.global_start_time;
  if (globalStart !== undefined && globalStart !== null) {
    rate = parseRationalTime(globalStart, "global_start_time").rate;
  }
  if (rate === null) rate = firstClipRate(trackNodes);
  if (rate === null) {
    rate = FALLBACK_RATE;
    warn(
      ctx,
      "rate-fallback-empty-timeline",
      `no global_start_time and no clip; using ${FALLBACK_RATE}fps`,
    );
  }
  ctx.rate = rate;

  const tracks: Track[] = [];
  for (const trackNode of trackNodes) {
    const track = importTrack(ctx, trackNode);
    if (track) tracks.push(track);
  }

  const timeline: Timeline = {
    projectRate: ctx.rate,
    tracks,
    mediaRefs: ctx.mediaRefs,
  };

  // The engine's contract is that a Timeline in hand is always valid. Only
  // an internally inconsistent document can get here (e.g. a source_range
  // outside its own available_range) — that is malformed input, not a clip
  // to silently drop beyond the locked skip rules (O2/O7b).
  const violations = checkInvariants(timeline);
  if (violations.length > 0) {
    invalid(
      `imported timeline violates engine invariants (${violations
        .map((v) => v.kind)
        .join(", ")})`,
    );
  }

  return { ok: true, timeline, warnings: [...ctx.warnings.values()] };
}

/** O5 — a track is ours-text if it says so in metadata; else Video/Audio. */
function importTrackKind(track: Record<string, unknown>): TrackKind | null {
  const fb = framebranchMeta(track);
  if (fb && fb.kind === "text") return "text";
  if (track.kind === "Video") return "video";
  if (track.kind === "Audio") return "audio";
  return null;
}

function importTrack(ctx: ImportCtx, trackNode: unknown): Track | null {
  const node = requireObject(trackNode, "track");
  const schema = requireSchema(node, "track");
  if (schema.name !== "Track") {
    // O7(b) — a non-Track child of the top-level Stack (e.g. a nested
    // Stack): skip + warning, import carries on.
    warn(ctx, "skipped-unsupported", schema.raw);
    return null;
  }

  const kind = importTrackKind(node);
  if (kind === null) {
    warn(
      ctx,
      "skipped-unsupported",
      `track kind ${JSON.stringify(node.kind ?? null)}`,
    );
    return null;
  }

  const clips: AnyClip[] = [];
  let cursor = 0; // O4 — the whole point: OTIO positions are implicit.

  for (const childNode of childrenOf(node, "track")) {
    const child = requireObject(childNode, "track child");
    const childSchema = requireSchema(child, "track child");

    if (childSchema.name === "Gap") {
      // O4 — a gap creates NOTHING; it only moves the cursor.
      const gapRange = convertTimeRange(
        parseTimeRange(child.source_range, "gap source_range"),
        ctx.rate,
      );
      cursor += gapRange.duration.value;
      continue;
    }

    if (childSchema.name !== "Clip") {
      // O4/O7(b) — Transition.1, effects, a nested Stack, …: skip + warning.
      // [AMENDED 2026-08-05, owner call] The cursor advances by the skipped
      // item's OWN duration when it has one. A Transition carries no
      // source_range, so it still does not move the cursor (O4's locked
      // rule — it consumes no track time). But a nested Stack DOES occupy
      // its span; not advancing there pulled every later clip left.
      // One rule covers both: "advance by whatever span the item declares".
      warn(ctx, "skipped-unsupported", childSchema.raw);
      if (child.source_range !== undefined) {
        const skippedRange = convertTimeRange(
          parseTimeRange(child.source_range, `${childSchema.raw} source_range`),
          ctx.rate,
        );
        cursor += skippedRange.duration.value;
      }
      continue;
    }

    const clip = importClip(ctx, child, kind, cursor);
    // A clip always occupies its own span in OTIO, even when we skip it —
    // so the cursor advances either way (O2/O7b skips must not shift the
    // rest of the track).
    cursor += clip.duration;
    if (clip.clip) clips.push(clip.clip);
  }

  return { id: mint(ctx, "track"), kind, clips: clips as Track["clips"] };
}

type ImportedClip = { clip: AnyClip | null; duration: number };

function importClip(
  ctx: ImportCtx,
  node: Record<string, unknown>,
  trackKind: TrackKind,
  cursor: number,
): ImportedClip {
  const rawRange = parseTimeRange(node.source_range, "clip source_range");
  const sourceRange = convertTimeRange(rawRange, ctx.rate);
  const duration = sourceRange.duration.value;

  if (duration <= 0) {
    // A4 (3) — zero/negative-duration clip on import: skip + itemized warning.
    warn(ctx, "skipped-unsupported", "zero-duration clip");
    return { clip: null, duration: Math.max(duration, 0) };
  }

  const timelineRange: TimeRange = {
    start: rt(cursor, ctx.rate),
    duration: sourceRange.duration,
  };

  const fb = framebranchMeta(node);
  if (fb && fb.kind === "text") {
    return {
      clip: importTextClip(ctx, fb, trackKind, timelineRange),
      duration,
    };
  }

  const mediaNode = node.media_reference;
  if (mediaNode === undefined || mediaNode === null) {
    warn(ctx, "skipped-unknown-clip", "clip without a media reference");
    return { clip: null, duration };
  }

  const media = requireObject(mediaNode, "media_reference");
  const mediaSchema = requireSchema(media, "media_reference");

  if (mediaSchema.name === "MissingReference") {
    // O5 — someone else's placeholder clip: no media, no framebranch
    // metadata, nothing we can honestly represent.
    warn(ctx, "skipped-unknown-clip", mediaSchema.raw);
    return { clip: null, duration };
  }
  if (mediaSchema.name !== "ExternalReference") {
    // O7(b) — e.g. ImageSequenceReference.1, GeneratorReference.1.
    warn(ctx, "skipped-unsupported", mediaSchema.raw);
    return { clip: null, duration };
  }
  if (trackKind === "text") {
    warn(ctx, "skipped-unknown-clip", "media clip on a text track");
    return { clip: null, duration };
  }

  return {
    clip: importMediaClip(
      ctx,
      media,
      rawRange,
      sourceRange,
      trackKind,
      timelineRange,
      fb ?? null,
    ),
    duration,
  };
}

function importTextClip(
  ctx: ImportCtx,
  fb: Record<string, unknown>,
  trackKind: TrackKind,
  timelineRange: TimeRange,
): TextClip | null {
  if (trackKind !== "text") {
    warn(ctx, "skipped-unknown-clip", "text clip on a non-text track");
    return null;
  }
  const textContent = parseTextContent(fb.textContent);
  if (textContent === null) {
    warn(ctx, "skipped-unknown-clip", "text clip with invalid textContent");
    return null;
  }
  const textStyle = parseTextStyle(fb.textStyle);
  if (textStyle === null) {
    warn(ctx, "skipped-unknown-clip", "text clip with invalid textStyle");
    return null;
  }
  const properties = parseProperties(fb.properties, TEXT_PROPERTY_KEYS);
  if (properties === null) {
    warn(ctx, "skipped-unknown-clip", "text clip with invalid properties");
    return null;
  }

  const id = mint(ctx, "clip");
  return {
    id,
    timelineRange,
    textContent,
    textStyle,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    lineage: {
      rootId: id,
      span: { start: rt(0, ctx.rate), duration: timelineRange.duration },
    },
  };
}

function importMediaClip(
  ctx: ImportCtx,
  media: Record<string, unknown>,
  rawRange: TimeRange,
  sourceRange: TimeRange,
  trackKind: TrackKind,
  timelineRange: TimeRange,
  fb: Record<string, unknown> | null,
): Clip | null {
  const url = media.target_url;
  if (typeof url !== "string" || url.length === 0) {
    invalid("media_reference.target_url: expected a non-empty string");
  }

  const kind = mediaKindFromUrl(url, trackKind);

  const properties = parseProperties(fb?.properties, MEDIA_PROPERTY_KEYS);
  if (properties === null) {
    warn(ctx, "skipped-unknown-clip", "clip with invalid properties");
    return null;
  }

  const rawAvailable =
    media.available_range === undefined || media.available_range === null
      ? null
      : parseTimeRange(media.available_range, "available_range");

  // O1 — image = "unbounded": durationInSource is null, exactly and only
  // for images. O2 — video/audio without a length is not importable.
  let durationInSource: RationalTime | null;
  if (kind === "image") {
    durationInSource = null;
  } else if (rawAvailable === null) {
    warn(ctx, "skipped-media-length-missing", url);
    return null;
  } else {
    durationInSource = convertRate(rawAvailable.duration, ctx.rate);
  }

  let mediaRef = ctx.mediaByUrl.get(url);
  if (!mediaRef) {
    mediaRef = {
      id: mint(ctx, "media"),
      kind,
      url,
      // OTIO carries no fingerprint; hash is an integration-ready field
      // that V1 flows never read (A2.1).
      hash: "",
      // The file's native fps: the media's own range when it has one,
      // otherwise the rate the clip's source window was written in.
      sourceRate: (rawAvailable ?? rawRange).start.rate,
      durationInSource,
    };
    ctx.mediaByUrl.set(url, mediaRef);
    ctx.mediaRefs.push(mediaRef);
  }

  const id = mint(ctx, "clip");
  return {
    id,
    mediaRefId: mediaRef.id,
    sourceRange,
    timelineRange,
    properties,
    lineage: {
      rootId: id,
      span: { start: rt(0, ctx.rate), duration: timelineRange.duration },
    },
  };
}

// ---------------------------------------------------------------------------
// exportOtio (public 7/7)
// ---------------------------------------------------------------------------

const rationalTimeJson = (t: RationalTime): OtioJson => ({
  OTIO_SCHEMA: "RationalTime.1",
  rate: t.rate,
  value: t.value,
});

const timeRangeJson = (r: TimeRange): OtioJson => ({
  OTIO_SCHEMA: "TimeRange.1",
  start_time: rationalTimeJson(r.start),
  duration: rationalTimeJson(r.duration),
});

/** O4 — every empty stretch becomes a real `Gap.1` item ("Filler"). */
const gapJson = (duration: number, rate: number): OtioJson => ({
  OTIO_SCHEMA: "Gap.1",
  name: "Filler",
  source_range: timeRangeJson({
    start: rt(0, rate),
    duration: rt(duration, rate),
  }),
  effects: [],
  markers: [],
  metadata: {},
});

const isTextClip = (c: AnyClip): c is TextClip => "textContent" in c;

/**
 * exportOtio — our timeline → an OTIO document. Never fails, never writes
 * internal IDs (docs/09 #11); the only thing we add to the format is the
 * locked `metadata.framebranch` extension (O5).
 */
export function exportOtio(timeline: Timeline): OtioJson {
  const rate = timeline.projectRate;
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: "",
    // O6 — round-trips the project rate exactly, including for an empty
    // timeline. The VALUE is always 0: our timelines start at 0.
    global_start_time: rationalTimeJson(rt(0, rate)),
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: timeline.tracks.map((track) => exportTrack(track, timeline)),
      markers: [],
      effects: [],
      metadata: {},
    },
    metadata: {},
  };
}

function exportTrack(track: Track, timeline: Timeline): OtioJson {
  const rate = timeline.projectRate;
  const clips = [...(track.clips as readonly AnyClip[])].sort(
    (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
  );

  const children: OtioJson[] = [];
  let cursor = 0;
  for (const clip of clips) {
    const start = clip.timelineRange.start.value;
    // O4 — leading gap + every gap between clips; omitting them would
    // silently slide every later clip (OTIO positions are implicit).
    if (start > cursor) children.push(gapJson(start - cursor, rate));
    children.push(exportClip(clip, timeline));
    cursor = Math.max(cursor, rangeEnd(clip.timelineRange));
  }

  // O5 — OTIO has no text track kind: it goes out as Video + our metadata.
  const metadata: OtioJson =
    track.kind === "text" ? { framebranch: { kind: "text" } } : {};

  return {
    OTIO_SCHEMA: "Track.1",
    name: "",
    kind: track.kind === "audio" ? "Audio" : "Video",
    children,
    markers: [],
    effects: [],
    metadata,
  };
}

function exportClip(clip: AnyClip, timeline: Timeline): OtioJson {
  if (isTextClip(clip)) {
    // O5 — text clip = Clip.1 + MissingReference.1 + framebranch metadata.
    return {
      OTIO_SCHEMA: "Clip.1",
      name: "",
      source_range: timeRangeJson({
        start: rt(0, clip.timelineRange.duration.rate),
        duration: clip.timelineRange.duration,
      }),
      media_reference: {
        OTIO_SCHEMA: "MissingReference.1",
        name: "",
        available_range: null,
        metadata: {},
      },
      effects: [],
      markers: [],
      metadata: {
        framebranch: {
          kind: "text",
          textContent: clip.textContent,
          textStyle: { ...clip.textStyle },
          ...propertiesJson(clip.properties),
        },
      },
    };
  }

  const media = timeline.mediaRefs.find((m) => m.id === clip.mediaRefId);
  return {
    OTIO_SCHEMA: "Clip.1",
    name: "",
    source_range: timeRangeJson(clip.sourceRange),
    media_reference: media
      ? {
          OTIO_SCHEMA: "ExternalReference.1",
          target_url: media.url,
          // O1 — an image has no length, so it has no available_range.
          available_range:
            media.durationInSource === null
              ? null
              : timeRangeJson({
                  start: rt(0, media.durationInSource.rate),
                  duration: media.durationInSource,
                }),
          metadata: {},
        }
      : // Export never fails (docs/09 #12/#13): a clip whose media ref is
        // gone still goes out, honestly, as a placeholder.
        {
          OTIO_SCHEMA: "MissingReference.1",
          name: "",
          available_range: null,
          metadata: {},
        },
    effects: [],
    markers: [],
    // O5/O10 — properties ride in our own namespace; a clip sitting at the
    // B3.1 defaults writes nothing at all, so plain files stay plain.
    metadata: emptyOrFramebranch(propertiesJson(clip.properties)),
  };
}

function propertiesJson(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const entries = Object.entries(properties ?? {}).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) return {};
  return { properties: Object.fromEntries(entries) };
}

function emptyOrFramebranch(payload: Record<string, unknown>): OtioJson {
  return Object.keys(payload).length === 0 ? {} : { framebranch: payload };
}
