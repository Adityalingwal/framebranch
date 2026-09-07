/**
 * B0 foundation tests — data model (C-A) + identity plumbing.
 *
 * C-A: commits.kind / actor_name, branches.created_by, working_state
 * .last_editor_name, project_events appended inside the same transaction.
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
import { POST as postBranch } from "../src/app/api/branch/route";
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

const NAME_HEADER = { "X-Editor-Name": "Priya" };

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
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
