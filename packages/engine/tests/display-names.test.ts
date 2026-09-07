/**
 * Display names (B0 / D4 patch 2026-09-07): `Clip.name`, `TextClip.name`,
 * `Track.name` are NON-SEMANTIC. They round-trip through OTIO and are
 * ignored by diff, merge, invariants and verbs.
 */

import { describe, expect, it } from "vitest";

import { computeDiff } from "../src/diff";
import { checkInvariants } from "../src/invariants";
import { startMerge } from "../src/merge";
import { exportOtio, importOtio } from "../src/otio";
import type { OtioJson } from "../src/otio";
import { applyCommand } from "../src/verbs";
import type { Clip, TextClip, Timeline, Track } from "../src/types";
import { baseTimeline, t } from "./fixtures";
import {
  otioClip,
  otioGap,
  otioTextClip,
  otioTimeline,
  otioTrack,
} from "./otio-fixtures";

type AnyClip = Clip | TextClip;
const clipsOf = (tl: Timeline, trackIndex: number): AnyClip[] =>
  tl.tracks[trackIndex].clips as AnyClip[];

/** The fixture with every clip and track renamed. Nothing else differs. */
function renamed(tl: Timeline): Timeline {
  return {
    ...tl,
    tracks: tl.tracks.map(
      (track, ti): Track => ({
        ...track,
        name: `Track ${ti}`,
        clips: (track.clips as AnyClip[]).map((clip) => ({
          ...clip,
          name: `Named ${clip.id}`,
        })) as Track["clips"],
      }),
    ),
  };
}

describe("display names are non-semantic", () => {
  it("renaming every clip and track produces zero diff entries", () => {
    const base = baseTimeline();
    const result = computeDiff(base, renamed(base));
    expect(result.entries).toEqual([]);
  });

  it("renaming does not create merge conflicts or change the merged content", () => {
    const base = baseTimeline();
    const ours = renamed(base);
    const theirsResult = applyCommand(base, {
      op: "move",
      clipId: "A",
      newStart: t(60),
    });
    if (!theirsResult.ok) throw new Error("fixture move failed");
    const theirs = theirsResult.timeline;

    const merge = startMerge({ base, ours, theirs });
    expect(merge.ok).toBe(true);
    if (!merge.ok) return;
    expect(merge.conflicts).toEqual([]);
    // The merged timeline carries exactly theirs' semantic content: a
    // diff against `theirs` sees nothing (names are invisible to diff).
    expect(computeDiff(theirs, merge.timeline).entries).toEqual([]);
  });

  it("invariants and verbs are indifferent to names", () => {
    const base = renamed(baseTimeline());
    expect(checkInvariants(base)).toEqual([]);
    const trimmed = applyCommand(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-2),
    });
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) return;
    // The verb copies the clip forward, so the name survives the edit.
    const a = clipsOf(trimmed.timeline, 0).find((c) => c.id === "A");
    expect(a?.name).toBe("Named A");
  });
});

describe("OTIO round-trip of names", () => {
  const doc = (): OtioJson =>
    otioTimeline({
      globalStart: { value: 0, rate: 24 },
      tracks: [
        otioTrack({
          name: "V1",
          kind: "Video",
          children: [
            otioClip({
              name: "Interview",
              sourceStart: 0,
              duration: 24,
              rate: 24,
              targetUrl: "file://interview.mp4",
              available: { start: 0, duration: 240, rate: 24 },
            }),
            otioGap(12, 24),
            otioClip({
              // no name at all → stays absent
              sourceStart: 0,
              duration: 24,
              rate: 24,
              targetUrl: "file://broll.mp4",
              available: { start: 0, duration: 240, rate: 24 },
            }),
          ],
        }),
        otioTrack({
          name: "   ", // whitespace-only → treated as absent
          kind: "Video",
          framebranchText: true,
          children: [
            otioTextClip({
              name: "Welcome card",
              duration: 24,
              rate: 24,
              textContent: "Welcome",
            }),
          ],
        }),
      ],
    });

  it("import reads clip and track names; absent/blank names stay absent", () => {
    const imported = importOtio(doc());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const tl = imported.timeline;
    expect(tl.tracks[0].name).toBe("V1");
    expect(tl.tracks[1].name).toBeUndefined();
    expect("name" in tl.tracks[1]).toBe(false);
    const [interview, broll] = clipsOf(tl, 0);
    expect(interview.name).toBe("Interview");
    expect(broll.name).toBeUndefined();
    expect("name" in broll).toBe(false);
    expect(clipsOf(tl, 1)[0].name).toBe("Welcome card");
  });

  it("export writes the names back and a second import reads them unchanged", () => {
    const first = importOtio(doc());
    if (!first.ok) throw new Error("fixture import failed");
    const exported = exportOtio(first.timeline);
    const second = importOtio(exported);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const names = (tl: Timeline) =>
      tl.tracks.map((track) => ({
        track: track.name,
        clips: (track.clips as AnyClip[]).map((c) => c.name),
      }));
    expect(names(second.timeline)).toEqual(names(first.timeline));
    expect(names(second.timeline)).toEqual([
      { track: "V1", clips: ["Interview", undefined] },
      { track: undefined, clips: ["Welcome card"] },
    ]);
  });

  it("an unnamed clip exports as name \"\" (plain documents stay plain)", () => {
    const first = importOtio(doc());
    if (!first.ok) throw new Error("fixture import failed");
    const exported = exportOtio(first.timeline) as {
      tracks: { children: { children: { name: string }[] }[] };
    };
    expect(exported.tracks.children[0].children.map((c) => c.name)).toEqual([
      "Interview",
      "Filler",
      "",
    ]);
  });
});
