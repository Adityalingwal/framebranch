import type { Timeline, Track } from "@framebranch/engine";

import type { AnyClip } from "../../lib/clip-helpers";

/** Zoom factor — pixels per second, constant (§8.1: no zoom control in M8a). */
export const PX_PER_SECOND = 70;

/** Lane heights by track kind — shared between the lane row and its clips. */
export const TRACK_HEIGHT: Record<Track["kind"], number> = {
  video: 56,
  audio: 44,
  text: 36,
};

export function pxPerFrame(projectRate: number): number {
  return PX_PER_SECOND / projectRate;
}

/** Rightmost frame any clip on any track reaches — drives ruler + lane width. */
export function timelineEndFrame(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips as AnyClip[]) {
      const clipEnd = clip.timelineRange.start.value + clip.timelineRange.duration.value;
      if (clipEnd > end) end = clipEnd;
    }
  }
  return end;
}
