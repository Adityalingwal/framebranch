import { describe, expect, it } from "vitest";
import { checkInvariants } from "../src/invariants";
import type { Timeline, Track } from "../src/types";
import {
  baseTimeline,
  EMPTY_TIMELINE,
  MEDIA_REFS,
  mediaClip,
  R,
  range,
  textClip,
} from "./fixtures";

function timelineWithVideoClips(clips: Track["clips"]): Timeline {
  return {
    projectRate: R,
    tracks: [{ id: "v1", kind: "video", clips }],
    mediaRefs: MEDIA_REFS,
  };
}

describe("B2.3: THE single invariant list", () => {
  it("B2.3: a valid timeline reports zero violations", () => {
    expect(checkInvariants(baseTimeline())).toEqual([]);
  });

  it("A4: an empty timeline (0 tracks / 0 clips) is a valid normal state", () => {
    expect(checkInvariants(EMPTY_TIMELINE)).toEqual([]);
  });

  it("B2.3: no-overlap-same-track — overlapping clips are reported", () => {
    const tl = timelineWithVideoClips([
      mediaClip("A", "mV", 0, 0, 10),
      mediaClip("B", "mV", 20, 5, 10), // [5,15) overlaps [0,10)
    ]);
    expect(checkInvariants(tl)).toContainEqual({
      kind: "overlap",
      trackId: "v1",
      clipIds: ["A", "B"],
    });
  });

  it("B2.3: touching edges (half-open ranges) are NOT an overlap", () => {
    const tl = timelineWithVideoClips([
      mediaClip("A", "mV", 0, 0, 10),
      mediaClip("B", "mV", 20, 10, 10), // starts exactly where A ends
    ]);
    expect(checkInvariants(tl)).toEqual([]);
  });

  it("B2.3: overlap on different tracks is fine (same-track rule only)", () => {
    const tl: Timeline = {
      projectRate: R,
      tracks: [
        { id: "v1", kind: "video", clips: [mediaClip("A", "mV", 0, 0, 10)] },
        { id: "a1", kind: "audio", clips: [mediaClip("AU", "mA", 0, 0, 10)] },
      ],
      mediaRefs: MEDIA_REFS,
    };
    expect(checkInvariants(tl)).toEqual([]);
  });

  it("B2.3: source-range-in-file — window past the end of the file is reported", () => {
    const tl = timelineWithVideoClips([mediaClip("A", "mV", 95, 0, 10)]); // 95+10 > 100
    expect(checkInvariants(tl)).toContainEqual({
      kind: "source-out-of-file",
      clipId: "A",
    });
  });

  it("B2.3: source-range-in-file — negative source start is reported", () => {
    const clip = mediaClip("A", "mV", 0, 0, 10);
    clip.sourceRange = range(-1, 10);
    clip.timelineRange = range(0, 10);
    const tl = timelineWithVideoClips([clip]);
    expect(checkInvariants(tl)).toContainEqual({
      kind: "source-out-of-file",
      clipId: "A",
    });
  });

  it("B2.3: duration > 0 — a zero-duration timeline range is reported", () => {
    const clip = mediaClip("A", "mV", 0, 0, 10);
    clip.timelineRange = range(0, 0);
    const tl = timelineWithVideoClips([clip]);
    expect(checkInvariants(tl)).toContainEqual({
      kind: "nonpositive-duration",
      clipId: "A",
      range: "timelineRange",
    });
  });

  it("B2.3: start >= 0 — a negative timeline start is reported", () => {
    const clip = mediaClip("A", "mV", 5, 0, 10);
    clip.timelineRange = range(-3, 10);
    const tl = timelineWithVideoClips([clip]);
    expect(checkInvariants(tl)).toContainEqual({
      kind: "negative-start",
      clipId: "A",
    });
  });

  it("BC.4: sourceRange.duration === timelineRange.duration for media clips", () => {
    const clip = mediaClip("A", "mV", 5, 0, 10);
    clip.sourceRange = range(5, 8); // 8 != 10
    const tl = timelineWithVideoClips([clip]);
    expect(checkInvariants(tl)).toContainEqual({
      kind: "source-timeline-duration-mismatch",
      clipId: "A",
    });
  });

  it("A3.6/N2: empty text content is reported (text clips only)", () => {
    const tl: Timeline = {
      projectRate: R,
      tracks: [{ id: "x1", kind: "text", clips: [textClip("TX", 0, 4, "")] }],
      mediaRefs: [],
    };
    expect(checkInvariants(tl)).toContainEqual({
      kind: "empty-text-content",
      clipId: "TX",
    });
  });
});
