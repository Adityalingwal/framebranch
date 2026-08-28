import { describe, expect, it } from "vitest";

import { applyCommand } from "../src";
import type { Timeline, Track } from "../src";

const base: Timeline = {
  projectRate: 24,
  mediaRefs: [],
  tracks: [
    { id: "v1", kind: "video", clips: [] },
    { id: "a1", kind: "audio", clips: [] },
  ],
};

describe("replaceTracks", () => {
  it("persists track names, colours, heights and order with an inverse", () => {
    const tracks: Track[] = [
      { id: "a1", kind: "audio", name: "Dialogue", height: 64, clips: [] },
      { id: "v1", kind: "video", color: "#b78cff", clips: [] },
    ];
    const result = applyCommand(base, { op: "replaceTracks", tracks });
    expect(result.ok).toBe(true);
    if (!result.ok || result.noChange) return;
    expect(result.timeline.tracks).toEqual(tracks);
    expect(result.inverse).toEqual([
      { op: "replaceTracks", tracks: base.tracks },
    ]);
  });

  it("accepts adding, duplicating and removing empty tracks", () => {
    const tracks: Track[] = [
      base.tracks[0],
      { id: "v2", kind: "video", name: "Video copy", clips: [] },
    ];
    const result = applyCommand(base, { op: "replaceTracks", tracks });
    expect(result.ok && !result.noChange).toBe(true);
    if (result.ok)
      expect(result.timeline.tracks.map((track) => track.id)).toEqual([
        "v1",
        "v2",
      ]);
  });

  it("rejects duplicate track ids", () => {
    const result = applyCommand(base, {
      op: "replaceTracks",
      tracks: [base.tracks[0], { ...base.tracks[1], id: "v1" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("E_INVALID_VALUE");
  });
});
