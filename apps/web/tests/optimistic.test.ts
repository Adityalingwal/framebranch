// Guard: optimistic result (client) must equal the server result for the same command.
// Fails if computeOptimisticResult diverges from the engine's own applyCommand.
import { describe, expect, it } from "vitest";

import { applyCommand } from "@framebranch/engine";
import type { Command, Timeline } from "@framebranch/engine";

import {
  computeOptimisticResult,
  isOptimisticVerb,
  OPTIMISTIC_VERBS,
} from "../src/lib/optimistic";

const RATE = 24;
const t = (value: number) => ({ value, rate: RATE });
const range = (start: number, duration: number) => ({
  start: t(start),
  duration: t(duration),
});

function fixtureTimeline(): Timeline {
  return {
    projectRate: RATE,
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [
          {
            id: "A",
            mediaRefId: "mV",
            sourceRange: range(0, 48),
            timelineRange: range(0, 48),
            properties: { volume: 80 },
            lineage: { rootId: "A", span: range(0, 48) },
          },
          {
            id: "B",
            mediaRefId: "mV",
            sourceRange: range(60, 48),
            timelineRange: range(96, 48),
            properties: {},
            lineage: { rootId: "B", span: range(0, 48) },
          },
        ],
      },
      {
        id: "x1",
        kind: "text",
        clips: [
          {
            id: "TX",
            timelineRange: range(0, 24),
            textContent: "Welcome",
            textStyle: { font: "Arial", size: 48, color: "#ffffff" },
            lineage: { rootId: "TX", span: range(0, 24) },
          },
        ],
      },
    ],
    mediaRefs: [
      {
        id: "mV",
        kind: "video",
        url: "/media/interview.mp4",
        hash: "h1",
        sourceRate: RATE,
        durationInSource: t(480),
      },
    ],
  };
}

/** One command per opt-in verb, table-driven for readability. */
const COMMANDS: { name: string; command: Command }[] = [
  { name: "move", command: { op: "move", clipId: "B", newStart: t(200) } },
  {
    name: "trim (start)",
    command: { op: "trim", clipId: "B", edge: "start", delta: t(-12) },
  },
  {
    name: "trim (end)",
    command: { op: "trim", clipId: "A", edge: "end", delta: t(12) },
  },
  { name: "slip", command: { op: "slip", clipId: "A", delta: t(6) } },
  { name: "split", command: { op: "split", clipId: "A", at: t(24) } },
  {
    name: "propertyChange (volume)",
    command: {
      op: "propertyChange",
      clipId: "A",
      property: "volume",
      value: 55,
    },
  },
  { name: "deleteClip", command: { op: "deleteClip", clipId: "B" } },
  { name: "rippleDelete", command: { op: "rippleDelete", clipId: "A" } },
  // A rejected command must also match — rollback depends on the ERROR
  // being identical, not just the success path.
  {
    name: "trim producing E_INVALID_RANGE (rejected on both sides alike)",
    command: { op: "trim", clipId: "A", edge: "end", delta: t(-1000) },
  },
];

describe("optimistic.ts — optimistic result == server result", () => {
  it.each(COMMANDS)(
    "$name: computeOptimisticResult(tl, cmd) equals applyCommand(tl, cmd)",
    ({ command }) => {
      const timeline = fixtureTimeline();
      const optimistic = computeOptimisticResult(timeline, command);
      // This IS what the server computes (apps/api/ops/route.ts calls the
      // same function on the same input) — asserting equality here is
      // asserting the client and server never diverge.
      const server = applyCommand(timeline, command);
      expect(optimistic).toEqual(server);
    },
  );

  it("every opt-in verb is supported; addClip is excluded on purpose because it mints ids", () => {
    expect([...OPTIMISTIC_VERBS].sort()).toEqual(
      [
        "deleteClip",
        "move",
        "propertyChange",
        "rippleDelete",
        "slip",
        "split",
        "trim",
      ].sort(),
    );
    expect(isOptimisticVerb("addClip")).toBe(false);
  });

  it("rule (a): an unlisted verb is not silently optimistic — computeOptimisticResult is not even the right call for it, isOptimisticVerb says so", () => {
    // addClip is the one verb NOT in the list (see header comment) — the
    // wrapper (hooks.ts) uses `isOptimisticVerb` as its ONLY gate, so this
    // is the guarantee that a forgotten verb defaults to server-first.
    expect(isOptimisticVerb("addClip")).toBe(false);
  });
});
