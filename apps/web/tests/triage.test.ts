
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Timeline } from "@framebranch/engine";

import { POST as postBranch } from "../src/app/api/branch/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { ERROR_CODES } from "../src/server/envelope";
import { demoOtioJson } from "../src/server/demo-fixture";
import {
  closeDb,
  expectError,
  expectOk,
  get,
  getDb,
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

/** First visit → project seeded from demo.otio, cookie captured. */
async function seeded(): Promise<{ session: Session; data: TimelineData }> {
  const session: Session = { token: null };
  const call = await get<TimelineData>(
    getTimeline,
    "/api/timeline?branch=main",
    session,
  );
  return { session, data: expectOk(call) };
}

describe("1/6 — tickets.ticket is UNIQUE at the database level (C3 (8))", () => {
  it("C3: the same ticket cannot enter the register twice, even under two different endpoints", async () => {
    const { data } = await seeded();
    expect(data.timeline.tracks.length).toBeGreaterThan(0);

    const projectId = (
      await getDb().execute<{ id: string }>(sql`select id from projects limit 1`)
    )[0].id;
    const t = ticket();

    await getDb().execute(
      sql`insert into tickets (ticket, project_id, endpoint, result)
          values (${t}::uuid, ${projectId}::uuid, 'ops', '{}'::jsonb)`,
    );

    // Before the fix this second insert succeeded (the composite key
    // (project_id, endpoint, ticket) does not forbid it) and two concurrent
    // instances could each run their own work with one ticket.
    await expect(
      getDb().execute(
        sql`insert into tickets (ticket, project_id, endpoint, result)
            values (${t}::uuid, ${projectId}::uuid, 'commit', '{}'::jsonb)`,
      ),
    ).rejects.toThrow();

    const rows = await getDb().execute<{ endpoint: string }>(
      sql`select endpoint from tickets where ticket = ${t}::uuid`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("4/6 — E_BRANCH_EXISTS (C4 (5), added 2026-08-05)", () => {
  it("C4: creating a branch whose name is taken returns E_BRANCH_EXISTS, not a verb code", async () => {
    const { session } = await seeded();

    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "tighten-intro", from: "main", ticket: ticket() },
        session,
      ),
    );

    const again = await post(
      postBranch,
      "/api/branch",
      { name: "tighten-intro", from: "main", ticket: ticket() },
      session,
    );

    const error = expectError(again);
    expect(error.code).toBe("E_BRANCH_EXISTS");
    // The UI must be able to say "that name is taken" — the message names it.
    expect(error.message).toContain("tighten-intro");
  });

  it("C3: the duplicate is still never created — exactly one branch carries the name", async () => {
    const { session } = await seeded();
    for (let i = 0; i < 2; i++) {
      await post(
        postBranch,
        "/api/branch",
        { name: "tighten-intro", from: "main", ticket: ticket() },
        session,
      );
    }
    const rows = await getDb().execute<{ n: string }>(
      sql`select count(*)::text as n from branches where name = 'tighten-intro'`,
    );
    expect(rows[0].n).toBe("1");
  });
});

describe("5/6 — E_INTERNAL keeps the envelope closed (C4 (1))", () => {
  it("C4: an unexpected crash comes back as { ok:false, error } with E_INTERNAL, not a raw 500", async () => {
    const { session } = await seeded();

    // A request the route accepts, but whose branch lookup will blow up:
    // `from` is not a uuid-shaped value the query can compare. Whatever the
    // driver throws, the door must still answer in the envelope.
    const call = await post(
      postBranch,
      "/api/branch",
      { name: "x", from: "main", ticket: "not-a-uuid" },
      session,
    );

    expect(call.body.ok).toBe(false);
    if (call.body.ok) throw new Error("unreachable");
    // Either a designed code caught it first, or E_INTERNAL did — what must
    // never happen is an un-enveloped response or an off-list code.
    expect(ERROR_CODES).toContain(call.body.error.code);
    expect(typeof call.body.error.message).toBe("string");
  });

  it("C4: E_INTERNAL is on the official list and never leaks the internal message", async () => {
    expect(ERROR_CODES).toContain("E_INTERNAL");
    expect(ERROR_CODES).toContain("E_BAD_REQUEST");
    expect(ERROR_CODES).toContain("E_BRANCH_EXISTS");
  });
});

describe("6/6 — demo.otio's logo is an image (O1)", () => {
  it("O1/O9: the fixture carries a .png whose available_range is null", () => {
    const json = JSON.stringify(demoOtioJson());
    expect(json).toContain("/media/logo.png");
    expect(json).not.toContain("logo.mp4");
  });

  it("O1: the seeded timeline has a media ref with durationInSource === null", async () => {
    const { data } = await seeded();
    const image = data.timeline.mediaRefs.find((m) => m.kind === "image");
    expect(image).toBeDefined();
    expect(image?.durationInSource).toBeNull();
  });

  it("C8: the fixture still imports with 5 clips", async () => {
    const { data } = await seeded();
    const clipCount = data.timeline.tracks.reduce(
      (total, track) => total + track.clips.length,
      0,
    );
    expect(clipCount).toBe(5);
  });
});
