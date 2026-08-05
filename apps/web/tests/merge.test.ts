/**
 * Merge endpoints — POST merge / merge/resolve / merge/abort (docs/11 C4 (4)
 * + F6), including **G4**, the one G-group test M7a left for M7b
 * (docs/12 T2, F11 amendment): merge finalize when a head has moved →
 * E_STALE_HEAD and no half-merge commit.
 *
 * Real Postgres, handlers called directly. The heads are moved by REAL
 * commits through the normal path, not by touching rows behind the code's
 * back — a CAS test that fakes the race proves nothing.
 */

import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { MergeConflict, MergeCounts, Timeline } from "@framebranch/engine";

import { branches, commits, mergeAttempts } from "../src/db/schema";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postMerge } from "../src/app/api/merge/route";
import { POST as postMergeAbort } from "../src/app/api/merge/abort/route";
import { POST as postMergeResolve } from "../src/app/api/merge/resolve/route";
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

type TimelineData = {
  timeline: Timeline;
  workingRev: number;
  pendingCount: number;
};
type MergeStarted = {
  attemptId: string;
  conflicts: MergeConflict[];
  counts: MergeCounts;
};
type MergeDone = { done: true; mergeCommitId: string };
type Resolved = { counts: MergeCounts; conflicts: MergeConflict[] };

const AGENT = "agent-branch";

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

async function edit(
  s: Session,
  branch: string,
  rev: number,
  command: unknown,
): Promise<number> {
  const data = expectOk(
    await post(
      postOps,
      "/api/ops",
      { branch, workingRev: rev, ticket: ticket(), command },
      s,
    ),
  ) as { workingRev: number };
  return data.workingRev;
}

async function save(s: Session, branch: string): Promise<string> {
  const data = expectOk(
    await post(postCommit, "/api/commit", { branch, ticket: ticket() }, s),
  ) as { commitId: string };
  return data.commitId;
}

const volume = (value: number) => ({
  op: "propertyChange",
  clipId: "clip-1",
  property: "volume",
  value,
});
const moveC = (start: number) => ({
  op: "move",
  clipId: "clip-3",
  newStart: { value: start, rate: 24 },
});

const commitCount = async (): Promise<number> =>
  (await getDb().select({ id: commits.id }).from(commits)).length;

const mergeCommits = async () =>
  getDb().select().from(commits).where(isNotNull(commits.parent2Id));

const attemptRows = async () => getDb().select().from(mergeAttempts);

const headOf = async (name: string): Promise<string> => {
  const rows = await getDb()
    .select()
    .from(branches)
    .where(eq(branches.name, name));
  return rows[0].headCommitId;
};

const timelineOf = async (s: Session, branch: string): Promise<Timeline> =>
  (
    expectOk(
      await get(getTimeline, `/api/timeline?branch=${branch}`, s),
    ) as TimelineData
  ).timeline;

/** A branch off `main`, then one committed edit on ONE side only. */
async function oneSidedBranches(s: Session): Promise<void> {
  expectOk(
    await post(
      postBranch,
      "/api/branch",
      { name: AGENT, from: "main", ticket: ticket() },
      s,
    ),
  );
  await edit(s, AGENT, 0, volume(40));
  await save(s, AGENT);
}

/** A branch off `main`, then edits on BOTH sides of the SAME two units. */
async function conflictingBranches(s: Session): Promise<void> {
  expectOk(
    await post(
      postBranch,
      "/api/branch",
      { name: AGENT, from: "main", ticket: ticket() },
      s,
    ),
  );
  let rev = await edit(s, AGENT, 0, volume(40));
  await edit(s, AGENT, rev, moveC(460));
  await save(s, AGENT);

  rev = await edit(s, "main", 0, volume(80));
  await edit(s, "main", rev, moveC(470));
  await save(s, "main");
}

const startMergeCall = async (s: Session, t = ticket()) =>
  post(postMerge, "/api/merge", { from: AGENT, into: "main", ticket: t }, s);

describe("C4 (4) — POST merge", () => {
  it("F6: a merge with ZERO conflicts finalizes immediately and leaves no draft row", async () => {
    const s = await session();
    await oneSidedBranches(s);
    const headInto = await headOf("main");
    const headFrom = await headOf(AGENT);

    const data = expectOk(await startMergeCall(s)) as MergeDone;
    expect(data.done).toBe(true);

    // C3: parent2_id is set — and ONLY on this commit.
    const merges = await mergeCommits();
    expect(merges).toHaveLength(1);
    expect(merges[0].id).toBe(data.mergeCommitId);
    expect(merges[0].parentId).toBe(headInto);
    expect(merges[0].parent2Id).toBe(headFrom);
    // docs/09 #9 + Q1: a merge commit is ALWAYS a full snapshot.
    expect(merges[0].snapshotDistance).toBe(0);

    // Nothing is left behind: the two-phase flow's phase 2 was empty.
    expect(await attemptRows()).toHaveLength(0);

    // `into` moved, `from` did NOT.
    expect(await headOf("main")).toBe(data.mergeCommitId);
    expect(await headOf(AGENT)).toBe(headFrom);

    // The one-sided change is present in the merged result.
    const merged = await timelineOf(s, "main");
    const clip = merged.tracks[0].clips.find((c) => c.id === "clip-1") as {
      properties: { volume?: number };
    };
    expect(clip.properties.volume).toBe(40);
  });

  it("B3.2/B3.3: conflicts open ONE draft row, then resolving them one by one finalizes and deletes it", async () => {
    const s = await session();
    await conflictingBranches(s);

    const started = expectOk(await startMergeCall(s)) as MergeStarted;
    expect(started.conflicts.length).toBe(2);
    expect(started.counts).toEqual({ total: 2, resolved: 0, remaining: 2 });
    expect(await attemptRows()).toHaveLength(1);
    // No commit yet — a merge writes only to merge_attempts until finalize.
    expect(await mergeCommits()).toHaveLength(0);

    const first = expectOk(
      await post(
        postMergeResolve,
        "/api/merge/resolve",
        {
          attemptId: started.attemptId,
          conflictId: started.conflicts[0].conflictId,
          choice: "ours",
          ticket: ticket(),
        },
        s,
      ),
    ) as Resolved;
    // B3.4: the count stays honest — one answered, one still open.
    expect(first.counts.resolved).toBe(1);
    expect(first.counts.remaining).toBe(1);
    expect(first.counts.total).toBe(2);
    expect(await attemptRows()).toHaveLength(1);

    const last = expectOk(
      await post(
        postMergeResolve,
        "/api/merge/resolve",
        {
          attemptId: started.attemptId,
          conflictId: first.conflicts[0].conflictId,
          choice: "theirs",
          ticket: ticket(),
        },
        s,
      ),
    ) as MergeDone;
    expect(last.done).toBe(true);

    const merges = await mergeCommits();
    expect(merges).toHaveLength(1);
    expect(merges[0].id).toBe(last.mergeCommitId);
    // C3: "finalize/abort par YE ROW delete" — in the same transaction.
    expect(await attemptRows()).toHaveLength(0);
  });

  it("C7: re-answering with the SAME choice is a normal success; a DIFFERENT one is E_MERGE_PRECONDITION", async () => {
    const s = await session();
    await conflictingBranches(s);
    const started = expectOk(await startMergeCall(s)) as MergeStarted;
    const target = started.conflicts[0].conflictId;

    expectOk(
      await post(
        postMergeResolve,
        "/api/merge/resolve",
        {
          attemptId: started.attemptId,
          conflictId: target,
          choice: "ours",
          ticket: ticket(),
        },
        s,
      ),
    );

    const again = await post(
      postMergeResolve,
      "/api/merge/resolve",
      {
        attemptId: started.attemptId,
        conflictId: target,
        choice: "ours",
        ticket: ticket(),
      },
      s,
    );
    expect(again.body.ok).toBe(true);

    const replaced = await post(
      postMergeResolve,
      "/api/merge/resolve",
      {
        attemptId: started.attemptId,
        conflictId: target,
        choice: "theirs",
        ticket: ticket(),
      },
      s,
    );
    expect(expectError(replaced).code).toBe("E_MERGE_PRECONDITION");
  });

  it("F6: merge/abort deletes the draft and leaves BOTH branches bit-for-bit untouched", async () => {
    const s = await session();
    await conflictingBranches(s);

    const beforeMain = await timelineOf(s, "main");
    const beforeAgent = await timelineOf(s, AGENT);
    const headMain = await headOf("main");
    const headAgent = await headOf(AGENT);
    const before = await commitCount();

    const started = expectOk(await startMergeCall(s)) as MergeStarted;
    const aborted = expectOk(
      await post(
        postMergeAbort,
        "/api/merge/abort",
        { attemptId: started.attemptId, ticket: ticket() },
        s,
      ),
    ) as { aborted: true };

    expect(aborted.aborted).toBe(true);
    expect(await attemptRows()).toHaveLength(0);
    // DISCARD: no commit is created at all (docs/09 #5).
    expect(await commitCount()).toBe(before);
    expect(await headOf("main")).toBe(headMain);
    expect(await headOf(AGENT)).toBe(headAgent);
    expect(await timelineOf(s, "main")).toEqual(beforeMain);
    expect(await timelineOf(s, AGENT)).toEqual(beforeAgent);

    // The draft is gone, so the id is no longer resolvable.
    const stale = await post(
      postMergeAbort,
      "/api/merge/abort",
      { attemptId: started.attemptId, ticket: ticket() },
      s,
    );
    expect(expectError(stale).code).toBe("E_MERGE_PRECONDITION");
  });

  it("E_BAD_REQUEST: a branch cannot be merged into itself", async () => {
    const s = await session();
    const call = await post(
      postMerge,
      "/api/merge",
      { from: "main", into: "main", ticket: ticket() },
      s,
    );
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });

  it("Item 6a(4): merge auto-seals BOTH branches when they are dirty", async () => {
    const s = await session();
    await conflictingBranches(s);
    await edit(s, "main", 2, volume(55));
    await edit(s, AGENT, 2, volume(35));
    const before = await commitCount();

    expectOk(await startMergeCall(s));

    // two seals (+ no merge commit yet: the merge has conflicts)
    const sealed = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.name, "Auto — before merge"));
    expect(sealed).toHaveLength(2);
    expect(await commitCount()).toBe(before + 2);
    const mainView = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(mainView.pendingCount).toBe(0);
  });

  it("#16: a retried merge with the SAME ticket replays and creates no second draft", async () => {
    const s = await session();
    await conflictingBranches(s);
    const t = ticket();

    const first = expectOk(await startMergeCall(s, t)) as MergeStarted;
    const retry = expectOk(await startMergeCall(s, t)) as MergeStarted;

    expect(retry.attemptId).toBe(first.attemptId);
    expect(await attemptRows()).toHaveLength(1);
  });

  it("#16: a retried merge/resolve with the SAME ticket replays and does NOT answer twice", async () => {
    const s = await session();
    await conflictingBranches(s);
    const started = expectOk(await startMergeCall(s)) as MergeStarted;
    const t = ticket();
    const body = {
      attemptId: started.attemptId,
      conflictId: started.conflicts[0].conflictId,
      choice: "ours",
      ticket: t,
    };

    const first = expectOk(
      await post(postMergeResolve, "/api/merge/resolve", body, s),
    ) as Resolved;
    const retry = expectOk(
      await post(postMergeResolve, "/api/merge/resolve", body, s),
    ) as Resolved;

    expect(retry).toEqual(first);
    const rows = await attemptRows();
    // B3.3's parchi has exactly ONE answer in it, not two.
    expect(Object.keys(rows[0].choices as object)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// G4 — docs/12 T2 (F11): the both-parents CAS at finalize (docs/09 #8)
// ---------------------------------------------------------------------------

describe("G-group — merge finalize CAS (docs/12 T2 F11)", () => {
  /**
   * Open a merge with conflicts, answer all but the last, then move ONE
   * branch's head with a real commit and answer the last conflict. The
   * finalize must refuse and write NOTHING.
   */
  async function stalenessRun(
    moving: "main" | typeof AGENT,
  ): Promise<{ code: string; before: Snapshot; after: Snapshot }> {
    const s = await session();
    await conflictingBranches(s);
    const started = expectOk(await startMergeCall(s)) as MergeStarted;
    expect(started.conflicts.length).toBe(2);

    const afterFirst = expectOk(
      await post(
        postMergeResolve,
        "/api/merge/resolve",
        {
          attemptId: started.attemptId,
          conflictId: started.conflicts[0].conflictId,
          choice: "ours",
          ticket: ticket(),
        },
        s,
      ),
    ) as Resolved;
    expect(afterFirst.counts.remaining).toBe(1);

    // …the head moves for real, through the normal edit + save path.
    // Both branches carry workingRev 2 here (two accepted edits each).
    await edit(s, moving, 2, {
      op: "propertyChange",
      clipId: "clip-2",
      property: "volume",
      value: 12,
    });
    await save(s, moving);

    const before = await snapshot(s);
    const call = await post(
      postMergeResolve,
      "/api/merge/resolve",
      {
        attemptId: started.attemptId,
        conflictId: afterFirst.conflicts[0].conflictId,
        choice: "theirs",
        ticket: ticket(),
      },
      s,
    );
    const code = expectError(call).code;
    return { code, before, after: await snapshot(s) };
  }

  type Snapshot = {
    commits: number;
    mergeCommits: number;
    heads: [string, string];
    timelines: [Timeline, Timeline];
  };

  async function snapshot(s: Session): Promise<Snapshot> {
    return {
      commits: await commitCount(),
      mergeCommits: (await mergeCommits()).length,
      heads: [await headOf("main"), await headOf(AGENT)],
      timelines: [await timelineOf(s, "main"), await timelineOf(s, AGENT)],
    };
  }

  it("G4: the INTO branch moving under an open merge → E_STALE_HEAD and no half-merge commit", async () => {
    const { code, before, after } = await stalenessRun("main");
    expect(code).toBe("E_STALE_HEAD");
    // (b) no new commit at all, (c) no two-parent commit exists,
    // (d) both heads and both timelines are exactly what they were.
    expect(after.commits).toBe(before.commits);
    expect(after.mergeCommits).toBe(0);
    expect(after.heads).toEqual(before.heads);
    expect(after.timelines).toEqual(before.timelines);
    // The draft survived the rollback, so the user can restart from it.
    expect(await attemptRows()).toHaveLength(1);
  });

  it("G4: the FROM branch moving under an open merge → E_STALE_HEAD too (docs/09 #8 revalidates BOTH)", async () => {
    const { code, before, after } = await stalenessRun(AGENT);
    expect(code).toBe("E_STALE_HEAD");
    expect(after.commits).toBe(before.commits);
    expect(after.mergeCommits).toBe(0);
    expect(after.heads).toEqual(before.heads);
    expect(after.timelines).toEqual(before.timelines);
    expect(await attemptRows()).toHaveLength(1);
  });
});
