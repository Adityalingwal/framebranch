/**
 * verbs.ts — A3.1–A3.8: the 8 locked verbs.
 *
 * Every verb answers the locked 5-question contract: command shape /
 * preconditions (typed errors) / exact transition / inverse / errors.
 * Invariant-class preconditions are NOT re-implemented per verb: each
 * verb builds its candidate state and runs THE single invariant list
 * (invariants.ts, B2.3 DRY) — the first relevant violation maps to its
 * locked error code.
 *
 * Pure core (C7): no DB / network / UI imports. applyCommand never
 * mutates its input timeline — it returns a new one.
 */

import {
  checkInvariants,
  VIOLATION_ERROR_CODE,
  type InvariantViolation,
} from "./invariants";
import type {
  AddClipMediaCommand,
  AddClipTextCommand,
  ApplyError,
  ApplyNoChange,
  ApplyOk,
  ApplyOptions,
  ApplyResult,
  Clip,
  Command,
  DeleteClipCommand,
  EngineCommand,
  ErrorCode,
  MediaRef,
  MoveCommand,
  Position,
  PropertyChangeCommand,
  RationalTime,
  RestoreClipCommand,
  RippleDeleteCommand,
  SlipCommand,
  SplitCommand,
  TextClip,
  TextFont,
  TextStyle,
  Timeline,
  TimeRange,
  Track,
  TrackKind,
  TrimCommand,
} from "./types";

// ---------------------------------------------------------------------------
// Locked constants
// ---------------------------------------------------------------------------

/** BC.5 — V1 font whitelist; default = first of the list. */
export const TEXT_FONT_WHITELIST = [
  "Arial",
  "Georgia",
  "Courier New",
] as const satisfies readonly TextFont[];

/** BC.5 — text style defaults (size 48, white, Arial). */
export const TEXT_STYLE_DEFAULTS: TextStyle = {
  font: "Arial",
  size: 48,
  color: "#ffffff",
};

/** B3.1 — property defaults ("not written" compares equal to these). */
export const PROPERTY_DEFAULTS = {
  volume: 100,
  opacity: 100,
  scale: 1,
  position: { x: 0, y: 0 } as Position,
} as const;

/** BC.5 storage rule — always lowercase 6-digit #rrggbb. */
const COLOR_RE = /^#[0-9a-f]{6}$/;

const MAX_TEXT_CONTENT = 500; // A3.6

type KindColumn = "video" | "audio" | "image" | "text";

/**
 * A3.6 + N1 amendment — the FULL 6×4 applicability matrix. For media
 * clips the column is the MEDIA kind (MediaRef.kind); text clips use the
 * text column.
 */
export const PROPERTY_APPLICABILITY: Record<
  PropertyChangeCommand["property"],
  Record<KindColumn, boolean>
> = {
  volume: { video: true, audio: true, image: false, text: false },
  opacity: { video: true, audio: false, image: true, text: true },
  scale: { video: true, audio: false, image: true, text: false },
  position: { video: true, audio: false, image: true, text: true },
  textContent: { video: false, audio: false, image: false, text: true },
  textStyle: { video: false, audio: false, image: false, text: true },
};

/** N1 — track-kind match: which track kind each media kind sits on. */
const TRACK_KIND_FOR_MEDIA: Record<MediaRef["kind"], TrackKind> = {
  video: "video",
  audio: "audio",
  image: "video", // image is visual → video track (audio ❌, text ❌)
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type AnyClip = Clip | TextClip;

const isTextClip = (c: AnyClip): c is TextClip => "textContent" in c;

const err = (code: ErrorCode, message: string): ApplyError => ({
  ok: false,
  error: { code, message },
});

const ok = (timeline: Timeline, inverse: EngineCommand[]): ApplyOk => ({
  ok: true,
  noChange: false,
  timeline,
  inverse,
});

/** A4 (1): silent success, no record, timeline returned unchanged. */
const noChange = (timeline: Timeline): ApplyNoChange => ({
  ok: true,
  noChange: true,
  timeline,
});

const rt = (value: number, rate: number): RationalTime => ({ value, rate });

const rangeEnd = (r: TimeRange): number => r.start.value + r.duration.value;

function getTrack(tl: Timeline, trackId: string): Track | undefined {
  return tl.tracks.find((t) => t.id === trackId);
}

function locateClip(
  tl: Timeline,
  clipId: string,
): { track: Track; clip: AnyClip } | undefined {
  for (const track of tl.tracks) {
    const clips: readonly AnyClip[] = track.clips;
    const clip = clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return undefined;
}

function getMedia(tl: Timeline, mediaRefId: string): MediaRef | undefined {
  return tl.mediaRefs.find((m) => m.id === mediaRefId);
}

/**
 * Clip arrays are kept in a normal form: sorted by timeline start.
 * (Deterministic storage order; ties are impossible under no-overlap.
 * Makes undo round-trips structurally exact.)
 */
function sortClips(clips: AnyClip[]): AnyClip[] {
  return [...clips].sort(
    (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
  );
}

function withTrackClips(
  tl: Timeline,
  trackId: string,
  clips: AnyClip[],
): Timeline {
  return {
    ...tl,
    tracks: tl.tracks.map((t) =>
      t.id === trackId
        ? { ...t, clips: sortClips(clips) as Track["clips"] }
        : t,
    ),
  };
}

function trackClips(track: Track): readonly AnyClip[] {
  return track.clips;
}

/** All RationalTime fields of a command must carry the project rate (A1.2). */
function rateMismatch(
  projectRate: number,
  times: RationalTime[],
): ApplyError | null {
  for (const t of times) {
    if (t.rate !== projectRate) {
      return err(
        "E_RATE_MISMATCH",
        `time rate ${t.rate} does not match project rate ${projectRate}`,
      );
    }
  }
  return null;
}

/**
 * Edit door of B2.3: run THE invariant list over the candidate state and
 * return the first violation involving the affected clip(s), mapped to
 * its locked error code. Priority order is fixed (deterministic):
 * duration → negative start → BC.4 → source bounds → overlap → empty text.
 */
const VIOLATION_PRIORITY: InvariantViolation["kind"][] = [
  "nonpositive-duration",
  "negative-start",
  "source-timeline-duration-mismatch",
  "source-out-of-file",
  "overlap",
  "empty-text-content",
];

function candidateError(
  candidate: Timeline,
  clipIds: string[],
): ApplyError | null {
  const relevant = checkInvariants(candidate).filter((v) =>
    v.kind === "overlap"
      ? v.clipIds.some((id) => clipIds.includes(id))
      : clipIds.includes(v.clipId),
  );
  if (relevant.length === 0) return null;
  relevant.sort(
    (a, b) =>
      VIOLATION_PRIORITY.indexOf(a.kind) - VIOLATION_PRIORITY.indexOf(b.kind),
  );
  const first = relevant[0];
  return err(VIOLATION_ERROR_CODE[first.kind], describeViolation(first));
}

function describeViolation(v: InvariantViolation): string {
  switch (v.kind) {
    case "nonpositive-duration":
      return `clip ${v.clipId}: ${v.range} duration must be > 0`;
    case "negative-start":
      return `clip ${v.clipId}: timeline start must be >= 0`;
    case "source-timeline-duration-mismatch":
      return `clip ${v.clipId}: sourceRange.duration must equal timelineRange.duration (BC.4)`;
    case "source-out-of-file":
      return `clip ${v.clipId}: source range is outside the media file`;
    case "overlap":
      return `clips ${v.clipIds[0]} and ${v.clipIds[1]} overlap on track ${v.trackId}`;
    case "empty-text-content":
      return `clip ${v.clipId}: text content must be non-empty`;
  }
}

function defaultMintId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for exotic runtimes without WebCrypto.
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Public entry — A3 dispatch
// ---------------------------------------------------------------------------

/**
 * Apply one PUBLIC command to a timeline. Pure function: returns a typed
 * error, a no-change success (A4), or the new timeline + inverse.
 */
export function applyCommand(
  timeline: Timeline,
  command: Command,
  options?: ApplyOptions,
): ApplyResult {
  return applyEngineCommand(timeline, command, options);
}

/**
 * Engine-internal apply: additionally accepts the restore form (A3.1c)
 * so inverse (undo) step lists can be executed. NOT exported via index.
 */
export function applyEngineCommand(
  timeline: Timeline,
  command: EngineCommand,
  options?: ApplyOptions,
): ApplyResult {
  switch (command.op) {
    case "addClip":
      if ("clip" in command) return applyRestoreClip(timeline, command);
      if ("mediaRefId" in command)
        return applyAddMediaClip(timeline, command, options);
      return applyAddTextClip(timeline, command, options);
    case "deleteClip":
      return applyDeleteClip(timeline, command);
    case "move":
      return applyMove(timeline, command);
    case "trim":
      return applyTrim(timeline, command);
    case "slip":
      return applySlip(timeline, command);
    case "propertyChange":
      return applyPropertyChange(timeline, command);
    case "rippleDelete":
      return applyRippleDelete(timeline, command);
    case "split":
      return applySplit(timeline, command);
  }
}

// ---------------------------------------------------------------------------
// A3.1 (a) — addClip, media payload
// ---------------------------------------------------------------------------

function applyAddMediaClip(
  tl: Timeline,
  cmd: AddClipMediaCommand,
  options?: ApplyOptions,
): ApplyResult {
  const track = getTrack(tl, cmd.trackId);
  if (!track) return err("E_TRACK_NOT_FOUND", `track ${cmd.trackId} not found`);

  const media = getMedia(tl, cmd.mediaRefId);
  if (!media)
    return err("E_MEDIA_NOT_FOUND", `media ${cmd.mediaRefId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [
    cmd.sourceRange.start,
    cmd.sourceRange.duration,
    cmd.timelineRange.start,
    cmd.timelineRange.duration,
  ]);
  if (rateErr) return rateErr;

  if (track.kind !== TRACK_KIND_FOR_MEDIA[media.kind]) {
    return err(
      "E_TRACK_KIND_MISMATCH",
      `${media.kind} media cannot sit on a ${track.kind} track`,
    );
  }

  const id = (options?.mintId ?? defaultMintId)();
  const clip: Clip = {
    id,
    mediaRefId: cmd.mediaRefId,
    sourceRange: cmd.sourceRange,
    timelineRange: cmd.timelineRange,
    properties: {},
    lineage: {
      rootId: id,
      span: {
        start: rt(0, tl.projectRate),
        duration: cmd.timelineRange.duration,
      },
    },
  };

  const candidate = withTrackClips(tl, track.id, [...trackClips(track), clip]);
  const invErr = candidateError(candidate, [id]);
  if (invErr) return invErr;

  return ok(candidate, [{ op: "deleteClip", clipId: id }]);
}

// ---------------------------------------------------------------------------
// A3.1 (b) — addClip, text payload (F4 + N2)
// ---------------------------------------------------------------------------

function validateTextContent(value: unknown): ApplyError | null {
  if (typeof value !== "string" || value.length === 0) {
    return err(
      "E_INVALID_VALUE",
      "textContent is required and must be non-empty",
    );
  }
  if (value.length > MAX_TEXT_CONTENT) {
    return err(
      "E_INVALID_VALUE",
      `textContent exceeds ${MAX_TEXT_CONTENT} characters`,
    );
  }
  return null;
}

function validateTextStyleField<K extends keyof TextStyle>(
  key: K,
  value: TextStyle[K],
): ApplyError | null {
  if (key === "font") {
    if (!(TEXT_FONT_WHITELIST as readonly string[]).includes(value as string)) {
      return err(
        "E_INVALID_VALUE",
        `font must be one of ${TEXT_FONT_WHITELIST.join(", ")}`,
      );
    }
  } else if (key === "size") {
    const size = value as number;
    if (!Number.isInteger(size) || size < 8 || size > 200) {
      return err("E_INVALID_VALUE", "textStyle.size must be an integer 8-200");
    }
  } else {
    if (typeof value !== "string" || !COLOR_RE.test(value)) {
      return err(
        "E_INVALID_VALUE",
        "textStyle.color must be lowercase #rrggbb",
      );
    }
  }
  return null;
}

/** BC.5 — materialize defaults per missing field; validate provided ones. */
function materializeTextStyle(
  partial: Partial<TextStyle> | undefined,
): { style: TextStyle } | { error: ApplyError } {
  const style: TextStyle = { ...TEXT_STYLE_DEFAULTS, ...(partial ?? {}) };
  for (const key of ["font", "size", "color"] as const) {
    if (partial?.[key] !== undefined) {
      const e = validateTextStyleField(key, style[key]);
      if (e) return { error: e };
    }
  }
  return { style };
}

function applyAddTextClip(
  tl: Timeline,
  cmd: AddClipTextCommand,
  options?: ApplyOptions,
): ApplyResult {
  const track = getTrack(tl, cmd.trackId);
  if (!track) return err("E_TRACK_NOT_FOUND", `track ${cmd.trackId} not found`);

  if (track.kind !== "text") {
    return err(
      "E_TRACK_KIND_MISMATCH",
      `text clip cannot sit on a ${track.kind} track`,
    );
  }

  const rateErr = rateMismatch(tl.projectRate, [
    cmd.timelineRange.start,
    cmd.timelineRange.duration,
  ]);
  if (rateErr) return rateErr;

  const contentErr = validateTextContent(cmd.textContent);
  if (contentErr) return contentErr;

  const styleResult = materializeTextStyle(cmd.textStyle);
  if ("error" in styleResult) return styleResult.error;

  const id = (options?.mintId ?? defaultMintId)();
  const clip: TextClip = {
    id,
    timelineRange: cmd.timelineRange,
    textContent: cmd.textContent,
    textStyle: styleResult.style,
    lineage: {
      rootId: id,
      span: {
        start: rt(0, tl.projectRate),
        duration: cmd.timelineRange.duration,
      },
    },
  };

  const candidate = withTrackClips(tl, track.id, [...trackClips(track), clip]);
  const invErr = candidateError(candidate, [id]);
  if (invErr) return invErr;

  return ok(candidate, [{ op: "deleteClip", clipId: id }]);
}

// ---------------------------------------------------------------------------
// A3.1 (c) — addClip, INTERNAL restore form (undo only, id preserved)
// ---------------------------------------------------------------------------

function applyRestoreClip(tl: Timeline, cmd: RestoreClipCommand): ApplyResult {
  const track = getTrack(tl, cmd.trackId);
  if (!track) return err("E_TRACK_NOT_FOUND", `track ${cmd.trackId} not found`);

  // Undo runs LIFO so the preimage always fits (A3.1c); the invariant
  // sweep stays on as a loud fail-safe against engine bugs.
  const candidate = withTrackClips(tl, track.id, [
    ...trackClips(track),
    cmd.clip,
  ]);
  const invErr = candidateError(candidate, [cmd.clip.id]);
  if (invErr) return invErr;

  return ok(candidate, [{ op: "deleteClip", clipId: cmd.clip.id }]);
}

// ---------------------------------------------------------------------------
// A3.2 — deleteClip (gap stays; neighbours do NOT move)
// ---------------------------------------------------------------------------

function applyDeleteClip(tl: Timeline, cmd: DeleteClipCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const remaining = trackClips(loc.track).filter((c) => c.id !== cmd.clipId);
  const candidate = withTrackClips(tl, loc.track.id, [...remaining]);

  // Inverse = internal restore form: full preimage back, id preserved.
  return ok(candidate, [
    { op: "addClip", trackId: loc.track.id, clip: loc.clip },
  ]);
}

// ---------------------------------------------------------------------------
// A3.3 — move (same-track only; ONLY timelineRange.start changes)
// ---------------------------------------------------------------------------

function applyMove(tl: Timeline, cmd: MoveCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [cmd.newStart]);
  if (rateErr) return rateErr;

  const oldStart = loc.clip.timelineRange.start;
  if (cmd.newStart.value === oldStart.value) return noChange(tl); // A4

  const updated: AnyClip = {
    ...loc.clip,
    timelineRange: { ...loc.clip.timelineRange, start: cmd.newStart },
  };
  const candidate = withTrackClips(
    tl,
    loc.track.id,
    trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
  );
  const invErr = candidateError(candidate, [cmd.clipId]);
  if (invErr) return invErr;

  return ok(candidate, [
    { op: "move", clipId: cmd.clipId, newStart: oldStart },
  ]);
}

// ---------------------------------------------------------------------------
// A3.4 — trim (source + timeline move together, BC.3 equations)
// ---------------------------------------------------------------------------

function applyTrim(tl: Timeline, cmd: TrimCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [cmd.delta]);
  if (rateErr) return rateErr;

  const d = cmd.delta.value;
  if (d === 0) return noChange(tl); // A4

  const clip = loc.clip;
  const rate = tl.projectRate;
  const tlr = clip.timelineRange;

  // BC.3: timeline and source window always change together, by the same
  // amount, on the same side. minus = cut, plus = extend.
  const newTimeline: TimeRange =
    cmd.edge === "start"
      ? {
          start: rt(tlr.start.value - d, rate),
          duration: rt(tlr.duration.value + d, rate),
        }
      : { start: tlr.start, duration: rt(tlr.duration.value + d, rate) };

  // Lineage span moves in lockstep (root-local content coordinate).
  const span = clip.lineage.span;
  const newSpan: TimeRange =
    cmd.edge === "start"
      ? {
          start: rt(span.start.value - d, rate),
          duration: rt(span.duration.value + d, rate),
        }
      : { start: span.start, duration: rt(span.duration.value + d, rate) };

  let updated: AnyClip;
  if (isTextClip(clip)) {
    // #16 — text has no source window: timeline only.
    updated = {
      ...clip,
      timelineRange: newTimeline,
      lineage: { ...clip.lineage, span: newSpan },
    };
  } else {
    const src = clip.sourceRange;
    const newSource: TimeRange =
      cmd.edge === "start"
        ? {
            start: rt(src.start.value - d, rate),
            duration: rt(src.duration.value + d, rate),
          }
        : { start: src.start, duration: rt(src.duration.value + d, rate) };
    updated = {
      ...clip,
      sourceRange: newSource,
      timelineRange: newTimeline,
      lineage: { ...clip.lineage, span: newSpan },
    };
  }

  const candidate = withTrackClips(
    tl,
    loc.track.id,
    trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
  );
  const invErr = candidateError(candidate, [cmd.clipId]);
  if (invErr) return invErr;

  return ok(candidate, [
    { op: "trim", clipId: cmd.clipId, edge: cmd.edge, delta: rt(-d, rate) },
  ]);
}

// ---------------------------------------------------------------------------
// A3.5 — slip (ONLY sourceRange.start moves; timeline untouched)
// ---------------------------------------------------------------------------

function applySlip(tl: Timeline, cmd: SlipCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  if (isTextClip(loc.clip)) {
    return err(
      "E_NOT_APPLICABLE",
      "slip is not applicable to text clips (#16)",
    );
  }

  // O3 — same idea, one row down the same table: slip moves the window
  // INSIDE the file, and an image has no window (whatever you slide to,
  // the same picture shows). Allowing it would change data with zero
  // visual effect — and that lie travels: diff would say "clip changed"
  // and two branches slipping differently would raise a Bucket-1 conflict
  // over nothing.
  const slipMedia = getMedia(tl, loc.clip.mediaRefId);
  if (slipMedia?.kind === "image") {
    return err("E_NOT_APPLICABLE", "slip is not applicable to image clips");
  }

  const rateErr = rateMismatch(tl.projectRate, [cmd.delta]);
  if (rateErr) return rateErr;

  const d = cmd.delta.value;
  if (d === 0) return noChange(tl); // A4

  const clip = loc.clip;
  const updated: Clip = {
    ...clip,
    sourceRange: {
      ...clip.sourceRange,
      start: rt(clip.sourceRange.start.value + d, tl.projectRate),
    },
  };

  const candidate = withTrackClips(
    tl,
    loc.track.id,
    trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
  );
  const invErr = candidateError(candidate, [cmd.clipId]);
  if (invErr) return invErr;

  return ok(candidate, [
    { op: "slip", clipId: cmd.clipId, delta: rt(-d, tl.projectRate) },
  ]);
}

// ---------------------------------------------------------------------------
// A3.6 — propertyChange (matrix + range validation; time untouched)
// ---------------------------------------------------------------------------

function eqPosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function eqTextStyle(a: TextStyle, b: TextStyle): boolean {
  return a.font === b.font && a.size === b.size && a.color === b.color;
}

function validateFinitePosition(value: unknown): value is Position {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Position).x === "number" &&
    typeof (value as Position).y === "number" &&
    Number.isFinite((value as Position).x) &&
    Number.isFinite((value as Position).y)
  );
}

function validateFullTextStyle(value: unknown): ApplyError | null {
  if (typeof value !== "object" || value === null) {
    return err(
      "E_INVALID_VALUE",
      "textStyle must be a {font, size, color} object",
    );
  }
  const style = value as Partial<TextStyle>;
  if (
    style.font === undefined ||
    style.size === undefined ||
    style.color === undefined
  ) {
    return err(
      "E_INVALID_VALUE",
      "textStyle must include font, size and color",
    );
  }
  for (const key of ["font", "size", "color"] as const) {
    const e = validateTextStyleField(key, style[key] as TextStyle[typeof key]);
    if (e) return e;
  }
  return null;
}

function applyPropertyChange(
  tl: Timeline,
  cmd: PropertyChangeCommand,
): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);
  const clip = loc.clip;

  // Column of the 6×4 matrix: text clips → "text"; media clips → media kind.
  let column: KindColumn;
  if (isTextClip(clip)) {
    column = "text";
  } else {
    const media = getMedia(tl, clip.mediaRefId);
    if (!media)
      return err("E_MEDIA_NOT_FOUND", `media ${clip.mediaRefId} not found`);
    column = media.kind;
  }

  if (!PROPERTY_APPLICABILITY[cmd.property][column]) {
    return err(
      "E_PROPERTY_NOT_APPLICABLE",
      `${cmd.property} is not applicable to a ${column} clip`,
    );
  }

  const replaceClip = (updated: AnyClip): Timeline =>
    withTrackClips(
      tl,
      loc.track.id,
      trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
    );

  const inverse = (
    oldValue: PropertyChangeCommand["value"],
  ): EngineCommand[] => [
    {
      op: "propertyChange",
      clipId: cmd.clipId,
      property: cmd.property,
      value: oldValue,
    },
  ];

  switch (cmd.property) {
    case "volume":
    case "opacity": {
      const v = cmd.value;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) {
        return err(
          "E_INVALID_VALUE",
          `${cmd.property} must be an integer 0-100`,
        );
      }
      const current =
        (
          clip.properties as { volume?: number; opacity?: number } | undefined
        )?.[cmd.property] ?? PROPERTY_DEFAULTS[cmd.property];
      if (v === current) return noChange(tl); // A4 (defaults materialized, B3.1)
      const updated: AnyClip = {
        ...clip,
        properties: { ...(clip.properties ?? {}), [cmd.property]: v },
      };
      return ok(replaceClip(updated), inverse(current));
    }
    case "scale": {
      const v = cmd.value;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0.1 || v > 10) {
        return err("E_INVALID_VALUE", "scale must be a number 0.1-10");
      }
      const mediaClip = clip as Clip; // matrix guarantees non-text here
      const current = mediaClip.properties.scale ?? PROPERTY_DEFAULTS.scale;
      if (v === current) return noChange(tl);
      const updated: Clip = {
        ...mediaClip,
        properties: { ...mediaClip.properties, scale: v },
      };
      return ok(replaceClip(updated), inverse(current));
    }
    case "position": {
      const v = cmd.value;
      if (!validateFinitePosition(v)) {
        return err(
          "E_INVALID_VALUE",
          "position must be {x, y} with finite numbers",
        );
      }
      const current =
        (clip.properties as { position?: Position } | undefined)?.position ??
        PROPERTY_DEFAULTS.position;
      if (eqPosition(v, current)) return noChange(tl);
      const updated: AnyClip = {
        ...clip,
        properties: { ...(clip.properties ?? {}), position: v },
      };
      return ok(replaceClip(updated), inverse(current));
    }
    case "textContent": {
      const contentErr = validateTextContent(cmd.value);
      if (contentErr) return contentErr;
      const textClip = clip as TextClip; // matrix guarantees text here
      const v = cmd.value as string;
      if (v === textClip.textContent) return noChange(tl);
      const updated: TextClip = { ...textClip, textContent: v };
      return ok(replaceClip(updated), inverse(textClip.textContent));
    }
    case "textStyle": {
      const styleErr = validateFullTextStyle(cmd.value);
      if (styleErr) return styleErr;
      const textClip = clip as TextClip;
      const v = cmd.value as TextStyle;
      if (eqTextStyle(v, textClip.textStyle)) return noChange(tl);
      const updated: TextClip = { ...textClip, textStyle: v };
      return ok(replaceClip(updated), inverse(textClip.textStyle));
    }
  }
}

// ---------------------------------------------------------------------------
// A3.7 — rippleDelete (single track; later clips shift left, gaps between
// them preserved; overlap-free BY CONSTRUCTION — no runtime sweep needed)
// ---------------------------------------------------------------------------

function applyRippleDelete(
  tl: Timeline,
  cmd: RippleDeleteCommand,
): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const victim = loc.clip;
  const dur = victim.timelineRange.duration.value;
  const victimEnd = rangeEnd(victim.timelineRange);
  const rate = tl.projectRate;

  const shifted: { id: string; oldStart: number }[] = [];
  const newClips: AnyClip[] = [];
  for (const c of trackClips(loc.track)) {
    if (c.id === victim.id) continue;
    if (c.timelineRange.start.value >= victimEnd) {
      shifted.push({ id: c.id, oldStart: c.timelineRange.start.value });
      newClips.push({
        ...c,
        timelineRange: {
          ...c.timelineRange,
          start: rt(c.timelineRange.start.value - dur, rate),
        },
      });
    } else {
      newClips.push(c);
    }
  }

  const candidate = withTrackClips(tl, loc.track.id, newClips);

  // Inverse (composite): shift the moved clips back right (rightmost
  // first — never a transient overlap), then restore the victim.
  const inverse: EngineCommand[] = [
    ...shifted
      .sort((a, b) => b.oldStart - a.oldStart)
      .map((s): EngineCommand => ({
        op: "move",
        clipId: s.id,
        newStart: rt(s.oldStart, rate),
      })),
    { op: "addClip", trackId: loc.track.id, clip: victim },
  ];

  return ok(candidate, inverse);
}

// ---------------------------------------------------------------------------
// A3.8 — split (left keeps id; right gets the B1.1 parent-chained
// formula-id at the ROOT-LOCAL cut position; gap/overlap/0-duration
// impossible BY CONSTRUCTION)
// ---------------------------------------------------------------------------

function applySplit(tl: Timeline, cmd: SplitCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [cmd.at]);
  if (rateErr) return rateErr;

  const clip = loc.clip;
  const rate = tl.projectRate;
  const start = clip.timelineRange.start.value;
  const end = rangeEnd(clip.timelineRange);
  const at = cmd.at.value;

  // Both edges exclusive — a boundary cut would create a 0-duration piece
  // (a 1-frame clip therefore cannot be split at all).
  if (at === start || at === end) {
    return err("E_SPLIT_AT_BOUNDARY", `cut at ${at} sits on a clip boundary`);
  }
  if (at < start || at > end) {
    return err(
      "E_SPLIT_OUT_OF_RANGE",
      `cut at ${at} is outside clip [${start}, ${end})`,
    );
  }

  const offset = at - start; // frames into the clip
  const span = clip.lineage.span;
  const cutLocal = span.start.value + offset; // root-local coordinate (B1.1)
  // Parent-chained formula name (B1.1). Trims can "heal" a previously cut
  // root-local coordinate while the original descendant still survives on a
  // shifted span, so the bare formula is not collision-proof: extend it
  // deterministically until unique among live clips. Same state mints the
  // same name on both branches, so same-cut merge convergence is preserved.
  const liveIds = new Set<string>();
  for (const track of tl.tracks) {
    for (const existing of track.clips) liveIds.add(existing.id);
  }
  let rightId = `${clip.id}@${cutLocal}`;
  while (liveIds.has(rightId)) rightId = `${rightId}@${cutLocal}`;

  const leftTimeline: TimeRange = {
    start: clip.timelineRange.start,
    duration: rt(offset, rate),
  };
  const rightTimeline: TimeRange = {
    start: rt(at, rate),
    duration: rt(end - at, rate),
  };
  const leftSpan: TimeRange = { start: span.start, duration: rt(offset, rate) };
  const rightSpan: TimeRange = {
    start: rt(cutLocal, rate),
    duration: rt(span.duration.value - offset, rate),
  };

  let left: AnyClip;
  let right: AnyClip;
  if (isTextClip(clip)) {
    // Text: timeline partition only (no source window); content + style
    // + properties copied exactly to both pieces.
    left = {
      ...clip,
      timelineRange: leftTimeline,
      lineage: { ...clip.lineage, span: leftSpan },
    };
    right = {
      ...clip,
      id: rightId,
      timelineRange: rightTimeline,
      lineage: { ...clip.lineage, span: rightSpan },
    };
  } else {
    const src = clip.sourceRange;
    left = {
      ...clip,
      sourceRange: { start: src.start, duration: rt(offset, rate) },
      timelineRange: leftTimeline,
      lineage: { ...clip.lineage, span: leftSpan },
    };
    right = {
      ...clip,
      id: rightId,
      sourceRange: {
        start: rt(src.start.value + offset, rate),
        duration: rt(src.duration.value - offset, rate),
      },
      timelineRange: rightTimeline,
      lineage: { ...clip.lineage, span: rightSpan },
    };
  }

  const candidate = withTrackClips(tl, loc.track.id, [
    ...trackClips(loc.track).map((c) => (c.id === clip.id ? left : c)),
    right,
  ]);

  // Inverse (atomic composite, undo-internal only): remove the right
  // piece, then restore the left piece from the captured preimage.
  const inverse: EngineCommand[] = [
    { op: "deleteClip", clipId: rightId },
    { op: "deleteClip", clipId: clip.id },
    { op: "addClip", trackId: loc.track.id, clip },
  ];

  return ok(candidate, inverse);
}
