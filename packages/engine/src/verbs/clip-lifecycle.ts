import type {
  AddClipMediaCommand,
  AddClipTextCommand,
  ApplyOptions,
  ApplyResult,
  Clip,
  DeleteClipCommand,
  EngineCommand,
  RippleDeleteCommand,
  RestoreClipCommand,
  TextClip,
  Timeline,
} from "../types";
import {
  type AnyClip,
  TRACK_KIND_FOR_MEDIA,
  candidateError,
  defaultMintId,
  err,
  getMedia,
  getTrack,
  rangeEnd,
  locateClip,
  materializeTextStyle,
  ok,
  rateMismatch,
  rt,
  trackClips,
  validateTextContent,
  withTrackClips,
} from "./shared";

export function applyAddMediaClip(
  tl: Timeline,
  cmd: AddClipMediaCommand,
  options?: ApplyOptions,
): ApplyResult {
  const track = getTrack(tl, cmd.trackId);
  if (!track) return err("E_TRACK_NOT_FOUND", `track ${cmd.trackId} not found`);

  const media = getMedia(tl, cmd.mediaRefId);
  if (!media)
    return err("E_MEDIA_NOT_FOUND", `media ${cmd.mediaRefId} not found`);

  const rateErr = rateMismatch(tl.projectRate, [
    cmd.sourceRange.start,
    cmd.sourceRange.duration,
    cmd.timelineRange.start,
    cmd.timelineRange.duration,
  ]);
  if (rateErr) return rateErr;

  if (track.kind !== TRACK_KIND_FOR_MEDIA[media.kind]) {
    return err(
      "E_TRACK_KIND_MISMATCH",
      `${media.kind} media cannot sit on a ${track.kind} track`,
    );
  }

  const id = (options?.mintId ?? defaultMintId)();
  const clip: Clip = {
    id,
    mediaRefId: cmd.mediaRefId,
    sourceRange: cmd.sourceRange,
    timelineRange: cmd.timelineRange,
    properties: {},
    lineage: {
      rootId: id,
      span: {
        start: rt(0, tl.projectRate),
        duration: cmd.timelineRange.duration,
      },
    },
  };

  const candidate = withTrackClips(tl, track.id, [...trackClips(track), clip]);
  const invErr = candidateError(candidate, [id]);
  if (invErr) return invErr;

  return ok(candidate, [{ op: "deleteClip", clipId: id }]);
}

export function applyAddTextClip(
  tl: Timeline,
  cmd: AddClipTextCommand,
  options?: ApplyOptions,
): ApplyResult {
  const track = getTrack(tl, cmd.trackId);
  if (!track) return err("E_TRACK_NOT_FOUND", `track ${cmd.trackId} not found`);

  if (track.kind !== "text") {
    return err(
      "E_TRACK_KIND_MISMATCH",
      `text clip cannot sit on a ${track.kind} track`,
    );
  }

  const rateErr = rateMismatch(tl.projectRate, [
    cmd.timelineRange.start,
    cmd.timelineRange.duration,
  ]);
  if (rateErr) return rateErr;

  const contentErr = validateTextContent(cmd.textContent);
  if (contentErr) return contentErr;

  const styleResult = materializeTextStyle(cmd.textStyle);
  if ("error" in styleResult) return styleResult.error;

  const id = (options?.mintId ?? defaultMintId)();
  const clip: TextClip = {
    id,
    timelineRange: cmd.timelineRange,
    textContent: cmd.textContent,
    textStyle: styleResult.style,
    lineage: {
      rootId: id,
      span: {
        start: rt(0, tl.projectRate),
        duration: cmd.timelineRange.duration,
      },
    },
  };

  const candidate = withTrackClips(tl, track.id, [...trackClips(track), clip]);
  const invErr = candidateError(candidate, [id]);
  if (invErr) return invErr;

  return ok(candidate, [{ op: "deleteClip", clipId: id }]);
}

export function applyRestoreClip(
  tl: Timeline,
  cmd: RestoreClipCommand,
): ApplyResult {
  const track = getTrack(tl, cmd.trackId);
  if (!track) return err("E_TRACK_NOT_FOUND", `track ${cmd.trackId} not found`);

  // Undo runs LIFO so the preimage always fits (A3.1c); the invariant
  // sweep stays on as a loud fail-safe against engine bugs.
  const candidate = withTrackClips(tl, track.id, [
    ...trackClips(track),
    cmd.clip,
  ]);
  const invErr = candidateError(candidate, [cmd.clip.id]);
  if (invErr) return invErr;

  return ok(candidate, [{ op: "deleteClip", clipId: cmd.clip.id }]);
}

export function applyDeleteClip(
  tl: Timeline,
  cmd: DeleteClipCommand,
): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const remaining = trackClips(loc.track).filter((c) => c.id !== cmd.clipId);
  const candidate = withTrackClips(tl, loc.track.id, [...remaining]);

  // Inverse = internal restore form: full preimage back, id preserved.
  return ok(candidate, [
    { op: "addClip", trackId: loc.track.id, clip: loc.clip },
  ]);
}

export function applyRippleDelete(
  tl: Timeline,
  cmd: RippleDeleteCommand,
): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);

  const victim = loc.clip;
  const dur = victim.timelineRange.duration.value;
  const victimEnd = rangeEnd(victim.timelineRange);
  const rate = tl.projectRate;

  const shifted: { id: string; oldStart: number }[] = [];
  const newClips: AnyClip[] = [];
  for (const c of trackClips(loc.track)) {
    if (c.id === victim.id) continue;
    if (c.timelineRange.start.value >= victimEnd) {
      shifted.push({ id: c.id, oldStart: c.timelineRange.start.value });
      newClips.push({
        ...c,
        timelineRange: {
          ...c.timelineRange,
          start: rt(c.timelineRange.start.value - dur, rate),
        },
      });
    } else {
      newClips.push(c);
    }
  }

  const candidate = withTrackClips(tl, loc.track.id, newClips);

  // Inverse (composite): shift the moved clips back right (rightmost
  // first — never a transient overlap), then restore the victim.
  const inverse: EngineCommand[] = [
    ...shifted
      .sort((a, b) => b.oldStart - a.oldStart)
      .map((s): EngineCommand => ({
        op: "move",
        clipId: s.id,
        newStart: rt(s.oldStart, rate),
      })),
    { op: "addClip", trackId: loc.track.id, clip: victim },
  ];

  return ok(candidate, inverse);
}
