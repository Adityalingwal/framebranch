/**
 * C-D — the shared diff presenter (server/diff-rows.ts). Pure: hand-built
 * timelines, no DB. Wording is the copy sheet's, verbatim.
 */

import { describe, expect, it } from "vitest";

import { applyCommand } from "@framebranch/engine";
import type {
  Clip,
  Command,
  MediaRef,
  TextClip,
  Timeline,
  Track,
} from "@framebranch/engine";

import { presentDiff, summaryName } from "../src/server/diff-rows";
import type { DiffRow } from "../src/server/diff-rows";

const R = 24;
const t = (value: number) => ({ value, rate: R });
const range = (start: number, duration: number) => ({
  start: t(start),
  duration: t(duration),
});

const MEDIA: MediaRef[] = [
  {
    id: "m-interview",
    kind: "video",
    url: "/media/interview.mp4",
    hash: "",
    sourceRate: R,
    durationInSource: t(24 * 60 * 60 * 2), // 2h of source — enough for every test
  },
  {
    id: "m-broll",
    kind: "video",
    url: "/media/broll.mp4",
    hash: "",
    sourceRate: R,
    durationInSource: t(24 * 60 * 60 * 2),
  },
];

function media(
  id: string,
  name: string | undefined,
  mediaRefId: string,
  tlStart: number,
  duration: number,
  srcStart = 48,
  properties: Clip["properties"] = {},
): Clip {
  return {
    id,
    ...(name ? { name } : {}),
    mediaRefId,
    sourceRange: range(srcStart, duration),
    timelineRange: range(tlStart, duration),
    properties,
    lineage: { rootId: id, span: range(0, duration) },
  };
}

function text(
  id: string,
  name: string | undefined,
  tlStart: number,
  duration: number,
  content: string,
): TextClip {
  return {
    id,
    ...(name ? { name } : {}),
    timelineRange: range(tlStart, duration),
    textContent: content,
    textStyle: { font: "Arial", size: 48, color: "#ffffff" },
    lineage: { rootId: id, span: range(0, duration) },
  };
}

/**
 * V1: Intro [0,48) · Interview [240,480) · B-roll [720,840)   (gaps between)
 * T1: Welcome [48,120)
 */
function base(): Timeline {
  const v1: Track = {
    id: "v1",
    kind: "video",
    name: "V1",
    clips: [
      media("intro", "Intro", "m-interview", 0, 48, 0),
      media("interview", "Interview", "m-interview", 240, 240),
      media("broll", "B-roll", "m-broll", 720, 120),
    ],
  };
  const t1: Track = {
    id: "t1",
    kind: "text",
    name: "T1",
    clips: [text("welcome", "Welcome", 48, 72, "Welcome")],
  };
  return { projectRate: R, tracks: [v1, t1], mediaRefs: MEDIA };
}

/** Contiguous V1: A [0,48) B [48,288) C [288,408) D [408,500). */
function contiguous(): Timeline {
  const v1: Track = {
    id: "v1",
    kind: "video",
    name: "V1",
    clips: [
      media("a", "Intro", "m-interview", 0, 48, 0),
      media("b", "Interview", "m-interview", 48, 240),
      media("c", "B-roll", "m-broll", 288, 120),
      media("d", "Logo", "m-broll", 408, 92),
    ],
  };
  return { projectRate: R, tracks: [v1], mediaRefs: MEDIA };
}

function apply(tl: Timeline, ...commands: Command[]): Timeline {
  let current = tl;
  for (const command of commands) {
    const result = applyCommand(current, command, {
      mintId: () =>
        `new-${current.tracks.reduce((n, x) => n + x.clips.length, 0)}`,
    });
    if (!result.ok) {
      throw new Error(`fixture command failed: ${result.error.message}`);
    }
    current = result.timeline;
  }
  return current;
}

const line = (r: DiffRow) => `${r.clipName} · ${r.text}${r.where ? ` · ${r.where}` : ""}`;

describe("presentDiff — one row per change, copy-sheet wording", () => {
  it("moved before its new neighbour, 4-part timecodes", () => {
    const after = apply(base(), { op: "move", clipId: "broll", newStart: t(96) });
    const p = presentDiff(base(), after);
    expect(p.rows.map(line)).toEqual([
      'B-roll · Moved before "Interview" · 00:00:30:00 → 00:00:04:00',
    ]);
    expect(p.count).toBe(1);
    expect(p.rows[0]).toMatchObject({
      kind: "moved",
      clipIds: ["broll"],
      thumbnail: "/thumbnails/broll.jpg",
      trackId: "v1",
      trackName: "V1",
    });
    // exactly one row → the card name is that row's own text
    expect(p.summaryName).toBe('B-roll moved before "Interview"');
  });

  it("moved to the end of its track → `Moved after`", () => {
    const after = apply(base(), { op: "move", clipId: "intro", newStart: t(1000) });
    expect(presentDiff(base(), after).rows.map(line)).toEqual([
      'Intro · Moved after "B-roll" · 00:00:00:00 → 00:00:41:16',
    ]);
  });

  it("moved while alone on the track → the fallback `Moved to ‹tc› (was ‹tc›)`", () => {
    const after = apply(base(), { op: "move", clipId: "welcome", newStart: t(240) });
    const p = presentDiff(base(), after);
    expect(p.rows.map(line)).toEqual([
      "Welcome · Moved to 00:00:10:00 (was 00:00:02:00)",
    ]);
    expect(p.rows[0].where).toBe("");
    expect(p.rows[0].thumbnail).toBeNull(); // text clips have no thumbnail
    expect(p.rows[0].trackName).toBe("T1");
  });

  it("trimmed: end shortened / start extended, amounts in frames, `now ends/starts` 4-part", () => {
    const after = apply(
      base(),
      { op: "trim", clipId: "interview", edge: "end", delta: t(-18) },
      // engine convention: minus = cut, plus = extend (either edge)
      { op: "trim", clipId: "interview", edge: "start", delta: t(1) },
    );
    const p = presentDiff(base(), after);
    expect(p.rows.map(line)).toEqual([
      "Interview · Start extended by 1 frame · now starts 00:00:09:23",
      "Interview · End trimmed by 18 frames · now ends 00:00:19:06",
    ]);
    expect(p.count).toBe(2);
    // two rows on ONE clip → the name counts the clip, the meta counts the rows
    expect(p.summaryName).toBe("1 clip trimmed");
  });

  it("slipped later, position unchanged", () => {
    const after = apply(base(), { op: "slip", clipId: "interview", delta: t(12) });
    expect(presentDiff(base(), after).rows.map(line)).toEqual([
      "Interview · Slipped 12 frames later · stays at 00:00:10:00",
    ]);
  });

  it("property rows: volume before → after; textStyle fans out per changed sub-field, each counts 1", () => {
    const after = apply(
      base(),
      { op: "propertyChange", clipId: "interview", property: "volume", value: 60 },
      {
        op: "propertyChange",
        clipId: "welcome",
        property: "textStyle",
        value: { font: "Georgia", size: 48, color: "#ff0000" },
      },
      { op: "propertyChange", clipId: "welcome", property: "position", value: { x: 0, y: 310 } },
    );
    const p = presentDiff(base(), after);
    expect(p.rows.map(line)).toEqual([
      "Interview · Volume 100% → 60%",
      "Welcome · Position changed",
      "Welcome · Text font changed",
      "Welcome · Text colour changed",
    ]);
    expect(p.count).toBe(4); // N = rows, not engine entries (3)
    // the NAME counts distinct clips (Interview, Welcome), not rows
    expect(p.summaryName).toBe("2 clips changed");
    expect(p.rows.map((r) => r.key)).toEqual([
      "interview:property:volume",
      "welcome:property:position",
      "welcome:property:font",
      "welcome:property:colour",
    ]);
  });

  it("added after a neighbour / added first, duration as 4-part timecode", () => {
    const after = apply(
      base(),
      {
        op: "addClip",
        trackId: "v1",
        mediaRefId: "m-broll",
        sourceRange: range(0, 120),
        timelineRange: range(1000, 120),
      },
      {
        op: "addClip",
        trackId: "t1",
        textContent: "Hi",
        timelineRange: range(0, 24),
      },
    );
    const p = presentDiff(base(), after);
    expect(p.rows.map(line)).toEqual([
      'Broll · Added after "B-roll" · at 00:00:41:16 · 00:00:05:00',
      '"Hi" · Added first · at 00:00:00:00 · 00:00:01:00',
    ]);
    // unnamed clips fall back to media filename / text content — never an id
    expect(p.rows.every((r) => !r.clipName.includes("new-"))).toBe(true);
    expect(p.summaryName).toBe("2 clips added");
  });

  it("removed: was at ‹tc› · ‹duration›", () => {
    const after = apply(base(), { op: "deleteClip", clipId: "interview" });
    const p = presentDiff(base(), after);
    expect(p.rows.map(line)).toEqual([
      "Interview · Removed · was at 00:00:10:00 · 00:00:10:00",
    ]);
    expect(p.rows[0].thumbnail).toBe("/thumbnails/interview.jpg"); // from `before`
  });

  it("split: N clips at the cut's timeline position (not the root-local cut)", () => {
    // move first so timeline position ≠ root-local coordinate, then split
    const moved = apply(base(), { op: "move", clipId: "interview", newStart: t(480) });
    const after = apply(moved, { op: "split", clipId: "interview", at: t(600) });
    const p = presentDiff(moved, after);
    expect(p.rows.map(line)).toEqual([
      "Interview · Split into 2 clips at 00:00:25:00".replace(" at ", " · at "),
    ]);
  });

  it("raw: media swapped → filenames; moved to another track → track name; unknown → take a look", () => {
    const a = base();
    const swapped: Timeline = {
      ...a,
      tracks: a.tracks.map((tr) =>
        tr.id !== "v1"
          ? tr
          : {
              ...tr,
              clips: (tr.clips as Clip[]).map((c) =>
                c.id === "interview" ? { ...c, mediaRefId: "m-broll" } : c,
              ),
            },
      ),
    };
    expect(presentDiff(a, swapped).rows.map(line)).toEqual([
      "Interview · Media changed: interview.mp4 → broll.mp4",
    ]);

    const v2: Track = { id: "v2", kind: "video", clips: [] };
    const withV2: Timeline = { ...a, tracks: [...a.tracks, v2] };
    const crossTrack: Timeline = {
      ...withV2,
      tracks: withV2.tracks.map((tr) => {
        if (tr.id === "v1") {
          return { ...tr, clips: (tr.clips as Clip[]).filter((c) => c.id !== "broll") };
        }
        if (tr.id === "v2") {
          return { ...tr, clips: [(a.tracks[0].clips as Clip[])[2]] };
        }
        return tr;
      }),
    };
    const p = presentDiff(withV2, crossTrack);
    expect(p.rows.map(line)).toEqual(["B-roll · Moved to track V2"]);
    expect(p.rows[0].trackName).toBe("V2"); // unnamed video track #2 → V2

    const rerated: Timeline = { ...a, projectRate: 25 };
    expect(presentDiff(a, rerated).rows.map(line)).toEqual([
      "Timeline · Changed — take a look",
    ]);
  });
});

describe("presentDiff — ripple grouping (D4(9))", () => {
  it("a ripple delete folds the shifted clips into ONE row, counted once", () => {
    const before = contiguous();
    const after = apply(before, { op: "rippleDelete", clipId: "a" });
    const p = presentDiff(before, after);
    expect(p.rows.map(line)).toEqual([
      "Intro · Removed · was at 00:00:00:00 · 00:00:02:00",
      '3 clips · Moved along after "Intro" · 00:00:02:00 → 00:00:00:00 (first)',
    ]);
    expect(p.count).toBe(2);
    expect(p.rows[1]).toMatchObject({
      kind: "ripple",
      clipIds: ["b", "c", "d"],
      children: [
        { clipId: "b", clipName: "Interview" },
        { clipId: "c", clipName: "B-roll" },
        { clipId: "d", clipName: "Logo" },
      ],
    });
    expect(p.summaryName).toBe("1 clip removed, 3 clips moved along");
    expect(p.runtime).toEqual({ before: "00:00:20:20", after: "00:00:18:20" });
  });

  it("a trim followed by the same shift on every later clip is a ripple after the trimmed clip", () => {
    const before = contiguous();
    const after = apply(
      before,
      { op: "trim", clipId: "a", edge: "end", delta: t(-18) },
      { op: "move", clipId: "b", newStart: t(30) },
      { op: "move", clipId: "c", newStart: t(270) },
      { op: "move", clipId: "d", newStart: t(390) },
    );
    const p = presentDiff(before, after);
    expect(p.rows.map(line)).toEqual([
      "Intro · End trimmed by 18 frames · now ends 00:00:01:06",
      '3 clips · Moved along after "Intro" · 00:00:02:00 → 00:00:01:06 (first)',
    ]);
    expect(p.summaryName).toBe("1 clip trimmed, 3 clips moved along");
  });

  it("does NOT group when the shifts differ or the clips are not consecutive", () => {
    const before = contiguous();
    const differing = apply(
      before,
      { op: "trim", clipId: "a", edge: "end", delta: t(-18) },
      { op: "move", clipId: "b", newStart: t(30) },
      { op: "move", clipId: "c", newStart: t(280) }, // −8, not −18
    );
    const p1 = presentDiff(before, differing);
    expect(p1.rows.map((r) => r.kind)).toEqual(["trimmed", "moved", "moved"]);
    expect(p1.count).toBe(3);

    const gapped = apply(
      before,
      { op: "trim", clipId: "a", edge: "end", delta: t(-18) },
      { op: "move", clipId: "b", newStart: t(30) },
      { op: "move", clipId: "d", newStart: t(420) }, // c stays → b,d not consecutive shifts
    );
    const p2 = presentDiff(before, gapped);
    expect(p2.rows.map((r) => r.kind)).toEqual(["trimmed", "moved", "moved"]);
  });

  it("two consecutive same-delta moves with NO trim/add/remove before them are plain moves", () => {
    const before = contiguous();
    const after = apply(
      before,
      { op: "move", clipId: "d", newStart: t(420) }, // d first, so c has room
      { op: "move", clipId: "c", newStart: t(300) },
    );
    const p = presentDiff(before, after);
    expect(p.rows.map((r) => r.kind)).toEqual(["moved", "moved"]);
    expect(p.summaryName).toBe("2 clips moved");
  });
});

describe("presentDiff — names, timecode boundaries, empty diff", () => {
  it("two unnamed clips from one media on one track: the 2nd gets `(2nd)` inside this row list", () => {
    const v1: Track = {
      id: "v1",
      kind: "video",
      clips: [
        media("x1", undefined, "m-broll", 0, 48, 0),
        media("x2", undefined, "m-broll", 240, 48, 0),
      ],
    };
    const before: Timeline = { projectRate: R, tracks: [v1], mediaRefs: MEDIA };
    const after = apply(
      before,
      { op: "propertyChange", clipId: "x1", property: "volume", value: 50 },
      { op: "propertyChange", clipId: "x2", property: "volume", value: 40 },
    );
    expect(presentDiff(before, after).rows.map((r) => r.clipName)).toEqual([
      "Broll",
      "Broll (2nd)",
    ]);
  });

  it("frame 0 → 00:00:00:00 and 24 fps × 3600 s → 01:00:00:00; durations never in seconds", () => {
    const before = base();
    const after = apply(before, {
      op: "addClip",
      trackId: "v1",
      mediaRefId: "m-broll",
      sourceRange: range(0, 24 * 3600),
      timelineRange: range(24 * 3600, 24 * 3600),
    });
    const p = presentDiff(before, after);
    expect(p.rows[0].where).toBe("at 01:00:00:00 · 01:00:00:00");
    expect(p.runtime).toEqual({ before: "00:00:35:00", after: "02:00:00:00" });
    expect(presentDiff(before, before).runtime.before).toBe("00:00:35:00");
    const empty: Timeline = { projectRate: R, tracks: [], mediaRefs: [] };
    expect(presentDiff(empty, empty).runtime).toEqual({
      before: "00:00:00:00",
      after: "00:00:00:00",
    });
  });

  it("identical timelines → 0 rows, count 0, empty summary", () => {
    const p = presentDiff(base(), base());
    expect(p.rows).toEqual([]);
    expect(p.count).toBe(0);
    expect(p.summaryName).toBe("");
  });

  it("summary name: fixed kind order, first part carries clip(s), capped at 60 chars with …", () => {
    const rows = (kinds: DiffRow["kind"][]): DiffRow[] =>
      kinds.map((kind, i) => ({
        key: `${i}`,
        kind,
        clipIds: kind === "ripple" ? ["p", "q", "r", "s", "u", "v", "w"] : [`c${i}`],
        clipName: kind === "ripple" ? "7 clips" : `Clip ${i}`,
        thumbnail: null,
        text: "x",
        where: "",
        trackId: "v1",
        trackName: "V1",
        jump: { side: "after" as const, frame: 0, clipId: `c${i}` },
        laneIds: { before: [`c${i}`], after: [`c${i}`] },
      }));
    expect(summaryName(rows(["trimmed", "moved", "moved", "moved", "added"]))).toBe(
      "3 clips moved, 1 trimmed, 1 added",
    );
    expect(summaryName(rows(["ripple", "trimmed"]))).toBe(
      "1 clip trimmed, 7 clips moved along",
    );
    expect(summaryName(rows(["property", "raw", "split", "removed", "slipped"]))).toBe(
      "1 clip removed, 1 split, 1 slipped, 2 changed",
    );
    // distinct clips per verb: two rows on ONE clip name it `1 clip changed`
    const twoRowsOneClip = rows(["property", "property"]).map((r) => ({
      ...r,
      clipIds: ["same"],
      clipName: "Welcome",
    }));
    expect(summaryName(twoRowsOneClip)).toBe("1 clip changed");
    const long = summaryName(
      rows(["moved", "trimmed", "slipped", "added", "removed", "split", "property", "ripple"]),
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// B2 §2.1 — `jump` (row click → player) and `laneIds` (lane colour +
// two-way highlight). `jump.frame` is ALWAYS the frame behind the last
// timecode the row prints; `Removed` is the only row that answers on the
// Before side (lock (3)).
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("presentDiff — jump + laneIds per kind (B2 lock (3), §2.6)", () => {
  it("moved → After at the NEW start, the clip on both lanes", () => {
    const after = apply(base(), { op: "move", clipId: "broll", newStart: t(96) });
    const p = presentDiff(base(), after);
    expect(p.rows[0].jump).toEqual({ side: "after", frame: 96, clipId: "broll" });
    expect(p.rows[0].laneIds).toEqual({ before: ["broll"], after: ["broll"] });
  });

  it("moved while alone on its track (the `Moved to ‹tc›` fallback) still jumps to the new start", () => {
    const after = apply(base(), { op: "move", clipId: "welcome", newStart: t(240) });
    expect(presentDiff(base(), after).rows[0].jump).toEqual({
      side: "after",
      frame: 240,
      clipId: "welcome",
    });
  });

  it("trimmed → the frame behind the printed `now starts` / `now ends`", () => {
    const after = apply(
      base(),
      { op: "trim", clipId: "interview", edge: "end", delta: t(-18) },
      { op: "trim", clipId: "interview", edge: "start", delta: t(1) },
    );
    const p = presentDiff(base(), after);
    // `now starts 00:00:09:23` = frame 239; `now ends 00:00:19:06` = 462.
    expect(p.rows[0].jump).toEqual({ side: "after", frame: 239, clipId: "interview" });
    expect(p.rows[1].jump).toEqual({ side: "after", frame: 462, clipId: "interview" });
  });

  it("slipped → After at the `stays at` frame (the clip did not move)", () => {
    const after = apply(base(), { op: "slip", clipId: "interview", delta: t(12) });
    expect(presentDiff(base(), after).rows[0].jump).toEqual({
      side: "after",
      frame: 240,
      clipId: "interview",
    });
  });

  it("property → After at the clip's own start; `where` is empty but the jump is not", () => {
    const after = apply(base(), {
      op: "propertyChange",
      clipId: "interview",
      property: "volume",
      value: 60,
    });
    const p = presentDiff(base(), after);
    expect(p.rows[0].where).toBe("");
    expect(p.rows[0].jump).toEqual({ side: "after", frame: 240, clipId: "interview" });
    expect(p.rows[0].laneIds).toEqual({
      before: ["interview"],
      after: ["interview"],
    });
  });

  it("added → After at `at ‹tc›`, and the clip exists on the After lane only", () => {
    const after = apply(base(), {
      op: "addClip",
      trackId: "v1",
      mediaRefId: "m-broll",
      sourceRange: range(0, 120),
      timelineRange: range(1000, 120),
    });
    const p = presentDiff(base(), after);
    const added = p.rows[0];
    expect(added.jump.side).toBe("after");
    expect(added.jump.frame).toBe(1000);
    expect(added.jump.clipId).toBe(added.clipIds[0]);
    expect(added.laneIds).toEqual({ before: [], after: [added.clipIds[0]] });
  });

  it("removed → BEFORE at `was at ‹tc›`, and the clip exists on the Before lane only", () => {
    const after = apply(base(), { op: "deleteClip", clipId: "interview" });
    const p = presentDiff(base(), after);
    expect(p.rows[0].jump).toEqual({
      side: "before",
      frame: 240,
      clipId: "interview",
    });
    expect(p.rows[0].laneIds).toEqual({ before: ["interview"], after: [] });
  });

  it("split → After at the cut, focus the ORIGINAL id; original in Before, both pieces in After", () => {
    const moved = apply(base(), { op: "move", clipId: "interview", newStart: t(480) });
    const after = apply(moved, { op: "split", clipId: "interview", at: t(600) });
    const p = presentDiff(moved, after);
    expect(p.rows[0].jump).toEqual({
      side: "after",
      frame: 600,
      clipId: "interview",
    });
    expect(p.rows[0].laneIds.before).toEqual(["interview"]);
    expect(p.rows[0].laneIds.after).toHaveLength(2);
    // the leftmost piece keeps the original id, so the focus always resolves
    expect(p.rows[0].laneIds.after[0]).toBe("interview");
    // `clipIds` stays ONE id — widening it would make `summaryName` read
    // "2 clips split" for a single split.
    expect(p.rows[0].clipIds).toEqual(["interview"]);
  });

  it("ripple → the FIRST shifted clip's new start, every shifted clip on both lanes", () => {
    const before = contiguous();
    const after = apply(
      before,
      { op: "trim", clipId: "a", edge: "end", delta: t(-18) },
      { op: "move", clipId: "b", newStart: t(30) },
      { op: "move", clipId: "c", newStart: t(270) },
      { op: "move", clipId: "d", newStart: t(390) },
    );
    const p = presentDiff(before, after);
    expect(p.rows[1].kind).toBe("ripple");
    expect(p.rows[1].jump).toEqual({ side: "after", frame: 30, clipId: "b" });
    expect(p.rows[1].laneIds).toEqual({
      before: ["b", "c", "d"],
      after: ["b", "c", "d"],
    });
  });

  it("raw `Moved to track` keeps the clip on both lanes; a timeline-scope raw row has no clip at all", () => {
    const a = base();
    const v2: Track = { id: "v2", kind: "video", clips: [] };
    const withV2: Timeline = { ...a, tracks: [...a.tracks, v2] };
    const crossTrack: Timeline = {
      ...withV2,
      tracks: withV2.tracks.map((tr) => {
        if (tr.id === "v1") {
          return { ...tr, clips: (tr.clips as Clip[]).filter((c) => c.id !== "broll") };
        }
        if (tr.id === "v2") {
          return { ...tr, clips: [(a.tracks[0].clips as Clip[])[2]] };
        }
        return tr;
      }),
    };
    const moved = presentDiff(withV2, crossTrack).rows[0];
    expect(moved.jump).toEqual({ side: "after", frame: 720, clipId: "broll" });
    expect(moved.laneIds).toEqual({ before: ["broll"], after: ["broll"] });

    const rerated: Timeline = { ...a, projectRate: 25 };
    const timelineRow = presentDiff(a, rerated).rows[0];
    expect(timelineRow.jump).toEqual({ side: "after", frame: 0, clipId: null });
    expect(timelineRow.laneIds).toEqual({ before: [], after: [] });
  });

  it("every row of a mixed edit carries both fields", () => {
    const before = contiguous();
    const after = apply(
      before,
      { op: "move", clipId: "d", newStart: t(600) },
      { op: "deleteClip", clipId: "c" },
      { op: "propertyChange", clipId: "b", property: "volume", value: 50 },
    );
    const p = presentDiff(before, after);
    expect(p.rows.length).toBeGreaterThan(0);
    for (const r of p.rows) {
      expect(["before", "after"]).toContain(r.jump.side);
      expect(Number.isFinite(r.jump.frame)).toBe(true);
      expect(Array.isArray(r.laneIds.before)).toBe(true);
      expect(Array.isArray(r.laneIds.after)).toBe(true);
    }
  });
});
