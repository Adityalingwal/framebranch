/**
 * Public entry point — the only file apps/web (or any external code) may import from.
 * No DB, network, or UI imports are allowed inside the engine, ever.
 */
export { applyCommand } from "./verbs";
export { computeDiff } from "./diff";
export { applyChoice, finalizeCheck, startMerge } from "./merge";
export { exportOtio, importOtio } from "./otio";

export type {
  ImportResult,
  ImportWarning,
  ImportWarningCode,
  OtioJson,
} from "./otio";

export type {
  AddedEntry,
  DiffEntry,
  DiffPropertyName,
  DiffResult,
  MovedEntry,
  PropertyChangedEntry,
  RawChangedEntry,
  RemovedEntry,
  SlippedEntry,
  SplitEntry,
  TrimmedEntry,
} from "./diff";

export type { RationalTime } from "./time";
export type {
  DeleteChoice,
  DeleteParticipants,
  FinalizeResult,
  MergeChoice,
  MergeChoices,
  MergeConflict,
  MergeCounts,
  MergeFailure,
  MergeField,
  MergeParticipants,
  MergeResult,
  MergeSuccess,
  OverlapChoice,
  OverlapParticipants,
  ValueChoice,
  ValueParticipants,
} from "./merge";
export type {
  AddClipMediaCommand,
  AddClipTextCommand,
  ApplyError,
  ApplyNoChange,
  ApplyOk,
  ApplyOptions,
  ApplyResult,
  Clip,
  ClipProperties,
  Command,
  DeleteClipCommand,
  EngineError,
  ErrorCode,
  Lineage,
  MediaKind,
  MediaRef,
  MoveCommand,
  Position,
  PropertyChangeCommand,
  PropertyName,
  PropertyValue,
  RippleDeleteCommand,
  SlipCommand,
  SplitCommand,
  TextClip,
  TextClipProperties,
  TextFont,
  TextStyle,
  Timeline,
  TimeRange,
  Track,
  TrackKind,
  TrimCommand,
} from "./types";
