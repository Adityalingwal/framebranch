/**
 * B3 §2.2 — the conflict-card presenter (server/conflict-cards.ts). Pure:
 * hand-built timelines run through the real engine, no DB. Wording is the
 * copy sheet's, verbatim (#137-#145).
 */

import { describe, expect, it } from "vitest";

import { applyCommand, recompute } from "@framebranch/engine";
import type {
  Clip,
  Command,
  MediaRef,
  MergeChoice,
  MergeConflict,
  TextClip,
  Timeline,
  Track,
} from "@framebranch/engine";

import {
  buildAfterDisplay,
  presentConflictCards,
} from "../src/server/conflict-cards";
import type { ConflictCard } from "../src/server/conflict-cards";

const R = 24;
const CUT = "priya-music";
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
    durationInSource: t(24 * 60 * 60 * 2),
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
  name: string,
  mediaRefId: string,
  tlStart: number,
  duration: number,
  srcStart = 48,
  properties: Clip["properties"] = {},
): Clip {
  return {
    id,
    name,
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
 * V1: Intro [0,48) · Interview [240,480) · B-roll [720,840)
 * T1: the unnamed text clip "Welcome" [48,120)
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
    clips: [text("welcome", undefined, 48, 72, "Welcome")],
  };
  return { projectRate: R, tracks: [v1, t1], mediaRefs: MEDIA };
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

/** base → ours/theirs → the engine → the cards, exactly as the route does. */
function cardsFor(
  ourCommands: Command[],
  theirCommands: Command[],
  choices: Record<string, MergeChoice> = {},
  start: Timeline = base(),
): { cards: ConflictCard[]; undecidedClipIds: string[]; after: Timeline } {
  const ours = apply(start, ...ourCommands);
  const theirs = apply(start, ...theirCommands);
  const run = recompute(start, ours, theirs, choices);
  if (!run.ok) throw new Error(`engine refused: ${run.error.message}`);
  const known = recompute(start, ours, theirs, {});
  if (!known.ok) throw new Error(`engine refused: ${known.error.message}`);
  const { after, undecidedClipIds } = buildAfterDisplay(
    run.timeline,
    ours,
    run.conflicts,
  );
  const cards = presentConflictCards({
    base: start,
    ours,
    theirs,
    after,
    cutName: CUT,
    conflicts: known.conflicts,
    choices,
  });
  return { cards, undecidedClipIds, after };
}

const one = (
  ourCommands: Command[],
  theirCommands: Command[],
  choices: Record<string, MergeChoice> = {},
): ConflictCard => {
  const { cards } = cardsFor(ourCommands, theirCommands, choices);
  expect(cards).toHaveLength(1);
  return cards[0];
};

const clipsOf = (timeline: Timeline): (Clip | TextClip)[] =>
  timeline.tracks.flatMap((track) => track.clips as (Clip | TextClip)[]);

const values = (card: ConflictCard) =>
  card.lines.map((l) => `${l.label} · ${l.value}`);

const volume = (clipId: string, value: number): Command => ({
  op: "propertyChange",
  clipId,
  property: "volume",
  value,
});

// ---------------------------------------------------------------------------
// Bucket 1 — both cuts changed the same thing (#137-#139)
// ---------------------------------------------------------------------------

describe("bucket 1 — titles (#137, #137a-#137i)", () => {
  it("#137 text: title, the three lines with real content, and the buttons", () => {
    const card = one(
      [
        {
          op: "propertyChange",
          clipId: "welcome",
          property: "textContent",
          value: "Welcome — 40% off",
        },
      ],
      [
        {
          op: "propertyChange",
          clipId: "welcome",
          property: "textContent",
          value: "Welcome — half price",
        },
      ],
    );
    expect(card.bucket).toBe(1);
    expect(card.title).toBe(`"Welcome" — both cuts changed the text`);
    expect(values(card)).toEqual([
      `main · "Welcome — 40% off"`,
      `${CUT} · "Welcome — half price"`,
      `Original · "Welcome"`,
    ]);
    // #139 — cut name verbatim, never yours/theirs.
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "ours" },
      { label: `Keep ${CUT}'s`, choice: "theirs" },
      { label: "Keep original", choice: "base" },
    ]);
    expect(card.chosen).toBeNull();
    // A text clip has no frame to show.
    expect(card.lines.every((l) => l.thumbnail === null)).toBe(true);
  });

  it("#137a volume — values read like the Compare rows", () => {
    const card = one([volume("interview", 40)], [volume("interview", 80)]);
    expect(card.title).toBe(`"Interview" — both cuts changed the volume`);
    expect(values(card)).toEqual([
      "main · Volume 40%",
      `${CUT} · Volume 80%`,
      "Original · Volume 100%",
    ]);
    expect(card.lines[0].thumbnail).toBe("/thumbnails/interview.jpg");
  });

  it("#137b opacity", () => {
    const card = one(
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "opacity",
          value: 80,
        },
      ],
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "opacity",
          value: 50,
        },
      ],
    );
    expect(card.title).toBe(`"Interview" — both cuts changed the opacity`);
    expect(values(card)).toEqual([
      "main · Opacity 80%",
      `${CUT} · Opacity 50%`,
      "Original · Opacity 100%",
    ]);
  });

  it("#137c scale — a factor is shown as a percentage", () => {
    const card = one(
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "scale",
          value: 1.5,
        },
      ],
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "scale",
          value: 2,
        },
      ],
    );
    expect(card.title).toBe(`"Interview" — both cuts changed the scale`);
    expect(values(card)).toEqual([
      "main · Scale 150%",
      `${CUT} · Scale 200%`,
      "Original · Scale 100%",
    ]);
  });

  it("#137d position — no values at all (look in the player)", () => {
    const card = one(
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "position",
          value: { x: 100, y: 0 },
        },
      ],
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "position",
          value: { x: 0, y: 60 },
        },
      ],
    );
    expect(card.title).toBe(`"Interview" — both cuts changed the position`);
    expect(card.lines.map((l) => l.value)).toEqual(["", "", ""]);
  });

  it("#137e text style", () => {
    const card = one(
      [
        {
          op: "propertyChange",
          clipId: "welcome",
          property: "textStyle",
          value: { font: "Georgia", size: 48, color: "#ffffff" },
        },
      ],
      [
        {
          op: "propertyChange",
          clipId: "welcome",
          property: "textStyle",
          value: { font: "Arial", size: 60, color: "#ffffff" },
        },
      ],
    );
    expect(card.title).toBe(`"Welcome" — both cuts changed the text style`);
    expect(card.lines.map((l) => l.value)).toEqual(["", "", ""]);
  });

  it("#137f moved — `at ‹tc›` on every line", () => {
    const card = one(
      [{ op: "move", clipId: "intro", newStart: t(120) }],
      [{ op: "move", clipId: "intro", newStart: t(168) }],
    );
    expect(card.title).toBe(`"Intro" — both cuts moved it`);
    expect(values(card)).toEqual([
      "main · at 00:00:05:00",
      `${CUT} · at 00:00:07:00`,
      "Original · at 00:00:00:00",
    ]);
  });

  it("#137g slipped — frames relative to the Original", () => {
    const card = one(
      [{ op: "slip", clipId: "interview", delta: t(12) }],
      [{ op: "slip", clipId: "interview", delta: t(-24) }],
    );
    expect(card.title).toBe(`"Interview" — both cuts slipped it`);
    expect(values(card)).toEqual([
      "main · starts 12 frames later",
      `${CUT} · starts 24 frames earlier`,
      "Original · starts 00:00:02:00",
    ]);
  });

  it("#137h trimmed — the D4(4) Trimmed words, `now` only on the two cuts", () => {
    const card = one(
      [{ op: "trim", clipId: "interview", edge: "end", delta: t(-24) }],
      [{ op: "trim", clipId: "interview", edge: "end", delta: t(-48) }],
    );
    expect(card.title).toBe(`"Interview" — both cuts trimmed it`);
    expect(values(card)).toEqual([
      "main · now ends 00:00:19:00",
      `${CUT} · now ends 00:00:18:00`,
      "Original · ends 00:00:20:00",
    ]);
  });

  it("#137i fallback — an engine field with no words of its own", () => {
    // `source-bounds` / `negative-start` / `nonpositive-duration` are not
    // reachable from normal editing, so the conflict record is hand-built:
    // the presenter is pure and takes the records it is given.
    const start = base();
    const ours = apply(start, volume("interview", 40));
    const theirs = apply(start, volume("interview", 80));
    const conflict: MergeConflict = {
      conflictId: "m4:hand-built",
      bucket: 1,
      participants: {
        kind: "value",
        trackId: "v1",
        rootId: "interview",
        clipIds: ["interview"],
        field: "source-bounds",
      },
      explanation: "Clip interview changed source-bounds differently",
      choices: ["ours", "theirs", "base"],
    };
    const cards = presentConflictCards({
      base: start,
      ours,
      theirs,
      after: ours,
      cutName: CUT,
      conflicts: [conflict],
      choices: {},
    });
    expect(cards[0].title).toBe(`"Interview" — both cuts changed it`);
    expect(cards[0].lines.map((l) => l.value)).toEqual(["", "", ""]);
  });

  it("a chosen card carries the answer; the Original line is inert", () => {
    const { cards } = cardsFor(
      [volume("interview", 40)],
      [volume("interview", 80)],
    );
    const id = cards[0].conflictId;
    const answered = one(
      [volume("interview", 40)],
      [volume("interview", 80)],
      { [id]: "theirs" },
    );
    expect(answered.chosen).toBe("theirs");

    const original = answered.lines[2];
    expect(original.side).toBe("original");
    expect(original.laneIds).toEqual({ before: [], after: [] });
    expect(original.jump).toBeNull();
    // main's line points at the Before lane, the cut's at the After lane.
    expect(answered.lines[0].jump).toEqual({ side: "before", frame: 240 });
    expect(answered.lines[0].laneIds.before).toEqual(["interview"]);
    expect(answered.lines[1].laneIds.before).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bucket 2 — one side removed it (#140-#142)
// ---------------------------------------------------------------------------

describe("bucket 2 — removed on one side (#140-#142)", () => {
  it("#140: main removed it, the cut moved it", () => {
    const card = one(
      [{ op: "deleteClip", clipId: "broll" }],
      [{ op: "move", clipId: "broll", newStart: t(600) }],
    );
    expect(card.bucket).toBe(2);
    expect(card.title).toBe(`B-roll — main removed it, ${CUT} moved it`);
    // #141 — no Original line in this bucket.
    expect(values(card)).toEqual([
      "main · Removed",
      `${CUT} · Moved to 00:00:25:00`,
    ]);
    // #142 — `Keep original` is not offered here.
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "delete" },
      { label: `Keep ${CUT}'s`, choice: "clip" },
    ]);
    // The removed side still shows the Original's frame.
    expect(card.lines[0].thumbnail).toBe("/thumbnails/broll.jpg");
  });

  it("#140a + #140b: the cut removed it, main trimmed it — the buttons swap", () => {
    const card = one(
      [{ op: "trim", clipId: "broll", edge: "end", delta: t(-24) }],
      [{ op: "deleteClip", clipId: "broll" }],
    );
    expect(card.title).toBe(`B-roll — ${CUT} removed it, main trimmed it`);
    expect(values(card)).toEqual([
      "main · End trimmed by 24 frames",
      `${CUT} · Removed`,
    ]);
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "clip" },
      { label: `Keep ${CUT}'s`, choice: "delete" },
    ]);
  });

  it("#140c slipped", () => {
    const card = one(
      [{ op: "slip", clipId: "broll", delta: t(12) }],
      [{ op: "deleteClip", clipId: "broll" }],
    );
    expect(card.title).toBe(`B-roll — ${CUT} removed it, main slipped it`);
  });

  it("#140d split", () => {
    const card = one(
      [{ op: "split", clipId: "broll", at: t(780) }],
      [{ op: "deleteClip", clipId: "broll" }],
    );
    expect(card.title).toBe(`B-roll — ${CUT} removed it, main split it`);
  });

  it("#140e changed the text", () => {
    const card = one(
      [
        {
          op: "propertyChange",
          clipId: "welcome",
          property: "textContent",
          value: "Hello",
        },
      ],
      [{ op: "deleteClip", clipId: "welcome" }],
    );
    expect(card.title).toBe(
      `"Welcome" — ${CUT} removed it, main changed the text`,
    );
  });

  it("#140f the five properties", () => {
    const cases: { command: Command; phrase: string }[] = [
      { command: volume("broll", 40), phrase: "changed the volume" },
      {
        command: {
          op: "propertyChange",
          clipId: "broll",
          property: "opacity",
          value: 50,
        },
        phrase: "changed the opacity",
      },
      {
        command: {
          op: "propertyChange",
          clipId: "broll",
          property: "scale",
          value: 2,
        },
        phrase: "changed the scale",
      },
      {
        command: {
          op: "propertyChange",
          clipId: "broll",
          property: "position",
          value: { x: 30, y: 0 },
        },
        phrase: "changed the position",
      },
    ];
    for (const { command, phrase } of cases) {
      const card = one([command], [{ op: "deleteClip", clipId: "broll" }]);
      expect(card.title).toBe(`B-roll — ${CUT} removed it, main ${phrase}`);
    }
    const styled = one(
      [
        {
          op: "propertyChange",
          clipId: "welcome",
          property: "textStyle",
          value: { font: "Georgia", size: 48, color: "#ffffff" },
        },
      ],
      [{ op: "deleteClip", clipId: "welcome" }],
    );
    expect(styled.title).toBe(
      `"Welcome" — ${CUT} removed it, main changed the text style`,
    );
  });
});

// ---------------------------------------------------------------------------
// Bucket 3 — two clips on one spot (#143-#145)
// ---------------------------------------------------------------------------

describe("bucket 3 — overlap (#143-#145)", () => {
  it("#143-#145: title with the intersection, lines by side, three buttons", () => {
    const { cards } = cardsFor(
      [{ op: "move", clipId: "intro", newStart: t(600) }],
      [{ op: "move", clipId: "broll", newStart: t(620) }],
    );
    const card = cards.find((c) => c.bucket === 3);
    expect(card).toBeDefined();
    expect(card!.title).toBe(
      `"B-roll" and "Intro" overlap on V1 (00:00:25:20–00:00:27:00)`,
    );
    expect(values(card!)).toEqual([
      `B-roll · from ${CUT}`,
      "Intro · from main",
      "Original · (this spot was empty)",
    ]);
    expect(card!.buttons).toEqual([
      { label: `Move "B-roll" later`, choice: "shift-a" },
      { label: `Move "Intro" later`, choice: "shift-b" },
      { label: "Keep original", choice: "base" },
    ]);
    expect(card!.lines[2].jump).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The After lane, and the one rule that has no exceptions
// ---------------------------------------------------------------------------

describe("undecided clips + F2e", () => {
  it("an undecided bucket-1 clip is drawn at main's position and named", () => {
    const { undecidedClipIds, after } = cardsFor(
      [volume("interview", 40)],
      [volume("interview", 80)],
    );
    expect(undecidedClipIds).toEqual(["interview"]);
    const drawn = clipsOf(after).find((clip) => clip.id === "interview");
    expect(drawn).toBeDefined();
    expect(drawn!.timelineRange.start.value).toBe(240);
    expect((drawn as Clip).properties.volume).toBe(40); // main's version
  });

  it("a clip main removed stays ABSENT from After until it is decided", () => {
    const { undecidedClipIds, after } = cardsFor(
      [{ op: "deleteClip", clipId: "broll" }],
      [{ op: "move", clipId: "broll", newStart: t(600) }],
    );
    expect(undecidedClipIds).toEqual([]);
    expect(clipsOf(after).find((clip) => clip.id === "broll")).toBeUndefined();
  });

  it("answering the conflict puts the decided content in After", () => {
    const { cards } = cardsFor(
      [volume("interview", 40)],
      [volume("interview", 80)],
    );
    const id = cards[0].conflictId;
    const { undecidedClipIds, after } = cardsFor(
      [volume("interview", 40)],
      [volume("interview", 80)],
      { [id]: "theirs" },
    );
    expect(undecidedClipIds).toEqual([]);
    const drawn = clipsOf(after).find((clip) => clip.id === "interview") as Clip;
    expect(drawn.properties.volume).toBe(80);
  });

  it("F2e: the engine's explanation never reaches any string", () => {
    const runs = [
      cardsFor([volume("interview", 40)], [volume("interview", 80)]),
      cardsFor(
        [{ op: "deleteClip", clipId: "broll" }],
        [{ op: "move", clipId: "broll", newStart: t(600) }],
      ),
      cardsFor(
        [{ op: "move", clipId: "intro", newStart: t(600) }],
        [{ op: "move", clipId: "broll", newStart: t(620) }],
      ),
    ];
    for (const run of runs) {
      // `conflictId` is machine data (it goes back to the server verbatim);
      // every HUMAN string is checked below.
      const json = JSON.stringify(
        run.cards.map((card) => ({ ...card, conflictId: "" })),
      );
      expect(json).not.toContain("Clip family");
      expect(json).not.toContain("differently");
      expect(json).not.toContain("m4:");
      // No raw clip id leaks into a human-facing string either.
      for (const card of run.cards) {
        expect(card.title).not.toContain("clip-");
        for (const line of card.lines) {
          expect(line.clipName).not.toBe(line.clipId);
        }
      }
    }
  });
});
