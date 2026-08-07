import type { Clip, PropertyValue, TextClip, Track } from "../types";

/**
 * All numbers in entries are integer frame counts at `a.projectRate`
 * ( integer world; `b` carries the same rate unless the input is
 * out-of-family, which #16 reports).
 */

export type DiffPropertyName =
  "volume" | "opacity" | "scale" | "position" | "textContent" | "textStyle";

/** #1 — jagah (anchor) changed. */
export type MovedEntry = {
  rule: 1;
  kind: "moved";
  trackId: string;
  clipId: string;
  fromStart: number;
  toStart: number;
};

/** #2–#5 — lambai (coverage) changed per edge. */
export type TrimmedEntry = {
  rule: 2 | 3 | 4 | 5; // 2 start-shortened, 3 start-extended, 4 end-shortened, 5 end-extended
  kind: "trimmed";
  trackId: string;
  clipId: string;
  edge: "start" | "end";
  change: "shortened" | "extended";
  frames: number; // positive frame count
};

/** #6 — khidki (source offset) changed. */
export type SlippedEntry = {
  rule: 6;
  kind: "slipped";
  trackId: string;
  clipId: string;
  fromSourceStart: number;
  toSourceStart: number;
};

/** #7–#12 — one rule per property ( listing order). */
export type PropertyChangedEntry = {
  rule: 7 | 8 | 9 | 10 | 11 | 12;
  kind: "propertyChanged";
  trackId: string;
  clipId: string;
  property: DiffPropertyName;
  before: PropertyValue;
  after: PropertyValue;
};

/** #13 — existence: clip only in `b`. */
export type AddedEntry = {
  rule: 13;
  kind: "added";
  trackId: string;
  clipId: string;
  start: number;
  duration: number;
};

/** #14 — existence: clip only in `a`. */
export type RemovedEntry = {
  rule: 14;
  kind: "removed";
  trackId: string;
  clipId: string;
  start: number;
  duration: number;
};

/**
 * #15 — partition: split detected from the khandaan-record .
 * `cuts` are ROOT-LOCAL cut positions (the coordinate the khandaan
 * records — move-invariant), sorted ascending.
 */
export type SplitEntry = {
  rule: 15;
  kind: "split";
  trackId: string;
  clipId: string; // the base (ancestor) clip in `a`
  pieceIds: string[]; // surviving pieces in `b`, span order
  cuts: number[];
};

/** #16 — catch-all: truthful raw before → after values. */
export type RawChangedEntry = {
  rule: 16;
  kind: "rawChanged";
  scope: "timeline" | "track" | "clip";
  trackId: string | null;
  clipId: string | null;
  field: string;
  before: string;
  after: string;
};

export type DiffEntry =
  | MovedEntry
  | TrimmedEntry
  | SlippedEntry
  | PropertyChangedEntry
  | AddedEntry
  | RemovedEntry
  | SplitEntry
  | RawChangedEntry;

/**
 * computeDiff result: parallel arrays — sentences[i] is rendered from
 * entries[i] (strict 1:1; the GET-diff endpoint serves `sentences`).
 */
export type DiffResult = {
  entries: DiffEntry[];
  sentences: string[];
};
type AnyClip = Clip | TextClip;

const isText = (c: AnyClip): c is TextClip => "textContent" in c;

type Located = { clip: AnyClip; track: Track; trackIndex: number };

/** Sort tuple + khaana slot (last element). */
type SortKey = (number | string)[];

type KeyedEntry = { key: SortKey; entry: DiffEntry };


export type { AnyClip, Located, SortKey, KeyedEntry };
export { isText };
