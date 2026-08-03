import { describe, expect, it } from "vitest";
import {
  applyChoice,
  applyCommand,
  finalizeCheck,
  startMerge,
} from "../src/index";
import type {
  Clip,
  Command,
  FinalizeResult,
  MergeChoice,
  MergeConflict,
  MergeResult,
  MergeSuccess,
  TextClip,
  Timeline,
} from "../src/index";
import { checkInvariants } from "../src/invariants";
import { MEDIA_REFS, R, baseTimeline, mediaClip, range, t } from "./fixtures";

type AnyClip = Clip | TextClip;
type Scenario = { base: Timeline; ours: Timeline; theirs: Timeline };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function videoTimeline(clips: Clip[]): Timeline {
  return {
    projectRate: R,
    tracks: [{ id: "v1", kind: "video", clips }],
    mediaRefs: clone(MEDIA_REFS),
  };
}

function edit(
  timeline: Timeline,
  command: Command,
  mintedId?: string,
): Timeline {
  const result = applyCommand(
    timeline,
    command,
    mintedId === undefined ? undefined : { mintId: () => mintedId },
  );
  if (!result.ok) {
    throw new Error(
      `fixture command ${command.op} failed: ${result.error.code}: ${result.error.message}`,
    );
  }
  return result.timeline;
}

function clipById(timeline: Timeline, clipId: string): AnyClip {
  for (const track of timeline.tracks) {
    const clip = (track.clips as readonly AnyClip[]).find(
      (candidate) => candidate.id === clipId,
    );
    if (clip) return clip;
  }
  throw new Error(`clip ${clipId} not found`);
}

function maybeClip(timeline: Timeline, clipId: string): AnyClip | undefined {
  for (const track of timeline.tracks) {
    const clip = (track.clips as readonly AnyClip[]).find(
      (candidate) => candidate.id === clipId,
    );
    if (clip) return clip;
  }
  return undefined;
}

function family(timeline: Timeline, rootId: string): AnyClip[] {
  return timeline.tracks
    .flatMap((track) => [...(track.clips as readonly AnyClip[])])
    .filter((clip) => clip.lineage.rootId === rootId)
    .sort(
      (a, b) =>
        a.lineage.span.start.value - b.lineage.span.start.value ||
        a.id.localeCompare(b.id),
    );
}

function success(result: MergeResult): MergeSuccess {
  if (!result.ok) {
    throw new Error(
      `expected merge success, got ${result.error.code}: ${result.error.message}`,
    );
  }
  return result;
}

function ready(result: MergeResult): MergeSuccess {
  const value = success(result);
  expect(value.status, JSON.stringify(value.conflicts)).toBe("ready");
  expect(value.conflicts).toEqual([]);
  return value;
}

function needs(result: MergeResult): MergeSuccess {
  const value = success(result);
  expect(value.status).toBe("needs-resolution");
  expect(value.conflicts.length).toBeGreaterThan(0);
  return value;
}

function findConflict(
  result: MergeSuccess,
  bucket: 1 | 2 | 3,
  field?: string,
): MergeConflict {
  const found = result.conflicts.find(
    (candidate) =>
      candidate.bucket === bucket &&
      (field === undefined ||
        (candidate.participants.kind === "value" &&
          candidate.participants.field === field)),
  );
  if (!found) {
    throw new Error(
      `missing bucket ${bucket}${field ? `/${field}` : ""} conflict`,
    );
  }
  return found;
}

function choose(
  scenario: Scenario,
  state: MergeSuccess,
  conflict: MergeConflict,
  choice: MergeChoice,
): MergeSuccess {
  return success(
    applyChoice({
      ...scenario,
      choices: state.choices,
      conflictId: conflict.conflictId,
      choice,
    }),
  );
}

function spans(timeline: Timeline, rootId: string): Array<[number, number]> {
  return family(timeline, rootId).map((clip) => [
    clip.lineage.span.start.value,
    clip.lineage.span.duration.value,
  ]);
}

function starts(timeline: Timeline, rootId: string): number[] {
  return family(timeline, rootId).map((clip) => clip.timelineRange.start.value);
}

function assertCleanAndPositive(timeline: Timeline): void {
  expect(checkInvariants(timeline)).toEqual([]);
  for (const track of timeline.tracks) {
    for (const clip of track.clips as readonly AnyClip[]) {
      expect(clip.lineage.span.duration.value).toBeGreaterThan(0);
    }
  }
}

function expectMergePrecondition(result: MergeResult | FinalizeResult): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("E_MERGE_PRECONDITION");
}

describe("C7: locked pure merge API and errors", () => {
  it("C7: public index exports exactly the three M4 merge functions", async () => {
    const engine = await import("../src/index");
    expect(engine.startMerge).toBeTypeOf("function");
    expect(engine.applyChoice).toBeTypeOf("function");
    expect(engine.finalizeCheck).toBeTypeOf("function");
  });

  it("C7: zero-conflict start returns the exact ready packet without mutating inputs", () => {
    const base = baseTimeline();
    const ours = edit(base, { op: "move", clipId: "A", newStart: t(60) });
    const theirs = clone(base);
    const before = clone({ base, ours, theirs });
    const result = ready(startMerge({ base, ours, theirs }));

    expect(result).toEqual({
      ok: true,
      status: "ready",
      timeline: ours,
      conflicts: [],
      choices: {},
      counts: { resolved: 0, remaining: 0, total: 0 },
    });
    expect({ base, ours, theirs }).toEqual(before);
  });

  it("C7: needs-resolution packet has lightweight B1 participants, fixed choices, and honest counts", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10, { volume: 80 }),
    ]);
    const ours = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    const result = needs(startMerge({ base, ours, theirs }));
    const conflict = findConflict(result, 1, "volume");

    expect(conflict.participants).toEqual({
      kind: "value",
      trackId: "v1",
      rootId: "A",
      clipIds: ["A"],
      field: "volume",
    });
    expect(conflict.choices).toEqual(["ours", "theirs", "base"]);
    expect(conflict.explanation.length).toBeGreaterThan(0);
    expect(result.counts).toEqual({ resolved: 0, remaining: 1, total: 1 });
    expect(maybeClip(result.timeline, "A")).toBeUndefined();
  });

  it("C7: same-choice retry is successful and byte-identical", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10, { volume: 80 }),
    ]);
    const ours = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    const conflict = findConflict(start, 1, "volume");
    const once = choose(scenario, start, conflict, "ours");
    const twice = success(
      applyChoice({
        ...scenario,
        choices: once.choices,
        conflictId: conflict.conflictId,
        choice: "ours",
      }),
    );
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("C7: unknown conflict id, bucket-invalid choice, and permanent-answer replacement return E_MERGE_PRECONDITION", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10, { volume: 80 }),
    ]);
    const ours = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    const conflict = findConflict(start, 1, "volume");

    expectMergePrecondition(
      applyChoice({
        ...scenario,
        choices: {},
        conflictId: "not-current",
        choice: "ours",
      }),
    );
    expectMergePrecondition(
      applyChoice({
        ...scenario,
        choices: {},
        conflictId: conflict.conflictId,
        choice: "shift-a",
      }),
    );
    const answered = choose(scenario, start, conflict, "ours");
    expectMergePrecondition(
      applyChoice({
        ...scenario,
        choices: answered.choices,
        conflictId: conflict.conflictId,
        choice: "theirs",
      }),
    );
  });

  it("C7: finalizeCheck rejects unresolved state and returns only a clean final timeline after choices", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10, { volume: 80 }),
    ]);
    const ours = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    expectMergePrecondition(finalizeCheck({ ...scenario, choices: {} }));
    const conflict = findConflict(start, 1, "volume");
    const answered = choose(scenario, start, conflict, "theirs");
    const final = finalizeCheck({ ...scenario, choices: answered.choices });
    expect(final.ok).toBe(true);
    if (final.ok) {
      expect((clipById(final.timeline, "A") as Clip).properties.volume).toBe(
        60,
      );
      assertCleanAndPositive(final.timeline);
    }
  });
});

describe("T2-A: split-family merge goldens", () => {
  it("B1.2/T2-A1: split vs untouched preserves the split automatically", () => {
    const base = videoTimeline([mediaClip("A", "mV", 0, 0, 100)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(50) });
    const result = ready(startMerge({ base, ours, theirs: base }));
    expect(spans(result.timeline, "A")).toEqual([
      [0, 50],
      [50, 50],
    ]);
  });

  it("B1.2/T2-A2: split vs property projects to base-valued pieces and a divergent piece becomes B1", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 100, { volume: 80 }),
    ]);
    const split = edit(base, { op: "split", clipId: "A", at: t(50) });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const projected = ready(startMerge({ base, ours: split, theirs }));
    expect(
      family(projected.timeline, "A").map((c) => (c as Clip).properties.volume),
    ).toEqual([40, 40]);

    const divergent = edit(split, {
      op: "propertyChange",
      clipId: "A@50",
      property: "volume",
      value: 30,
    });
    const conflictState = needs(startMerge({ base, ours: divergent, theirs }));
    const conflict = findConflict(conflictState, 1, "volume");
    expect(conflict.participants.clipIds).toContain("A@50");
  });

  it("B1.2/T2-A3: split vs move shifts the whole family with cuts intact", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(15) });
    const theirs = edit(base, { op: "move", clipId: "A", newStart: t(60) });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(starts(result.timeline, "A")).toEqual([60, 65]);
    expect(spans(result.timeline, "A")).toEqual([
      [0, 5],
      [5, 5],
    ]);
  });

  it("B1.2/T2-A4: split vs slip projects the source offset across all media pieces", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(15) });
    const theirs = edit(base, { op: "slip", clipId: "A", delta: t(3) });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(
      family(result.timeline, "A").map(
        (c) => (c as Clip).sourceRange.start.value,
      ),
    ).toEqual([8, 13]);
  });

  it("B1.2/T2-A5: split vs trim-shrink maps the trailing boundary across refined pieces", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(15) });
    const theirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-2),
    });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(spans(result.timeline, "A")).toEqual([
      [0, 5],
      [5, 3],
    ]);
  });

  it("B1.2/T2-A6: fully erased unedited segment auto-erases while an edited segment becomes B2", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 5, 10, 10, { volume: 80 }),
    ]);
    const split = edit(base, { op: "split", clipId: "A", at: t(15) });
    const erased = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-5),
    });
    const automatic = ready(startMerge({ base, ours: split, theirs: erased }));
    expect(spans(automatic.timeline, "A")).toEqual([[0, 5]]);

    const edited = edit(split, {
      op: "propertyChange",
      clipId: "A@5",
      property: "volume",
      value: 30,
    });
    const conflictState = needs(
      startMerge({ base, ours: edited, theirs: erased }),
    );
    expect(findConflict(conflictState, 2).participants.clipIds).toContain(
      "A@5",
    );
  });

  it("B1.2/T2-A7: trim extension modifies the edge piece", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(15) });
    const theirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(3),
    });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(spans(result.timeline, "A")).toEqual([
      [0, 5],
      [5, 8],
    ]);
    expect((family(result.timeline, "A")[1] as Clip).sourceRange).toEqual(
      range(10, 8),
    );
  });

  it("B1.2/T2-A8: split vs delete is one family-atomic B2 with all three outcomes", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(15) });
    const theirs = edit(base, { op: "deleteClip", clipId: "A" });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    const conflict = findConflict(start, 2);
    expect(conflict.choices).toEqual(["delete", "clip", "base"]);
    expect(
      family(choose(scenario, start, conflict, "delete").timeline, "A"),
    ).toEqual([]);
    expect(
      spans(choose(scenario, start, conflict, "clip").timeline, "A"),
    ).toEqual([
      [0, 5],
      [5, 5],
    ]);
    expect(
      spans(choose(scenario, start, conflict, "base").timeline, "A"),
    ).toEqual([[0, 10]]);
  });

  it("B1.1/B1.2/T2-A9: same concurrent cut converges to the same IDs", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(15) });
    const theirs = edit(base, { op: "split", clipId: "A", at: t(15) });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(family(result.timeline, "A").map((c) => c.id)).toEqual(["A", "A@5"]);
  });

  it("B1.2/T2-A10: different cuts union into three positive refined pieces", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "split", clipId: "A", at: t(14) });
    const theirs = edit(base, { op: "split", clipId: "A", at: t(17) });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(spans(result.timeline, "A")).toEqual([
      [0, 4],
      [4, 3],
      [7, 3],
    ]);
    expect(new Set(family(result.timeline, "A").map((c) => c.id)).size).toBe(3);
    assertCleanAndPositive(result.timeline);
  });

  it("B1.1/T2-A11: split-delete-extend-resplit uses the parent-chained collision-proof ID", () => {
    const base = videoTimeline([mediaClip("A", "mV", 0, 0, 100)]);
    let ours = edit(base, { op: "split", clipId: "A", at: t(40) });
    ours = edit(ours, { op: "deleteClip", clipId: "A" });
    ours = edit(ours, {
      op: "trim",
      clipId: "A@40",
      edge: "start",
      delta: t(10),
    });
    ours = edit(ours, { op: "split", clipId: "A@40", at: t(40) });
    expect(maybeClip(ours, "A@40")).toBeDefined();
    expect(maybeClip(ours, "A@40@40")).toBeDefined();
    const result = ready(startMerge({ base, ours, theirs: base }));
    expect(new Set(family(result.timeline, "A").map((c) => c.id)).size).toBe(
      family(result.timeline, "A").length,
    );
  });
});

describe("T2-B: atom composition and conflict goldens", () => {
  it("B2.1/T2-B1: move and end-trim compose conflict-free", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    const ours = edit(base, { op: "move", clipId: "A", newStart: t(60) });
    const theirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-2),
    });
    const result = ready(startMerge({ base, ours, theirs }));
    const merged = clipById(result.timeline, "A") as Clip;
    expect(merged.timelineRange).toEqual(range(60, 8));
    expect(merged.sourceRange).toEqual(range(5, 8));
    expect(merged.lineage.span).toEqual(range(0, 8));
  });

  it("B2.1/B2.3/T2-B2: opposite trims compose for a positive remainder and conflict at zero/negative", () => {
    const base = videoTimeline([mediaClip("A", "mV", 10, 10, 10)]);
    const positiveOurs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "start",
      delta: t(-4),
    });
    const positiveTheirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-5),
    });
    expect(
      spans(
        ready(startMerge({ base, ours: positiveOurs, theirs: positiveTheirs }))
          .timeline,
        "A",
      ),
    ).toEqual([[4, 1]]);

    for (const startCut of [5, 6]) {
      const ours = edit(base, {
        op: "trim",
        clipId: "A",
        edge: "start",
        delta: t(-startCut),
      });
      const theirs = edit(base, {
        op: "trim",
        clipId: "A",
        edge: "end",
        delta: t(-5),
      });
      expect(
        findConflict(
          needs(startMerge({ base, ours, theirs })),
          1,
          "nonpositive-duration",
        ),
      ).toBeDefined();
    }
  });

  it("B2.1/B2.2/T2-B3: different move destinations produce B1 with exact three choices", () => {
    const base = videoTimeline([mediaClip("A", "mV", 0, 0, 10)]);
    const ours = edit(base, { op: "move", clipId: "A", newStart: t(60) });
    const theirs = edit(base, { op: "move", clipId: "A", newStart: t(70) });
    const scenario = { base, ours, theirs };
    const state = needs(startMerge(scenario));
    const conflict = findConflict(state, 1, "timeline-offset");
    expect(conflict.choices).toEqual(["ours", "theirs", "base"]);
    expect(
      starts(choose(scenario, state, conflict, "ours").timeline, "A"),
    ).toEqual([60]);
    expect(
      starts(choose(scenario, state, conflict, "theirs").timeline, "A"),
    ).toEqual([70]);
    expect(
      starts(choose(scenario, state, conflict, "base").timeline, "A"),
    ).toEqual([0]);
  });

  it("B2.1/B2.2/T2-B4: same property value converges and different values produce B1", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10, { volume: 80 }),
    ]);
    const sameOurs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const sameTheirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    expect(
      (
        clipById(
          ready(startMerge({ base, ours: sameOurs, theirs: sameTheirs }))
            .timeline,
          "A",
        ) as Clip
      ).properties.volume,
    ).toBe(40);

    const different = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    expect(
      findConflict(
        needs(startMerge({ base, ours: sameOurs, theirs: different })),
        1,
        "volume",
      ),
    ).toBeDefined();
  });

  it("B2.3/T2-B5: slip plus extension that crosses source bounds escalates to B1", () => {
    const base = videoTimeline([mediaClip("A", "mV", 90, 10, 5)]);
    const ours = edit(base, { op: "slip", clipId: "A", delta: t(5) });
    const theirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(5),
    });
    expect(
      findConflict(
        needs(startMerge({ base, ours, theirs })),
        1,
        "source-bounds",
      ),
    ).toBeDefined();
  });

  it("B2.3/T2-B6: move plus start-extension that crosses frame zero escalates to B1", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 5, 10)]);
    const ours = edit(base, { op: "move", clipId: "A", newStart: t(0) });
    const theirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "start",
      delta: t(5),
    });
    expect(
      findConflict(
        needs(startMerge({ base, ours, theirs })),
        1,
        "negative-start",
      ),
    ).toBeDefined();
  });

  it("B2.3/T2-B7: independently valid trims whose combination reaches zero produce B1", () => {
    const base = videoTimeline([mediaClip("A", "mV", 10, 10, 10)]);
    const ours = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "start",
      delta: t(-5),
    });
    const theirs = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-5),
    });
    expect(
      findConflict(
        needs(startMerge({ base, ours, theirs })),
        1,
        "nonpositive-duration",
      ),
    ).toBeDefined();
  });

  it("B2.2/B2.3/T2-B8: one-sided add plus one-sided move that overlap produce B3", () => {
    const base = videoTimeline([mediaClip("A", "mV", 0, 0, 10)]);
    const ours = edit(
      base,
      {
        op: "addClip",
        trackId: "v1",
        mediaRefId: "mV",
        sourceRange: range(20, 10),
        timelineRange: range(30, 10),
      },
      "D",
    );
    const theirs = edit(base, { op: "move", clipId: "A", newStart: t(30) });
    const scenario = { base, ours, theirs };
    const state = needs(startMerge(scenario));
    const conflict = findConflict(state, 3);
    expect(conflict.participants).toEqual({
      kind: "overlap",
      trackId: "v1",
      clipIds: ["A", "D"],
    });
    const reverted = ready(choose(scenario, state, conflict, "base"));
    expect(starts(reverted.timeline, "A")).toEqual([0]);
    expect(maybeClip(reverted.timeline, "D")).toBeUndefined();
  });
});

describe("T2-C: merge machinery goldens", () => {
  function spuriousScenario(): Scenario {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10),
      mediaClip("C", "mV", 20, 20, 10),
    ]);
    const ours = edit(base, { op: "move", clipId: "A", newStart: t(10) });
    let theirs = edit(base, { op: "move", clipId: "A", newStart: t(30) });
    theirs = edit(theirs, { op: "move", clipId: "C", newStart: t(0) });
    return { base, ours, theirs };
  }

  it("B3.3/T2-C1: unresolved B1 placeholder does not create a spurious B3; base choice discovers the real overlap", () => {
    const scenario = spuriousScenario();
    const start = needs(startMerge(scenario));
    expect(start.conflicts.map((c) => c.bucket)).toEqual([1]);
    const b1 = findConflict(start, 1, "timeline-offset");
    const dynamic = needs(choose(scenario, start, b1, "base"));
    expect(dynamic.conflicts.map((c) => c.bucket)).toEqual([3]);
    expect(dynamic.counts).toEqual({ resolved: 1, remaining: 1, total: 2 });
  });

  it("B3.3/T2-C2: same choices in swapped click order produce byte-identical output", () => {
    const base = baseTimeline();
    let ours = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    ours = edit(ours, {
      op: "propertyChange",
      clipId: "TX",
      property: "textContent",
      value: "ours",
    });
    let theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    theirs = edit(theirs, { op: "deleteClip", clipId: "TX" });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    const b1 = findConflict(start, 1, "volume");
    const b2 = findConflict(start, 2);

    const afterB1 = choose(scenario, start, b1, "ours");
    const firstOrder = choose(
      scenario,
      afterB1,
      findConflict(afterB1, 2),
      "delete",
    );
    const afterB2 = choose(scenario, start, b2, "delete");
    const secondOrder = choose(
      scenario,
      afterB2,
      findConflict(afterB2, 1, "volume"),
      "ours",
    );
    expect(JSON.stringify(firstOrder)).toBe(JSON.stringify(secondOrder));
  });

  it("B3.4/T2-C3: a dynamic conflict appears in the same recompute with honest counts", () => {
    const scenario = spuriousScenario();
    const start = needs(startMerge(scenario));
    const dynamic = needs(choose(scenario, start, start.conflicts[0], "base"));
    expect(dynamic.choices).toHaveProperty(
      start.conflicts[0].conflictId,
      "base",
    );
    expect(dynamic.counts.total).toBe(
      dynamic.counts.resolved + dynamic.counts.remaining,
    );
    expect(dynamic.counts).toEqual({ resolved: 1, remaining: 1, total: 2 });
  });

  it("N4/T2-C4: Remove-both-induced cascade keeps prior answers and terminates", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10),
      mediaClip("B", "mV", 20, 20, 10),
      mediaClip("C", "mV", 40, 40, 10),
    ]);
    let ours = edit(base, { op: "move", clipId: "A", newStart: t(10) });
    ours = edit(ours, { op: "move", clipId: "C", newStart: t(0) });
    const theirs = edit(base, { op: "move", clipId: "B", newStart: t(10) });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    const first = findConflict(start, 3);
    const dynamic = needs(choose(scenario, start, first, "base"));
    expect(dynamic.choices[first.conflictId]).toBe("base");
    const second = findConflict(dynamic, 3);
    expect(second.conflictId).not.toBe(first.conflictId);
    const done = ready(choose(scenario, dynamic, second, "base"));
    expect(Object.keys(done.choices)).toHaveLength(2);
    assertCleanAndPositive(done.timeline);
  });

  it("B2.4/T2-C5: delete vs rippleDelete auto-converges to ripple net effect", () => {
    const base = baseTimeline();
    const ours = edit(base, { op: "deleteClip", clipId: "A" });
    const theirs = edit(base, { op: "rippleDelete", clipId: "A" });
    const result = ready(startMerge({ base, ours, theirs }));
    expect(maybeClip(result.timeline, "A")).toBeUndefined();
    expect(
      (clipById(result.timeline, "B") as Clip).timelineRange.start.value,
    ).toBe(20);
    expect(
      (clipById(result.timeline, "IM") as Clip).timelineRange.start.value,
    ).toBe(40);
  });

  it("B2.2/T2-C6: delete on both sides converges without a conflict", () => {
    const base = videoTimeline([mediaClip("A", "mV", 0, 0, 10)]);
    const ours = edit(base, { op: "deleteClip", clipId: "A" });
    const theirs = edit(base, { op: "deleteClip", clipId: "A" });
    expect(
      maybeClip(ready(startMerge({ base, ours, theirs })).timeline, "A"),
    ).toBeUndefined();
  });

  it("BC.2/T2-C7: deleted clip is restored only by explicit B2 clip/base choices", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 0, 0, 10, { volume: 80 }),
    ]);
    const ours = edit(base, { op: "deleteClip", clipId: "A" });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const scenario = { base, ours, theirs };
    const start = needs(startMerge(scenario));
    expect(maybeClip(start.timeline, "A")).toBeUndefined();
    const conflict = findConflict(start, 2);
    expect(
      maybeClip(choose(scenario, start, conflict, "delete").timeline, "A"),
    ).toBeUndefined();
    expect(
      (
        clipById(
          choose(scenario, start, conflict, "clip").timeline,
          "A",
        ) as Clip
      ).properties.volume,
    ).toBe(40);
    expect(
      (
        clipById(
          choose(scenario, start, conflict, "base").timeline,
          "A",
        ) as Clip
      ).properties.volume,
    ).toBe(80);
  });
});

describe("T2-D: identity and equality goldens", () => {
  it("B3.1/T2-D1: trim then untrim is net unchanged and merges as untouched", () => {
    const base = videoTimeline([mediaClip("A", "mV", 5, 10, 10)]);
    let ours = edit(base, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-3),
    });
    ours = edit(ours, { op: "trim", clipId: "A", edge: "end", delta: t(3) });
    expect(ready(startMerge({ base, ours, theirs: base })).timeline).toEqual(
      base,
    );
  });

  it("B3.1/T2-D2: delete plus identical-looking recreate remains old delete plus new add", () => {
    const base = videoTimeline([
      mediaClip("A", "mV", 5, 10, 10, { volume: 80 }),
    ]);
    let ours = edit(base, { op: "deleteClip", clipId: "A" });
    ours = edit(
      ours,
      {
        op: "addClip",
        trackId: "v1",
        mediaRefId: "mV",
        sourceRange: range(5, 10),
        timelineRange: range(10, 10),
      },
      "A2",
    );
    const oneSided = ready(startMerge({ base, ours, theirs: base }));
    expect(maybeClip(oneSided.timeline, "A")).toBeUndefined();
    expect(maybeClip(oneSided.timeline, "A2")).toBeDefined();

    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const conflicted = needs(startMerge({ base, ours, theirs }));
    const deletion = findConflict(conflicted, 2);
    expect(deletion.participants.kind).toBe("delete");
    if (deletion.participants.kind === "delete") {
      expect(deletion.participants.rootId).toBe("A");
    }
    expect(maybeClip(conflicted.timeline, "A2")).toBeDefined();
  });

  it("B3.1/T2-D3: omitted defaults and explicit defaults compare equal without false conflict", () => {
    const base = videoTimeline([mediaClip("A", "mV", 0, 0, 10)]);
    const ours = clone(base);
    (clipById(ours, "A") as Clip).properties.volume = 100;
    const result = ready(startMerge({ base, ours, theirs: base }));
    expect(
      (clipById(result.timeline, "A") as Clip).properties.volume ?? 100,
    ).toBe(100);
  });

  it("B3.2/T2-D4: identical merge repeats with byte-identical conflict order and IDs", () => {
    const base = baseTimeline();
    const ours = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 60,
    });
    const theirs = edit(base, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const a = needs(startMerge({ base, ours, theirs }));
    const b = needs(startMerge({ base, ours, theirs }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("C2/T2-E: deterministic Shift goldens", () => {
  function shiftScenario(target: number, blockers: Clip[] = []): Scenario {
    const base = videoTimeline([
      ...blockers,
      mediaClip("A", "mV", 0, 100, 10),
      mediaClip("B", "mV", 20, 120, 10),
    ]);
    const ours = edit(base, { op: "move", clipId: "A", newStart: t(target) });
    const theirs = edit(base, { op: "move", clipId: "B", newStart: t(target) });
    return { base, ours, theirs };
  }

  function shiftedA(scenario: Scenario): Clip {
    const state = needs(startMerge(scenario));
    const conflict = findConflict(state, 3);
    const before = clipById(scenario.ours, "A") as Clip;
    const result = ready(choose(scenario, state, conflict, "shift-a"));
    const after = clipById(result.timeline, "A") as Clip;
    expect(after.sourceRange).toEqual(before.sourceRange);
    expect(after.timelineRange.duration).toEqual(before.timelineRange.duration);
    expect(after.properties).toEqual(before.properties);
    expect(after.lineage).toEqual(before.lineage);
    return after;
  }

  it("C2/T2-E1: minimum-distance gap wins independently on the left and right", () => {
    const left = shiftScenario(50, [mediaClip("R", "mV", 40, 60, 5)]);
    expect(shiftedA(left).timelineRange.start.value).toBe(40);
    const right = shiftScenario(50, [mediaClip("L", "mV", 40, 45, 5)]);
    expect(shiftedA(right).timelineRange.start.value).toBe(60);
  });

  it("C2/T2-E2: exactly equal gap distance ties to the left", () => {
    expect(shiftedA(shiftScenario(50)).timelineRange.start.value).toBe(40);
  });

  it("C2/T2-E3: a left placement crossing frame zero chooses the right", () => {
    expect(shiftedA(shiftScenario(0)).timelineRange.start.value).toBe(10);
  });

  it("C2/T2-E4: no interior fit places the clip at the unbounded right end", () => {
    const scenario = shiftScenario(50, [mediaClip("FULL", "mV", 0, 0, 50)]);
    expect(shiftedA(scenario).timelineRange.start.value).toBe(60);
  });
});
