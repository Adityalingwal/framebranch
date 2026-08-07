/**
 * computeDiff golden tests.
 *
 * Base fixture: v1 (video): A tl[10,20) src[5,15) / B tl[30,35) / IM tl[50,55) image
 *               a1 (audio): AU tl[0,8)
 *               x1 (text):  TX tl[0,4) "Welcome" / TX2 tl[10,15) "Bye"
 */
import { describe, expect, it } from "vitest";
import { computeDiff } from "../src/diff";
import type { DiffResult } from "../src/diff";
import { applyCommand } from "../src/verbs";
import type { Clip, Command, Timeline } from "../src/types";
import { baseTimeline, EMPTY_TIMELINE, range, t } from "./fixtures";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Apply a public command; throw on any error (goldens use valid edits). */
function apply(tl: Timeline, cmd: Command, mintedId?: string): Timeline {
  const r = applyCommand(
    tl,
    cmd,
    mintedId === undefined ? undefined : { mintId: () => mintedId },
  );
  if (!r.ok) throw new Error(`apply failed: ${r.error.code}`);
  return r.timeline;
}

function clipById(tl: Timeline, id: string): Clip {
  for (const track of tl.tracks) {
    const clip = (track.clips as Clip[]).find((c) => c.id === id);
    if (clip) return clip;
  }
  throw new Error(`clip ${id} not found`);
}

function rules(d: DiffResult): number[] {
  return d.entries.map((e) => e.rule);
}

/** Deep clone for hand-built out-of-family states (plain JSON data). */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

// ---------------------------------------------------------------------------
// C1 — the 15 rules, table-driven (T2-F "15-rules table" golden)
// ---------------------------------------------------------------------------

type RuleRow = {
  name: string;
  edit: (tl: Timeline) => Timeline;
  rules: number[];
  sentences: string[];
};

const RULE_ROWS: RuleRow[] = [
  {
    name: "#1 moved — jagah khaana",
    edit: (tl) => apply(tl, { op: "move", clipId: "A", newStart: t(40) }),
    rules: [1],
    sentences: ["Clip A moved from frame 10 to frame 40"],
  },
  {
    name: "#2 trim start shortened",
    edit: (tl) =>
      apply(tl, { op: "trim", clipId: "A", edge: "start", delta: t(-3) }),
    rules: [2],
    sentences: ["Clip A shortened by 3 frames at the start"],
  },
  {
    name: "#3 trim start extended",
    edit: (tl) =>
      apply(tl, { op: "trim", clipId: "A", edge: "start", delta: t(3) }),
    rules: [3],
    sentences: ["Clip A extended by 3 frames at the start"],
  },
  {
    name: "#4 trim end shortened",
    edit: (tl) =>
      apply(tl, { op: "trim", clipId: "A", edge: "end", delta: t(-3) }),
    rules: [4],
    sentences: ["Clip A shortened by 3 frames at the end"],
  },
  {
    name: "#5 trim end extended",
    edit: (tl) =>
      apply(tl, { op: "trim", clipId: "A", edge: "end", delta: t(3) }),
    rules: [5],
    sentences: ["Clip A extended by 3 frames at the end"],
  },
  {
    name: "#6 slipped — khidki khaana",
    edit: (tl) => apply(tl, { op: "slip", clipId: "A", delta: t(3) }),
    rules: [6],
    sentences: ["Clip A slipped: source window moved from 5 to 8"],
  },
  {
    name: "#7 volume changed (old → new values)",
    edit: (tl) =>
      apply(tl, {
        op: "propertyChange",
        clipId: "A",
        property: "volume",
        value: 40,
      }),
    rules: [7],
    sentences: ["Clip A volume changed: 80 → 40"],
  },
  {
    name: "#8 opacity changed (default 100 materialized as old value)",
    edit: (tl) =>
      apply(tl, {
        op: "propertyChange",
        clipId: "A",
        property: "opacity",
        value: 50,
      }),
    rules: [8],
    sentences: ["Clip A opacity changed: 100 → 50"],
  },
  {
    name: "#9 scale changed",
    edit: (tl) =>
      apply(tl, {
        op: "propertyChange",
        clipId: "A",
        property: "scale",
        value: 2,
      }),
    rules: [9],
    sentences: ["Clip A scale changed: 1 → 2"],
  },
  {
    name: "#10 position changed",
    edit: (tl) =>
      apply(tl, {
        op: "propertyChange",
        clipId: "A",
        property: "position",
        value: { x: 100, y: 50 },
      }),
    rules: [10],
    sentences: ["Clip A position changed: (0, 0) → (100, 50)"],
  },
  {
    name: "#11 textContent changed",
    edit: (tl) =>
      apply(tl, {
        op: "propertyChange",
        clipId: "TX",
        property: "textContent",
        value: "Hello",
      }),
    rules: [11],
    sentences: ['Clip TX text changed: "Welcome" → "Hello"'],
  },
  {
    name: "#12 textStyle changed (whole-atom)",
    edit: (tl) =>
      apply(tl, {
        op: "propertyChange",
        clipId: "TX",
        property: "textStyle",
        value: { font: "Georgia", size: 60, color: "#00ff00" },
      }),
    rules: [12],
    sentences: [
      "Clip TX text style changed: Arial 48 #ffffff → Georgia 60 #00ff00",
    ],
  },
  {
    name: "#13 added",
    edit: (tl) =>
      apply(
        tl,
        {
          op: "addClip",
          trackId: "v1",
          mediaRefId: "mV",
          sourceRange: range(0, 5),
          timelineRange: range(70, 5),
        },
        "N",
      ),
    rules: [13],
    sentences: ["Clip N added at frame 70 (5 frames long)"],
  },
  {
    name: "#14 removed",
    edit: (tl) => apply(tl, { op: "deleteClip", clipId: "B" }),
    rules: [14],
    sentences: ["Clip B removed"],
  },
  {
    name: "#15 split (khandaan-record; cut in root-local coordinates)",
    edit: (tl) => apply(tl, { op: "split", clipId: "A", at: t(15) }),
    rules: [15],
    sentences: ["Clip A split into two at 5"],
  },
];

describe("C1: the 15 classify+render rules (table-driven)", () => {
  for (const row of RULE_ROWS) {
    it(`C1 ${row.name}`, () => {
      const a = baseTimeline();
      const d = computeDiff(a, row.edit(a));
      expect(d.sentences).toEqual(row.sentences);
      expect(rules(d)).toEqual(row.rules);
    });
  }
});

// ---------------------------------------------------------------------------
// C1 — multi-change clip → multiple sentences (T2-F golden)
// ---------------------------------------------------------------------------

describe("C1: multi-change clip = multiple sentences", () => {
  it("C1: move + end-trim + volume on one clip → 3 sentences, khaana order", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "move", clipId: "A", newStart: t(40) });
    b = apply(b, { op: "trim", clipId: "A", edge: "end", delta: t(-3) });
    b = apply(b, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A moved from frame 10 to frame 40",
      "Clip A shortened by 3 frames at the end",
      "Clip A volume changed: 80 → 40",
    ]);
    expect(rules(d)).toEqual([1, 4, 7]);
  });

  it("C1: composed move ⊕ trim-start decompose into independent sentences (B2.1 content-anchored atoms)", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "move", clipId: "A", newStart: t(13) });
    b = apply(b, { op: "trim", clipId: "A", edge: "start", delta: t(-2) });
    const d = computeDiff(a, b);
    // anchor moved by +3; coverage start cut by 2 — exactly one sentence each
    expect(rules(d)).toEqual([1, 2]);
    expect(d.sentences).toEqual([
      "Clip A moved from frame 12 to frame 15",
      "Clip A shortened by 2 frames at the start",
    ]);
  });
});

// ---------------------------------------------------------------------------
// C1 — rippleDelete renders as #14 + N×#1 (net-state truth; T2-F golden)
// ---------------------------------------------------------------------------

describe("C1: rippleDelete diff = #14 + N×#1", () => {
  it("C1: ripple delete A → 'removed' + a 'moved' sentence per shifted clip", () => {
    const a = baseTimeline();
    const b = apply(a, { op: "rippleDelete", clipId: "A" });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A removed",
      "Clip B moved from frame 30 to frame 20",
      "Clip IM moved from frame 50 to frame 40",
    ]);
    expect(rules(d)).toEqual([14, 1, 1]);
    // machine form (structured entries — M4 composes on these)
    expect(d.entries).toEqual([
      {
        rule: 14,
        kind: "removed",
        trackId: "v1",
        clipId: "A",
        start: 10,
        duration: 10,
      },
      {
        rule: 1,
        kind: "moved",
        trackId: "v1",
        clipId: "B",
        fromStart: 30,
        toStart: 20,
      },
      {
        rule: 1,
        kind: "moved",
        trackId: "v1",
        clipId: "IM",
        fromStart: 50,
        toStart: 40,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// C1 #16 — catch-all (T2-F golden): truthful raw values, never crash/skip
// ---------------------------------------------------------------------------

describe("C1 #16: catch-all on out-of-family states", () => {
  it("C1 #16: artificially corrupted sourceRange duration → the exact raw sentence from the C1 lock", () => {
    const a = baseTimeline();
    const b = clone(a);
    clipById(b, "A").sourceRange = range(5, 7); // no verb can do this (BC.4)
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Clip A changed: sourceRange 5–15 → 5–12"]);
    expect(rules(d)).toEqual([16]);
  });

  it("C1 #16: mediaRefId swapped under the same clip id → truthful raw values", () => {
    const a = baseTimeline();
    const b = clone(a);
    clipById(b, "A").mediaRefId = "mI";
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Clip A changed: mediaRefId mV → mI"]);
    expect(rules(d)).toEqual([16]);
  });

  it("C1 #16: projectRate mismatch → timeline-level raw sentence, no crash", () => {
    const a = baseTimeline();
    const b = clone(a);
    b.projectRate = 30;
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Timeline changed: projectRate 24 → 30"]);
    expect(rules(d)).toEqual([16]);
  });

  it("C1 #16: whole track missing → track-level raw + honest per-clip removals", () => {
    const a = baseTimeline();
    const b = clone(a);
    b.tracks = b.tracks.filter((track) => track.id !== "a1");
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Track a1 changed: existence present → absent",
      "Clip AU removed",
    ]);
    expect(rules(d)).toEqual([16, 14]);
  });
});

// ---------------------------------------------------------------------------
// C1 + B3.1 — empty diff (T2-F golden; PRD invariant diff(A,A) = ∅)
// ---------------------------------------------------------------------------

describe("C1/B3.1: empty diff", () => {
  it("C1: diff(A, A) = empty (same reference)", () => {
    const a = baseTimeline();
    expect(computeDiff(a, a)).toEqual({ entries: [], sentences: [] });
  });

  it("C1: diff of two structurally equal timelines = empty (different objects)", () => {
    expect(computeDiff(baseTimeline(), baseTimeline())).toEqual({
      entries: [],
      sentences: [],
    });
  });

  it("C1: empty timeline vs itself = empty (A4 — empty is a valid state)", () => {
    expect(computeDiff(EMPTY_TIMELINE, clone(EMPTY_TIMELINE))).toEqual({
      entries: [],
      sentences: [],
    });
  });

  it("B3.1: defaults materialized — explicit default values vs unwritten = NO diff line", () => {
    const a = baseTimeline();
    const b = clone(a);
    clipById(b, "B").properties = {
      volume: 100,
      opacity: 100,
      scale: 1,
      position: { x: 0, y: 0 },
    };
    expect(computeDiff(a, b).sentences).toEqual([]);
    // and the mirror direction (explicit defaults in `a`)
    expect(computeDiff(b, a).sentences).toEqual([]);
  });

  it("B3.1: trim + untrim back = no changes (net-state authority)", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "trim", clipId: "A", edge: "end", delta: t(-3) });
    b = apply(b, { op: "trim", clipId: "A", edge: "end", delta: t(3) });
    expect(computeDiff(a, b).sentences).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B1.1 — split khandaan matching (T2 group A, DIFF-level parts only)
// ---------------------------------------------------------------------------

describe("B1.1: split khandaan — descendants matched to base, rule #15", () => {
  it("B1.1: simple split → ONLY the #15 sentence (descendants matched, no added/removed/trim noise)", () => {
    const a = baseTimeline();
    const b = apply(a, { op: "split", clipId: "A", at: t(15) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Clip A split into two at 5"]);
    expect(d.entries).toEqual([
      {
        rule: 15,
        kind: "split",
        trackId: "v1",
        clipId: "A",
        pieceIds: ["A", "A@5"],
        cuts: [5],
      },
    ]);
  });

  it("B1.1: nested split chain matched — A, A@5, A@5@7 all map back to base A", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "split", clipId: "A@5", at: t(17) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Clip A split into three at 5, 7"]);
    expect(d.entries).toEqual([
      {
        rule: 15,
        kind: "split",
        trackId: "v1",
        clipId: "A",
        pieceIds: ["A", "A@5", "A@5@7"],
        cuts: [5, 7],
      },
    ]);
  });

  it("B1.1: split + piece moved → #15 + #1 on the piece (anchor is split-invariant)", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "move", clipId: "A@5", newStart: t(60) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A split into two at 5",
      "Clip A@5 moved from frame 15 to frame 60",
    ]);
    expect(rules(d)).toEqual([15, 1]);
  });

  it("B1.1: split + piece property change → #15 + #7 with the base value as old value", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, {
      op: "propertyChange",
      clipId: "A@5",
      property: "volume",
      value: 30,
    });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A split into two at 5",
      "Clip A@5 volume changed: 80 → 30",
    ]);
    expect(rules(d)).toEqual([15, 7]);
  });

  it("B1.1: split + piece slip → #15 + #6 with the piece's truthful source window", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "slip", clipId: "A@5", delta: t(3) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A split into two at 5",
      "Clip A@5 slipped: source window moved from 10 to 13",
    ]);
    expect(rules(d)).toEqual([15, 6]);
  });

  it("B1.1: split + piece end-trim → #15 + #4 attributed to the trailing piece", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "trim", clipId: "A@5", edge: "end", delta: t(-2) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A split into two at 5",
      "Clip A@5 shortened by 2 frames at the end",
    ]);
    expect(rules(d)).toEqual([15, 4]);
  });

  it("B1.1: split + trailing-piece end-extension → #15 + #5 on that piece", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "trim", clipId: "A@5", edge: "end", delta: t(3) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A split into two at 5",
      "Clip A@5 extended by 3 frames at the end",
    ]);
    expect(rules(d)).toEqual([15, 5]);
  });

  it("B1.1: split + LEFT piece deleted → #14 (base id content gone) + #15, survivor matched", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "deleteClip", clipId: "A" });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A removed",
      "Clip A split into two at 5",
    ]);
    expect(rules(d)).toEqual([14, 15]);
  });

  it("B1.1/B3.1: split + RIGHT piece deleted = net-state of an end-trim → #4, no #15 (net-state authority)", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "deleteClip", clipId: "A@5" });
    // identical net state to a plain end-trim of 5 frames…
    const trimmed = apply(a, {
      op: "trim",
      clipId: "A",
      edge: "end",
      delta: t(-5),
    });
    expect(b).toEqual(trimmed);
    // …so the diff is the same sentence (raasta irrelevant — sirf aakhri shakal)
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Clip A shortened by 5 frames at the end"]);
    expect(rules(d)).toEqual([4]);
  });

  it("B1.1: pre-existing family in the base — only the NEW cut is reported", () => {
    const a0 = baseTimeline();
    const a = apply(a0, { op: "split", clipId: "A", at: t(15) }); // family already in base
    const b = apply(a, { op: "split", clipId: "A@5", at: t(17) });
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual(["Clip A@5 split into two at 7"]);
    expect(rules(d)).toEqual([15]);
  });
});

// ---------------------------------------------------------------------------
// B3.1 — matching is ID-only, never by shape
// ---------------------------------------------------------------------------

describe("B3.1: ID-only matching", () => {
  it("B3.1: delete + recreate an identical-looking clip = removed + added (never a silent match)", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "deleteClip", clipId: "A" });
    b = apply(
      b,
      {
        op: "addClip",
        trackId: "v1",
        mediaRefId: "mV",
        sourceRange: range(5, 10),
        timelineRange: range(10, 10),
      },
      "A2",
    );
    const d = computeDiff(a, b);
    expect(d.sentences).toEqual([
      "Clip A removed",
      "Clip A2 added at frame 10 (10 frames long)",
    ]);
    expect(rules(d)).toEqual([14, 13]);
  });
});

// ---------------------------------------------------------------------------
// C1 — deterministic output order (documented in diff.ts)
// ---------------------------------------------------------------------------

describe("C1: deterministic ordering", () => {
  it("C1: kitab-order — track order, then B3.1 clip sort key, then khaana order; stable across runs", () => {
    const a = baseTimeline();
    let b = apply(a, {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 40,
    });
    b = apply(b, { op: "move", clipId: "B", newStart: t(60) });
    b = apply(b, { op: "deleteClip", clipId: "AU" });
    b = apply(b, {
      op: "propertyChange",
      clipId: "TX",
      property: "textContent",
      value: "Hello",
    });
    const d1 = computeDiff(a, b);
    expect(d1.sentences).toEqual([
      "Clip A volume changed: 80 → 40",
      "Clip B moved from frame 30 to frame 60",
      "Clip AU removed",
      'Clip TX text changed: "Welcome" → "Hello"',
    ]);
    // same inputs ⇒ byte-identical output
    const d2 = computeDiff(a, b);
    expect(JSON.stringify(d2)).toBe(JSON.stringify(d1));
  });
});

// ---------------------------------------------------------------------------
// Machine form — every sentence derived from a structured entry (1:1)
// ---------------------------------------------------------------------------

describe("C1: machine form ↔ sentences", () => {
  it("C1: entries and sentences are strictly 1:1 and every entry names its clip in its sentence", () => {
    const a = baseTimeline();
    let b = apply(a, { op: "split", clipId: "A", at: t(15) });
    b = apply(b, { op: "move", clipId: "A@5", newStart: t(60) });
    b = apply(b, { op: "deleteClip", clipId: "B" });
    // O3 (2026-08-04): slip is not applicable to an image, so the #6
    // sentence is taken on the audio clip instead of the image clip IM.
    b = apply(b, { op: "slip", clipId: "AU", delta: t(2) });
    const d = computeDiff(a, b);
    expect(d.sentences.length).toBe(d.entries.length);
    d.entries.forEach((entry, i) => {
      if (entry.kind !== "rawChanged") {
        expect(d.sentences[i]).toContain(`Clip ${entry.clipId}`);
      }
      expect(d.sentences[i].length).toBeGreaterThan(0);
    });
  });
});
