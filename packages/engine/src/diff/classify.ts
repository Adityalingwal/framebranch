import type { PropertyValue } from "../types";
import type {
  DiffEntry,
  DiffPropertyName,
  KeyedEntry,
  Located,
  TrimmedEntry,
} from "./types";
import {
  KHAANA_ORDER,
  PROPERTY_RULE,
  anchor,
  clipKey,
  eqPos,
  eqStyle,
  fmtRange,
  isText,
  materialized,
  spanEnd,
  spanStart,
  tlStart,
} from "./match";

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

  // #16 — track changed (cross-track move is OUT; out-of-family)
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

  // #7–#12 — properties, defaults materialized
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
  // left-survives, so a missing base id = that content removed.
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

export { classifyPair, classifyFamily };
