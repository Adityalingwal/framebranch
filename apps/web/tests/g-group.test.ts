// Server/state integration tests: G1 retry, G2 ticket+endpoint, G3 branch-switch, G5 token mismatch.
// G4 (merge finalize CAS) is in merge.test.ts. Real Postgres — tests exercise DB-level behaviour.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Timeline } from "@framebranch/engine";

import { commits, workingState } from "../src/db/schema";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postBranchSwitch } from "../src/app/api/branch/switch/route";
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

type TimelineData = {
  timeline: Timeline;
  workingRev: number;
  pendingCount: number;
};

async function newSession(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

async function editMain(
  s: Session,
  rev: number,
  volume: number,
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
    ),
  ) as { workingRev: number };
  return data.workingRev;
}

const commitCount = async (): Promise<number> =>
  (await getDb().select({ id: commits.id }).from(commits)).length;

describe("G-group — server/state integration (docs/12 T2 F11)", () => {
  it("G1: response-lost retry — the same ticket returns the stored result and creates NO second commit", async () => {
    const s = await newSession();
    await editMain(s, 0, 80);

    const before = await commitCount();
    expect(before).toBe(1); // just the import commit

    const t = ticket();
    const first = expectOk(
      await post(postCommit, "/api/commit", { branch: "main", ticket: t }, s),
    ) as { commitId: string; name: string };
    const afterFirst = await commitCount();
    expect(afterFirst).toBe(2);

    // The response was "lost": the client retries with the SAME ticket.
    const retry = expectOk(
      await post(postCommit, "/api/commit", { branch: "main", ticket: t }, s),
    ) as { commitId: string; name: string };
    const afterRetry = await commitCount();

    expect(retry).toEqual(first); // stored result, not recomputed
    expect(afterRetry).toBe(afterFirst); // 2 before, 2 after — zero extra work
  });

  it("G2: the same ticket on a DIFFERENT endpoint is an explicit E_TICKET_REUSED", async () => {
    const s = await newSession();
    await editMain(s, 0, 80);

    const t = ticket();
    expectOk(
      await post(postCommit, "/api/commit", { branch: "main", ticket: t }, s),
    );

    const reused = await post(
      postOps,
      "/api/ops",
      {
        branch: "main",
        workingRev: 1,
        ticket: t,
        command: {
          op: "propertyChange",
          clipId: "clip-1",
          property: "volume",
          value: 60,
        },
      },
      s,
    );
    expect(expectError(reused).code).toBe("E_TICKET_REUSED");

    // F2: no payload comparison exists — the SAME endpoint with the same
    // ticket replays the stored result instead of erroring.
    const replay = await post(
      postCommit,
      "/api/commit",
      { branch: "main", ticket: t },
      s,
    );
    expect(replay.body.ok).toBe(true);
  });

  it("G3: switching away from a dirty branch auto-seals it — a commit IS created and pending IS cleared", async () => {
    const s = await newSession();

    // Branch created while main is clean → no seal here.
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "tighten-intro", from: "main", ticket: ticket() },
        s,
      ),
    );
    const beforeDirty = await commitCount();

    // Now make main dirty: two accepted edits, nothing saved.
    let rev = await editMain(s, 0, 80);
    rev = await editMain(s, rev, 70);
    const dirtyView = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(dirtyView.pendingCount).toBe(2);

    const switched = expectOk(
      await post(
        postBranchSwitch,
        "/api/branch/switch",
        { from: "main", to: "tighten-intro", ticket: ticket() },
        s,
      ),
    ) as TimelineData & { sealedCommitId?: string };

    // (a) the auto-seal commit exists
    expect(switched.sealedCommitId).toBeTruthy();
    expect(await commitCount()).toBe(beforeDirty + 1);
    const sealed = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.id, switched.sealedCommitId as string));
    expect(sealed[0].name).toBe("Auto — before branch switch");

    // (b) pending is cleared on the branch we left
    const mainView = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(mainView.pendingCount).toBe(0);
    expect(mainView.workingRev).toBe(rev); // monotonic, not reset

    // and the switch returned the TARGET's view, which never saw those edits
    expect(switched.pendingCount).toBe(0);
    const targetClip = switched.timeline.tracks[0].clips.find(
      (c) => c.id === "clip-1",
    ) as { properties: { volume?: number } };
    expect(targetClip.properties.volume).toBeUndefined();
  });

  it("G5: a capability-token mismatch is 404 and never returns another project's data", async () => {
    const alice = await newSession();
    // Something only Alice's project has.
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "alice-secret", from: "main", ticket: ticket() },
        alice,
      ),
    );

    const bob = await newSession();
    expect(bob.token).not.toBe(alice.token);

    // (a) an unknown token is 404 — not 403, not a fresh project
    const forged = await get(getTimeline, "/api/timeline?branch=main", {
      token: "not-a-real-token",
    });
    expect(forged.status).toBe(404);
    expect(expectError(forged).code).toBe("E_PROJECT_NOT_FOUND");

    // (b) a VALID token cannot reach another project's branch
    const crossRead = await get(
      getTimeline,
      "/api/timeline?branch=alice-secret",
      bob,
    );
    expect(crossRead.status).toBe(404);
    expect(expectError(crossRead).code).toBe("E_BRANCH_NOT_FOUND");

    // (c) nor write to it
    const crossWrite = await post(
      postOps,
      "/api/ops",
      {
        branch: "alice-secret",
        workingRev: 0,
        ticket: ticket(),
        command: { op: "deleteClip", clipId: "clip-1" },
      },
      bob,
    );
    expect(expectError(crossWrite).code).toBe("E_BRANCH_NOT_FOUND");

    // (d) and Alice's rows are untouched: her branch still has its own
    // working record, still owned by her project.
    const aliceView = expectOk(
      await get(getTimeline, "/api/timeline?branch=alice-secret", alice),
    ) as TimelineData;
    expect(aliceView.pendingCount).toBe(0);
    const wsRows = await getDb().select().from(workingState);
    const projectIds = new Set(wsRows.map((row) => row.projectId));
    expect(projectIds.size).toBe(2); // two isolated worlds, no shared rows
  });
});
