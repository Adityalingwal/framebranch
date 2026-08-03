/**
 * FrameBranch engine — public API entry point ("public darwaza", docs/11 C7).
 *
 * Milestone 2 exports applyCommand + public types ONLY. The remaining 6
 * API functions (computeDiff, startMerge, applyChoice, finalizeCheck,
 * importOtio, exportOtio) arrive in later milestones — no stubs.
 *
 * apps/web will import ONLY from this index (small door = free internal
 * refactoring). Pure core: no DB / network / UI imports, ever.
 */

export { applyCommand } from "./verbs";

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
  TextStyle,
  Timeline,
  TimeRange,
  Track,
  TrackKind,
  TrimCommand,
} from "./types";
