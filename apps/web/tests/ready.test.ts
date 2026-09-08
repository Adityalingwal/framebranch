// F3(4) "Ready for main" — `POST/DELETE /api/branch/ready`, the clear on
// landing, and the agent marking its own cut. Real Postgres; every rev and
// head moves through the normal edit/mark path.
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { branches, projectEvents, workingState } from "../src/db/schema";
import { GET as getBranches, POST as postBranch } from "../src/app/api/branch/route";
import {
  DELETE as deleteReady,
  POST as postReady,
} from "../src/app/api/branch/ready/route";
import { POST as postBranchSwitch } from "../src/app/api/branch/switch/route";
import { POST as postAgentRun } from "../src/app/api/agent/run/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postMerge } from "../src/app/api/merge/route";
import { GET as getPreview } from "../src/app/api/merge/preview/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import type { BranchListItem } from "../src/app/api/branch/route";
import type { BringInPreview } from "../src/app/api/merge/preview/route";
import {
  closeDb,
  del,
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

const CUT = "priya-music";
const PRIYA = { "X-Editor-Name": "Priya" };
const ADITYA = { "X-Editor-Name": "Aditya" };
const NOTE = "Music bed + VO dip";

/** The demo preset's V1 clips. */
const INTERVIEW = "clip-1";

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

async function makeCut(s: Session, name = CUT): Promise<void> {
  expectOk(
    await post(
      postBranch,
      "/api/branch",
      { name, from: "main", ticket: ticket() },
      s,
      PRIYA,
    ),
  );
}

const volume = (clipId: string, value: number) => ({
  op: "propertyChange",
  clipId,
  property: "volume",
  value,
});

async function edit(
  s: Session,
  branch: string,
  rev: number,
  command: unknown = volume(INTERVIEW, 40),
  headers: Record<string, string> = PRIYA,
): Promise<number> {
  const data = expectOk(
    await post(
      postOps,
      "/api/ops",
      { branch, workingRev: rev, ticket: ticket(), command },
      s,
      headers,
    ),
  ) as { workingRev: number };
  return data.workingRev;
}

type Ready = BranchListItem["ready"];
type ReadyAnswer = { cut: string; ready: Ready };

async function markReady(
  s: Session,
  input: { cut?: string; note?: string; ticket?: string } = {},
  headers: Record<string, string> = PRIYA,
) {
  return post(
    postReady,
    "/api/branch/ready",
    {
      cut: input.cut ?? CUT,
      note: input.note ?? NOTE,
      ticket: input.ticket ?? ticket(),
    },
    s,
    headers,
  );
}

async function clearReady(
  s: Session,
  cut = CUT,
  headers: Record<string, string> = PRIYA,
) {
  return del(
    deleteReady,
    "/api/branch/ready",
    { cut, ticket: ticket() },
    s,
    headers,
  );
}

async function readyOf(s: Session, cut = CUT): Promise<Ready> {
  const data = expectOk(await get(getBranches, "/api/branch", s)) as {
    branches: BranchListItem[];
  };
  return data.branches.find((b) => b.name === cut)!.ready;
}

const rowOf = async (name: string) => {
  const rows = await getDb()
    .select()
    .from(branches)
    .where(eq(branches.name, name));
  return rows[0];
};

/** The cut's current working rev, read straight from the database. */
async function revOfCut(name: string): Promise<number> {
  const branch = await rowOf(name);
  const rows = await getDb()
    .select()
    .from(workingState)
    .where(eq(workingState.branchId, branch.id));
  return rows[0].workingRev;
}

const events = async () =>
  getDb().select().from(projectEvents).orderBy(asc(projectEvents.id));

const eventsOfKind = async (kind: string) =>
  (await events()).filter((row) => row.kind === kind);

describe("POST /api/branch/ready — marking", () => {
  it("writes the four columns, appends `ready-set`, and GET /api/branch agrees", async () => {
    const s = await session();
    await makeCut(s);
    const revBefore = await revOfCut(CUT);

    const before = Date.now();
    const answer = expectOk(await markReady(s)) as ReadyAnswer;

    expect(answer.cut).toBe(CUT);
    expect(answer.ready).toEqual({
      note: NOTE,
      by: "Priya",
      at: expect.any(String),
      editedSince: false,
    });

    const row = await rowOf(CUT);
    expect(row.readyNote).toBe(NOTE);
    // F2a: the name is the header's, never a body field.
    expect(row.readyBy).toBe("Priya");
    expect(row.readyWorkingRev).toBe(revBefore);
    expect(row.readyAt!.getTime()).toBeGreaterThanOrEqual(before - 5000);
    expect(row.readyAt!.getTime()).toBeLessThanOrEqual(Date.now() + 5000);

    const set = await eventsOfKind("ready-set");
    expect(set).toHaveLength(1);
    expect(set[0].payload).toEqual({ cut: CUT, by: "Priya", note: NOTE });

    expect(await readyOf(s)).toEqual({
      note: NOTE,
      by: "Priya",
      at: answer.ready!.at,
      editedSince: false,
    });
  });

  it("no `X-Editor-Name` header → `Editor` (the B0 leniency, unchanged)", async () => {
    const s = await session();
    await makeCut(s);
    const answer = expectOk(await markReady(s, {}, {})) as ReadyAnswer;
    expect(answer.ready!.by).toBe("Editor");
  });

  it("main is refused server-side (F1: main is never brought into itself)", async () => {
    const s = await session();
    const error = expectError(await markReady(s, { cut: "main" }));
    expect(error.code).toBe("E_BAD_REQUEST");
    expect(await eventsOfKind("ready-set")).toHaveLength(0);
  });

  it("an unknown cut is the existing 404", async () => {
    const s = await session();
    const call = await markReady(s, { cut: "nope" });
    expect(call.status).toBe(404);
    expect(expectError(call).code).toBe("E_BRANCH_NOT_FOUND");
  });

  it("the note is required: empty, whitespace and 201 chars are all 400", async () => {
    const s = await session();
    await makeCut(s);
    for (const note of ["", "   ", "x".repeat(201)]) {
      expect(expectError(await markReady(s, { note })).code).toBe(
        "E_BAD_REQUEST",
      );
    }
    expect((await rowOf(CUT)).readyAt).toBeNull();
  });

  it("an extra field is 400 (.strict(), like every other body)", async () => {
    const s = await session();
    await makeCut(s);
    const call = await post(
      postReady,
      "/api/branch/ready",
      { cut: CUT, note: NOTE, by: "Someone Else", ticket: ticket() },
      s,
      PRIYA,
    );
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });

  it("re-marking OVERWRITES (new note, new time, new rev) and appends a second event", async () => {
    const s = await session();
    await makeCut(s);
    const first = expectOk(await markReady(s)) as ReadyAnswer;
    const firstRow = await rowOf(CUT);

    const rev = await edit(s, CUT, 0);
    const second = expectOk(
      await markReady(s, { note: "Now with the outro" }, ADITYA),
    ) as ReadyAnswer;

    expect(second.ready!.note).toBe("Now with the outro");
    expect(second.ready!.by).toBe("Aditya");
    expect(second.ready!.editedSince).toBe(false);

    const row = await rowOf(CUT);
    expect(row.readyWorkingRev).toBe(rev);
    expect(row.readyWorkingRev).not.toBe(firstRow.readyWorkingRev);
    expect(row.readyAt!.getTime()).toBeGreaterThanOrEqual(
      firstRow.readyAt!.getTime(),
    );
    expect(new Date(second.ready!.at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.ready!.at).getTime(),
    );

    expect(await eventsOfKind("ready-set")).toHaveLength(2);
  });

  it("replaying the SAME ticket returns the identical answer and appends nothing", async () => {
    const s = await session();
    await makeCut(s);
    const t = ticket();
    const first = expectOk(await markReady(s, { ticket: t })) as ReadyAnswer;
    const replay = expectOk(await markReady(s, { ticket: t })) as ReadyAnswer;

    expect(replay).toEqual(first);
    expect(await eventsOfKind("ready-set")).toHaveLength(1);
  });
});

describe("editedSince — the working rev, not the head (F2a IMPL-NOTE)", () => {
  it("false → one edit makes it true → re-marking makes it false again", async () => {
    const s = await session();
    await makeCut(s);
    expectOk(await markReady(s));
    expect((await readyOf(s))!.editedSince).toBe(false);

    await edit(s, CUT, 0);
    expect((await readyOf(s))!.editedSince).toBe(true);

    expectOk(await markReady(s, { note: "Re-marked" }));
    expect((await readyOf(s))!.editedSince).toBe(false);
  });

  it("a Mark (`/api/commit`) on the Ready cut does NOT flip it — a commit keeps the rev", async () => {
    const s = await session();
    await makeCut(s);
    await edit(s, CUT, 0);
    expectOk(await markReady(s));
    expect((await readyOf(s))!.editedSince).toBe(false);

    expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: CUT, name: "Music pass", ticket: ticket() },
        s,
        PRIYA,
      ),
    );

    expect((await readyOf(s))!.editedSince).toBe(false);
  });

  it("switching away and back (which auto-seals) does NOT flip it either", async () => {
    const s = await session();
    await makeCut(s);
    await edit(s, CUT, 0);
    expectOk(await markReady(s));

    for (const [from, to] of [
      [CUT, "main"],
      ["main", CUT],
    ]) {
      expectOk(
        await post(
          postBranchSwitch,
          "/api/branch/switch",
          { from, to, ticket: ticket() },
          s,
          PRIYA,
        ),
      );
    }

    expect((await readyOf(s))!.editedSince).toBe(false);
  });
});

describe("DELETE /api/branch/ready — un-marking", () => {
  it("nulls the four columns and appends `ready-cleared { reason: 'unmarked' }`", async () => {
    const s = await session();
    await makeCut(s);
    expectOk(await markReady(s));

    const answer = expectOk(await clearReady(s)) as ReadyAnswer;
    expect(answer).toEqual({ cut: CUT, ready: null });

    const row = await rowOf(CUT);
    expect(row.readyNote).toBeNull();
    expect(row.readyBy).toBeNull();
    expect(row.readyAt).toBeNull();
    expect(row.readyWorkingRev).toBeNull();

    const cleared = await eventsOfKind("ready-cleared");
    expect(cleared).toHaveLength(1);
    expect(cleared[0].payload).toEqual({
      cut: CUT,
      by: "Priya",
      reason: "unmarked",
    });

    expect(await readyOf(s)).toBeNull();
  });

  it("clearing a cut that is not Ready is a 200 no-op with NO event", async () => {
    const s = await session();
    await makeCut(s);

    const answer = expectOk(await clearReady(s)) as ReadyAnswer;
    expect(answer).toEqual({ cut: CUT, ready: null });
    expect(await eventsOfKind("ready-cleared")).toHaveLength(0);

    // …and a second DELETE after a real clear behaves the same way.
    expectOk(await markReady(s));
    expectOk(await clearReady(s));
    expectOk(await clearReady(s));
    expect(await eventsOfKind("ready-cleared")).toHaveLength(1);
  });

  it("main is refused here too", async () => {
    const s = await session();
    expect(expectError(await clearReady(s, "main")).code).toBe(
      "E_BAD_REQUEST",
    );
  });
});

describe("F3(4)(d) — landing clears Ready", () => {
  it("a Ready cut that lands comes back `ready: null`, with the event AFTER `merge-finalized`", async () => {
    const s = await session();
    await makeCut(s);
    await edit(s, CUT, 0);
    expectOk(await markReady(s));

    const token = (
      expectOk(
        await get(getPreview, `/api/merge/preview?from=${CUT}`, s),
      ) as BringInPreview
    ).token;

    expectOk(
      await post(
        postMerge,
        "/api/merge",
        { from: CUT, into: "main", token, choices: {}, ticket: ticket() },
        s,
        ADITYA,
      ),
    );

    expect(await readyOf(s)).toBeNull();

    const all = await events();
    const finalized = all.findIndex((row) => row.kind === "merge-finalized");
    const cleared = all.findIndex(
      (row) =>
        row.kind === "ready-cleared" &&
        (row.payload as { reason?: string }).reason === "landed",
    );
    expect(finalized).toBeGreaterThanOrEqual(0);
    // Same transaction, in this order: the card, then the mark going.
    expect(cleared).toBeGreaterThan(finalized);
    expect(all[cleared].payload).toEqual({
      cut: CUT,
      by: "Aditya",
      reason: "landed",
    });

    // The bring-in card itself exists.
    expect(all[finalized].payload).toMatchObject({ from: CUT, into: "main" });
  });

  it("a REFUSED landing (stale token → 409) leaves Ready standing, with no event", async () => {
    const s = await session();
    await makeCut(s);
    await edit(s, CUT, 0);
    expectOk(await markReady(s));

    const token = (
      expectOk(
        await get(getPreview, `/api/merge/preview?from=${CUT}`, s),
      ) as BringInPreview
    ).token;

    // main moves under the preview: the token is now stale.
    await edit(s, "main", 0, volume(INTERVIEW, 10), ADITYA);

    const call = await post(
      postMerge,
      "/api/merge",
      { from: CUT, into: "main", token, choices: {}, ticket: ticket() },
      s,
      ADITYA,
    );
    expect(call.status).toBe(409);
    expect(expectError(call).code).toBe("E_STALE_HEAD");

    expect((await readyOf(s))!.note).toBe(NOTE);
    expect(await eventsOfKind("ready-cleared")).toHaveLength(0);
  });

  it("landing a cut that was never Ready writes no `ready-cleared` at all", async () => {
    const s = await session();
    await makeCut(s);
    await edit(s, CUT, 0);

    const token = (
      expectOk(
        await get(getPreview, `/api/merge/preview?from=${CUT}`, s),
      ) as BringInPreview
    ).token;
    expectOk(
      await post(
        postMerge,
        "/api/merge",
        { from: CUT, into: "main", token, choices: {}, ticket: ticket() },
        s,
        ADITYA,
      ),
    );

    expect(await eventsOfKind("ready-cleared")).toHaveLength(0);
  });
});

describe("#172 — the agent marks its own cut Ready", () => {
  it("`ready = { by: 'Agent', note: the G4-N auto summary, editedSince: false }`", async () => {
    const s = await session();
    expectOk(
      await post(
        postAgentRun,
        "/api/agent/run",
        { preset: "tighten-intro", ticket: ticket() },
        s,
        ADITYA,
      ),
    );

    const ready = await readyOf(s, "agent-tighten-intro");
    expect(ready).not.toBeNull();
    expect(ready!.by).toBe("Agent");
    expect(ready!.editedSince).toBe(false);
    // The auto format the seal uses (`‹N› clips …`), never the run-log's
    // verb line and never a bare count.
    expect(ready!.note).toMatch(/clip/);
    expect(ready!.note).toBe("1 clip trimmed, 1 added, 1 removed, 1 changed");

    const all = await events();
    const commitAt = all.findIndex(
      (row) =>
        row.kind === "commit-created" &&
        (row.payload as { kind?: string }).kind === "agent-run",
    );
    const readyAt = all.findIndex((row) => row.kind === "ready-set");
    expect(commitAt).toBeGreaterThanOrEqual(0);
    expect(readyAt).toBeGreaterThan(commitAt);
    expect(all[readyAt].payload).toEqual({
      cut: "agent-tighten-intro",
      by: "Agent",
      note: ready!.note,
    });
  });

  it("a FAILED run writes no Ready and no event — the whole transaction rolls back", async () => {
    const s = await session();
    // The `boundary.test.ts` recipe: pre-shrink B so the script's own 4th
    // command (a -2s end-trim on B) pushes its duration negative. The first
    // three succeed in memory, so this is a part-way failure.
    await edit(
      s,
      "main",
      0,
      { op: "trim", clipId: "clip-2", edge: "end", delta: { value: -168, rate: 24 } },
      ADITYA,
    );
    expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", name: "Short B", ticket: ticket() },
        s,
        ADITYA,
      ),
    );
    const eventsBefore = (await events()).length;

    const call = await post(
      postAgentRun,
      "/api/agent/run",
      { preset: "tighten-intro", ticket: ticket() },
      s,
      ADITYA,
    );
    expect(call.body.ok).toBe(false);

    const rows = await getDb()
      .select()
      .from(branches)
      .where(eq(branches.name, "agent-tighten-intro"));
    expect(rows).toHaveLength(0);
    expect(await eventsOfKind("ready-set")).toHaveLength(0);
    expect(await events()).toHaveLength(eventsBefore);
  });
});

