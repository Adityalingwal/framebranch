/**
 * The single shared invariant list — called by both the edit door (verbs.ts)
 * and the post-merge sweep after a merge.
 *
 * All 6 invariants:
 *  1. No two clips overlap on the same track
 *  2. Clip source-range is within MediaRef.durationInSource (skipped for images — null = unbounded)
 *  3. Every TimeRange has duration > 0
 *  4. Timeline start >= 0
 *  5. sourceRange.duration === timelineRange.duration for media clips
 *  6. Text clip content is non-empty
 */
import type { Clip, ErrorCode, MediaRef, TextClip, Timeline } from "./types";

export type InvariantViolation =
  | {
      kind: "nonpositive-duration";
      clipId: string;
      range: "sourceRange" | "timelineRange";
    }
  | { kind: "negative-start"; clipId: string }
  | { kind: "source-timeline-duration-mismatch"; clipId: string }
  | { kind: "source-out-of-file"; clipId: string }
  | { kind: "overlap"; trackId: string; clipIds: [string, string] }
  | { kind: "empty-text-content"; clipId: string };


export const VIOLATION_ERROR_CODE: Record<
  InvariantViolation["kind"],
  ErrorCode
> = {
  "nonpositive-duration": "E_INVALID_RANGE",
  "negative-start": "E_NEGATIVE_TIME",
  "source-timeline-duration-mismatch": "E_INVALID_RANGE",
  "source-out-of-file": "E_SOURCE_OUT_OF_BOUNDS",
  overlap: "E_OVERLAP",
  "empty-text-content": "E_INVALID_VALUE",
};

const isTextClip = (c: Clip | TextClip): c is TextClip => "textContent" in c;

/** Run THE list over a timeline; returns every violation found. */
export function checkInvariants(timeline: Timeline): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const mediaById = new Map<string, MediaRef>(
    timeline.mediaRefs.map((m) => [m.id, m]),
  );

  for (const track of timeline.tracks) {
    const clips: readonly (Clip | TextClip)[] = track.clips;

    for (const clip of clips) {
      const tl = clip.timelineRange;

      // 3. duration > 0 (every TimeRange the clip carries)
      if (tl.duration.value <= 0) {
        violations.push({
          kind: "nonpositive-duration",
          clipId: clip.id,
          range: "timelineRange",
        });
      }

      // 4. timeline start >= 0
      if (tl.start.value < 0) {
        violations.push({ kind: "negative-start", clipId: clip.id });
      }

      if (isTextClip(clip)) {
        // 6. text content non-empty
        if (clip.textContent.length === 0) {
          violations.push({ kind: "empty-text-content", clipId: clip.id });
        }
      } else {
        const src = clip.sourceRange;

        if (src.duration.value <= 0) {
          violations.push({
            kind: "nonpositive-duration",
            clipId: clip.id,
            range: "sourceRange",
          });
        }

        // 5. sourceRange.duration === timelineRange.duration (no speed-change in V1)
        if (src.duration.value !== tl.duration.value) {
          violations.push({
            kind: "source-timeline-duration-mismatch",
            clipId: clip.id,
          });
        }

        // 2. source range inside the file — O1: an image has no length
        // (durationInSource === null = unbounded), so the check skips it.
        const media = mediaById.get(clip.mediaRefId);
        if (media && media.durationInSource !== null) {
          const srcEnd = src.start.value + src.duration.value;
          if (src.start.value < 0 || srcEnd > media.durationInSource.value) {
            violations.push({ kind: "source-out-of-file", clipId: clip.id });
          }
        }
      }
    }

    // 1. no-overlap-same-track (half-open ranges; touching edges are fine)
    for (let i = 0; i < clips.length; i++) {
      for (let j = i + 1; j < clips.length; j++) {
        const a = clips[i].timelineRange;
        const b = clips[j].timelineRange;
        const aEnd = a.start.value + a.duration.value;
        const bEnd = b.start.value + b.duration.value;
        if (a.start.value < bEnd && b.start.value < aEnd) {
          violations.push({
            kind: "overlap",
            trackId: track.id,
            clipIds: [clips[i].id, clips[j].id],
          });
        }
      }
    }
  }

  return violations;
}
