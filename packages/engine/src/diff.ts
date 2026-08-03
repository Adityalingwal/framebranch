/**
 * diff.ts — C1: the diff engine.
 *
 * The locked 3-step pipeline: MATCH → CLASSIFY → RENDER.
 *
 *   MATCH    = ID-only (B3.1 — never by shape) + split-khandaan (B1.1):
 *              a clip id present in `b` but not in `a` is walked up its
 *              parent-chained formula name (strip trailing "@cut" pieces);
 *              the nearest ancestor present in `a` adopts it as a family
 *              piece. No ancestor found → genuinely added.
 *   CLASSIFY = the finite khaane of B2.1 (jagah / lambai per edge /
 *              khidki / 6 properties / existence / partition), each an
 *              exact integer compare with defaults materialized (B3.1).
 *   RENDER   = one English sentence per structured entry (C1 templates).
 *              Every sentence is derived from its machine entry — never
 *              ad hoc — so M4 merge can compose on the entries.
 *
 * Normalized content-anchored atoms (via the B1.1 lineage span; M2 keeps
 * the span in lockstep with trims):
 *   anchor       = timelineRange.start − span.start  → #1 moved
 *   coverage     = span [start, end)                 → #2–#5 trims per edge
 *   sourceOffset = sourceRange.start − span.start    → #6 slipped
 * move / trim / slip each touch exactly one atom, so composed edits
 * decompose into independent sentences (B2.1 worked example). The atoms
 * are also split-invariant, which is what lets khandaan pieces be
 * compared directly against their base clip.
 *
 * #16 CATCH-ALL (the jaal): every raw field that is not covered by an
 * atom has an explicit compare (kind, track, lineage.rootId, mediaRefId,
 * tlDuration−spanDuration consistency, srcDuration−tlDuration
 * consistency, projectRate, track existence/kind). Out-of-family data
 * renders truthful raw before → after values — never crash, never
 * silent-skip, never guess.
 *
 * DETERMINISTIC OUTPUT ORDER (stable across runs, documented per brief):
 *   1. timeline-level #16 entries first;
 *   2. tracks in `a`'s order, then `b`-only tracks in `b`'s order;
 *      track-level #16 entries come before that track's clip entries;
 *   3. within a track, clips by the B3.1 sort key (tl start, tl end,
 *      rootId, span start, clipId), taken from the clip's `b` state when
 *      it exists, else its `a` state; family split/removed entries use
 *      the base clip's `a` state;
 *   4. within one clip, fixed khaana order: removed, added, split,
 *      moved, trim-start-shortened, trim-start-extended,
 *      trim-end-shortened, trim-end-extended, slipped, volume, opacity,
 *      scale, position, textContent, textStyle, raw (#16 raws in
 *      emission order: kind, track, rootId, mediaRefId, sourceRange,
 *      timelineRange, coverage).
 *
 * Pure core (C7): no DB / network / UI imports; zero AI; no mutation of
 * either input timeline.
 */

import { PROPERTY_DEFAULTS } from "./verbs";
import type {
  Clip,
  Position,
  PropertyValue,
  TextClip,
  TextStyle,
  Timeline,
  TimeRange,
  Track,
} from "./types";

// ---------------------------------------------------------------------------
// Structured entries (machine form — M4 merge composes with these)
// ---------------------------------------------------------------------------

/**
 * All numbers in entries are integer frame counts at `a.projectRate`
 * (A1.1 integer world; `b` carries the same rate unless the input is
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

/** #7–#12 — one rule per property (C1 listing order). */
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
 * #15 — partition: split detected from the khandaan-record (B1.1).
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
 * entries[i] (strict 1:1; the C4 GET-diff endpoint serves `sentences`).
 */
export type DiffResult = {
  entries: DiffEntry[];
  sentences: string[];
};

// ---------------------------------------------------------------------------
// Internal plumbing
// ---------------------------------------------------------------------------

type AnyClip = Clip | TextClip;

const isText = (c: AnyClip): c is TextClip => "textContent" in c;

type Located = { clip: AnyClip; track: Track; trackIndex: number };

/** Sort tuple + khaana slot (last element). */
type SortKey = (number | string)[];

type KeyedEntry = { key: SortKey; entry: DiffEntry };

/** Within-clip khaana order (see module doc, point 4). */
const KHAANA_ORDER: Readonly<Record<DiffEntry["rule"], number>> = {
  14: 0,
  13: 1,
  15: 2,
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
  7: 9,
  8: 10,
  9: 11,
  10: 12,
  11: 13,
  12: 14,
  16: 15,
};

const PROPERTY_RULE = {
  volume: 7,
  opacity: 8,
  scale: 9,
  position: 10,
  textContent: 11,
  textStyle: 12,
} as const;

const spanStart = (c: AnyClip): number => c.lineage.span.start.value;
const spanEnd = (c: AnyClip): number =>
  c.lineage.span.start.value + c.lineage.span.duration.value;
const tlStart = (c: AnyClip): number => c.timelineRange.start.value;
const tlEnd = (c: AnyClip): number =>
  c.timelineRange.start.value + c.timelineRange.duration.value;
/** anchor = where root-content frame 0 would sit on the timeline. */
const anchor = (c: AnyClip): number => tlStart(c) - spanStart(c);

/** B3.1 fixed sort order: (tl start, tl end, rootId, span start, clipId). */
function clipKey(l: Located): SortKey {
  return [
    l.trackIndex,
    tlStart(l.clip),
    tlEnd(l.clip),
    l.clip.lineage.rootId,
    spanStart(l.clip),
    l.clip.id,
  ];
}

function cmpKey(x: SortKey, y: SortKey): number {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const a = x[i];
    const b = y[i];
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
    return String(a) < String(b) ? -1 : 1;
  }
  return x.length - y.length;
}

function fmtRange(r: TimeRange): string {
  return `${r.start.value}–${r.start.value + r.duration.value}`;
}

type Materialized = {
  volume: number | null;
  opacity: number;
  scale: number | null;
  position: Position;
};

/** B3.1 rule 1 — defaults materialize before compare. */
function materialized(clip: AnyClip): Materialized {
  if (isText(clip)) {
    return {
      volume: null, // not applicable to text (A3.6 matrix)
      opacity: clip.properties?.opacity ?? PROPERTY_DEFAULTS.opacity,
      scale: null,
      position: clip.properties?.position ?? PROPERTY_DEFAULTS.position,
    };
  }
  return {
    volume: clip.properties.volume ?? PROPERTY_DEFAULTS.volume,
    opacity: clip.properties.opacity ?? PROPERTY_DEFAULTS.opacity,
    scale: clip.properties.scale ?? PROPERTY_DEFAULTS.scale,
    position: clip.properties.position ?? PROPERTY_DEFAULTS.position,
  };
}

const eqPos = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;

const eqStyle = (a: TextStyle, b: TextStyle): boolean =>
  a.font === b.font && a.size === b.size && a.color === b.color;

/**
 * B1.1 khandaan walk: strip trailing "@cut" segments until an id present
 * in `pool` is found (nearest ancestor), or the chain runs out.
 */
function nearestAncestorIn(
  id: string,
  pool: Map<string, Located>,
): string | null {
  let cur = id;
  for (;;) {
    const at = cur.lastIndexOf("@");
    if (at < 0) return null;
    cur = cur.slice(0, at);
    if (pool.has(cur)) return cur;
  }
}

function indexClips(
  tl: Timeline,
  trackIndexById: Map<string, number>,
): Map<string, Located> {
  const out = new Map<string, Located>();
  for (const track of tl.tracks) {
    const trackIndex = trackIndexById.get(track.id) ?? 0;
    const clips: readonly AnyClip[] = track.clips;
    for (const clip of clips) out.set(clip.id, { clip, track, trackIndex });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLASSIFY
// ---------------------------------------------------------------------------

/**
 * Compare one `b` clip (`cur`) against its `a`-side reference (`ref` —
 * the same-id clip for plain pairs, the family base for khandaan
 * pieces). mode "piece" skips the coverage khaana — the family-level
 * partition/edge handling owns it.
 */
function classifyPair(
  ref: Located,
  cur: Located,
  mode: "pair" | "piece",
  out: KeyedEntry[],
): void {
  const key = clipKey(cur);
  const push = (entry: DiffEntry): void => {
    out.push({ key: [...key, KHAANA_ORDER[entry.rule]], entry });
  };
  const rawClip = (field: string, before: string, after: string): void => {
    push({
      rule: 16,
      kind: "rawChanged",
      scope: "clip",
      trackId: cur.track.id,
      clipId: cur.clip.id,
      field,
      before,
      after,
    });
  };

  const refClip = ref.clip;
  const curClip = cur.clip;
  const refIsText = isText(refClip);
  const curIsText = isText(curClip);
  const trackId = cur.track.id;
  const clipId = curClip.id;

  // #16 — kind flip (no verb can do this; out-of-family)
  if (refIsText !== curIsText) {
    rawClip("kind", refIsText ? "text" : "media", curIsText ? "text" : "media");
  }

  // #16 — track changed (cross-track move is V1 OUT; out-of-family)
  if (ref.track.id !== cur.track.id) {
    rawClip("track", ref.track.id, cur.track.id);
  }

  // #16 — lineage root changed (identity is birth; out-of-family)
  if (refClip.lineage.rootId !== curClip.lineage.rootId) {
    rawClip("lineage.rootId", refClip.lineage.rootId, curClip.lineage.rootId);
  }

  // #1 — jagah (anchor)
  if (anchor(refClip) !== anchor(curClip)) {
    push({
      rule: 1,
      kind: "moved",
      trackId,
      clipId,
      fromStart: anchor(refClip) + spanStart(curClip),
      toStart: tlStart(curClip),
    });
  }

  // #2–#5 — lambai (coverage) per edge
  if (mode === "pair") {
    const dStart = spanStart(curClip) - spanStart(refClip);
    if (dStart !== 0) push(trimmedEntry(trackId, clipId, "start", dStart));
    const dEnd = spanEnd(curClip) - spanEnd(refClip);
    if (dEnd !== 0) push(trimmedEntry(trackId, clipId, "end", dEnd));
  }

  // media-only atoms
  if (!refIsText && !curIsText) {
    // #6 — khidki (source offset)
    const refOff = refClip.sourceRange.start.value - spanStart(refClip);
    const curOff = curClip.sourceRange.start.value - spanStart(curClip);
    if (refOff !== curOff) {
      push({
        rule: 6,
        kind: "slipped",
        trackId,
        clipId,
        fromSourceStart: refOff + spanStart(curClip),
        toSourceStart: curClip.sourceRange.start.value,
      });
    }

    // #16 — media identity swap (no verb can do this)
    if (refClip.mediaRefId !== curClip.mediaRefId) {
      rawClip("mediaRefId", refClip.mediaRefId, curClip.mediaRefId);
    }

    // #16 — sourceRange consistency (srcDuration − tlDuration; BC.4 says
    // 0 for verb-produced states — a differing delta is out-of-family)
    const refD =
      refClip.sourceRange.duration.value - refClip.timelineRange.duration.value;
    const curD =
      curClip.sourceRange.duration.value - curClip.timelineRange.duration.value;
    if (refD !== curD) {
      rawClip(
        "sourceRange",
        fmtRange(refClip.sourceRange),
        fmtRange(curClip.sourceRange),
      );
    }
  }

  // #16 — timelineRange consistency (tlDuration − spanDuration; 0 for
  // verb-produced states — a differing delta is out-of-family)
  const refT =
    refClip.timelineRange.duration.value - refClip.lineage.span.duration.value;
  const curT =
    curClip.timelineRange.duration.value - curClip.lineage.span.duration.value;
  if (refT !== curT) {
    rawClip(
      "timelineRange",
      fmtRange(refClip.timelineRange),
      fmtRange(curClip.timelineRange),
    );
  }

  // #7–#12 — properties, defaults materialized (B3.1)
  const rp = materialized(refClip);
  const cp = materialized(curClip);
  const prop = (
    property: DiffPropertyName,
    before: PropertyValue,
    after: PropertyValue,
  ): void => {
    push({
      rule: PROPERTY_RULE[property],
      kind: "propertyChanged",
      trackId,
      clipId,
      property,
      before,
      after,
    });
  };
  if (rp.volume !== null && cp.volume !== null && rp.volume !== cp.volume) {
    prop("volume", rp.volume, cp.volume);
  }
  if (rp.opacity !== cp.opacity) prop("opacity", rp.opacity, cp.opacity);
  if (rp.scale !== null && cp.scale !== null && rp.scale !== cp.scale) {
    prop("scale", rp.scale, cp.scale);
  }
  if (!eqPos(rp.position, cp.position)) {
    prop("position", rp.position, cp.position);
  }
  if (refIsText && curIsText) {
    if (refClip.textContent !== curClip.textContent) {
      prop("textContent", refClip.textContent, curClip.textContent);
    }
    if (!eqStyle(refClip.textStyle, curClip.textStyle)) {
      prop("textStyle", refClip.textStyle, curClip.textStyle);
    }
  }
}

function trimmedEntry(
  trackId: string,
  clipId: string,
  edge: "start" | "end",
  delta: number, // cur − ref of that span edge
): TrimmedEntry {
  const base = { kind: "trimmed" as const, trackId, clipId, edge };
  if (edge === "start") {
    return delta > 0
      ? { rule: 2, ...base, change: "shortened", frames: delta }
      : { rule: 3, ...base, change: "extended", frames: -delta };
  }
  return delta < 0
    ? { rule: 4, ...base, change: "shortened", frames: -delta }
    : { rule: 5, ...base, change: "extended", frames: delta };
}

/**
 * #15 + family handling. `pieces` = every `b` clip whose id chains back
 * to `base` (including the base id itself when it survives in `b`).
 */
function classifyFamily(
  base: Located,
  pieces: Located[],
  baseInB: Located | undefined,
  out: KeyedEntry[],
): void {
  const sorted = [...pieces].sort((x, y) => {
    const d = spanStart(x.clip) - spanStart(y.clip);
    if (d !== 0) return d;
    return x.clip.id < y.clip.id ? -1 : 1;
  });
  const baseKey = clipKey(base);
  const pushAtBase = (entry: DiffEntry): void => {
    out.push({ key: [...baseKey, KHAANA_ORDER[entry.rule]], entry });
  };

  // #15 — partition from the khandaan-record: cuts are the root-local
  // start positions of the non-leftmost surviving pieces.
  const cutSet = new Set<number>();
  for (const p of sorted) {
    if (spanStart(p.clip) > spanStart(base.clip)) cutSet.add(spanStart(p.clip));
  }
  const cuts = [...cutSet].sort((x, y) => x - y);
  if (cuts.length > 0) {
    pushAtBase({
      rule: 15,
      kind: "split",
      trackId: base.track.id,
      clipId: base.clip.id,
      pieceIds: sorted.map((p) => p.clip.id),
      cuts,
    });
  }

  // Existence: the left-most descendant always carries the base id
  // (B1.1 left-survives), so a missing base id = that content removed.
  if (!baseInB) {
    pushAtBase({
      rule: 14,
      kind: "removed",
      trackId: base.track.id,
      clipId: base.clip.id,
      start: tlStart(base.clip),
      duration: base.clip.timelineRange.duration.value,
    });
  }

  // Piece-level khaane vs the base (coverage handled below).
  for (const p of sorted) classifyPair(base, p, "piece", out);

  // Family coverage edges: leading edge on the first piece (skipped when
  // the base piece is gone — the #14 above already owns that content),
  // trailing edge on the last piece.
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (baseInB) {
    const dStart = spanStart(first.clip) - spanStart(base.clip);
    if (dStart !== 0) {
      out.push({
        key: [...clipKey(first), KHAANA_ORDER[dStart > 0 ? 2 : 3]],
        entry: trimmedEntry(first.track.id, first.clip.id, "start", dStart),
      });
    }
  }
  const dEnd = spanEnd(last.clip) - spanEnd(base.clip);
  if (dEnd !== 0) {
    out.push({
      key: [...clipKey(last), KHAANA_ORDER[dEnd < 0 ? 4 : 5]],
      entry: trimmedEntry(last.track.id, last.clip.id, "end", dEnd),
    });
  }

  // #16 — non-contiguous piece spans (interior gap/overlap) are
  // out-of-family: report the raw coverage truthfully on the base.
  let irregular = false;
  for (let i = 1; i < sorted.length; i++) {
    if (spanStart(sorted[i].clip) !== spanEnd(sorted[i - 1].clip)) {
      irregular = true;
      break;
    }
  }
  if (irregular) {
    pushAtBase({
      rule: 16,
      kind: "rawChanged",
      scope: "clip",
      trackId: base.track.id,
      clipId: base.clip.id,
      field: "coverage",
      before: fmtRange(base.clip.lineage.span),
      after: sorted.map((p) => fmtRange(p.clip.lineage.span)).join(", "),
    });
  }
}

// ---------------------------------------------------------------------------
// RENDER (C1 English templates — one sentence per entry)
// ---------------------------------------------------------------------------

const COUNT_WORDS = [
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

function countWord(n: number): string {
  return n >= 2 && n <= 10 ? COUNT_WORDS[n - 2] : String(n);
}

function nFrames(n: number): string {
  return `${n} frame${n === 1 ? "" : "s"}`;
}

function fmtPropValue(property: DiffPropertyName, v: PropertyValue): string {
  if (property === "position") {
    const p = v as Position;
    return `(${p.x}, ${p.y})`;
  }
  if (property === "textContent") return `"${String(v)}"`;
  if (property === "textStyle") {
    const s = v as TextStyle;
    return `${s.font} ${s.size} ${s.color}`;
  }
  return String(v);
}

const PROPERTY_LABEL: Readonly<Record<DiffPropertyName, string>> = {
  volume: "volume",
  opacity: "opacity",
  scale: "scale",
  position: "position",
  textContent: "text",
  textStyle: "text style",
};

function renderEntry(e: DiffEntry): string {
  switch (e.kind) {
    case "moved":
      return `Clip ${e.clipId} moved from frame ${e.fromStart} to frame ${e.toStart}`;
    case "trimmed":
      return `Clip ${e.clipId} ${e.change} by ${nFrames(e.frames)} at the ${e.edge}`;
    case "slipped":
      return `Clip ${e.clipId} slipped: source window moved from ${e.fromSourceStart} to ${e.toSourceStart}`;
    case "propertyChanged":
      return `Clip ${e.clipId} ${PROPERTY_LABEL[e.property]} changed: ${fmtPropValue(e.property, e.before)} → ${fmtPropValue(e.property, e.after)}`;
    case "added":
      return `Clip ${e.clipId} added at frame ${e.start} (${nFrames(e.duration)} long)`;
    case "removed":
      return `Clip ${e.clipId} removed`;
    case "split":
      return `Clip ${e.clipId} split into ${countWord(e.cuts.length + 1)} at ${e.cuts.join(", ")}`;
    case "rawChanged": {
      const subject =
        e.scope === "timeline"
          ? "Timeline"
          : e.scope === "track"
            ? `Track ${e.trackId}`
            : `Clip ${e.clipId}`;
      return `${subject} changed: ${e.field} ${e.before} → ${e.after}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API #2 of 7 — computeDiff
// ---------------------------------------------------------------------------

/**
 * Compute the deterministic semantic diff of two timelines: what changed
 * going from `a` (before) to `b` (after). Returns the khaana-level
 * machine entries plus their rendered English sentences (1:1).
 * diff(A, A) is empty (PRD invariant).
 */
export function computeDiff(a: Timeline, b: Timeline): DiffResult {
  const keyed: KeyedEntry[] = [];

  // Timeline-level #16 (out-of-family: engine is single-rate, A1.2).
  if (a.projectRate !== b.projectRate) {
    keyed.push({
      key: [Number.NEGATIVE_INFINITY, 0, 0, "", 0, "", KHAANA_ORDER[16]],
      entry: {
        rule: 16,
        kind: "rawChanged",
        scope: "timeline",
        trackId: null,
        clipId: null,
        field: "projectRate",
        before: String(a.projectRate),
        after: String(b.projectRate),
      },
    });
  }

  // Track order: a's tracks first, then b-only tracks (V1 has no track
  // verbs — a differing track set is out-of-family, reported via #16).
  const trackIndexById = new Map<string, number>();
  for (const t of a.tracks) trackIndexById.set(t.id, trackIndexById.size);
  for (const t of b.tracks) {
    if (!trackIndexById.has(t.id))
      trackIndexById.set(t.id, trackIndexById.size);
  }
  const aTracks = new Map(a.tracks.map((t) => [t.id, t]));
  const bTracks = new Map(b.tracks.map((t) => [t.id, t]));
  const trackRaw = (
    trackId: string,
    field: string,
    before: string,
    after: string,
  ): void => {
    keyed.push({
      key: [
        trackIndexById.get(trackId) ?? 0,
        Number.NEGATIVE_INFINITY,
        0,
        "",
        0,
        "",
        KHAANA_ORDER[16],
      ],
      entry: {
        rule: 16,
        kind: "rawChanged",
        scope: "track",
        trackId,
        clipId: null,
        field,
        before,
        after,
      },
    });
  };
  for (const [id] of trackIndexById) {
    const at = aTracks.get(id);
    const bt = bTracks.get(id);
    if (at && !bt) trackRaw(id, "existence", "present", "absent");
    else if (!at && bt) trackRaw(id, "existence", "absent", "present");
    else if (at && bt && at.kind !== bt.kind) {
      trackRaw(id, "kind", at.kind, bt.kind);
    }
  }

  // MATCH — ID-only + khandaan grouping (B3.1 + B1.1).
  const aClips = indexClips(a, trackIndexById);
  const bClips = indexClips(b, trackIndexById);

  const families = new Map<string, Located[]>();
  const added: Located[] = [];
  for (const [id, loc] of bClips) {
    if (aClips.has(id)) continue;
    const baseId = nearestAncestorIn(id, aClips);
    if (baseId === null) {
      added.push(loc);
      continue;
    }
    const fam = families.get(baseId);
    if (fam) fam.push(loc);
    else families.set(baseId, [loc]);
  }
  // The surviving base-id piece belongs to its family too.
  for (const [baseId, fam] of families) {
    const baseInB = bClips.get(baseId);
    if (baseInB) fam.push(baseInB);
  }

  // CLASSIFY — every a-clip, then genuinely added b-clips.
  for (const [id, aLoc] of aClips) {
    const fam = families.get(id);
    if (fam) {
      classifyFamily(aLoc, fam, bClips.get(id), keyed);
      continue;
    }
    const bLoc = bClips.get(id);
    if (!bLoc) {
      keyed.push({
        key: [...clipKey(aLoc), KHAANA_ORDER[14]],
        entry: {
          rule: 14,
          kind: "removed",
          trackId: aLoc.track.id,
          clipId: id,
          start: tlStart(aLoc.clip),
          duration: aLoc.clip.timelineRange.duration.value,
        },
      });
      continue;
    }
    classifyPair(aLoc, bLoc, "pair", keyed);
  }
  for (const loc of added) {
    keyed.push({
      key: [...clipKey(loc), KHAANA_ORDER[13]],
      entry: {
        rule: 13,
        kind: "added",
        trackId: loc.track.id,
        clipId: loc.clip.id,
        start: tlStart(loc.clip),
        duration: loc.clip.timelineRange.duration.value,
      },
    });
  }

  // ORDER + RENDER.
  keyed.sort((x, y) => cmpKey(x.key, y.key));
  const entries = keyed.map((k) => k.entry);
  return { entries, sentences: entries.map(renderEntry) };
}
