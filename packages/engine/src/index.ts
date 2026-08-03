/**
 * FrameBranch engine — public API entry point ("public darwaza", docs/11 C7).
 *
 * Milestones 2-3 export applyCommand + computeDiff + public types ONLY.
 * The remaining 5 API functions (startMerge, applyChoice, finalizeCheck,
 * importOtio, exportOtio) arrive in later milestones — no stubs.
 *
 * apps/web will import ONLY from this index (small door = free internal
 * refactoring). Pure core: no DB / network / UI imports, ever.
 */

export { applyCommand } from "./verbs";
export { computeDiff } from "./diff";

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
