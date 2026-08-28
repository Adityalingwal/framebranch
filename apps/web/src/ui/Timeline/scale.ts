import type { Timeline, Track } from "@framebranch/engine";

import type { AnyClip } from "../../lib/clip-helpers";

/** Timeline zoom bounds. The editor starts compact but can expand for frame work. */
export const DEFAULT_PX_PER_SECOND = 76;
export const MIN_PX_PER_SECOND = 44;
export const MAX_PX_PER_SECOND = 148;
export const LANE_LABEL_WIDTH = 208;
export type TimelineTool = "select" | "blade";

/** Track-kind → CSS var holding its tint, for labels and clip accents. */
export const TRACK_COLOR: Record<Track["kind"], string> = {
  video: "var(--fb-track-video)",
  audio: "var(--fb-track-audio)",
  text: "var(--fb-track-text)",
};

/** Lane heights by track kind — shared between the lane row and its clips. */
export const TRACK_HEIGHT: Record<Track["kind"], number> = {
  video: 56,
  audio: 44,
  text: 36,
};

export function trackHeight(track: Track): number {
  return track.height ?? TRACK_HEIGHT[track.kind];
}

export function trackColor(track: Track): string {
  return track.color ?? TRACK_COLOR[track.kind];
}

export function pxPerFrame(
  projectRate: number,
  pxPerSecond = DEFAULT_PX_PER_SECOND,
): number {
  return pxPerSecond / projectRate;
}

/** Rightmost frame any clip on any track reaches — drives ruler + lane width. */
export function timelineEndFrame(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips as AnyClip[]) {
      const clipEnd =
        clip.timelineRange.start.value + clip.timelineRange.duration.value;
      if (clipEnd > end) end = clipEnd;
    }
  }
  return end;
}
