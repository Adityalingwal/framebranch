// Bring-in endpoint tests (POST /api/merge). Real Postgres. Heads moved
// through the normal commit path — a faked race proves nothing.
//
// S1 shape: the draft table and the resolve/abort routes are retired, so
// only the door rules and the zero-conflict landing are covered here. S3
// rewrites this file around `GET /api/merge/preview` + the one-transaction
// land (token, choices, stale messages).
import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Timeline } from "@framebranch/engine";

import { branches, commits } from "../src/db/schema";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postMerge } from "../src/app/api/merge/route";
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
type MergeDone = { done: true; mergeCommitId: string };

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
    await post(
      postCommit,
      "/api/commit",
      { branch, name: `Marked on ${branch}`, ticket: ticket() },
      s,
    ),
  ) as { commitId: string };
  return data.commitId;
}

const volume = (value: number) => ({
  op: "propertyChange",
  clipId: "clip-1",
  property: "volume",
  value,
});

const mergeCommits = async () =>
  getDb().select().from(commits).where(isNotNull(commits.parent2Id));

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

const landCall = async (s: Session, t = ticket()) =>
  post(postMerge, "/api/merge", { from: AGENT, into: "main", ticket: t }, s);

describe("C4 (4) — POST merge", () => {
  it("F1: Bring in only lands on main — any other `into` is rejected at the door, nothing written", async () => {
    const s = await session();
    await oneSidedBranches(s);
    const headInto = await headOf("main");
    const headFrom = await headOf(AGENT);
    const commitsBefore = (await getDb().select().from(commits)).length;

    const err = expectError(
      await post(
        postMerge,
        "/api/merge",
        { from: "main", into: AGENT, ticket: ticket() },
        s,
      ),
    );
    expect(err.code).toBe("E_BAD_REQUEST");
    expect(err.message).toContain('"main"');

    // no seal, no card, heads untouched
    expect(await headOf("main")).toBe(headInto);
    expect(await headOf(AGENT)).toBe(headFrom);
    expect((await getDb().select().from(commits)).length).toBe(commitsBefore);
  });

  it("F6: a bring-in with ZERO conflicts lands one two-parent card", async () => {
    const s = await session();
    await oneSidedBranches(s);
    const headInto = await headOf("main");
    const headFrom = await headOf(AGENT);

    const data = expectOk(await landCall(s)) as MergeDone;
    expect(data.done).toBe(true);

    // parent2_id is set — and ONLY on this commit.
    const merges = await mergeCommits();
    expect(merges).toHaveLength(1);
    expect(merges[0].id).toBe(data.mergeCommitId);
    expect(merges[0].parentId).toBe(headInto);
    expect(merges[0].parent2Id).toBe(headFrom);
    // A merge commit is always a full snapshot.
    expect(merges[0].snapshotDistance).toBe(0);

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

  it("a retried bring-in with the SAME ticket replays the same answer", async () => {
    const s = await session();
    await oneSidedBranches(s);
    const t = ticket();

    const first = expectOk(await landCall(s, t)) as MergeDone;
    const retry = expectOk(await landCall(s, t)) as MergeDone;

    expect(retry.mergeCommitId).toBe(first.mergeCommitId);
    expect(await mergeCommits()).toHaveLength(1);
  });
});
