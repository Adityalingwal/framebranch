/**
 * C6 — the idempotency register's exact numbers (docs/11 C6, docs/09 #16).
 *
 * The register's BEHAVIOUR is G1/G2's subject (replay, and the
 * different-endpoint refusal). What is checked here is the part of C6 that
 * only shows up over time and at the door:
 *   C6 (1) the ticket is a browser `crypto.randomUUID()`;
 *   C6 (4) rows have a 24h per-row TTL, swept inline — no scheduler, and
 *          the table is never emptied wholesale.
 * The two silent auto-retries and the banner (C6 (2)/(3)) are client
 * behaviour and belong to the UI milestone.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { tickets } from "../src/db/schema";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
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

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

const edit = async (s: Session, rev: number, value: number): Promise<void> => {
  expectOk(
    await post(
      postOps,
      "/api/ops",
      {
        branch: "main",
        workingRev: rev,
        ticket: ticket(),
        command: {
          op: "propertyChange",
          clipId: "clip-1",
          property: "volume",
          value,
        },
      },
      s,
    ),
  );
};

describe("C6 — idempotency register", () => {
  it("C6: a ticket row older than the 24h TTL is swept by the next write", async () => {
    const s = await session();
    await edit(s, 0, 80);

    const old = ticket();
    expectOk(
      await post(postCommit, "/api/commit", { branch: "main", ticket: old }, s),
    );
    const beforeSweep = await getDb().select().from(tickets);
    // one row per mutating call so far (the edit and this commit)
    expect(beforeSweep).toHaveLength(2);
    expect(beforeSweep.map((row) => row.ticket)).toContain(old);

    // Age that row past its TTL (the only thing a clock would have done).
    await getDb()
      .update(tickets)
      .set({ createdAt: sql`now() - interval '25 hours'` })
      .where(eq(tickets.ticket, old));

    await edit(s, 1, 70);
    const fresh = ticket();
    expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", ticket: fresh },
        s,
      ),
    );

    // Swept inline by that write: the expired row is gone and the live ones
    // are untouched (the table is never emptied wholesale).
    const rows = await getDb().select().from(tickets);
    expect(rows.map((row) => row.ticket)).not.toContain(old);
    expect(rows.map((row) => row.ticket)).toContain(fresh);
  });

  it("C6: a ticket that is not a UUID is refused at the door", async () => {
    const s = await session();
    const call = await post(
      postCommit,
      "/api/commit",
      { branch: "main", ticket: "not-a-uuid" },
      s,
    );
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
    expect(await getDb().select().from(tickets)).toHaveLength(0);
  });
});
