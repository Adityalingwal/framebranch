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
 *   #137-#139       a conflict card's title, lines and buttons
 *
 * Pure only: no database, no React. The component-level literals (`Mark
 * version`, `Bring in now`, …) are pinned by the sheet audit itself, not
 * here — a test that retypes a JSX literal asserts nothing.
 */

import { describe, expect, it } from "vitest";

import { applyCommand, recompute } from "@framebranch/engine";
import type {
  Clip,
  Command,
  MediaRef,
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
import { presentConflictCards } from "../src/server/conflict-cards";
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
// #137-#139 — a conflict card's three parts
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("#137-#139 — the conflict card's shape", () => {
  it("both cuts changed one property → title, three named lines, three buttons", () => {
    const start = base();
    const ours = apply(start, {
      op: "propertyChange",
      clipId: "interview",
      property: "volume",
      value: 60,
    });
    const theirs = apply(start, {
      op: "propertyChange",
      clipId: "interview",
      property: "volume",
      value: 30,
    });
    const run = recompute(start, ours, theirs, {});
    if (!run.ok) throw new Error(`engine refused: ${run.error.message}`);
    expect(run.conflicts).toHaveLength(1);

    const [card] = presentConflictCards({
      base: start,
      ours,
      theirs,
      after: run.timeline,
      cutName: "priya-music",
      conflicts: run.conflicts.map((conflict) => ({
        conflict,
        composed: run.composed ?? run.timeline,
      })),
      choices: {},
    });

    // #137a — the clip is named from the ORIGINAL, and the phrase says
    // which property collided.
    expect(card.title).toBe('"Interview" — both cuts changed the volume');
    // #138 — one line per side: main, the cut by NAME, then Original.
    expect(card.lines.map((line) => [line.label, line.value])).toEqual([
      ["main", "Volume 60%"],
      ["priya-music", "Volume 30%"],
      ["Original", "Volume 100%"],
    ]);
    // #139 — cut names verbatim; never yours/theirs/agent's.
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "ours" },
      { label: "Keep priya-music's", choice: "theirs" },
      { label: "Keep original", choice: "base" },
    ]);
    expect(card.chosen).toBeNull();
  });
});
