/**
 * copy.test.ts — B5's regression net for the C5 copy sheet.
 *
 * Every string the product GENERATES (as opposed to renders from a literal
 * in a component) comes out of a handful of pure functions. This file pins
 * those functions to the sheet, verbatim, so a later refactor cannot quietly
 * reword the product:
 *
 *   G4-N            generated card names (naming.ts)
 *   #109/#184       `summaryName` / `runSummary`, incl. B5 lock (3)'s cap
 *   #125            the clip display-name fallbacks
 *   #77             `formatClock`'s three forms
 *   C-3             `formatFrames` — 4-part, always
 *   B1 fix 4        `quoted()` never nests
 *   #137-#145       the three conflict-card forms: titles, lines, buttons
 *
 * Pure only: no database, no React. The component-level literals (`Mark
 * version`, `Bring in now`, …) are pinned by the sheet audit itself, not
 * here — a test that retypes a JSX literal asserts nothing. That is why
 * #146 (`‹N› decisions left`), #147 (nothing) and #148 (`Cancel — nothing
 * changes` / `Bring in now`) are absent: they are JSX in
 * `ui/RightPanel/BringInPanel.tsx`, with no builder to call, and the suite
 * has no DOM (`vitest.config.ts` includes `tests/**\/*.test.ts` only).
 *
 * Every expected string below is typed from the SHEET row named in the
 * comment beside it, never read back off a run of the code.
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

import { clipDisplayName, EMPTY_TEXT, UNTITLED_CLIP } from "../src/lib/clip-helpers";
import { formatClock, formatFrames, quoted } from "../src/lib/format";
import {
  presentDiff,
  runSummary,
  SUMMARY_NAME_MAX,
} from "../src/server/diff-rows";
import type { DiffRow } from "../src/server/diff-rows";
import {
  buildAfterDisplay,
  presentConflictCards,
} from "../src/server/conflict-cards";
import type {
  ConflictCard,
  ConflictRecord,
} from "../src/server/conflict-cards";
import {
  IMPORTED_TIMELINE_COMMIT_NAME,
  mergeCommitName,
  restoreCommitName,
} from "../src/server/naming";

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
    durationInSource: t(24 * 60 * 60),
  },
];

function media(
  id: string,
  name: string | undefined,
  tlStart: number,
  duration: number,
  properties: Clip["properties"] = {},
): Clip {
  return {
    id,
    ...(name ? { name } : {}),
    mediaRefId: "m-interview",
    sourceRange: range(48, duration),
    timelineRange: range(tlStart, duration),
    properties,
    lineage: { rootId: id, span: range(0, duration) },
  };
}

/** V1: Intro [0,48) · Interview [240,480). */
function base(): Timeline {
  const v1: Track = {
    id: "v1",
    kind: "video",
    name: "V1",
    clips: [media("intro", "Intro", 0, 48), media("interview", "Interview", 240, 240)],
  };
  return { projectRate: R, tracks: [v1], mediaRefs: MEDIA };
}

function apply(tl: Timeline, ...commands: Command[]): Timeline {
  let current = tl;
  for (const command of commands) {
    const result = applyCommand(current, command);
    if (!result.ok) throw new Error(`fixture refused: ${result.error.message}`);
    current = result.timeline;
  }
  return current;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// G4-N — the generated card names
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("G4-N — generated card names", () => {
  it("bring-in (#95): `Brought \"‹cut›\" into main` — the target is always main", () => {
    expect(mergeCommitName("priya-music")).toBe('Brought "priya-music" into main');
    expect(mergeCommitName("agent-tighten-intro")).toBe(
      'Brought "agent-tighten-intro" into main',
    );
  });

  it("bring-in of a cut whose NAME carries quotes (B1 fix 4): one pair, ever", () => {
    // `branchName` permits `"` (schemas.ts), so this cut is creatable. The
    // same `quoted()` rule `restoreCommitName` uses applies here: a name
    // that already carries quotes is not wrapped again.
    expect(mergeCommitName('"client"')).toBe('Brought "client" into main');
    expect(mergeCommitName('"client"')).not.toContain('""');
    expect(mergeCommitName('say "hi"')).toBe('Brought say "hi" into main');
  });

  it("restore (#94): `Restored \"‹card›\"`", () => {
    expect(restoreCommitName("Client pick")).toBe('Restored "Client pick"');
  });

  it("restore of a restore (B1 fix 4): the quotes never nest", () => {
    // `quoted()`'s rule — a name that already carries quotes is not wrapped
    // again — applied to the server template too. The alternative
    // (`Restored "Restored "Client pick""`) is not a string any reader can
    // parse, and collapsing it to `Restored "Client pick"` would name the
    // wrong card.
    const once = restoreCommitName("Client pick");
    expect(restoreCommitName(once)).toBe('Restored Restored "Client pick"');
    expect(restoreCommitName(once)).not.toContain('""');
  });

  it("import (#G4-N, API-only): `Imported timeline`", () => {
    expect(IMPORTED_TIMELINE_COMMIT_NAME).toBe("Imported timeline");
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// #79 / #184 — the auto-card name and the run-log's summary
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("summaryName / runSummary — the two generated summaries", () => {
  it("one row → the row's own sentence; the verb list otherwise", () => {
    const trimmed = presentDiff(
      base(),
      apply(base(), {
        op: "trim",
        clipId: "interview",
        edge: "end",
        delta: t(-18),
      }),
    );
    expect(trimmed.summaryName).toBe("Interview end trimmed by 18 frames");
    // The run-log line takes the VERB form even for one row, so
    // `1 change: 1 trimmed` reads like every other entry.
    expect(runSummary(trimmed.rows)).toBe("1 trimmed");
  });

  it("singular: one clip is `1 clip trimmed`, never `1 clips`", () => {
    const p = presentDiff(
      base(),
      apply(
        base(),
        { op: "trim", clipId: "interview", edge: "end", delta: t(-18) },
        { op: "trim", clipId: "interview", edge: "start", delta: t(1) },
      ),
    );
    expect(p.summaryName).toBe("1 clip trimmed");
  });

  it("nothing changed → both are empty, and the presenter counts 0", () => {
    const p = presentDiff(base(), base());
    expect(p.count).toBe(0);
    expect(p.summaryName).toBe("");
    expect(runSummary(p.rows)).toBe("");
  });

  it("B5 lock (3): the generated names are capped at 60 characters with `…`", () => {
    const longName = "An interview clip whose OTIO name runs on and on and on";
    const start: Timeline = {
      projectRate: R,
      tracks: [
        {
          id: "v1",
          kind: "video",
          name: "V1",
          clips: [media("interview", longName, 240, 240)],
        },
      ],
      mediaRefs: MEDIA,
    };
    const p = presentDiff(
      start,
      apply(start, {
        op: "trim",
        clipId: "interview",
        edge: "end",
        delta: t(-18),
      }),
    );
    expect(p.summaryName.length).toBe(SUMMARY_NAME_MAX);
    expect(p.summaryName).toBe(
      "An interview clip whose OTIO name runs on and on and on end…",
    );
    expect(SUMMARY_NAME_MAX).toBe(60);
  });

  /**
   * #184 line 3 is `‹N› changes: ‹summary›`, and `‹summary›` is G4-N's auto
   * template minus the leading `clip(s)` word. The row's own example
   * (`3 trimmed, 1 removed, 2 moved`) lists the verbs out of order; G4-N
   * fixes the order (moved · trimmed · added · removed · split · slipped ·
   * changed), and G4-N is the template the row points at, so THAT is what
   * is typed below. Lock (3) caps it at 60 with `…`, like the card name.
   */
  it("#184 + G4-N: `runSummary` keeps the verb order, and is capped at 60", () => {
    const row = (kind: DiffRow["kind"], i: number): DiffRow => ({
      key: `${i}`,
      kind,
      clipIds: [`c${i}`],
      clipName: `Clip ${i}`,
      thumbnail: null,
      text: "x",
      where: "",
      trackId: "v1",
      trackName: "V1",
      jump: { side: "after", frame: 0, clipId: `c${i}` },
      laneIds: { before: [`c${i}`], after: [`c${i}`] },
    });
    const rows = (kinds: DiffRow["kind"][]): DiffRow[] => kinds.map(row);

    // Under the cap → untouched, and in G4-N order however the rows arrive.
    expect(
      runSummary(rows(["removed", "trimmed", "trimmed", "moved", "moved"])),
    ).toBe("2 moved, 2 trimmed, 1 removed");
    expect(runSummary(rows(["trimmed"]))).toBe("1 trimmed");

    // Every verb at once → 60 characters, the last one cut, `…` at the end.
    const everything = runSummary(
      rows([
        "moved",
        "trimmed",
        "added",
        "removed",
        "split",
        "slipped",
        "property",
      ]),
    );
    expect(everything).toBe(
      "1 moved, 1 trimmed, 1 added, 1 removed, 1 split, 1 slipped,…",
    );
    expect(everything.length).toBe(SUMMARY_NAME_MAX);

    // Nothing changed → the empty string, never `0 changes`.
    expect(runSummary([])).toBe("");
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// #125 — a raw clip id is never shown
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("#125 — clip display names", () => {
  it("the OTIO name wins, then the media filename, then `Untitled clip`", () => {
    expect(clipDisplayName(media("c1", "Interview", 0, 24), MEDIA[0])).toBe(
      "Interview",
    );
    expect(clipDisplayName(media("c1", undefined, 0, 24), MEDIA[0])).toBe(
      "Interview",
    );
    expect(clipDisplayName(media("c1", undefined, 0, 24), undefined)).toBe(
      UNTITLED_CLIP,
    );
    expect(UNTITLED_CLIP).toBe("Untitled clip");
  });

  it("an empty text clip is `Empty text`, never a blank", () => {
    expect(EMPTY_TEXT).toBe("Empty text");
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// C-3 — the timecode is 4-part EVERYWHERE
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("C-3 — `HH:MM:SS:FF`, hours included", () => {
  it("frame 0 · one second · one second and a frame", () => {
    expect(formatFrames(0, 24)).toBe("00:00:00:00");
    expect(formatFrames(24, 24)).toBe("00:00:01:00");
    expect(formatFrames(25, 24)).toBe("00:00:01:01");
  });

  it("past an hour it grows the hours field, never a different shape", () => {
    expect(formatFrames(24 * 60 * 60, 24)).toBe("01:00:00:00");
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// #77 — one time format, three forms
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("#77 — `formatClock`", () => {
  const now = new Date(2026, 8, 8, 17, 30); // Tue 8 Sep 2026, 5:30 pm

  it("today → `5:11 pm`", () => {
    expect(formatClock(new Date(2026, 8, 8, 17, 11).toISOString(), now)).toBe(
      "5:11 pm",
    );
  });

  it("within the previous six days → `Sun 9:05 am`", () => {
    expect(formatClock(new Date(2026, 8, 6, 9, 5).toISOString(), now)).toBe(
      "Sun 9:05 am",
    );
  });

  it("older → `1 Sep, 12:00 pm`", () => {
    expect(formatClock(new Date(2026, 8, 1, 12, 0).toISOString(), now)).toBe(
      "1 Sep, 12:00 pm",
    );
  });

  it("midnight and noon read 12, not 0", () => {
    expect(formatClock(new Date(2026, 8, 8, 0, 5).toISOString(), now)).toBe(
      "12:05 am",
    );
    expect(formatClock(new Date(2026, 8, 8, 12, 0).toISOString(), now)).toBe(
      "12:00 pm",
    );
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// B1 fix 4 — `quoted()` never double-wraps
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("`quoted()` — one pair of quotes, ever", () => {
  it("wraps a plain name and leaves a name that already carries quotes", () => {
    expect(quoted("Client pick")).toBe('"Client pick"');
    expect(quoted(restoreCommitName("Client pick"))).toBe(
      'Restored "Client pick"',
    );
    expect(quoted(mergeCommitName("priya-music"))).toBe(
      'Brought "priya-music" into main',
    );
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// #137-#145 — the three conflict-card forms. One shape, three filled forms
// (F3(2)); every title, line and button label below is typed from the sheet
// row named beside it.
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

const CUT = "priya-music";

const BROLL_MEDIA: MediaRef = {
  id: "m-broll",
  kind: "video",
  url: "/media/broll.mp4",
  hash: "",
  sourceRate: R,
  durationInSource: t(24 * 60 * 60),
};

function textClip(
  id: string,
  tlStart: number,
  duration: number,
  content: string,
): TextClip {
  return {
    id,
    timelineRange: range(tlStart, duration),
    textContent: content,
    textStyle: { font: "Arial", size: 48, color: "#ffffff" },
    lineage: { rootId: id, span: range(0, duration) },
  };
}

/**
 * V1: Intro [0,48) · Interview [240,480) · B-roll [720,840)
 * T1: an unnamed text clip reading `Welcome` [48,120)
 */
function conflictBase(): Timeline {
  const v1: Track = {
    id: "v1",
    kind: "video",
    name: "V1",
    clips: [
      media("intro", "Intro", 0, 48),
      media("interview", "Interview", 240, 240),
      {
        ...media("broll", "B-roll", 720, 120),
        mediaRefId: "m-broll",
      },
    ],
  };
  const t1: Track = {
    id: "t1",
    kind: "text",
    name: "T1",
    clips: [textClip("welcome", 48, 72, "Welcome")],
  };
  return { projectRate: R, tracks: [v1, t1], mediaRefs: [...MEDIA, BROLL_MEDIA] };
}

/** base → both sides → the engine → the cards, exactly as the route does. */
function cardsFor(
  ourCommands: Command[],
  theirCommands: Command[],
  choices: Record<string, MergeChoice> = {},
): ConflictCard[] {
  const start = conflictBase();
  const ours = apply(start, ...ourCommands);
  const theirs = apply(start, ...theirCommands);
  const run = recompute(start, ours, theirs, choices);
  if (!run.ok) throw new Error(`engine refused: ${run.error.message}`);
  const { after } = buildAfterDisplay(run.timeline, ours, run.conflicts);
  return presentConflictCards({
    base: start,
    ours,
    theirs,
    after,
    cutName: CUT,
    conflicts: run.conflicts.map((conflict) => ({
      conflict,
      composed: run.composed ?? run.timeline,
    })),
    choices,
  });
}

/** The one card a two-command pair is expected to raise. */
function oneCard(ourCommands: Command[], theirCommands: Command[]): ConflictCard {
  const cards = cardsFor(ourCommands, theirCommands);
  expect(cards).toHaveLength(1);
  return cards[0];
}

/** `‹label› · ‹value›` per line — the sheet's own notation for #138/#141/#144. */
const lineText = (card: ConflictCard): string[] =>
  card.lines.map((line) => `${line.label} · ${line.value}`);

describe("Case 1 (#137-#139) — both cuts changed the same thing", () => {
  it("#137 text · #138 lines · #139 buttons", () => {
    const card = oneCard(
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
    // #137 `"‹clip›" — both cuts changed the text`
    expect(card.title).toBe('"Welcome" — both cuts changed the text');
    // #138 `main · "‹main's value›"` / `‹cut› · "‹cut's value›"` /
    //      `Original · "‹original value›"`
    expect(lineText(card)).toEqual([
      'main · "Welcome — 40% off"',
      `${CUT} · "Welcome — half price"`,
      'Original · "Welcome"',
    ]);
    // #139 `Keep main's` / `Keep ‹cut›'s` / `Keep original`
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "ours" },
      { label: `Keep ${CUT}'s`, choice: "theirs" },
      { label: "Keep original", choice: "base" },
    ]);
    expect(card.chosen).toBeNull();
  });

  it("#137a volume — the clip is named from the ORIGINAL", () => {
    const card = oneCard(
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "volume",
          value: 60,
        },
      ],
      [
        {
          op: "propertyChange",
          clipId: "interview",
          property: "volume",
          value: 30,
        },
      ],
    );
    // #137a `"‹clip›" — both cuts changed the volume`
    expect(card.title).toBe('"Interview" — both cuts changed the volume');
    // #138 — values render like the Compare rows (#119-#121): `Volume 60%`.
    expect(lineText(card)).toEqual([
      "main · Volume 60%",
      `${CUT} · Volume 30%`,
      "Original · Volume 100%",
    ]);
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "ours" },
      { label: `Keep ${CUT}'s`, choice: "theirs" },
      { label: "Keep original", choice: "base" },
    ]);
  });

  it("#137h trimmed — the D4(4) Trimmed words, `now` only on the two cuts", () => {
    const card = oneCard(
      [{ op: "trim", clipId: "interview", edge: "end", delta: t(-24) }],
      [{ op: "trim", clipId: "interview", edge: "end", delta: t(-48) }],
    );
    // #137h `"‹clip›" — both cuts trimmed it`, lines
    // `main · now ends ‹tc›` / `‹cut› · now ends ‹tc›` / `Original · ends ‹tc›`
    expect(card.title).toBe('"Interview" — both cuts trimmed it');
    expect(lineText(card)).toEqual([
      "main · now ends 00:00:19:00",
      `${CUT} · now ends 00:00:18:00`,
      "Original · ends 00:00:20:00",
    ]);
  });

  it("#137i fallback — an engine field with no words of its own", () => {
    // `source-bounds` is not reachable from normal editing, so the record is
    // hand-built; the presenter is pure and takes the records it is given.
    const start = conflictBase();
    const ours = apply(start, {
      op: "propertyChange",
      clipId: "interview",
      property: "volume",
      value: 40,
    });
    const theirs = apply(start, {
      op: "propertyChange",
      clipId: "interview",
      property: "volume",
      value: 80,
    });
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
    const record: ConflictRecord = { conflict, composed: ours };
    const [card] = presentConflictCards({
      base: start,
      ours,
      theirs,
      after: ours,
      cutName: CUT,
      conflicts: [record],
      choices: {},
    });
    // #137i `"‹clip›" — both cuts changed it`; the lines carry no value.
    expect(card.title).toBe('"Interview" — both cuts changed it');
    expect(card.lines.map((line) => line.value)).toEqual(["", "", ""]);
  });
});

describe("Case 2 (#140-#142) — one side removed it", () => {
  it("#140 title · #141 two lines, no Original · #142 two buttons", () => {
    const card = oneCard(
      [{ op: "deleteClip", clipId: "broll" }],
      [{ op: "move", clipId: "broll", newStart: t(600) }],
    );
    expect(card.bucket).toBe(2);
    // #140 `‹clip› — main removed it, ‹cut› moved it` — the remover first.
    expect(card.title).toBe(`B-roll — main removed it, ${CUT} moved it`);
    // #141 `main · Removed` / `‹cut› · Moved to ‹tc›`; no Original line.
    expect(lineText(card)).toEqual([
      "main · Removed",
      `${CUT} · Moved to 00:00:25:00`,
    ]);
    // #142 `Keep main's` / `Keep ‹cut›'s` — no `Keep original` in Case 2.
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "delete" },
      { label: `Keep ${CUT}'s`, choice: "clip" },
    ]);
  });

  it("#140a + #140b: the cut removed it, main trimmed it — the buttons swap", () => {
    const card = oneCard(
      [{ op: "trim", clipId: "broll", edge: "end", delta: t(-24) }],
      [{ op: "deleteClip", clipId: "broll" }],
    );
    // #140a `‹clip› — ‹cut› removed it, main ‹verb› it`; #140b verb `trimmed`.
    expect(card.title).toBe(`B-roll — ${CUT} removed it, main trimmed it`);
    expect(lineText(card)).toEqual([
      "main · End trimmed by 24 frames",
      `${CUT} · Removed`,
    ]);
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "clip" },
      { label: `Keep ${CUT}'s`, choice: "delete" },
    ]);
  });

  it("#140c slipped · #140d split · #140e text · #140f a property", () => {
    const removeBroll: Command = { op: "deleteClip", clipId: "broll" };
    const titleOf = (ourCommand: Command): string =>
      oneCard([ourCommand], [removeBroll]).title;

    expect(titleOf({ op: "slip", clipId: "broll", delta: t(12) })).toBe(
      `B-roll — ${CUT} removed it, main slipped it`,
    );
    expect(titleOf({ op: "split", clipId: "broll", at: t(780) })).toBe(
      `B-roll — ${CUT} removed it, main split it`,
    );
    expect(
      titleOf({
        op: "propertyChange",
        clipId: "broll",
        property: "opacity",
        value: 50,
      }),
    ).toBe(`B-roll — ${CUT} removed it, main changed the opacity`);
    // #140e — a text clip, and the text verb.
    expect(
      oneCard(
        [
          {
            op: "propertyChange",
            clipId: "welcome",
            property: "textContent",
            value: "Hello",
          },
        ],
        [{ op: "deleteClip", clipId: "welcome" }],
      ).title,
    ).toBe(`"Welcome" — ${CUT} removed it, main changed the text`);
  });
});

describe("Case 3 (#143-#145) — two clips overlap", () => {
  it("#143 title with the intersection · #144 lines by side · #145 buttons", () => {
    const card = cardsFor(
      [{ op: "move", clipId: "intro", newStart: t(600) }],
      [{ op: "move", clipId: "broll", newStart: t(620) }],
    ).find((c) => c.bucket === 3);
    expect(card).toBeDefined();
    // #143 `"‹clip A›" and "‹clip B›" overlap on ‹track› (‹tc›–‹tc›)`
    expect(card!.title).toBe(
      '"B-roll" and "Intro" overlap on V1 (00:00:25:20–00:00:27:00)',
    );
    // #144 `‹clip A› · from ‹cut›` / `‹clip B› · from main` /
    //      `Original · (this spot was empty)`
    expect(lineText(card!)).toEqual([
      `B-roll · from ${CUT}`,
      "Intro · from main",
      "Original · (this spot was empty)",
    ]);
    // #145 `Move "‹clip A›" later` / `Move "‹clip B›" later` / `Keep original`
    expect(card!.buttons).toEqual([
      { label: 'Move "B-roll" later', choice: "shift-a" },
      { label: 'Move "Intro" later', choice: "shift-b" },
      { label: "Keep original", choice: "base" },
    ]);
  });
});
