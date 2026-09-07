/**
 * B0 foundation tests — data model (C-A), cut-scoped read APIs (C-C) and
 * identity plumbing.
 *
 * C-A: commits.kind / actor_name, branches.created_by, working_state
 * .last_editor_name, project_events appended inside the same transaction.
 * C-C: GET /api/branch (heads + Ready), GET /api/history?cut (chain, order,
 * changes), GET /api/diff?cut&a&b (now as a side, older → newer, codes).
 */

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  branches,
  commits,
  projectEvents,
  workingState,
} from "../src/db/schema";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import {
  GET as getBranches,
  POST as postBranch,
} from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { GET as getDiff } from "../src/app/api/diff/route";
import type { DiffResponse } from "../src/app/api/diff/route";
import { GET as getHistory } from "../src/app/api/history/route";
import type { HistoryItem } from "../src/app/api/history/route";
import { POST as postMerge } from "../src/app/api/merge/route";
import { POST as postOps } from "../src/app/api/ops/route";
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

const NAME_HEADER = { "X-Editor-Name": "Priya" };

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

type BranchList = {
  branches: {
    name: string;
    head: string;
    createdBy: string | null;
    ready: null | { note: string; by: string; at: string; editedSince: boolean };
  }[];
};

async function editOn(
  s: Session,
  branch: string,
  rev: number,
  clipId: string,
  volume: number,
): Promise<number> {
  const data = expectOk(
    await post(
      postOps,
      "/api/ops",
      {
        branch,
        workingRev: rev,
        ticket: ticket(),
        command: { op: "propertyChange", clipId, property: "volume", value: volume },
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
  const data = expectOk(
    await get(getHistory, `/api/history?cut=${cut}`, s),
  ) as { commits: HistoryItem[] };
  return data.commits;
}

async function edit(
  s: Session,
  rev: number,
  volume: number,
  headers: Record<string, string> = {},
): Promise<number> {
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
      headers,
    ),
  ) as { workingRev: number };
  return data.workingRev;
}

describe("C-A — data model", () => {
  it("the seed card is kind=seed with no actor name, and appends one event", async () => {
    await session();
    const rows = await getDb().select().from(commits);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("seed");
    expect(rows[0].actorName).toBeNull();

    const events = await getDb().select().from(projectEvents);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("commit-created");
    expect(events[0].payload).toMatchObject({ kind: "seed", branch: "main" });
  });

  it("a Mark carries kind=mark and the X-Editor-Name header as actor_name", async () => {
    const s = await session();
    await edit(s, 0, 55, NAME_HEADER);
    const commit = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", name: "Client pick", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    ) as { commitId: string };

    const [row] = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.id, commit.commitId));
    expect(row.kind).toBe("mark");
    expect(row.actorName).toBe("Priya");
    expect(row.actor).toBe("user");

    const events = await getDb()
      .select()
      .from(projectEvents)
      .orderBy(asc(projectEvents.id));
    expect(events.map((e) => e.kind)).toEqual([
      "commit-created",
      "commit-created",
    ]);
    expect(events[1].payload).toMatchObject({
      commitId: commit.commitId,
      kind: "mark",
      actorName: "Priya",
    });
  });

  it("a mutating request WITHOUT the header falls back to `Editor` (B0 leniency)", async () => {
    const s = await session();
    await edit(s, 0, 55);
    const commit = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", name: "x", ticket: ticket() },
        s,
      ),
    ) as { commitId: string };
    const [row] = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.id, commit.commitId));
    expect(row.actorName).toBe("Editor");
  });

  it("an accepted op records last_editor_name on the working state", async () => {
    const s = await session();
    await edit(s, 0, 55, NAME_HEADER);
    const [ws] = await getDb().select().from(workingState);
    expect(ws.lastEditorName).toBe("Priya");
  });

  it("creating a cut stores created_by and appends a branch-created event", async () => {
    const s = await session();
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "priya-music", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    const rows = await getDb()
      .select()
      .from(branches)
      .where(eq(branches.name, "priya-music"));
    expect(rows[0].createdBy).toBe("Priya");
    expect(rows[0].readyAt).toBeNull();

    const main = await getDb()
      .select()
      .from(branches)
      .where(eq(branches.name, "main"));
    expect(main[0].createdBy).toBeNull();

    const events = await getDb()
      .select()
      .from(projectEvents)
      .orderBy(asc(projectEvents.id));
    expect(events.at(-1)?.kind).toBe("branch-created");
    expect(events.at(-1)?.payload).toMatchObject({
      branch: "priya-music",
      createdBy: "Priya",
    });
  });
});

describe("C-C — GET /api/branch", () => {
  it("lists every cut with head, creator and Ready (null), `main` first then A→Z", async () => {
    const s = await session();
    for (const name of ["zed", "alpha"]) {
      expectOk(
        await post(
          postBranch,
          "/api/branch",
          { name, from: "main", ticket: ticket() },
          s,
          NAME_HEADER,
        ),
      );
    }
    const data = expectOk(await get(getBranches, "/api/branch", s)) as BranchList;
    expect(data.branches.map((b) => b.name)).toEqual(["main", "alpha", "zed"]);
    const seed = (await getDb().select().from(commits))[0].id;
    expect(data.branches[0]).toEqual({
      name: "main",
      head: seed,
      createdBy: null,
      ready: null,
    });
    expect(data.branches[1].createdBy).toBe("Priya");
    expect(data.branches[1].head).toBe(seed);
  });

  it("exposes the Ready fields when a cut is marked ready (columns written directly — no route yet)", async () => {
    const s = await session();
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "priya-music", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    await getDb()
      .update(branches)
      .set({
        readyNote: "music done",
        readyBy: "Priya",
        readyAt: new Date("2026-09-07T12:00:00Z"),
        readyWorkingRev: 0,
      })
      .where(eq(branches.name, "priya-music"));

    const before = expectOk(await get(getBranches, "/api/branch", s)) as BranchList;
    expect(before.branches[1].ready).toEqual({
      note: "music done",
      by: "Priya",
      at: "2026-09-07T12:00:00.000Z",
      editedSince: false,
    });

    // an edit moves the working rev → "Edited since ready", head unchanged
    await editOn(s, "priya-music", 0, "clip-1", 30);
    const after = expectOk(await get(getBranches, "/api/branch", s)) as BranchList;
    expect(after.branches[1].ready?.editedSince).toBe(true);
    expect(after.branches[1].head).toBe(before.branches[1].head);
  });
});

describe("C-C — GET /api/history?cut (B2 chain)", () => {
  it("a cut whose head is a bring-in lists both sides' ancestors once, time desc, tie → child above parent", async () => {
    const s = await session();
    const seed = (await getDb().select().from(commits))[0].id;

    // priya-music: one card
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "priya-music", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    await editOn(s, "priya-music", 0, "clip-4", 30); // music volume
    const priyaCard = await mark(s, "priya-music", "Quieter music");

    // main: one card + a dirty edit that the merge seals (same tx as the bring-in)
    await editOn(s, "main", 0, "clip-1", 70);
    const mainCard = await mark(s, "main", "Louder interview");
    await editOn(s, "main", 1, "clip-2", 65);

    const merged = expectOk(
      await post(
        postMerge,
        "/api/merge",
        { from: "priya-music", into: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    ) as { done: true; mergeCommitId: string };
    expect(merged.done).toBe(true);

    const main = await historyOf(s, "main");
    expect(main.map((c) => c.kind)).toEqual([
      "bring-in",
      "auto",
      "mark",
      "mark",
      "seed",
    ]);
    expect(main[0].commitId).toBe(merged.mergeCommitId);
    expect(main[0].parents).toHaveLength(2);
    expect(main[0].parents[1]).toBe(priyaCard);
    // the seal and the bring-in share a transaction timestamp → child above
    expect(main[0].createdAt).toBe(main[1].createdAt);
    expect(main[0].parents[0]).toBe(main[1].commitId);
    // both sides present exactly once, seed last
    expect(new Set(main.map((c) => c.commitId)).size).toBe(main.length);
    expect(main.map((c) => c.commitId)).toContain(priyaCard);
    expect(main.map((c) => c.commitId)).toContain(mainCard);
    expect(main.at(-1)?.commitId).toBe(seed);
    // time desc throughout
    for (let i = 1; i < main.length; i += 1) {
      expect(new Date(main[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(main[i].createdAt).getTime(),
      );
    }
    // actor names + changes (presenter row counts vs first parent)
    expect(main[0].actorName).toBe("Priya");
    expect(main.at(-1)?.actorName).toBeNull();
    expect(main.at(-1)?.changes).toBe(0); // seed
    expect(main[1].changes).toBe(1); // the seal: one volume change
    expect(main[0].changes).toBe(1); // bring-in vs into side: priya's music change

    // the other cut sees only its own chain
    const priya = await historyOf(s, "priya-music");
    expect(priya.map((c) => c.commitId)).toEqual([priyaCard, seed]);
  });
});

describe("C-C — GET /api/diff?cut&a&b", () => {
  it("canonicalises older → newer by History order; `now` is always newer", async () => {
    const s = await session();
    const seed = (await getDb().select().from(commits))[0].id;
    await editOn(s, "main", 0, "clip-1", 70);
    const card = await mark(s, "main", "Louder");
    await editOn(s, "main", 1, "clip-2", 20); // pending → Now differs from head

    const ab = expectOk(
      await get(getDiff, `/api/diff?cut=main&a=${seed}&b=${card}`, s),
    ) as DiffResponse;
    const ba = expectOk(
      await get(getDiff, `/api/diff?cut=main&a=${card}&b=${seed}`, s),
    ) as DiffResponse;
    expect(ab.older).toBe("a");
    expect(ba.older).toBe("b");
    expect(ba.rows).toEqual(ab.rows);
    expect(ab.count).toBe(1);

    const headNow = expectOk(
      await get(getDiff, `/api/diff?cut=main&a=now&b=${card}`, s),
    ) as DiffResponse;
    expect(headNow.older).toBe("b");
    expect(headNow.count).toBe(1);
    expect(headNow.rows[0].clipName).toBe("B-roll");
    expect(headNow.runtime).toEqual({
      before: "00:00:22:00",
      after: "00:00:22:00",
    });
  });

  it("a commit that exists but is not on this cut's chain → 400 E_BAD_REQUEST", async () => {
    const s = await session();
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "priya-music", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    await editOn(s, "main", 0, "clip-1", 70);
    const mainCard = await mark(s, "main", "Louder");
    const call = await get(
      getDiff,
      `/api/diff?cut=priya-music&a=${mainCard}&b=now`,
      s,
    );
    expect(call.status).toBe(400);
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });
});
