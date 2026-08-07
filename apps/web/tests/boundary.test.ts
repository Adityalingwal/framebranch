// API route tests: POST restore/import/export/agent-simulate/demo-reset and GET diff.
// Real Postgres, route handlers called directly.
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { importOtio } from "@framebranch/engine";
import type { DiffResult, ImportWarning, Timeline } from "@framebranch/engine";

import { commits, ops, projects, snapshots } from "../src/db/schema";
import { POST as postAgent } from "../src/app/api/agent/simulate/route";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postDemoReset } from "../src/app/api/demo/reset/route";
import { GET as getDiff } from "../src/app/api/diff/route";
import { POST as postExport } from "../src/app/api/export/route";
import { GET as getHistory } from "../src/app/api/history/route";
import { POST as postImport } from "../src/app/api/import/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { POST as postRestore } from "../src/app/api/restore/route";
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
type CommitData = { commitId: string; name: string };

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

async function save(s: Session, branch = "main"): Promise<CommitData> {
  return expectOk(
    await post(postCommit, "/api/commit", { branch, ticket: ticket() }, s),
  ) as CommitData;
}

const volume = (clipId: string, value: number) => ({
  op: "propertyChange",
  clipId,
  property: "volume",
  value,
});

const commitCount = async (): Promise<number> =>
  (await getDb().select({ id: commits.id }).from(commits)).length;

const view = async (s: Session, branch = "main"): Promise<TimelineData> =>
  expectOk(
    await get(getTimeline, `/api/timeline?branch=${branch}`, s),
  ) as TimelineData;

/** The session's OWN root (import) commit, read through the public door. */
const rootCommitOf = async (s: Session): Promise<string> => {
  const data = expectOk(await get(getHistory, "/api/history", s)) as {
    commits: { commitId: string; parents: string[] }[];
  };
  const root = data.commits.find((c) => c.parents.length === 0);
  if (!root) throw new Error("no root commit");
  return root.commitId;
};

const volumeOf = (timeline: Timeline, clipId: string): number | undefined =>
  (
    timeline.tracks[0].clips.find((c) => c.id === clipId) as {
      properties: { volume?: number };
    }
  ).properties.volume;

// ---------------------------------------------------------------------------
// POST restore — docs/09 Item 6c + Q1
// ---------------------------------------------------------------------------

describe("C4 (4) — POST restore", () => {
  it("Item 6c/Q1: restore is a NEW forced-snapshot commit and the old history is intact", async () => {
    const s = await session();
    await edit(s, "main", 0, volume("clip-1", 80));
    const v2 = await save(s);
    await edit(s, "main", 1, volume("clip-1", 20));
    await save(s);
    const before = await commitCount();

    const restored = expectOk(
      await post(
        postRestore,
        "/api/restore",
        { branch: "main", commitId: v2.commitId, ticket: ticket() },
        s,
      ),
    ) as CommitData;

    // A NEW commit — not the one restored from (history moves forward).
    expect(restored.commitId).not.toBe(v2.commitId);
    expect(restored.name).toBe(`Restored version "${v2.name}"`);
    expect(await commitCount()).toBe(before + 1);

    const row = (
      await getDb()
        .select()
        .from(commits)
        .where(eq(commits.id, restored.commitId))
    )[0];
    expect(row.snapshotDistance).toBe(0);
    expect(row.parent2Id).toBeNull();
    const snap = await getDb()
      .select()
      .from(snapshots)
      .where(eq(snapshots.commitId, restored.commitId));
    expect(snap).toHaveLength(1);
    // No ops rows: restore has no verb representation (Q1).
    const opRows = await getDb()
      .select()
      .from(ops)
      .where(eq(ops.commitId, restored.commitId));
    expect(opRows).toHaveLength(0);

    // The content is the restored version's content.
    expect(volumeOf((await view(s)).timeline, "clip-1")).toBe(80);
    // …and the version we restored FROM still exists, untouched.
    const old = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.id, v2.commitId));
    expect(old).toHaveLength(1);
  });

  it("Item 6a(4): restore auto-seals a dirty branch first", async () => {
    const s = await session();
    await edit(s, "main", 0, volume("clip-1", 80));
    const v2 = await save(s);
    await edit(s, "main", 1, volume("clip-1", 33)); // pending, not saved

    expectOk(
      await post(
        postRestore,
        "/api/restore",
        { branch: "main", commitId: v2.commitId, ticket: ticket() },
        s,
      ),
    );

    const sealed = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.name, "Auto — before restore"));
    expect(sealed).toHaveLength(1);
    expect((await view(s)).pendingCount).toBe(0);
  });

  it("HLD#14: a commit id from ANOTHER project is not restorable", async () => {
    const alice = await session();
    const hers = await save(alice); // her import commit, returned as a no-op
    const bob = await session();

    const call = await post(
      postRestore,
      "/api/restore",
      { branch: "main", commitId: hers.commitId, ticket: ticket() },
      bob,
    );
    // No "commit not found" code exists in C4 — see the M7b findings.
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
    expect(await commitCount()).toBe(2); // one import commit each, nothing new
  });
});

// ---------------------------------------------------------------------------
// POST import — O7/O8 + F7 + HLD #10
// ---------------------------------------------------------------------------

const time = (value: number, rate = 24) => ({
  OTIO_SCHEMA: "RationalTime.1",
  rate,
  value,
});
const range = (start: number, duration: number, rate = 24) => ({
  OTIO_SCHEMA: "TimeRange.1",
  start_time: time(start, rate),
  duration: time(duration, rate),
});
/** A hand-written document, deliberately NOT produced by `exportOtio`. */
const otioDoc = (children: unknown[]) => ({
  OTIO_SCHEMA: "Timeline.1",
  name: "imported fixture",
  metadata: {},
  tracks: {
    OTIO_SCHEMA: "Stack.1",
    name: "tracks",
    markers: [],
    effects: [],
    metadata: {},
    children: [
      {
        OTIO_SCHEMA: "Track.1",
        name: "Video",
        kind: "Video",
        markers: [],
        effects: [],
        metadata: {},
        children,
      },
    ],
  },
});
const otioClip = () => ({
  OTIO_SCHEMA: "Clip.1",
  name: "solo",
  source_range: range(0, 48),
  media_reference: {
    OTIO_SCHEMA: "ExternalReference.1",
    target_url: "/media/other.mp4",
    available_range: range(0, 240),
    metadata: {},
  },
  effects: [],
  markers: [],
  metadata: {},
});
const otioTransition = () => ({
  OTIO_SCHEMA: "Transition.1",
  name: "cross-dissolve",
  transition_type: "SMPTE_Dissolve",
  in_offset: time(2),
  out_offset: time(2),
  metadata: {},
});

describe("C4 (4) — POST import", () => {
  it("F7/O8: warnings land in import_warnings AND come back as skippedItems", async () => {
    const s = await session();
    const doc = otioDoc([otioClip(), otioTransition()]);

    const data = expectOk(
      await post(
        postImport,
        "/api/import",
        { branch: "main", otioJson: doc, ticket: ticket() },
        s,
      ),
    ) as { commitId: string; skippedItems: ImportWarning[] };

    // O8: assert on the CODE, never on English prose.
    expect(data.skippedItems.map((w) => w.code)).toEqual([
      "skipped-unsupported",
    ]);

    const row = (
      await getDb().select().from(commits).where(eq(commits.id, data.commitId))
    )[0];
    expect(row.importWarnings).toEqual(data.skippedItems);
    // Q1: an import commit is always a full snapshot, with no ops.
    expect(row.snapshotDistance).toBe(0);
    expect(
      await getDb()
        .select()
        .from(snapshots)
        .where(eq(snapshots.commitId, row.id)),
    ).toHaveLength(1);
    expect(
      await getDb().select().from(ops).where(eq(ops.commitId, row.id)),
    ).toHaveLength(0);

    // HLD #10: a fresh start — the imported document replaced the timeline.
    const after = await view(s);
    expect(after.timeline.tracks).toHaveLength(1);
    expect(after.timeline.tracks[0].clips).toHaveLength(1);
  });

  it("M7b fix: a re-import lands on the project's EXISTING rate, not the file's", async () => {
    const s = await session();
    // A hand-written 30fps document: one clip, 60 frames (2s) long.
    const doc = otioDoc([
      {
        OTIO_SCHEMA: "Clip.1",
        name: "thirty",
        source_range: range(0, 60, 30),
        media_reference: {
          OTIO_SCHEMA: "ExternalReference.1",
          target_url: "/media/other.mp4",
          available_range: range(0, 300, 30),
          metadata: {},
        },
        effects: [],
        markers: [],
        metadata: {},
      },
    ]);

    expectOk(
      await post(
        postImport,
        "/api/import",
        { branch: "main", otioJson: doc, ticket: ticket() },
        s,
      ),
    );

    // The demo project is 24fps; import must never change project_rate
    // (the old bug: it took the file's own rate instead — see the M7b
    // findings' witness: 240@24 vs 300@30, same 10s, called a 60-frame
    // extension).
    const projectRow = (await getDb().select().from(projects))[0];
    expect(projectRow.projectRate).toBe(24);

    // The file's 60 frames @ 30fps (2s) convert to 48 frames @ 24fps — a
    // real unit conversion, not a raw copy of the file's own frame count.
    const after = await view(s);
    expect(after.timeline.projectRate).toBe(24);
    const clip = after.timeline.tracks[0].clips[0];
    expect(clip.timelineRange.duration).toEqual({ value: 48, rate: 24 });
  });

  it("H11: a garbage payload is E_INVALID_OTIO and NOTHING is written", async () => {
    const s = await session();
    await edit(s, "main", 0, volume("clip-1", 80)); // dirty, so a seal COULD have run
    const before = await commitCount();

    const call = await post(
      postImport,
      "/api/import",
      {
        branch: "main",
        otioJson: { not: "an otio document" },
        ticket: ticket(),
      },
      s,
    );
    expect(expectError(call).code).toBe("E_INVALID_OTIO");

    // The rollback took the auto-seal with it: nothing at all was written.
    expect(await commitCount()).toBe(before);
    const still = await view(s);
    expect(still.pendingCount).toBe(1);
  });

  it("E_BAD_REQUEST: a body without otioJson never reaches the engine", async () => {
    const s = await session();
    const call = await post(
      postImport,
      "/api/import",
      { branch: "main", ticket: ticket() },
      s,
    );
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// POST export — docs/09 #4
// ---------------------------------------------------------------------------

describe("C4 (4) — POST export", () => {
  it("HLD#4: export seals a dirty branch, ties the file to that head, and round-trips", async () => {
    const s = await session();
    await edit(s, "main", 0, volume("clip-1", 80));
    const before = await commitCount();

    const data = expectOk(
      await post(
        postExport,
        "/api/export",
        { branch: "main", ticket: ticket() },
        s,
      ),
    ) as { otioJson: unknown; commitId: string; name: string };

    // The seal ran with the name docs/09 #4 fixes verbatim…
    expect(data.name).toBe("Auto — before export");
    expect(await commitCount()).toBe(before + 1);
    expect((await view(s)).pendingCount).toBe(0);
    // …and the returned commitId IS the branch's head.
    const head = (
      await getDb().select().from(commits).where(eq(commits.id, data.commitId))
    )[0];
    expect(head.name).toBe("Auto — before export");

    // The locked shape has mediaWarnings OPTIONAL; there is no honest signal
    // for it in V1 (docs/09 #12/#13), so the field is omitted entirely.
    expect(Object.keys(data as object).sort()).toEqual([
      "commitId",
      "name",
      "otioJson",
    ]);

    // O10-style structural round-trip through the real importer.
    const back = importOtio(data.otioJson);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const exported = (await view(s)).timeline;
    expect(back.timeline.projectRate).toBe(exported.projectRate);
    expect(back.timeline.tracks.map((t) => t.kind)).toEqual(
      exported.tracks.map((t) => t.kind),
    );
    expect(back.timeline.tracks.map((t) => t.clips.length)).toEqual(
      exported.tracks.map((t) => t.clips.length),
    );
    expect(volumeOf(back.timeline, back.timeline.tracks[0].clips[0].id)).toBe(
      80,
    );
  });

  it("HLD#4: exporting a CLEAN branch creates no commit and names the existing head", async () => {
    const s = await session();
    const before = await commitCount();
    const data = expectOk(
      await post(
        postExport,
        "/api/export",
        { branch: "main", ticket: ticket() },
        s,
      ),
    ) as { commitId: string; name: string };
    expect(await commitCount()).toBe(before);
    expect(data.name).toBe('Imported "demo.otio"');
  });
});

// ---------------------------------------------------------------------------
// POST agent/simulate — docs/09 #3 + C8
// ---------------------------------------------------------------------------

describe("C4 (4) — POST agent/simulate", () => {
  /**
   * C8's script places clip D at 0:20 on the video track (frames 480-600 @
   * 24fps). The M7b fixture fix shortened clip C to 18s-20s (frames
   * 432-480) so the untouched fixture no longer overlaps D there — the
   * choreography's step 2 (branch "tighten-intro" off pristine main, no
   * other edits before the agent runs) now matches the locked script
   * as-is, with no workaround needed.
   */
  async function branchForAgentRun(s: Session): Promise<string> {
    const name = "tighten-intro";
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name, from: "main", ticket: ticket() },
        s,
      ),
    );
    return name;
  }

  it("Item 6a(2)/#3: a run is ONE commit whose ops all carry actor 'agent'", async () => {
    const s = await session();
    const branch = await branchForAgentRun(s);
    const before = await commitCount();

    const data = expectOk(
      await post(
        postAgent,
        "/api/agent/simulate",
        { branch, script: "tighten-intro", ticket: ticket() },
        s,
      ),
    ) as { commitId: string; name: string; actor: string; opsApplied: number };

    expect(data.actor).toBe("agent");
    expect(data.name).toBe('Agent run — "tighten-intro"');
    expect(data.opsApplied).toBe(4); // C8: volume, caption delete, add D, B trim
    expect(await commitCount()).toBe(before + 1);

    const row = (
      await getDb().select().from(commits).where(eq(commits.id, data.commitId))
    )[0];
    expect(row.actor).toBe("agent");

    const opRows = await getDb()
      .select()
      .from(ops)
      .where(eq(ops.commitId, data.commitId))
      .orderBy(asc(ops.seq));
    expect(opRows).toHaveLength(4);
    expect(opRows.every((op) => op.actor === "agent")).toBe(true);
    expect(opRows.map((op) => op.seq)).toEqual([0, 1, 2, 3]);

    // The edits are really there: A's volume is the agent's 40 and the
    // caption is gone.
    const after = await view(s, branch);
    expect(volumeOf(after.timeline, "clip-1")).toBe(40);
    expect(after.timeline.tracks[2].clips).toHaveLength(0);
  });

  /**
   * Independent of the fixture layout: pre-shrinks B (clip-2) to 1s so the
   * script's OWN 4th command — its -2s end-trim on B — pushes B's duration
   * negative. The script's first three commands (volume, caption delete,
   * add D) still succeed against this branch's timeline and land in the
   * in-memory `applied` list before the 4th one fails, so this still proves
   * a part-way failure writes nothing (same shape as the original test).
   */
  async function branchWithShortB(s: Session): Promise<string> {
    const name = "short-b";
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name, from: "main", ticket: ticket() },
        s,
      ),
    );
    await edit(s, name, 0, {
      op: "trim",
      clipId: "clip-2",
      edge: "end",
      delta: { value: -168, rate: 24 }, // 192 frames -> 24 frames (1s)
    });
    await save(s, name);
    return name;
  }

  it("#3: a script that fails part-way writes NOTHING at all", async () => {
    const s = await session();
    const branch = await branchWithShortB(s);
    const before = await commitCount();
    const beforeOpsCount = (await getDb().select().from(ops)).length;
    const beforeTimeline = (await view(s, branch)).timeline;

    // B is down to 1s; the script's own -2s end-trim on B (its 4th and
    // last command) would leave it at -1s — nonpositive duration.
    const call = await post(
      postAgent,
      "/api/agent/simulate",
      { branch, script: "tighten-intro", ticket: ticket() },
      s,
    );
    expect(expectError(call).code).toBe("E_INVALID_RANGE");

    expect(await commitCount()).toBe(before);
    expect(await getDb().select().from(ops)).toHaveLength(beforeOpsCount);
    expect((await view(s, branch)).timeline).toEqual(beforeTimeline);
  });

  it("E_BAD_REQUEST: an unknown script name never touches the branch", async () => {
    const s = await session();
    const call = await post(
      postAgent,
      "/api/agent/simulate",
      { branch: "main", script: "no-such-script", ticket: ticket() },
      s,
    );
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// POST demo/reset — docs/09 #5 (DISCARD)
// ---------------------------------------------------------------------------

describe("C4 (4) — POST demo/reset", () => {
  it("HLD#5: the project row and cookie survive, the state is the fresh fixture", async () => {
    const s = await session();
    const projectBefore = (await getDb().select().from(projects))[0];
    await edit(s, "main", 0, volume("clip-1", 80));
    const doomed = await save(s);
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "scratch", from: "main", ticket: ticket() },
        s,
      ),
    );

    const t = ticket();
    const data = expectOk(
      await post(postDemoReset, "/api/demo/reset", { ticket: t }, s),
    ) as { done: true };
    expect(data.done).toBe(true);

    // Identity survives: same project row, same token → same cookie.
    const projectAfter = await getDb().select().from(projects);
    expect(projectAfter).toHaveLength(1);
    expect(projectAfter[0].id).toBe(projectBefore.id);
    expect(projectAfter[0].ownerToken).toBe(projectBefore.ownerToken);
    expect(projectAfter[0].projectRate).toBe(projectBefore.projectRate);

    // State is fresh: one import commit, `main` only, five clips, no edits.
    const rows = await getDb().select().from(commits);
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.id)).not.toContain(doomed.commitId);
    const fresh = await view(s);
    expect(fresh.pendingCount).toBe(0);
    expect(fresh.workingRev).toBe(0);
    expect(
      fresh.timeline.tracks.reduce((n, t2) => n + t2.clips.length, 0),
    ).toBe(5);
    // The extra branch is gone with the rest of the state.
    const gone = await get(getTimeline, "/api/timeline?branch=scratch", s);
    expect(expectError(gone).code).toBe("E_BRANCH_NOT_FOUND");

    // #16: the retry is a replay, not a second reset.
    const seeded = (await getDb().select().from(commits))[0].id;
    const retry = expectOk(
      await post(postDemoReset, "/api/demo/reset", { ticket: t }, s),
    ) as { done: true };
    expect(retry.done).toBe(true);
    expect((await getDb().select().from(commits))[0].id).toBe(seeded);
  });
});

// ---------------------------------------------------------------------------
// GET diff — C4 (2) + C1
// ---------------------------------------------------------------------------

describe("C4 (2) — GET diff", () => {
  it("C1: the engine's sentences come back verbatim, 1:1 with entries", async () => {
    const s = await session();
    const root = (await getDb().select().from(commits))[0].id;
    await edit(s, "main", 0, volume("clip-1", 80));
    const v2 = await save(s);

    const data = expectOk(
      await get(getDiff, `/api/diff?from=${root}&to=${v2.commitId}`, s),
    ) as DiffResult;

    expect(data.entries).toHaveLength(1);
    expect(data.sentences).toHaveLength(1);
    expect(data.entries[0].kind).toBe("propertyChanged");
    expect(data.sentences[0]).toContain("olume");

    // The other direction is a real diff too (and it is not the same text).
    const back = expectOk(
      await get(getDiff, `/api/diff?from=${v2.commitId}&to=${root}`, s),
    ) as DiffResult;
    expect(back.sentences).toHaveLength(1);
    expect(back.sentences[0]).not.toBe(data.sentences[0]);
  });

  it("C1: diffing a commit against itself is empty", async () => {
    const s = await session();
    const root = (await getDb().select().from(commits))[0].id;
    const data = expectOk(
      await get(getDiff, `/api/diff?from=${root}&to=${root}`, s),
    ) as DiffResult;
    expect(data.entries).toEqual([]);
    expect(data.sentences).toEqual([]);
  });

  it("HLD#14: another project's commit is never readable through diff", async () => {
    const alice = await session();
    const hers = await rootCommitOf(alice);
    const bob = await session();
    const his = await rootCommitOf(bob);
    expect(hers).not.toBe(his);

    // Alice's commit id is simply not there for Bob — not readable, not an
    // authorization error, and never her data.
    const call = await get(getDiff, `/api/diff?from=${hers}&to=${his}`, bob);
    expect(expectError(call).code).toBe("E_BAD_REQUEST");

    // …and it still works inside her own project.
    expect(
      expectOk(await get(getDiff, `/api/diff?from=${hers}&to=${hers}`, alice)),
    ).toEqual({ entries: [], sentences: [] });
  });

  it("E_BAD_REQUEST: a missing query parameter is refused at the door", async () => {
    const s = await session();
    const root = (await getDb().select().from(commits))[0].id;
    const call = await get(getDiff, `/api/diff?from=${root}`, s);
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });
});
