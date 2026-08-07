import {
  checkInvariants,
  VIOLATION_ERROR_CODE,
  type InvariantViolation,
} from "../invariants";
import type {
  ApplyError,
  ApplyNoChange,
  ApplyOk,
  Clip,
  EngineCommand,
  ErrorCode,
  MediaRef,
  Position,
  PropertyChangeCommand,
  RationalTime,
  TextClip,
  TextFont,
  TextStyle,
  Timeline,
  TimeRange,
  Track,
  TrackKind,
} from "../types";

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

export type KindColumn = "video" | "audio" | "image" | "text";

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
export const TRACK_KIND_FOR_MEDIA: Record<MediaRef["kind"], TrackKind> = {
  video: "video",
  audio: "audio",
  image: "video", // image is visual → video track (audio ❌, text ❌)
};

export type AnyClip = Clip | TextClip;

export const isTextClip = (c: AnyClip): c is TextClip => "textContent" in c;

export const err = (code: ErrorCode, message: string): ApplyError => ({
  ok: false,
  error: { code, message },
});

export const ok = (timeline: Timeline, inverse: EngineCommand[]): ApplyOk => ({
  ok: true,
  noChange: false,
  timeline,
  inverse,
});

/** A4 (1): silent success, no record, timeline returned unchanged. */
export const noChange = (timeline: Timeline): ApplyNoChange => ({
  ok: true,
  noChange: true,
  timeline,
});

export const rt = (value: number, rate: number): RationalTime => ({
  value,
  rate,
});

export const rangeEnd = (r: TimeRange): number =>
  r.start.value + r.duration.value;

export function getTrack(tl: Timeline, trackId: string): Track | undefined {
  return tl.tracks.find((t) => t.id === trackId);
}

export function locateClip(
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

export function getMedia(
  tl: Timeline,
  mediaRefId: string,
): MediaRef | undefined {
  return tl.mediaRefs.find((m) => m.id === mediaRefId);
}

/**
 * Clip arrays are kept in a normal form: sorted by timeline start.
 * (Deterministic storage order; ties are impossible under no-overlap.
 * Makes undo round-trips structurally exact.)
 */
export function sortClips(clips: AnyClip[]): AnyClip[] {
  return [...clips].sort(
    (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
  );
}

export function withTrackClips(
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

export function trackClips(track: Track): readonly AnyClip[] {
  return track.clips;
}

/** All RationalTime fields of a command must carry the project rate (A1.2). */
export function rateMismatch(
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

export function candidateError(
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

export function describeViolation(v: InvariantViolation): string {
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

export function defaultMintId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for exotic runtimes without WebCrypto.
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateTextContent(value: unknown): ApplyError | null {
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

export function validateTextStyleField<K extends keyof TextStyle>(
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
export function materializeTextStyle(
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
