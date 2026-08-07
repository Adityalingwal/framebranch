/**
 * POST /api/commit tests — snapshot cadence and no-op behaviour.
 */

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { commits, ops, snapshots, workingState } from "../src/db/schema";
import { SNAPSHOT_INTERVAL } from "../src/server/commits";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postOps } from "../src/app/api/ops/route";
import {
  closeDb,
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

type TimelineData = { workingRev: number; pendingCount: number };
type CommitData = { commitId: string; name: string };

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

/** One accepted edit on `main`. `rev` is the caller's current workingRev. */
async function edit(s: Session, rev: number, volume: number): Promise<number> {
  const data = expectOk(
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
          value: volume,
        },
      },
      s,
    ),
  ) as { workingRev: number };
  return data.workingRev;
}

describe("C4 (4) — POST commit", () => {
  it("C3: pending ops become ops rows in seq order and the working record restarts", async () => {
    const s = await session();
    let rev = await edit(s, 0, 80);
    rev = await edit(s, rev, 70);

    const commit = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", ticket: ticket() },
        s,
      ),
    ) as CommitData;

    const opRows = await getDb()
      .select()
      .from(ops)
      .where(eq(ops.commitId, commit.commitId))
      .orderBy(asc(ops.seq));
    expect(opRows.map((row) => row.seq)).toEqual([0, 1]);
    expect(
      opRows.map((row) => (row.command as { value: number }).value),
    ).toEqual([80, 70]);

    const wsRows = await getDb().select().from(workingState);
    expect(wsRows[0].pendingOps).toEqual([]);
    expect(wsRows[0].baseCommitId).toBe(commit.commitId);
    // C3: working_rev is monotonic and NEVER resets.
    expect(wsRows[0].workingRev).toBe(rev);

    const view = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(view.pendingCount).toBe(0);
    expect(view.workingRev).toBe(rev);
  });

  it("committing with nothing pending is an already-saved no-op", async () => {
    const s = await session();
    const first = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", ticket: ticket() },
        s,
      ),
    ) as CommitData;
    const rows = await getDb().select().from(commits);
    expect(rows).toHaveLength(1);
    expect(first.commitId).toBe(rows[0].id);
  });

  it("every 10th commit carries a snapshot; snapshot_distance tracks the distance", async () => {
    const s = await session();
    let rev = 0;
    const created: string[] = [];
    for (let i = 1; i <= SNAPSHOT_INTERVAL; i += 1) {
      rev = await edit(s, rev, i);
      const commit = expectOk(
        await post(
          postCommit,
          "/api/commit",
          { branch: "main", ticket: ticket() },
          s,
        ),
      ) as CommitData;
      created.push(commit.commitId);
    }

    const rows = await getDb().select().from(commits);
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The import commit is distance 0 (Q1), then 1..9, then a snapshot at 10.
    expect(created.map((id) => byId.get(id)?.snapshotDistance)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 0,
    ]);

    const snapshotRows = await getDb().select().from(snapshots);
    const snapshotIds = new Set(snapshotRows.map((row) => row.commitId));
    // Import commit + the 10th commit — nothing in between.
    expect(snapshotIds.size).toBe(2);
    expect(snapshotIds.has(created[SNAPSHOT_INTERVAL - 1])).toBe(true);
    expect(snapshotIds.has(created[0])).toBe(false);

    // The whole point of the cadence: the head still materializes exactly.
    const view = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(view.pendingCount).toBe(0);
  });

  it("Item 6a(5): the default name is a deterministic template, never AI", async () => {
    const s = await session();
    await edit(s, 0, 55);
    const commit = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", ticket: ticket() },
        s,
      ),
    ) as CommitData;
    expect(commit.name).toBe("Version 2");

    await edit(s, 1, 44);
    const named = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", name: "Tighter intro", ticket: ticket() },
        s,
      ),
    ) as CommitData;
    expect(named.name).toBe("Tighter intro");
  });
});
