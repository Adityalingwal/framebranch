import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Timeline } from "@framebranch/engine";

import { GET as getTimeline } from "../src/app/api/timeline/route";
import { POST as postOps } from "../src/app/api/ops/route";
import {
  closeDb,
  expectError,
  expectOk,
  get,
  post,
  resetDatabase,
  ticket,
} from "./helpers";
import type { Session } from "./helpers";

beforeEach(resetDatabase);
afterAll(closeDb);

type TimelineData = {
  timeline: Timeline;
  workingRev: number;
  pendingCount: number;
};
type OpsData = {
  workingRev: number;
  pendingCount: number;
  noChange?: true;
};

async function seeded(): Promise<{ session: Session; view: TimelineData }> {
  const session: Session = { token: null };
  const view = expectOk(
    await get(getTimeline, "/api/timeline?branch=main", session),
  ) as TimelineData;
  return { session, view };
}

describe("C4 (3) — POST ops", () => {
  it("C4: an accepted edit bumps workingRev by 1 and shows up in the working timeline", async () => {
    const { session } = await seeded();
    const data = expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: "main",
          workingRev: 0,
          ticket: ticket(),
          command: {
            op: "propertyChange",
            clipId: "clip-1",
            property: "volume",
            value: 80,
          },
        },
        session,
      ),
    ) as OpsData;
    expect(data).toEqual({ workingRev: 1, pendingCount: 1 });

    const after = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", session),
    ) as TimelineData;
    expect(after.workingRev).toBe(1);
    expect(after.pendingCount).toBe(1);
    const clip = after.timeline.tracks[0].clips.find((c) => c.id === "clip-1");
    expect(
      (clip as { properties: { volume?: number } }).properties.volume,
    ).toBe(80);
  });

  it("F9/A4: a no-change command returns noChange and does NOT move workingRev or pendingCount", async () => {
    const { session } = await seeded();
    // volume 100 == the materialized default (B3.1) → nothing changes.
    const first = expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: "main",
          workingRev: 0,
          ticket: ticket(),
          command: {
            op: "propertyChange",
            clipId: "clip-1",
            property: "volume",
            value: 100,
          },
        },
        session,
      ),
    ) as OpsData;
    expect(first).toEqual({ noChange: true, workingRev: 0, pendingCount: 0 });

    // Same-position move — A4's other named no-change case.
    const second = expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: "main",
          workingRev: 0,
          ticket: ticket(),
          command: {
            op: "move",
            clipId: "clip-1",
            newStart: { value: 0, rate: 24 },
          },
        },
        session,
      ),
    ) as OpsData;
    expect(second.noChange).toBe(true);
    expect(second.workingRev).toBe(0);

    const after = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", session),
    ) as TimelineData;
    expect(after.workingRev).toBe(0);
    expect(after.pendingCount).toBe(0);
  });

  it("rejects a stale workingRev with E_STALE_REV", async () => {
    const { session } = await seeded();
    const call = await post(
      postOps,
      "/api/ops",
      {
        branch: "main",
        workingRev: 7,
        ticket: ticket(),
        command: { op: "deleteClip", clipId: "clip-1" },
      },
      session,
    );
    expect(expectError(call).code).toBe("E_STALE_REV");
    expect(call.status).toBe(409);
  });

  it("C4: engine verb errors propagate with their own code (E_OVERLAP)", async () => {
    const { session } = await seeded();
    const call = await post(
      postOps,
      "/api/ops",
      {
        branch: "main",
        workingRev: 0,
        ticket: ticket(),
        // clip-2 starts at 240; moving it onto clip-1 (0..240) overlaps.
        command: {
          op: "move",
          clipId: "clip-2",
          newStart: { value: 0, rate: 24 },
        },
      },
      session,
    );
    expect(expectError(call).code).toBe("E_OVERLAP");
  });

  it("A3.1: an addClip replays deterministically — the minted id survives a reload", async () => {
    const { session } = await seeded();
    expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: "main",
          workingRev: 0,
          ticket: ticket(),
          command: {
            op: "addClip",
            trackId: "track-3",
            textContent: "Second caption",
            timelineRange: {
              start: { value: 200, rate: 24 },
              duration: { value: 48, rate: 24 },
            },
          },
        },
        session,
      ),
    );

    const first = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", session),
    ) as TimelineData;
    const second = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", session),
    ) as TimelineData;
    // Two independent replays of the same op list → byte-identical state.
    expect(JSON.stringify(second.timeline)).toEqual(
      JSON.stringify(first.timeline),
    );
    expect(first.timeline.tracks[2].clips).toHaveLength(2);
  });

  it("rejects a malformed body before it reaches the engine", async () => {
    const { session } = await seeded();
    const call = await post(
      postOps,
      "/api/ops",
      {
        branch: "main",
        workingRev: 0,
        ticket: ticket(),
        command: { op: "teleport", clipId: "clip-1" },
      },
      session,
    );
    // C4 (5) transport codes [ADDED 2026-08-05]: a command outside the Phase
    // A union is a malformed REQUEST, not an illegal VALUE for a clip. It
    // used to borrow E_INVALID_VALUE and the UI could not tell the two apart.
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });

  it("C4 (5): a well-formed command the ENGINE rejects keeps its own verb code, not E_BAD_REQUEST", async () => {
    const { session } = await seeded();
    // The body is valid in every schema sense — the clip simply is not there.
    // The split between the two code families is: rejected at the door (schema)
    // = E_BAD_REQUEST; rejected by the engine = that verb's own code.
    const call = await post(
      postOps,
      "/api/ops",
      {
        branch: "main",
        workingRev: 0,
        ticket: ticket(),
        command: {
          op: "move",
          clipId: "no-such-clip",
          newStart: { value: 0, rate: 24 },
        },
      },
      session,
    );
    const code = expectError(call).code;
    expect(code).not.toBe("E_BAD_REQUEST");
    expect(code).toBe("E_CLIP_NOT_FOUND");
  });
});
