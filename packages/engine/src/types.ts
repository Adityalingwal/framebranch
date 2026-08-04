/**
 * types.ts — A2: the 6-type domain family (+ F3 amendments), B1.1 lineage,
 * the command discriminated union (all addClip forms), typed errors, and
 * the applyCommand result shape.
 *
 * Style lock (A2.3): `type`, never `interface`, project-wide.
 */

import type { RationalTime } from "./time";

export type { RationalTime };

// ---------------------------------------------------------------------------
// A2.1 — building blocks
// ---------------------------------------------------------------------------

export type TimeRange = {
  start: RationalTime;
  duration: RationalTime;
};

export type MediaKind = "video" | "audio" | "image"; // F3: image is a valid kind

/**
 * MediaRef — the "parchi" for one file (one file → many clips).
 * durationInSource = full length of the file, expressed in the project
 * rate (A1.2: conversion happens once at the import door; inside the
 * engine everything is single-rate so the source-range-in-file invariant
 * can compare exact integers). sourceRate records the file's native fps.
 *
 * O1 (2026-08-04): durationInSource is NULLABLE, and `null` has exactly
 * ONE meaning — "this media has no length at all (unbounded)" — which
 * applies only to `kind === "image"`. Video/audio are still required to
 * carry a real length; an OTIO file that does not state one simply does
 * not produce a clip (O2). The second possible meaning ("it is a video
 * but we don't know its length") was deliberately NOT created: one value
 * with two meanings makes every call site ask "which null is this?".
 */
export type MediaRef = {
  id: string;
  kind: MediaKind;
  url: string;
  hash: string;
  sourceRate: number;
  durationInSource: RationalTime | null;
};

// ---------------------------------------------------------------------------
// A2.2 (+ BC.1) — Clip + TextClip
// ---------------------------------------------------------------------------

export type Position = { x: number; y: number };

/** #15 whitelist — all optional, defaults materialize at compare (B3.1). */
export type ClipProperties = {
  volume?: number; // int 0-100
  opacity?: number; // int 0-100
  scale?: number; // 0.1-10 (1 = normal)
  position?: Position; // screen placement (PiP); offscreen valid
};

/**
 * B1.1 — khandaan-record carried in STATE (op-log can never be merge
 * input). rootId = the original ancestor clip id; span = which part of
 * the root's extent this segment covers, in ROOT-LOCAL coordinates
 * (deliberately NOT timeline numbers — move never changes it).
 */
export type Lineage = {
  rootId: string;
  span: TimeRange;
};

export type Clip = {
  id: string; // stable — the identity diff/merge lives on
  mediaRefId: string;
  sourceRange: TimeRange; // WHAT part of the file
  timelineRange: TimeRange; // WHEN it plays
  properties: ClipProperties;
  lineage: Lineage;
};

/** BC.5 exact V1 whitelist; untrusted JSON still receives runtime validation. */
export type TextFont = "Arial" | "Georgia" | "Courier New";

export type TextStyle = {
  font: TextFont;
  size: number; // int 8-200, default 48
  color: string; // always lowercase 6-digit #rrggbb
};

/** BC.1: only the two matrix-allowed properties exist on text. */
export type TextClipProperties = {
  opacity?: number;
  position?: Position;
};

export type TextClip = {
  id: string;
  timelineRange: TimeRange;
  textContent: string;
  textStyle: TextStyle;
  properties?: TextClipProperties;
  lineage: Lineage;
};

// ---------------------------------------------------------------------------
// A2.3 — Track + Timeline (+ F3 mediaRefs)
// ---------------------------------------------------------------------------

export type TrackKind = "video" | "audio" | "text";

export type Track = {
  id: string;
  kind: TrackKind;
  clips: Clip[] | TextClip[];
};

export type Timeline = {
  projectRate: number;
  tracks: Track[];
  mediaRefs: MediaRef[];
};

// ---------------------------------------------------------------------------
// C4 point (5) — engine subset of the official error-code list.
// (No E_ID_COLLISION — removed by F8; unreachable by design.)
//
// M5: E_INVALID_OTIO and E_UNSUPPORTED_OTIO_VERSION were already in the
// locked C4 list; they join the union now only because the OTIO adapter
// (the code that raises them) arrives in M5. Not new error codes.
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "E_CLIP_NOT_FOUND"
  | "E_TRACK_NOT_FOUND"
  | "E_MEDIA_NOT_FOUND"
  | "E_OVERLAP"
  | "E_SOURCE_OUT_OF_BOUNDS"
  | "E_INVALID_RANGE"
  | "E_NEGATIVE_TIME"
  | "E_TRACK_KIND_MISMATCH"
  | "E_RATE_MISMATCH"
  | "E_PROPERTY_NOT_APPLICABLE"
  | "E_INVALID_VALUE"
  | "E_NOT_APPLICABLE"
  | "E_SPLIT_AT_BOUNDARY"
  | "E_SPLIT_OUT_OF_RANGE"
  | "E_INVALID_OTIO"
  | "E_UNSUPPORTED_OTIO_VERSION";

export type EngineError = {
  code: ErrorCode;
  message: string; // human-readable; code is the machine contract
};

// ---------------------------------------------------------------------------
// A3 — command discriminated union (public forms)
// ---------------------------------------------------------------------------

/** A3.1 form (a) — media payload. */
export type AddClipMediaCommand = {
  op: "addClip";
  trackId: string;
  mediaRefId: string;
  sourceRange: TimeRange;
  timelineRange: TimeRange;
};

/**
 * A3.1 form (b) — text payload (F4). No media/sourceRange fields; the
 * form is recognized by its fields. textContent REQUIRED non-empty (N2).
 * textStyle optional — BC.5 defaults materialize per missing field.
 */
export type AddClipTextCommand = {
  op: "addClip";
  trackId: string;
  textContent: string;
  textStyle?: Partial<TextStyle>;
  timelineRange: TimeRange;
};

export type DeleteClipCommand = { op: "deleteClip"; clipId: string };

export type MoveCommand = {
  op: "move";
  clipId: string;
  newStart: RationalTime;
};

export type TrimCommand = {
  op: "trim";
  clipId: string;
  edge: "start" | "end";
  delta: RationalTime; // minus = cut, plus = extend (BC.3)
};

export type SlipCommand = {
  op: "slip";
  clipId: string;
  delta: RationalTime;
};

export type PropertyName =
  "volume" | "opacity" | "scale" | "position" | "textContent" | "textStyle";

export type PropertyValue = number | string | Position | TextStyle;

export type PropertyChangeCommand = {
  op: "propertyChange";
  clipId: string;
  property: PropertyName;
  value: PropertyValue;
};

export type RippleDeleteCommand = { op: "rippleDelete"; clipId: string };

export type SplitCommand = {
  op: "split";
  clipId: string;
  at: RationalTime; // absolute timeline frame boundary
};

/** The PUBLIC command union — what the API door may ever send. */
export type Command =
  | AddClipMediaCommand
  | AddClipTextCommand
  | DeleteClipCommand
  | MoveCommand
  | TrimCommand
  | SlipCommand
  | PropertyChangeCommand
  | RippleDeleteCommand
  | SplitCommand;

/**
 * A3.1 form (c) — INTERNAL restore form. Engine-internal only, NEVER
 * accepted from the API (deliberately NOT part of `Command`). Puts a
 * fully captured clip back, id included — no minting. deleteClip's
 * inverse is exactly this form (identity preserved for diff/merge).
 */
export type RestoreClipCommand = {
  op: "addClip";
  trackId: string;
  clip: Clip | TextClip;
};

/** Everything the engine can apply internally (undo steps included). */
export type EngineCommand = Command | RestoreClipCommand;

// ---------------------------------------------------------------------------
// applyCommand result (engine-level; the C4 HTTP envelope is server-side)
// ---------------------------------------------------------------------------

export type ApplyOptions = {
  /** Injectable id minting (deterministic tests / seeded fuzz). */
  mintId?: () => string;
};

export type ApplyOk = {
  ok: true;
  noChange: false;
  timeline: Timeline;
  /**
   * Inverse (undo) as a list of engine commands applied in order.
   * Single-step verbs return one element; split / rippleDelete return
   * their locked atomic composites. Valid under LIFO undo only (A3.1c).
   */
  inverse: EngineCommand[];
};

/**
 * A4 rule (1): no-change command = silent SUCCESS + noChange flag; the
 * caller must not record it (no pending/op-log entry). Timeline is
 * returned unchanged (same reference).
 */
export type ApplyNoChange = {
  ok: true;
  noChange: true;
  timeline: Timeline;
};

export type ApplyError = {
  ok: false;
  error: EngineError;
};

export type ApplyResult = ApplyOk | ApplyNoChange | ApplyError;
