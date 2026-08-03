import { describe, expect, it } from "vitest";
import { applyCommand, applyEngineCommand } from "../src/verbs";
import type {
  ApplyOk,
  ApplyResult,
  Clip,
  Command,
  EngineCommand,
  ErrorCode,
  TextClip,
  Timeline,
} from "../src/types";
import { baseTimeline, EMPTY_TIMELINE, mediaClip, range, t } from "./fixtures";

type AnyClip = Clip | TextClip;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function expectOk(r: ApplyResult): ApplyOk {
  if (!r.ok)
    throw new Error(
      `expected success, got ${r.error.code}: ${r.error.message}`,
    );
  if (r.noChange) throw new Error("expected a real change, got noChange");
  return r;
}

function expectNoChange(r: ApplyResult): void {
  if (!r.ok) throw new Error(`expected noChange success, got ${r.error.code}`);
  expect(r.noChange).toBe(true);
}

function expectError(r: ApplyResult, code: ErrorCode): void {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe(code);
}

function clipById(tl: Timeline, id: string): AnyClip {
  for (const track of tl.tracks) {
    const clips: readonly AnyClip[] = track.clips;
    const clip = clips.find((c) => c.id === id);
    if (clip) return clip;
  }
  throw new Error(`clip ${id} not found in timeline`);
}

function hasClip(tl: Timeline, id: string): boolean {
  return tl.tracks.some((track) =>
    (track.clips as readonly AnyClip[]).some((c) => c.id === id),
  );
}

/** Apply an inverse (list of engine-internal undo steps) in order. */
function applySteps(tl: Timeline, steps: EngineCommand[]): Timeline {
  let cur = tl;
  for (const step of steps) {
    const r = applyEngineCommand(cur, step);
    if (!r.ok) throw new Error(`inverse step failed: ${r.error.code}`);
    cur = r.timeline;
  }
  return cur;
}

const mint = (id: string) => ({ mintId: () => id });

// ---------------------------------------------------------------------------
// A3.1 — addClip (media payload)
// ---------------------------------------------------------------------------

describe("A3.1: addClip — media payload", () => {
  const cmd = (over: Partial<Record<string, unknown>> = {}): Command =>
    ({
      op: "addClip",
      trackId: "v1",
      mediaRefId: "mV",
      sourceRange: range(0, 5),
      timelineRange: range(70, 5),
      ...over,
    }) as Command;

  it("A3.1: happy path — engine mints the id, lineage initialized, inverse = deleteClip", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, cmd(), mint("NEW")));
    const clip = clipById(res.timeline, "NEW") as Clip;
    expect(clip).toEqual({
      id: "NEW",
      mediaRefId: "mV",
      sourceRange: range(0, 5),
      timelineRange: range(70, 5),
      properties: {},
      lineage: { rootId: "NEW", span: range(0, 5) },
    });
    expect(res.inverse).toEqual([{ op: "deleteClip", clipId: "NEW" }]);
    // input untouched (pure function)
    expect(hasClip(tl, "NEW")).toBe(false);
  });

  it("A3.1: inverse (deleteClip) restores the original timeline", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, cmd(), mint("NEW")));
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });

  it("A3.1: unknown track → E_TRACK_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ trackId: "zz" })),
      "E_TRACK_NOT_FOUND",
    );
  });

  it("A3.1: unknown media → E_MEDIA_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ mediaRefId: "zz" })),
      "E_MEDIA_NOT_FOUND",
    );
  });

  it("A3.1: source window outside the file → E_SOURCE_OUT_OF_BOUNDS", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ sourceRange: range(98, 5) })),
      "E_SOURCE_OUT_OF_BOUNDS",
    );
  });

  it("A3.1: overlap with an existing clip → E_OVERLAP", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ timelineRange: range(12, 5) })),
      "E_OVERLAP",
    );
  });

  it("A3.1: zero duration → E_INVALID_RANGE", () => {
    expectError(
      applyCommand(
        baseTimeline(),
        cmd({ sourceRange: range(0, 0), timelineRange: range(70, 0) }),
      ),
      "E_INVALID_RANGE",
    );
  });

  it("A3.1: negative timeline start → E_NEGATIVE_TIME", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ timelineRange: range(-2, 5) })),
      "E_NEGATIVE_TIME",
    );
  });

  it("A3.1: video media on an audio track → E_TRACK_KIND_MISMATCH", () => {
    expectError(
      applyCommand(
        baseTimeline(),
        cmd({ trackId: "a1", timelineRange: range(20, 5) }),
      ),
      "E_TRACK_KIND_MISMATCH",
    );
  });

  it("A3.1: media clip on a text track → E_TRACK_KIND_MISMATCH", () => {
    expectError(
      applyCommand(
        baseTimeline(),
        cmd({ trackId: "x1", timelineRange: range(20, 5) }),
      ),
      "E_TRACK_KIND_MISMATCH",
    );
  });

  it("A3.1: command rate != project rate → E_RATE_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ sourceRange: range(0, 5, 30) })),
      "E_RATE_MISMATCH",
    );
  });

  it("BC.4: sourceRange.duration !== timelineRange.duration → E_INVALID_RANGE", () => {
    expectError(
      applyCommand(
        baseTimeline(),
        cmd({ sourceRange: range(0, 5), timelineRange: range(70, 6) }),
      ),
      "E_INVALID_RANGE",
    );
  });

  it("A3.1: audio media on an audio track is valid", () => {
    const res = expectOk(
      applyCommand(
        baseTimeline(),
        cmd({
          trackId: "a1",
          mediaRefId: "mA",
          sourceRange: range(10, 5),
          timelineRange: range(20, 5),
        }),
        mint("AU2"),
      ),
    );
    expect(hasClip(res.timeline, "AU2")).toBe(true);
  });

  it("A4: verbs work from an empty timeline (valid state) — add hits E_TRACK_NOT_FOUND, not a crash", () => {
    expectError(applyCommand(EMPTY_TIMELINE, cmd()), "E_TRACK_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// A3.6 + N1 — image → video-track mapping (addClip side)
// ---------------------------------------------------------------------------

describe("N1: image media track mapping", () => {
  const imgCmd = (trackId: string): Command =>
    ({
      op: "addClip",
      trackId,
      mediaRefId: "mI",
      sourceRange: range(0, 5),
      timelineRange: range(70, 5),
    }) as Command;

  it("N1: image media sits on a VIDEO track (image→video allowed)", () => {
    const res = expectOk(
      applyCommand(baseTimeline(), imgCmd("v1"), mint("IM2")),
    );
    expect(hasClip(res.timeline, "IM2")).toBe(true);
  });

  it("N1: image on an audio track → E_TRACK_KIND_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), imgCmd("a1")),
      "E_TRACK_KIND_MISMATCH",
    );
  });

  it("N1: image on a text track → E_TRACK_KIND_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), imgCmd("x1")),
      "E_TRACK_KIND_MISMATCH",
    );
  });
});

// ---------------------------------------------------------------------------
// A3.1 (F4/N2/BC.5) — addClip (text payload)
// ---------------------------------------------------------------------------

describe("A3.1 (F4): addClip — text payload", () => {
  const cmd = (over: Partial<Record<string, unknown>> = {}): Command =>
    ({
      op: "addClip",
      trackId: "x1",
      textContent: "Hello",
      timelineRange: range(20, 3),
      ...over,
    }) as Command;

  it("BC.5: happy path — defaults materialized (Arial / 48 / #ffffff)", () => {
    const res = expectOk(applyCommand(baseTimeline(), cmd(), mint("T1")));
    const clip = clipById(res.timeline, "T1") as TextClip;
    expect(clip).toEqual({
      id: "T1",
      timelineRange: range(20, 3),
      textContent: "Hello",
      textStyle: { font: "Arial", size: 48, color: "#ffffff" },
      lineage: { rootId: "T1", span: range(0, 3) },
    });
    expect(res.inverse).toEqual([{ op: "deleteClip", clipId: "T1" }]);
  });

  it("BC.5: partial style — provided field kept, missing fields defaulted", () => {
    const res = expectOk(
      applyCommand(
        baseTimeline(),
        cmd({ textStyle: { font: "Georgia" } }),
        mint("T1"),
      ),
    );
    expect((clipById(res.timeline, "T1") as TextClip).textStyle).toEqual({
      font: "Georgia",
      size: 48,
      color: "#ffffff",
    });
  });

  it("N2: empty textContent → E_INVALID_VALUE", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ textContent: "" })),
      "E_INVALID_VALUE",
    );
  });

  it("N2: MISSING textContent → E_INVALID_VALUE", () => {
    const raw = { op: "addClip", trackId: "x1", timelineRange: range(20, 3) };
    expectError(
      applyCommand(baseTimeline(), raw as unknown as Command),
      "E_INVALID_VALUE",
    );
  });

  it("A3.6: textContent longer than 500 chars → E_INVALID_VALUE", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ textContent: "x".repeat(501) })),
      "E_INVALID_VALUE",
    );
  });

  it("BC.5: font outside the whitelist → E_INVALID_VALUE", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ textStyle: { font: "Comic Sans" } })),
      "E_INVALID_VALUE",
    );
  });

  it("BC.5: color must be lowercase 6-digit #rrggbb → E_INVALID_VALUE", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ textStyle: { color: "#FFFFFF" } })),
      "E_INVALID_VALUE",
    );
    expectError(
      applyCommand(baseTimeline(), cmd({ textStyle: { color: "#fff" } })),
      "E_INVALID_VALUE",
    );
  });

  it("A3.1 (F4): text clip on a video track → E_TRACK_KIND_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ trackId: "v1" })),
      "E_TRACK_KIND_MISMATCH",
    );
  });

  it("A3.1 (F4): overlap on the text track → E_OVERLAP", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ timelineRange: range(2, 3) })),
      "E_OVERLAP",
    );
  });

  it("A3.1 (F4): zero duration → E_INVALID_RANGE; negative start → E_NEGATIVE_TIME", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ timelineRange: range(20, 0) })),
      "E_INVALID_RANGE",
    );
    expectError(
      applyCommand(baseTimeline(), cmd({ timelineRange: range(-1, 3) })),
      "E_NEGATIVE_TIME",
    );
  });

  it("A3.1 + A1.2: timelineRange rate != project rate → E_RATE_MISMATCH (see NOTES)", () => {
    expectError(
      applyCommand(baseTimeline(), cmd({ timelineRange: range(20, 3, 30) })),
      "E_RATE_MISMATCH",
    );
  });
});

// ---------------------------------------------------------------------------
// A3.2 — deleteClip
// ---------------------------------------------------------------------------

describe("A3.2: deleteClip", () => {
  it("A3.2: clip disappears, the GAP stays — neighbours do not move", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, { op: "deleteClip", clipId: "A" }));
    expect(hasClip(res.timeline, "A")).toBe(false);
    expect(clipById(res.timeline, "B").timelineRange).toEqual(range(30, 5));
    expect(clipById(res.timeline, "IM").timelineRange).toEqual(range(50, 5));
  });

  it("A3.2: unknown clip → E_CLIP_NOT_FOUND (already-deleted = does not exist)", () => {
    const tl = baseTimeline();
    expectError(
      applyCommand(tl, { op: "deleteClip", clipId: "zz" }),
      "E_CLIP_NOT_FOUND",
    );
    const deleted = expectOk(
      applyCommand(tl, { op: "deleteClip", clipId: "A" }),
    );
    expectError(
      applyCommand(deleted.timeline, { op: "deleteClip", clipId: "A" }),
      "E_CLIP_NOT_FOUND",
    );
  });

  it("A3.1c: delete's inverse is the internal restore form — id PRESERVED, exact preimage back", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, { op: "deleteClip", clipId: "A" }));
    expect(res.inverse).toEqual([
      { op: "addClip", trackId: "v1", clip: clipById(tl, "A") },
    ]);
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });

  it("A3.2: works the same for text clips (#16)", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, { op: "deleteClip", clipId: "TX" }));
    expect(hasClip(res.timeline, "TX")).toBe(false);
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });
});

// ---------------------------------------------------------------------------
// A3.3 — move
// ---------------------------------------------------------------------------

describe("A3.3: move", () => {
  it("A3.3: ONLY timelineRange.start changes — duration/source/properties untouched", () => {
    const tl = baseTimeline();
    const res = expectOk(
      applyCommand(tl, { op: "move", clipId: "A", newStart: t(60) }),
    );
    const moved = clipById(res.timeline, "A") as Clip;
    expect(moved.timelineRange).toEqual(range(60, 10));
    expect(moved.sourceRange).toEqual(range(5, 10));
    expect(moved.properties).toEqual({ volume: 80 });
    expect(moved.lineage).toEqual({ rootId: "A", span: range(0, 10) });
    expect(res.inverse).toEqual([{ op: "move", clipId: "A", newStart: t(10) }]);
  });

  it("A4: move to the SAME place → silent success + noChange, timeline untouched", () => {
    const tl = baseTimeline();
    const res = applyCommand(tl, { op: "move", clipId: "A", newStart: t(10) });
    expectNoChange(res);
    expect(res.ok && res.timeline).toBe(tl); // same reference — nothing happened
  });

  it("A3.3: unknown clip → E_CLIP_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "move",
        clipId: "zz",
        newStart: t(60),
      }),
      "E_CLIP_NOT_FOUND",
    );
  });

  it("A3.3: negative destination → E_NEGATIVE_TIME", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "move",
        clipId: "A",
        newStart: t(-1),
      }),
      "E_NEGATIVE_TIME",
    );
  });

  it("A3.3: destination overlaps a neighbour (self excluded) → E_OVERLAP", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "move",
        clipId: "A",
        newStart: t(25),
      }),
      "E_OVERLAP",
    );
  });

  it("A3.3: rate mismatch → E_RATE_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "move",
        clipId: "A",
        newStart: t(60, 30),
      }),
      "E_RATE_MISMATCH",
    );
  });

  it("A3.3: inverse returns the clip to its old start", () => {
    const tl = baseTimeline();
    const res = expectOk(
      applyCommand(tl, { op: "move", clipId: "A", newStart: t(60) }),
    );
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });

  it("A3.3: text clips move too (#16)", () => {
    const res = expectOk(
      applyCommand(baseTimeline(), {
        op: "move",
        clipId: "TX",
        newStart: t(20),
      }),
    );
    expect(clipById(res.timeline, "TX").timelineRange).toEqual(range(20, 4));
  });
});

// ---------------------------------------------------------------------------
// A3.4 — trim (BC.3 table)
// ---------------------------------------------------------------------------

describe("A3.4: trim", () => {
  // BC.3 example clip A: timeline 10–20, visible file part 5–15.
  const rows: {
    name: string;
    edge: "start" | "end";
    delta: number;
    tl: [number, number];
    src: [number, number];
  }[] = [
    {
      name: "trim(end,+3) → tl 10–23, file 5–18",
      edge: "end",
      delta: 3,
      tl: [10, 13],
      src: [5, 13],
    },
    {
      name: "trim(end,−3) → tl 10–17, file 5–12",
      edge: "end",
      delta: -3,
      tl: [10, 7],
      src: [5, 7],
    },
    {
      name: "trim(start,−3) → tl 13–20, file 8–15",
      edge: "start",
      delta: -3,
      tl: [13, 7],
      src: [8, 7],
    },
    {
      name: "trim(start,+3) → tl 7–20, file 2–15",
      edge: "start",
      delta: 3,
      tl: [7, 13],
      src: [2, 13],
    },
  ];

  it.each(rows)("BC.3: $name", ({ edge, delta, tl: tlExp, src: srcExp }) => {
    const res = expectOk(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge,
        delta: t(delta),
      }),
    );
    const clip = clipById(res.timeline, "A") as Clip;
    expect(clip.timelineRange).toEqual(range(tlExp[0], tlExp[1]));
    expect(clip.sourceRange).toEqual(range(srcExp[0], srcExp[1]));
    // BC.4 stays true by construction
    expect(clip.sourceRange.duration).toEqual(clip.timelineRange.duration);
  });

  it("A4: delta = 0 → silent success + noChange", () => {
    const tl = baseTimeline();
    const res = applyCommand(tl, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(0),
    });
    expectNoChange(res);
    expect(res.ok && res.timeline).toBe(tl);
  });

  it("A3.4: cutting the whole clip (resulting duration <= 0) → E_INVALID_RANGE", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge: "end",
        delta: t(-10),
      }),
      "E_INVALID_RANGE",
    );
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge: "end",
        delta: t(-12),
      }),
      "E_INVALID_RANGE",
    );
  });

  it("A3.4: extending past the END of the source file → E_SOURCE_OUT_OF_BOUNDS", () => {
    // B: src 93–98 of a 100-frame file — +3 needs material that does not exist
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "B",
        edge: "end",
        delta: t(3),
      }),
      "E_SOURCE_OUT_OF_BOUNDS",
    );
  });

  it("A3.4: extending past the START of the source file → E_SOURCE_OUT_OF_BOUNDS", () => {
    // A: src starts at 5 — extending start by 6 needs frame -1 of the file
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge: "start",
        delta: t(6),
      }),
      "E_SOURCE_OUT_OF_BOUNDS",
    );
  });

  it("A3.4: extension colliding with a neighbour → E_OVERLAP", () => {
    // A end +12 → tl 10–32 runs into B at 30 (source 5–27 still inside file)
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge: "end",
        delta: t(12),
      }),
      "E_OVERLAP",
    );
  });

  it("A3.4: start-extension crossing timeline 0 → E_NEGATIVE_TIME", () => {
    // TX starts at 0 (text: no source bounds in play) — any start-extend goes negative
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "TX",
        edge: "start",
        delta: t(1),
      }),
      "E_NEGATIVE_TIME",
    );
  });

  it("A3.4: rate mismatch → E_RATE_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge: "end",
        delta: t(3, 30),
      }),
      "E_RATE_MISMATCH",
    );
  });

  it("A3.4: unknown clip → E_CLIP_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "zz",
        edge: "end",
        delta: t(3),
      }),
      "E_CLIP_NOT_FOUND",
    );
  });

  it("A3.4 (#16): text clip trims timelineRange only (no source fields)", () => {
    const res = expectOk(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "TX",
        edge: "end",
        delta: t(3),
      }),
    );
    const clip = clipById(res.timeline, "TX") as TextClip;
    expect(clip.timelineRange).toEqual(range(0, 7));
    expect("sourceRange" in clip).toBe(false);
  });

  it("A3.4: inverse = same edge, opposite delta — exact round-trip", () => {
    const tl = baseTimeline();
    for (const { edge, delta } of rows) {
      const res = expectOk(
        applyCommand(tl, { op: "trim", clipId: "A", edge, delta: t(delta) }),
      );
      expect(res.inverse).toEqual([
        { op: "trim", clipId: "A", edge, delta: t(-delta) },
      ]);
      expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
    }
  });
});

// ---------------------------------------------------------------------------
// A3.5 — slip
// ---------------------------------------------------------------------------

describe("A3.5: slip", () => {
  it("A3.5: ONLY sourceRange.start moves — timeline untouched", () => {
    const tl = baseTimeline();
    const res = expectOk(
      applyCommand(tl, { op: "slip", clipId: "A", delta: t(5) }),
    );
    const clip = clipById(res.timeline, "A") as Clip;
    expect(clip.sourceRange).toEqual(range(10, 10));
    expect(clip.timelineRange).toEqual(range(10, 10));
    expect(res.inverse).toEqual([{ op: "slip", clipId: "A", delta: t(-5) }]);
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });

  it("A4: delta = 0 → silent success + noChange", () => {
    const tl = baseTimeline();
    const res = applyCommand(tl, { op: "slip", clipId: "A", delta: t(0) });
    expectNoChange(res);
    expect(res.ok && res.timeline).toBe(tl);
  });

  it("A3.5: new window sliding before the file start → E_SOURCE_OUT_OF_BOUNDS", () => {
    expectError(
      applyCommand(baseTimeline(), { op: "slip", clipId: "A", delta: t(-6) }),
      "E_SOURCE_OUT_OF_BOUNDS",
    );
  });

  it("A3.5: new window sliding past the file end → E_SOURCE_OUT_OF_BOUNDS", () => {
    expectError(
      applyCommand(baseTimeline(), { op: "slip", clipId: "B", delta: t(3) }),
      "E_SOURCE_OUT_OF_BOUNDS",
    );
  });

  it("A3.5 (#16): slip on a text clip → E_NOT_APPLICABLE", () => {
    expectError(
      applyCommand(baseTimeline(), { op: "slip", clipId: "TX", delta: t(2) }),
      "E_NOT_APPLICABLE",
    );
  });

  it("A3.5: unknown clip (stale id) → E_CLIP_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), { op: "slip", clipId: "zz", delta: t(2) }),
      "E_CLIP_NOT_FOUND",
    );
  });

  it("A3.5: rate mismatch → E_RATE_MISMATCH", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "slip",
        clipId: "A",
        delta: t(2, 30),
      }),
      "E_RATE_MISMATCH",
    );
  });
});

// ---------------------------------------------------------------------------
// A3.6 — propertyChange (full 6×4 matrix + ranges + A4)
// ---------------------------------------------------------------------------

describe("A3.6: propertyChange", () => {
  const VALID_VALUE = {
    volume: 55,
    opacity: 55,
    scale: 2,
    position: { x: 5, y: 6 },
    textContent: "Hi",
    textStyle: { font: "Georgia", size: 30, color: "#ff0000" },
  } as const;

  // N1 amendment: full 6×4 matrix (media clips keyed by MEDIA kind).
  const matrix: {
    property: keyof typeof VALID_VALUE;
    clipId: string;
    column: string;
    allowed: boolean;
  }[] = [
    { property: "volume", clipId: "A", column: "video", allowed: true },
    { property: "volume", clipId: "AU", column: "audio", allowed: true },
    { property: "volume", clipId: "IM", column: "image", allowed: false },
    { property: "volume", clipId: "TX", column: "text", allowed: false },
    { property: "opacity", clipId: "A", column: "video", allowed: true },
    { property: "opacity", clipId: "AU", column: "audio", allowed: false },
    { property: "opacity", clipId: "IM", column: "image", allowed: true },
    { property: "opacity", clipId: "TX", column: "text", allowed: true },
    { property: "scale", clipId: "A", column: "video", allowed: true },
    { property: "scale", clipId: "AU", column: "audio", allowed: false },
    { property: "scale", clipId: "IM", column: "image", allowed: true },
    { property: "scale", clipId: "TX", column: "text", allowed: false },
    { property: "position", clipId: "A", column: "video", allowed: true },
    { property: "position", clipId: "AU", column: "audio", allowed: false },
    { property: "position", clipId: "IM", column: "image", allowed: true },
    { property: "position", clipId: "TX", column: "text", allowed: true },
    { property: "textContent", clipId: "A", column: "video", allowed: false },
    { property: "textContent", clipId: "AU", column: "audio", allowed: false },
    { property: "textContent", clipId: "IM", column: "image", allowed: false },
    { property: "textContent", clipId: "TX", column: "text", allowed: true },
    { property: "textStyle", clipId: "A", column: "video", allowed: false },
    { property: "textStyle", clipId: "AU", column: "audio", allowed: false },
    { property: "textStyle", clipId: "IM", column: "image", allowed: false },
    { property: "textStyle", clipId: "TX", column: "text", allowed: true },
  ];

  it.each(matrix)(
    "A3.6/N1: $property on $column clip → allowed=$allowed",
    ({ property, clipId, allowed }) => {
      const res = applyCommand(baseTimeline(), {
        op: "propertyChange",
        clipId,
        property,
        value: VALID_VALUE[property],
      });
      if (allowed) {
        expectOk(res);
      } else {
        expectError(res, "E_PROPERTY_NOT_APPLICABLE");
      }
    },
  );

  it("A3.6: transition touches ONLY the property — time fields untouched", () => {
    const tl = baseTimeline();
    const res = expectOk(
      applyCommand(tl, {
        op: "propertyChange",
        clipId: "A",
        property: "volume",
        value: 40,
      }),
    );
    const clip = clipById(res.timeline, "A") as Clip;
    expect(clip.properties).toEqual({ volume: 40 });
    expect(clip.timelineRange).toEqual(range(10, 10));
    expect(clip.sourceRange).toEqual(range(5, 10));
    expect(res.inverse).toEqual([
      { op: "propertyChange", clipId: "A", property: "volume", value: 80 },
    ]);
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });

  const badValues: {
    name: string;
    clipId: string;
    property: string;
    value: unknown;
  }[] = [
    { name: "volume above 100", clipId: "A", property: "volume", value: 101 },
    { name: "volume below 0", clipId: "A", property: "volume", value: -1 },
    {
      name: "volume not an integer",
      clipId: "A",
      property: "volume",
      value: 50.5,
    },
    { name: "opacity above 100", clipId: "A", property: "opacity", value: 101 },
    { name: "scale below 0.1", clipId: "A", property: "scale", value: 0.05 },
    { name: "scale above 10", clipId: "A", property: "scale", value: 11 },
    {
      name: "position without numbers",
      clipId: "A",
      property: "position",
      value: { x: "left", y: 0 },
    },
    {
      name: "empty textContent (empty caption = delete it)",
      clipId: "TX",
      property: "textContent",
      value: "",
    },
    {
      name: "textContent above 500 chars",
      clipId: "TX",
      property: "textContent",
      value: "x".repeat(501),
    },
    {
      name: "textStyle font outside whitelist",
      clipId: "TX",
      property: "textStyle",
      value: { font: "Papyrus", size: 48, color: "#ffffff" },
    },
    {
      name: "textStyle size below 8",
      clipId: "TX",
      property: "textStyle",
      value: { font: "Arial", size: 7, color: "#ffffff" },
    },
    {
      name: "textStyle size above 200",
      clipId: "TX",
      property: "textStyle",
      value: { font: "Arial", size: 201, color: "#ffffff" },
    },
    {
      name: "textStyle color not lowercase #rrggbb",
      clipId: "TX",
      property: "textStyle",
      value: { font: "Arial", size: 48, color: "#FFFFFF" },
    },
    {
      name: "textStyle missing a field (whole-atom)",
      clipId: "TX",
      property: "textStyle",
      value: { font: "Arial", size: 48 },
    },
  ];

  it.each(badValues)(
    "A3.6: $name → E_INVALID_VALUE",
    ({ clipId, property, value }) => {
      const res = applyCommand(baseTimeline(), {
        op: "propertyChange",
        clipId,
        property,
        value,
      } as Command);
      expectError(res, "E_INVALID_VALUE");
    },
  );

  it("A4: value == current (volume 80 → 80) → silent success + noChange, no record", () => {
    const tl = baseTimeline(); // fixture A already has volume 80
    const res = applyCommand(tl, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 80,
    });
    expectNoChange(res);
    expect(res.ok && res.timeline).toBe(tl);
  });

  it("A4 + B3.1: unset property compares against its DEFAULT (volume 100 on unset clip → noChange)", () => {
    const tl = baseTimeline(); // AU has no volume written → default 100
    expectNoChange(
      applyCommand(tl, {
        op: "propertyChange",
        clipId: "AU",
        property: "volume",
        value: 100,
      }),
    );
  });

  it("A3.6: text opacity/position live in the BC.1 properties bag", () => {
    const res = expectOk(
      applyCommand(baseTimeline(), {
        op: "propertyChange",
        clipId: "TX",
        property: "opacity",
        value: 40,
      }),
    );
    const clip = clipById(res.timeline, "TX") as TextClip;
    expect(clip.properties).toEqual({ opacity: 40 });
  });

  it("A3.6: unknown clip → E_CLIP_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), {
        op: "propertyChange",
        clipId: "zz",
        property: "volume",
        value: 50,
      }),
      "E_CLIP_NOT_FOUND",
    );
  });

  it("A3.6: textContent change carries its old value in the inverse", () => {
    const tl = baseTimeline();
    const res = expectOk(
      applyCommand(tl, {
        op: "propertyChange",
        clipId: "TX",
        property: "textContent",
        value: "Hi there",
      }),
    );
    expect((clipById(res.timeline, "TX") as TextClip).textContent).toBe(
      "Hi there",
    );
    expect(res.inverse).toEqual([
      {
        op: "propertyChange",
        clipId: "TX",
        property: "textContent",
        value: "Welcome",
      },
    ]);
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });
});

// ---------------------------------------------------------------------------
// A3.7 — rippleDelete
// ---------------------------------------------------------------------------

describe("A3.7: rippleDelete", () => {
  it("A3.7: later clips on the SAME track shift left by the deleted duration — gaps between them preserved", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, { op: "rippleDelete", clipId: "A" }));
    expect(hasClip(res.timeline, "A")).toBe(false);
    // A was 10 frames: B 30→20, IM 50→40; the B–IM gap (15) is intact
    expect(clipById(res.timeline, "B").timelineRange).toEqual(range(20, 5));
    expect(clipById(res.timeline, "IM").timelineRange).toEqual(range(40, 5));
    // other tracks untouched
    expect(clipById(res.timeline, "AU").timelineRange).toEqual(range(0, 8));
    expect(clipById(res.timeline, "TX").timelineRange).toEqual(range(0, 4));
  });

  it("A3.7: clips BEFORE the victim never move", () => {
    const res = expectOk(
      applyCommand(baseTimeline(), { op: "rippleDelete", clipId: "B" }),
    );
    expect(clipById(res.timeline, "A").timelineRange).toEqual(range(10, 10));
    expect(clipById(res.timeline, "IM").timelineRange).toEqual(range(45, 5));
  });

  it("A3.7: unknown clip → E_CLIP_NOT_FOUND", () => {
    expectError(
      applyCommand(baseTimeline(), { op: "rippleDelete", clipId: "zz" }),
      "E_CLIP_NOT_FOUND",
    );
  });

  it("A3.7: inverse (composite: shift back + restore) rebuilds the exact original", () => {
    const tl = baseTimeline();
    const res = expectOk(applyCommand(tl, { op: "rippleDelete", clipId: "A" }));
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });
});

// ---------------------------------------------------------------------------
// A3.8 + B1.1 — split
// ---------------------------------------------------------------------------

describe("A3.8: split", () => {
  const split = (tl: Timeline, clipId: string, at: number): ApplyResult =>
    applyCommand(tl, { op: "split", clipId, at: t(at) });

  it("B1.1: left keeps the id; right gets the parent-chained formula-id at the ROOT-LOCAL cut", () => {
    const res = expectOk(split(baseTimeline(), "A", 15));
    const left = clipById(res.timeline, "A") as Clip;
    const right = clipById(res.timeline, "A@5") as Clip;
    // exact partition: [10,15) + [15,20), source [5,10) + [10,15)
    expect(left.timelineRange).toEqual(range(10, 5));
    expect(left.sourceRange).toEqual(range(5, 5));
    expect(left.lineage).toEqual({ rootId: "A", span: range(0, 5) });
    expect(right.timelineRange).toEqual(range(15, 5));
    expect(right.sourceRange).toEqual(range(10, 5));
    expect(right.lineage).toEqual({ rootId: "A", span: range(5, 5) });
    // properties copied EXACTLY to both pieces
    expect(left.properties).toEqual({ volume: 80 });
    expect(right.properties).toEqual({ volume: 80 });
  });

  it("B1.1: nested split chains the name (A@5 cut again → A@5@8)", () => {
    const first = expectOk(split(baseTimeline(), "A", 15));
    const second = expectOk(split(first.timeline, "A@5", 18));
    const piece = clipById(second.timeline, "A@5@8") as Clip;
    expect(piece.timelineRange).toEqual(range(18, 2));
    expect(piece.lineage).toEqual({ rootId: "A", span: range(8, 2) });
  });

  it("B1.1: the cut name is root-local, NOT a timeline number — a moved clip splits to the same name", () => {
    const moved = expectOk(
      applyCommand(baseTimeline(), {
        op: "move",
        clipId: "A",
        newStart: t(60),
      }),
    );
    const res = expectOk(split(moved.timeline, "A", 65)); // same 5-frames-in cut
    expect(hasClip(res.timeline, "A@5")).toBe(true);
  });

  it("B1.1: cut names stay content-anchored across a start-trim (same content cut → same name)", () => {
    // untrimmed: cut 8 frames in → A@8
    const plain = expectOk(split(baseTimeline(), "A", 18));
    expect(hasClip(plain.timeline, "A@8")).toBe(true);
    // start-cut 3 frames, then cut at the SAME content point (timeline 18) → still A@8
    const trimmed = expectOk(
      applyCommand(baseTimeline(), {
        op: "trim",
        clipId: "A",
        edge: "start",
        delta: t(-3),
      }),
    );
    const res = expectOk(split(trimmed.timeline, "A", 18));
    expect(hasClip(res.timeline, "A@8")).toBe(true);
  });

  it("A3.8: cut exactly on a clip edge → E_SPLIT_AT_BOUNDARY (both edges exclusive)", () => {
    expectError(split(baseTimeline(), "A", 10), "E_SPLIT_AT_BOUNDARY");
    expectError(split(baseTimeline(), "A", 20), "E_SPLIT_AT_BOUNDARY");
  });

  it("A3.8: a 1-frame clip cannot be split at all", () => {
    const tl = baseTimeline();
    const oneFrame = mediaClip("ONE", "mV", 0, 70, 1);
    (tl.tracks[0].clips as Clip[]).push(oneFrame);
    expectError(split(tl, "ONE", 70), "E_SPLIT_AT_BOUNDARY");
    expectError(split(tl, "ONE", 71), "E_SPLIT_AT_BOUNDARY");
  });

  it("A3.8: cut outside the clip → E_SPLIT_OUT_OF_RANGE", () => {
    expectError(split(baseTimeline(), "A", 5), "E_SPLIT_OUT_OF_RANGE");
    expectError(split(baseTimeline(), "A", 25), "E_SPLIT_OUT_OF_RANGE");
  });

  it("A3.8: unknown clip → E_CLIP_NOT_FOUND; rate mismatch → E_RATE_MISMATCH", () => {
    expectError(split(baseTimeline(), "zz", 15), "E_CLIP_NOT_FOUND");
    expectError(
      applyCommand(baseTimeline(), { op: "split", clipId: "A", at: t(15, 30) }),
      "E_RATE_MISMATCH",
    );
  });

  it("A3.8: split is valid on text clips — timeline partition only, content copied to both", () => {
    const res = expectOk(split(baseTimeline(), "TX", 2));
    const left = clipById(res.timeline, "TX") as TextClip;
    const right = clipById(res.timeline, "TX@2") as TextClip;
    expect(left.timelineRange).toEqual(range(0, 2));
    expect(right.timelineRange).toEqual(range(2, 2));
    expect(left.textContent).toBe("Welcome");
    expect(right.textContent).toBe("Welcome");
    expect(right.textStyle).toEqual(left.textStyle);
    expect("sourceRange" in right).toBe(false);
  });

  it("A3.8: no gap, no overlap, no 0-duration piece — by construction (proof check)", () => {
    const res = expectOk(split(baseTimeline(), "A", 15));
    const left = clipById(res.timeline, "A");
    const right = clipById(res.timeline, "A@5");
    const leftEnd =
      left.timelineRange.start.value + left.timelineRange.duration.value;
    expect(leftEnd).toBe(right.timelineRange.start.value);
    expect(left.timelineRange.duration.value).toBeGreaterThan(0);
    expect(right.timelineRange.duration.value).toBeGreaterThan(0);
  });

  it("A3.8: inverse is an atomic composite — remove right, restore left preimage", () => {
    const tl = baseTimeline();
    const res = expectOk(split(tl, "A", 15));
    expect(applySteps(res.timeline, res.inverse)).toEqual(tl);
  });
});
