import { checkInvariants, VIOLATION_ERROR_CODE } from "../invariants";
import type { ReplaceTracksCommand, Timeline, Track } from "../types";
import {
  describeViolation,
  err,
  noChange,
  ok,
  TRACK_KIND_FOR_MEDIA,
} from "./shared";

const TRACK_COLOR_RE = /^#[0-9a-f]{6}$/;

export function applyReplaceTracks(
  timeline: Timeline,
  command: ReplaceTracksCommand,
) {
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  const mediaById = new Map(
    timeline.mediaRefs.map((media) => [media.id, media]),
  );

  for (const track of command.tracks) {
    if (!track.id || trackIds.has(track.id)) {
      return err("E_INVALID_VALUE", "track ids must be present and unique");
    }
    trackIds.add(track.id);
    if (
      track.name !== undefined &&
      (track.name.trim().length === 0 || track.name.length > 80)
    ) {
      return err("E_INVALID_VALUE", "track name must be 1-80 characters");
    }
    if (track.color !== undefined && !TRACK_COLOR_RE.test(track.color)) {
      return err("E_INVALID_VALUE", "track color must be lowercase #rrggbb");
    }
    if (
      track.height !== undefined &&
      (!Number.isInteger(track.height) ||
        track.height < 32 ||
        track.height > 120)
    ) {
      return err("E_INVALID_VALUE", "track height must be an integer 32-120");
    }
    for (const clip of track.clips) {
      if (!clip.id || clipIds.has(clip.id)) {
        return err("E_INVALID_VALUE", "clip ids must remain globally unique");
      }
      clipIds.add(clip.id);
      if ("textContent" in clip) {
        if (track.kind !== "text") {
          return err(
            "E_TRACK_KIND_MISMATCH",
            "text clips require a text track",
          );
        }
      } else {
        const media = mediaById.get(clip.mediaRefId);
        if (!media || TRACK_KIND_FOR_MEDIA[media.kind] !== track.kind) {
          return err(
            "E_TRACK_KIND_MISMATCH",
            `clip ${clip.id} does not match track ${track.id}`,
          );
        }
      }
    }
  }

  const nextTracks = command.tracks.map((track): Track => ({
    ...track,
    name: track.name?.trim(),
  }));
  if (JSON.stringify(timeline.tracks) === JSON.stringify(nextTracks)) {
    return noChange(timeline);
  }

  const candidate = { ...timeline, tracks: nextTracks };
  const violation = checkInvariants(candidate)[0];
  if (violation) {
    return err(
      VIOLATION_ERROR_CODE[violation.kind],
      describeViolation(violation),
    );
  }

  return ok(candidate, [{ op: "replaceTracks", tracks: timeline.tracks }]);
}
