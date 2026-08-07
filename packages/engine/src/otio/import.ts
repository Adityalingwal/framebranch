import { checkInvariants } from "../invariants";
import { convertRate } from "../time";
import { TEXT_FONT_WHITELIST, TEXT_STYLE_DEFAULTS } from "../verbs";
import type { Clip, MediaKind, MediaRef, RationalTime, TextClip, TextFont, TextStyle, Timeline, TimeRange, Track, TrackKind } from "../types";
import { COLOR_RE, FALLBACK_RATE, IMAGE_EXTENSIONS, MAX_TEXT_CONTENT, TRACK_KIND_FOR_MEDIA, type ImportResult, type ImportWarning, type ImportWarningCode } from "./types";
import { type AnyClip, OtioAbortError, childrenOf, convertTimeRange, framebranchMeta, invalid, isObject, parseRationalTime, parseTimeRange, requireObject, requireSchema, rt } from "./shared-parsers";

type ImportCtx = {
  rate: number;
  /** key = JSON.stringify([code, detail]) → grouped entry . */
  warnings: Map<string, ImportWarning>;
  mediaByUrl: Map<string, MediaRef>;
  mediaRefs: MediaRef[];
  counters: Map<string, number>;
};

/**
 * Import is always a fresh start ( #10) — every id is minted here.
 * Deterministic per-document counters: same file in → same ids out, and the
 * ids are `@`-free, so the split namespace stays reserved.
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

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// project rate
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

/**
 * (2): the rate of the FIRST clip in document order. Deliberately
 * tolerant — it only reads; every real validation (and every abort) is the
 * main walk's job, so a broken document reports its error exactly once.
 */
function firstClipRate(trackNodes: readonly unknown[]): number | null {
  for (const trackNode of trackNodes) {
    if (!isObject(trackNode)) continue;
    // Only real Tracks: a nested Stack at this level is skipped by the walk
    // so taking the project rate from a clip inside it would let a
    // discarded clip decide the rate every KEPT value then converts into.
    // [, 2026-08-05 review.]
    const trackSchema = trackNode.OTIO_SCHEMA;
    if (typeof trackSchema !== "string" || !trackSchema.startsWith("Track.")) {
      continue;
    }
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

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// media kind from the target_url extension
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

/**
 * `.png .jpg .jpeg .webp` → image; otherwise the track decides. An
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

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// text clip payload carried in metadata.framebranch
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

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
 * / [AMENDED 2026-08-05, owner call] — clip properties travel in the
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

/**
 * Which properties each kind may carry — the 6x4 applicability matrix
 * the same table `verbs.ts` enforces. Import must not mint a state
 * no verb could produce: an image with a volume would fail
 * E_PROPERTY_NOT_APPLICABLE from applyCommand, yet diff/merge would go on
 * comparing it as a real field. [, 2026-08-05 review.]
 */
const PROPERTY_KEYS_BY_KIND = {
  video: ["volume", "opacity", "scale", "position"],
  audio: ["volume"],
  image: ["opacity", "scale", "position"],
  text: ["opacity", "position"],
} as const satisfies Record<
  MediaKind | "text",
  readonly ("volume" | "opacity" | "scale" | "position")[]
>;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// importOtio (public 6/7)
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

/**
 * `targetRate` — : importing into a project that already has a rate
 * (a re-import, not the project's first) must land ON that rate, not
 * whatever the new file declares ( is for establishing a rate from
 * scratch). When given, it skips entirely and every value converts to
 * it — same single door, same `convertRate`, just caller-supplied.
 */
export function importOtio(
  otioJson: unknown,
  targetRate?: number,
): ImportResult {
  try {
    return runImport(otioJson, targetRate);
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

function runImport(otioJson: unknown, targetRate?: number): ImportResult {
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

  // (1) global_start_time's RATE (its value is ignored: our timelines
  // always start at 0), (2) else the first clip's rate, (3) else 24 + warning.
  // Skipped entirely when the caller supplies `targetRate` (a re-import
  // landing on an existing project's rate, not establishing a fresh one).
  let rate: number | null = targetRate ?? null;
  const globalStart = root.global_start_time;
  if (rate === null && globalStart !== undefined && globalStart !== null) {
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
  // to silently drop beyond the locked skip rules (/).
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

/** — a track is ours-text if it says so in metadata; else Video/Audio. */
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
    // (b) — a non-Track child of the top-level Stack (e.g. a nested
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
      // a gap creates NOTHING; it only moves the cursor.
      const gapRange = convertTimeRange(
        parseTimeRange(child.source_range, "gap source_range"),
        ctx.rate,
      );
      cursor += gapRange.duration.value;
      continue;
    }

    if (childSchema.name !== "Clip") {
      // /(b) — Transition.1, effects, a nested Stack, …: skip + warning.
      // [AMENDED 2026-08-05, owner call] The cursor advances by the skipped
      // item's OWN duration when it has one. A Transition carries no
      // source_range, so it still does not move the cursor ('s locked
      // rule — it consumes no track time). But a nested Stack DOES occupy
      // its span; not advancing there pulled every later clip left.
      // One rule covers both: "advance by whatever span the item declares".
      warn(ctx, "skipped-unsupported", childSchema.raw);
      // `source_range: null` is what real serializers write for an untrimmed
      // Item — it means "no range of its own", exactly like the field being
      // absent. Treating null as present aborted the whole import on the very
      // shape (b) says to skip past.
      if (child.source_range !== undefined && child.source_range !== null) {
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
    // so the cursor advances either way (/ skips must not shift the
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
    // (3) — zero/negative-duration clip on import: skip + itemized warning.
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
    // someone else's placeholder clip: no media, no framebranch
    // metadata, nothing we can honestly represent.
    warn(ctx, "skipped-unknown-clip", mediaSchema.raw);
    return { clip: null, duration };
  }
  if (mediaSchema.name !== "ExternalReference") {
    // (b) — e.g. ImageSequenceReference.1, GeneratorReference.1.
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
  const properties = parseProperties(fb.properties, PROPERTY_KEYS_BY_KIND.text);
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

  // track mapping : an image is visual, so it lives on a VIDEO
  // track — never on an audio or text lane. `addClip` refuses that placement
  // with E_TRACK_KIND_MISMATCH, and the invariant sweep does not cover
  // track-kind, so without this check import could mint a timeline no verb
  // could build. Same non-coercion rule already used for text/media
  // mismatches: skip the clip, never guess the track. [, 2026-08-05.]
  if (TRACK_KIND_FOR_MEDIA[kind] !== trackKind) {
    warn(ctx, "skipped-unknown-clip", `${kind} media on a ${trackKind} track`);
    return null;
  }

  const properties = parseProperties(
    fb?.properties,
    PROPERTY_KEYS_BY_KIND[kind],
  );
  if (properties === null) {
    warn(ctx, "skipped-unknown-clip", "clip with invalid properties");
    return null;
  }

  const rawAvailable =
    media.available_range === undefined || media.available_range === null
      ? null
      : parseTimeRange(media.available_range, "available_range");

  // image = "unbounded": durationInSource is null, exactly and only
  // for images. — video/audio without a length is not importable.
  let durationInSource: RationalTime | null;
  if (kind === "image") {
    durationInSource = null;
  } else if (rawAvailable === null) {
    warn(ctx, "skipped-media-length-missing", url);
    return null;
  } else {
    durationInSource = convertRate(rawAvailable.duration, ctx.rate);
  }

  // amendment (2026-08-05) — OTIO source coordinates live inside the
  // media's OWN range, which need not start at 0 (embedded timecode). Engine
  // coordinates always start at 0, so the door normalizes: subtract the
  // file's start here, add it back on export. Ignoring it rejected valid
  // files (a window at 250 inside [90,290) looked out of a 200-long file)
  // AND silently accepted invalid ones (frame 5, which that file lacks).
  const fileStart =
    rawAvailable === null ? null : convertRate(rawAvailable.start, ctx.rate);
  const offset = fileStart?.value ?? 0;
  const localSourceRange: TimeRange =
    offset === 0
      ? sourceRange
      : {
          start: rt(sourceRange.start.value - offset, ctx.rate),
          duration: sourceRange.duration,
        };

  let mediaRef = ctx.mediaByUrl.get(url);
  if (!mediaRef) {
    mediaRef = {
      id: mint(ctx, "media"),
      kind,
      url,
      // OTIO carries no fingerprint; hash is an integration-ready field
      // that flows never read .
      hash: "",
      // The file's native fps: the media's own range when it has one,
      // otherwise the rate the clip's source window was written in.
      sourceRate: (rawAvailable ?? rawRange).start.rate,
      durationInSource,
      // Only carried when it is not the boring 0 — plain files stay plain.
      ...(fileStart && fileStart.value !== 0
        ? { sourceStartInFile: fileStart }
        : {}),
    };
    ctx.mediaByUrl.set(url, mediaRef);
    ctx.mediaRefs.push(mediaRef);
  }

  const id = mint(ctx, "clip");
  return {
    id,
    mediaRefId: mediaRef.id,
    sourceRange: localSourceRange,
    timelineRange,
    properties,
    lineage: {
      rootId: id,
      span: { start: rt(0, ctx.rate), duration: timelineRange.duration },
    },
  };
}
