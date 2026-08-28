import type { RationalTime } from "./time";

export type { RationalTime };

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Core time and media types
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export type TimeRange = {
  start: RationalTime;
  duration: RationalTime;
};

export type MediaKind = "video" | "audio" | "image";

export type MediaRef = {
  id: string;
  kind: MediaKind;
  url: string;
  hash: string;
  sourceRate: number;
  durationInSource: RationalTime | null;
  sourceStartInFile?: RationalTime;
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Clip types
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export type Position = { x: number; y: number };

export type ClipProperties = {
  volume?: number; // int 0–100
  opacity?: number; // int 0–100
  scale?: number; // 0.1–10 (1 = normal)
  position?: Position;
};

export type Lineage = {
  rootId: string;
  span: TimeRange;
};

export type Clip = {
  id: string; // stable — diff and merge identity lives on this
  mediaRefId: string;
  sourceRange: TimeRange;
  timelineRange: TimeRange;
  properties: ClipProperties;
  lineage: Lineage;
};

export type TextFont = "Arial" | "Georgia" | "Courier New";

export type TextStyle = {
  font: TextFont;
  size: number; // int 8–200, default 48
  color: string; // lowercase 6-digit #rrggbb
};

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

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Track and timeline
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export type TrackKind = "video" | "audio" | "text";

export type Track = {
  id: string;
  kind: TrackKind;
  name?: string;
  color?: string;
  height?: number;
  clips: Clip[] | TextClip[];
};

export type Timeline = {
  projectRate: number;
  tracks: Track[];
  mediaRefs: MediaRef[];
};

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

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Commands
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export type AddClipMediaCommand = {
  op: "addClip";
  trackId: string;
  mediaRefId: string;
  sourceRange: TimeRange;
  timelineRange: TimeRange;
};

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
  delta: RationalTime; // minus = cut, plus = extend
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
  at: RationalTime;
};

export type ReplaceTracksCommand = {
  op: "replaceTracks";
  tracks: Track[];
};

export type Command =
  | AddClipMediaCommand
  | AddClipTextCommand
  | DeleteClipCommand
  | MoveCommand
  | TrimCommand
  | SlipCommand
  | PropertyChangeCommand
  | RippleDeleteCommand
  | SplitCommand
  | ReplaceTracksCommand;

// Engine-internal only — never accepted from the API, never part of the public Command union.
export type RestoreClipCommand = {
  op: "addClip";
  trackId: string;
  clip: Clip | TextClip;
};

export type EngineCommand = Command | RestoreClipCommand;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// applyCommand result (engine-level; the HTTP envelope is server-side)
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export type ApplyOptions = {
  mintId?: () => string;
};

export type ApplyOk = {
  ok: true;
  noChange: false;
  timeline: Timeline;
  inverse: EngineCommand[]; // undo commands — apply in LIFO order
};

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
