/**
 * B1 tests — stored `changes` (§2.2) and the frozen-commit read API (§2.3).
 *
 * Everything in B1 above these two is client-side (top bar, History panel,
 * View mode, Restore flow); this repo has no component tests, so the API
 * level is where B1's server-visible behaviour is pinned.
 */

import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { commits } from "../src/db/schema";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { GET as getHistory } from "../src/app/api/history/route";
import type { HistoryItem } from "../src/app/api/history/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { POST as postRestore } from "../src/app/api/restore/route";
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

const NAME_HEADER = { "X-Editor-Name": "Aditya" };

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

/** The branch's current working_rev (never reset by a commit — monotonic). */
async function revOf(s: Session, branch: string): Promise<number> {
  const data = expectOk(
    await get(getTimeline, `/api/timeline?branch=${branch}`, s),
  ) as { workingRev: number };
  return data.workingRev;
}

async function editVolume(
  s: Session,
  branch: string,
  clipId: string,
  volume: number,
): Promise<number> {
  const rev = await revOf(s, branch);
  const data = expectOk(
    await post(
      postOps,
      "/api/ops",
      {
        branch,
        workingRev: rev,
        ticket: ticket(),
        command: {
          op: "propertyChange",
          clipId,
          property: "volume",
          value: volume,
        },
      },
      s,
      NAME_HEADER,
    ),
  ) as { workingRev: number };
  return data.workingRev;
}

async function mark(s: Session, branch: string, name: string): Promise<string> {
  const data = expectOk(
    await post(
      postCommit,
      "/api/commit",
      { branch, name, ticket: ticket() },
      s,
      NAME_HEADER,
    ),
  ) as { commitId: string };
  return data.commitId;
}

async function historyOf(s: Session, cut: string): Promise<HistoryItem[]> {
  const data = expectOk(await get(getHistory, `/api/history?cut=${cut}`, s)) as {
    commits: HistoryItem[];
  };
  return data.commits;
}

async function storedChanges(commitId: string): Promise<number | null> {
  const rows = await getDb()
    .select({ changes: commits.changes })
    .from(commits)
    .where(eq(commits.id, commitId));
  return rows[0].changes;
}

describe("B1 §2.2 — commits.changes is written at commit time", () => {
  it("stores the presenter's count on a Mark and the History GET reads it", async () => {
    const s = await session();
    await editVolume(s, "main", "clip-2", 50);
    await editVolume(s, "main", "clip-4", 40);
    const markId = await mark(s, "main", "Two levels");

    expect(await storedChanges(markId)).toBe(2);
    const history = await historyOf(s, "main");
    expect(history[0].commitId).toBe(markId);
    expect(history[0].changes).toBe(2);
  });

  it("stores 0 on the seed card", async () => {
    const s = await session();
    const history = await historyOf(s, "main");
    const seed = history[history.length - 1];
    expect(seed.kind).toBe("seed");
    expect(await storedChanges(seed.commitId)).toBe(0);
    expect(seed.changes).toBe(0);
  });

  it("an auto seal stores the same count its summary name was built from", async () => {
    const s = await session();
    await editVolume(s, "main", "clip-2", 50);
    // Creating a cut seals the dirty working area first (kind: auto).
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "client-alt", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    const history = await historyOf(s, "main");
    expect(history[0].kind).toBe("auto");
    expect(history[0].changes).toBe(1);
    expect(await storedChanges(history[0].commitId)).toBe(1);
  });

  it("a restore of the current content stores 0 changes", async () => {
    const s = await session();
    const history = await historyOf(s, "main");
    const seedId = history[history.length - 1].commitId;

    expectOk(
      await post(
        postRestore,
        "/api/restore",
        { branch: "main", commitId: seedId, ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    const after = await historyOf(s, "main");
    expect(after[0].kind).toBe("restore");
    expect(after[0].changes).toBe(0);
  });

  it("a restore that undoes real edits stores the count of what it put back", async () => {
    const s = await session();
    const seedId = (await historyOf(s, "main")).slice(-1)[0].commitId;
    await editVolume(s, "main", "clip-2", 50);
    await mark(s, "main", "Quieter");

    expectOk(
      await post(
        postRestore,
        "/api/restore",
        { branch: "main", commitId: seedId, ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    const after = await historyOf(s, "main");
    expect(after[0].kind).toBe("restore");
    expect(after[0].changes).toBe(1);
  });

  it("every card written on this build has a non-null changes column", async () => {
    const s = await session();
    await editVolume(s, "main", "clip-2", 50);
    await mark(s, "main", "One");
    await editVolume(s, "main", "clip-4", 30);
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "priya-music", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );

    const nulls = await getDb()
      .select({ id: commits.id })
      .from(commits)
      .where(isNull(commits.changes));
    expect(nulls).toEqual([]);
  });

  it("a legacy NULL row is filled by the first History GET and not touched again", async () => {
    const s = await session();
    await editVolume(s, "main", "clip-2", 50);
    const markId = await mark(s, "main", "Quieter");

    // Simulate a row written before migration 0003 existed.
    await getDb()
      .update(commits)
      .set({ changes: null })
      .where(eq(commits.id, markId));
    expect(await storedChanges(markId)).toBeNull();

    const first = await historyOf(s, "main");
    expect(first[0].changes).toBe(1);
    // The read wrote it back — proving the fill happens once, not per GET.
    expect(await storedChanges(markId)).toBe(1);

    // Second GET: the value is already there, so nothing is recomputed. If
    // the route ever went back to recomputing, poisoning the stored value
    // would be invisible; here it must come straight back.
    await getDb()
      .update(commits)
      .set({ changes: 99 })
      .where(eq(commits.id, markId));
    const second = await historyOf(s, "main");
    expect(second[0].changes).toBe(99);
  });
});
