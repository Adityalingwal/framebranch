import type {
  ApplyResult,
  Clip,
  EngineCommand,
  MoveCommand,
  SlipCommand,
  SplitCommand,
  TimeRange,
  Timeline,
  TrimCommand,
} from "../types";
import {
  type AnyClip,
  candidateError,
  err,
  getMedia,
  isTextClip,
  locateClip,
  noChange,
  ok,
  rangeEnd,
  rateMismatch,
  rt,
  trackClips,
  withTrackClips,
} from "./shared";

export function applyMove(tl: Timeline, cmd: MoveCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [cmd.newStart]);
  if (rateErr) return rateErr;

  const oldStart = loc.clip.timelineRange.start;
  if (cmd.newStart.value === oldStart.value) return noChange(tl); // A4

  const updated: AnyClip = {
    ...loc.clip,
    timelineRange: { ...loc.clip.timelineRange, start: cmd.newStart },
  };
  const candidate = withTrackClips(
    tl,
    loc.track.id,
    trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
  );
  const invErr = candidateError(candidate, [cmd.clipId]);
  if (invErr) return invErr;

  return ok(candidate, [
    { op: "move", clipId: cmd.clipId, newStart: oldStart },
  ]);
}

export function applyTrim(tl: Timeline, cmd: TrimCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [cmd.delta]);
  if (rateErr) return rateErr;

  const d = cmd.delta.value;
  if (d === 0) return noChange(tl); // A4

  const clip = loc.clip;
  const rate = tl.projectRate;
  const tlr = clip.timelineRange;

  // BC.3: timeline and source window always change together, by the same
  // amount, on the same side. minus = cut, plus = extend.
  const newTimeline: TimeRange =
    cmd.edge === "start"
      ? {
          start: rt(tlr.start.value - d, rate),
          duration: rt(tlr.duration.value + d, rate),
        }
      : { start: tlr.start, duration: rt(tlr.duration.value + d, rate) };

  // Lineage span moves in lockstep (root-local content coordinate).
  const span = clip.lineage.span;
  const newSpan: TimeRange =
    cmd.edge === "start"
      ? {
          start: rt(span.start.value - d, rate),
          duration: rt(span.duration.value + d, rate),
        }
      : { start: span.start, duration: rt(span.duration.value + d, rate) };

  let updated: AnyClip;
  if (isTextClip(clip)) {
    // #16 — text has no source window: timeline only.
    updated = {
      ...clip,
      timelineRange: newTimeline,
      lineage: { ...clip.lineage, span: newSpan },
    };
  } else {
    const src = clip.sourceRange;
    const newSource: TimeRange =
      cmd.edge === "start"
        ? {
            start: rt(src.start.value - d, rate),
            duration: rt(src.duration.value + d, rate),
          }
        : { start: src.start, duration: rt(src.duration.value + d, rate) };
    updated = {
      ...clip,
      sourceRange: newSource,
      timelineRange: newTimeline,
      lineage: { ...clip.lineage, span: newSpan },
    };
  }

  const candidate = withTrackClips(
    tl,
    loc.track.id,
    trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
  );
  const invErr = candidateError(candidate, [cmd.clipId]);
  if (invErr) return invErr;

  return ok(candidate, [
    { op: "trim", clipId: cmd.clipId, edge: cmd.edge, delta: rt(-d, rate) },
  ]);
}

export function applySlip(tl: Timeline, cmd: SlipCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  if (isTextClip(loc.clip)) {
    return err(
      "E_NOT_APPLICABLE",
      "slip is not applicable to text clips (#16)",
    );
  }

  // O3 — same idea, one row down the same table: slip moves the window
  // INSIDE the file, and an image has no window (whatever you slide to,
  // the same picture shows). Allowing it would change data with zero
  // visual effect — and that lie travels: diff would say "clip changed"
  // and two branches slipping differently would raise a Bucket-1 conflict
  // over nothing.
  const slipMedia = getMedia(tl, loc.clip.mediaRefId);
  if (slipMedia?.kind === "image") {
    return err("E_NOT_APPLICABLE", "slip is not applicable to image clips");
  }

  const rateErr = rateMismatch(tl.projectRate, [cmd.delta]);
  if (rateErr) return rateErr;

  const d = cmd.delta.value;
  if (d === 0) return noChange(tl); // A4

  const clip = loc.clip;
  const updated: Clip = {
    ...clip,
    sourceRange: {
      ...clip.sourceRange,
      start: rt(clip.sourceRange.start.value + d, tl.projectRate),
    },
  };

  const candidate = withTrackClips(
    tl,
    loc.track.id,
    trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
  );
  const invErr = candidateError(candidate, [cmd.clipId]);
  if (invErr) return invErr;

  return ok(candidate, [
    { op: "slip", clipId: cmd.clipId, delta: rt(-d, tl.projectRate) },
  ]);
}

export function applySplit(tl: Timeline, cmd: SplitCommand): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [cmd.at]);
  if (rateErr) return rateErr;

  const clip = loc.clip;
  const rate = tl.projectRate;
  const start = clip.timelineRange.start.value;
  const end = rangeEnd(clip.timelineRange);
  const at = cmd.at.value;

  // Both edges exclusive — a boundary cut would create a 0-duration piece
  // (a 1-frame clip therefore cannot be split at all).
  if (at === start || at === end) {
    return err("E_SPLIT_AT_BOUNDARY", `cut at ${at} sits on a clip boundary`);
  }
  if (at < start || at > end) {
    return err(
      "E_SPLIT_OUT_OF_RANGE",
      `cut at ${at} is outside clip [${start}, ${end})`,
    );
  }

  const offset = at - start; // frames into the clip
  const span = clip.lineage.span;
  const cutLocal = span.start.value + offset; // root-local coordinate (B1.1)
  // Parent-chained formula name (B1.1). Trims can "heal" a previously cut
  // root-local coordinate while the original descendant still survives on a
  // shifted span, so the bare formula is not collision-proof: extend it
  // deterministically until unique among live clips. Same state mints the
  // same name on both branches, so same-cut merge convergence is preserved.
  const liveIds = new Set<string>();
  for (const track of tl.tracks) {
    for (const existing of track.clips) liveIds.add(existing.id);
  }
  let rightId = `${clip.id}@${cutLocal}`;
  while (liveIds.has(rightId)) rightId = `${rightId}@${cutLocal}`;

  const leftTimeline: TimeRange = {
    start: clip.timelineRange.start,
    duration: rt(offset, rate),
  };
  const rightTimeline: TimeRange = {
    start: rt(at, rate),
    duration: rt(end - at, rate),
  };
  const leftSpan: TimeRange = { start: span.start, duration: rt(offset, rate) };
  const rightSpan: TimeRange = {
    start: rt(cutLocal, rate),
    duration: rt(span.duration.value - offset, rate),
  };

  let left: AnyClip;
  let right: AnyClip;
  if (isTextClip(clip)) {
    // Text: timeline partition only (no source window); content + style
    // + properties copied exactly to both pieces.
    left = {
      ...clip,
      timelineRange: leftTimeline,
      lineage: { ...clip.lineage, span: leftSpan },
    };
    right = {
      ...clip,
      id: rightId,
      timelineRange: rightTimeline,
      lineage: { ...clip.lineage, span: rightSpan },
    };
  } else {
    const src = clip.sourceRange;
    left = {
      ...clip,
      sourceRange: { start: src.start, duration: rt(offset, rate) },
      timelineRange: leftTimeline,
      lineage: { ...clip.lineage, span: leftSpan },
    };
    right = {
      ...clip,
      id: rightId,
      sourceRange: {
        start: rt(src.start.value + offset, rate),
        duration: rt(src.duration.value - offset, rate),
      },
      timelineRange: rightTimeline,
      lineage: { ...clip.lineage, span: rightSpan },
    };
  }

  const candidate = withTrackClips(tl, loc.track.id, [
    ...trackClips(loc.track).map((c) => (c.id === clip.id ? left : c)),
    right,
  ]);

  // Inverse (atomic composite, undo-internal only): remove the right
  // piece, then restore the left piece from the captured preimage.
  const inverse: EngineCommand[] = [
    { op: "deleteClip", clipId: rightId },
    { op: "deleteClip", clipId: clip.id },
    { op: "addClip", trackId: loc.track.id, clip },
  ];

  return ok(candidate, inverse);
}
