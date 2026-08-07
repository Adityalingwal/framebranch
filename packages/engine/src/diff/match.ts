import { PROPERTY_DEFAULTS } from "../verbs";
import type { Position, TextStyle, TimeRange, Timeline } from "../types";
import type { AnyClip, DiffEntry, Located, SortKey } from "./types";
import { isText } from "./types";

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

export {
  KHAANA_ORDER,
  PROPERTY_RULE,
  spanStart,
  spanEnd,
  tlStart,
  tlEnd,
  anchor,
  clipKey,
  cmpKey,
  fmtRange,
  isText,
  materialized,
  nearestAncestorIn,
  indexClips,
  eqPos,
  eqStyle,
};
