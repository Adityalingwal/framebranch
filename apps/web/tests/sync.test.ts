// J1 — `POST /api/sync`: presence upsert + heartbeat, lazy expiry, the live
// peers, and events since a cursor. Real Postgres; two tab ids stand in for
// two browser tabs (one project, one cookie — that is the demo).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { presence, projectEvents, projects } from "../src/db/schema";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postReady } from "../src/app/api/branch/ready/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { POST as postSync } from "../src/app/api/sync/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import type { SyncData } from "../src/app/api/sync/route";
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

const CUT = "priya-music";
const PRIYA = { "X-Editor-Name": "Priya" };
const ADITYA = { "X-Editor-Name": "Aditya" };
const TAB_A = "tab-aditya-0001";
const TAB_B = "tab-priya-00001";

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

type SyncInput = {
  tabId?: string;
  cut?: string;
  playheadFrame?: number;
  colourSeed?: number;
  cursor?: number | null;
};

async function sync(
  s: Session,
  input: SyncInput = {},
  headers: Record<string, string> = ADITYA,
) {
  return post(
    postSync,
    "/api/sync",
    {
      tabId: input.tabId ?? TAB_A,
      cut: input.cut ?? "main",
      playheadFrame: input.playheadFrame ?? 0,
      colourSeed: input.colourSeed ?? 10,
      cursor: input.cursor === undefined ? null : input.cursor,
    },
    s,
    headers,
  );
}

const okSync = async (
  s: Session,
  i: SyncInput = {},
  h: Record<string, string> = ADITYA,
) =>
  expectOk(await sync(s, i, h)) as SyncData;

async function edit(
  s: Session,
  branch: string,
  rev: number,
  value = 40,
  headers = PRIYA,
): Promise<number> {
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
          clipId: "clip-1",
          property: "volume",
          value,
        },
      },
      s,
      headers,
    ),
  ) as { workingRev: number };
  return data.workingRev;
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

/** Backdate a presence row by SQL — the only honest way to age one. */
async function ageRow(tabId: string, seconds: number): Promise<void> {
  await getDb()
    .update(presence)
    .set({
      lastSeenAt: sql`now() - interval '${sql.raw(String(seconds))} seconds'`,
    })
    .where(eq(presence.tabId, tabId));
}

const presenceRows = async () => getDb().select().from(presence);

describe("POST /api/sync — the cursor", () => {
  it("a FIRST call (cursor: null) replays nothing and reports the current high-water mark", async () => {
    const s = await session();
    await makeCut(s); // branch-created
    await edit(s, CUT, 0); // edit
    const all = await getDb().select().from(projectEvents);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const data = await okSync(s);
    expect(data.events).toEqual([]);
    expect(typeof data.cursor).toBe("number");
    expect(data.cursor).toBe(Math.max(...all.map((row) => row.id)));
    expect(data.peers).toEqual([]);
  });

  it("cursor: null on an empty feed is 0 (a project always has its seed event, so this is the guard)", async () => {
    const s = await session();
    await getDb().delete(projectEvents);
    expect((await okSync(s)).cursor).toBe(0);
  });

  it("events since a cursor come back in id order and advance it; the same cursor returns them again", async () => {
    const s = await session();
    const start = (await okSync(s)).cursor;

    await makeCut(s);
    expectOk(await postReadyCall(s));

    const first = await okSync(s, { cursor: start });
    expect(first.events.map((e) => e.kind)).toEqual([
      "branch-created",
      "ready-set",
    ]);
    expect(first.events[0].id).toBeLessThan(first.events[1].id);
    expect(first.cursor).toBe(first.events[1].id);
    expect(first.events[1].payload).toMatchObject({ cut: CUT, by: "Priya" });
    expect(typeof first.events[0].at).toBe("string");

    // The server records NOTHING about what it handed out.
    const again = await okSync(s, { cursor: start });
    expect(again.events.map((e) => e.id)).toEqual(
      first.events.map((e) => e.id),
    );

    // …and the advanced cursor is empty, with the cursor standing still.
    const empty = await okSync(s, { cursor: first.cursor });
    expect(empty.events).toEqual([]);
    expect(empty.cursor).toBe(first.cursor);
  });

  it("more than a page: the first call returns 200 and the next returns the rest", async () => {
    const s = await session();
    await getDb().delete(projectEvents);
    const projectId = await onlyProjectId();
    await getDb()
      .insert(projectEvents)
      .values(
        Array.from({ length: 201 }, (_, n) => ({
          projectId,
          kind: "edit",
          payload: { n },
        })),
      );

    const first = await okSync(s, { cursor: 0 });
    expect(first.events).toHaveLength(200);
    expect(first.events[0].payload).toEqual({ n: 0 });
    expect(first.cursor).toBe(first.events[199].id);

    // No `more` flag: the rest simply arrives on the next tick.
    const second = await okSync(s, { cursor: first.cursor });
    expect(second.events).toHaveLength(1);
    expect(second.events[0].payload).toEqual({ n: 200 });
  });
});

describe("POST /api/sync — presence", () => {
  it("the first call INSERTS a row with the header's name; the second UPDATES it, never a second row", async () => {
    const s = await session();
    await okSync(s, { cut: "main", playheadFrame: 0 }, ADITYA);

    let rows = await presenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tabId: TAB_A,
      name: "Aditya",
      cut: "main",
      playheadFrame: 0,
      colourSeed: 10,
    });
    const firstSeen = rows[0].lastSeenAt;

    await okSync(
      s,
      { cut: CUT, playheadFrame: 120, colourSeed: 200 },
      ADITYA,
    );

    rows = await presenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tabId: TAB_A,
      cut: CUT,
      playheadFrame: 120,
      colourSeed: 200,
    });
    expect(rows[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      firstSeen.getTime(),
    );
  });

  it("no `X-Editor-Name` header → the row is named `Editor` (the B0 leniency)", async () => {
    const s = await session();
    await okSync(s, {}, {});
    expect((await presenceRows())[0].name).toBe("Editor");
  });

  it("peers exclude the caller and include a tab seen a moment ago", async () => {
    const s = await session();
    await okSync(s, { tabId: TAB_A, cut: "main" }, ADITYA);
    const b = await okSync(
      s,
      { tabId: TAB_B, cut: CUT, playheadFrame: 120, colourSeed: 200 },
      PRIYA,
    );

    expect(b.peers).toHaveLength(1);
    expect(b.peers[0]).toMatchObject({
      tabId: TAB_A,
      name: "Aditya",
      cut: "main",
      playheadFrame: 0,
      colourSeed: 10,
    });
    expect(typeof b.peers[0].lastSeenAt).toBe("string");

    // And the other way round: A now sees B at its frame.
    const a = await okSync(s, { tabId: TAB_A, cut: "main" }, ADITYA);
    expect(a.peers).toHaveLength(1);
    expect(a.peers[0]).toMatchObject({
      tabId: TAB_B,
      name: "Priya",
      cut: CUT,
      playheadFrame: 120,
    });
  });

  it("a peer last seen 11s ago is filtered out but its ROW survives; at 61s the row is deleted", async () => {
    const s = await session();
    await okSync(s, { tabId: TAB_B, cut: CUT }, PRIYA);

    await ageRow(TAB_B, 11);
    let data = await okSync(s, { tabId: TAB_A }, ADITYA);
    expect(data.peers).toEqual([]);
    expect(await presenceRows()).toHaveLength(2); // filtered, not swept

    // …and it comes back on its own next tick, with no re-insert dance.
    data = await okSync(s, { tabId: TAB_B, cut: CUT }, PRIYA);
    expect(data.peers.map((p) => p.tabId)).toEqual([TAB_A]);

    await ageRow(TAB_B, 61);
    data = await okSync(s, { tabId: TAB_A }, ADITYA);
    expect(data.peers).toEqual([]);
    expect((await presenceRows()).map((r) => r.tabId)).toEqual([TAB_A]);
  });

  it("`cut` is NOT validated against branches — a peer can be mid-switch", async () => {
    const s = await session();
    const data = await okSync(s, { cut: "a-cut-that-does-not-exist" });
    expect(data.events).toEqual([]);
    expect((await presenceRows())[0].cut).toBe("a-cut-that-does-not-exist");
  });
});

describe("POST /api/sync — the body", () => {
  it("a missing tabId, a too-short one, a negative frame, colourSeed 400 and an extra field are all 400", async () => {
    const s = await session();
    const bodies: Record<string, unknown>[] = [
      { cut: "main", playheadFrame: 0, colourSeed: 10, cursor: null },
      { tabId: "short", cut: "main", playheadFrame: 0, colourSeed: 10, cursor: null },
      { tabId: TAB_A, cut: "main", playheadFrame: -1, colourSeed: 10, cursor: null },
      { tabId: TAB_A, cut: "main", playheadFrame: 0, colourSeed: 400, cursor: null },
      // No ticket field is accepted: `/api/sync` is not a mutation to replay.
      {
        tabId: TAB_A,
        cut: "main",
        playheadFrame: 0,
        colourSeed: 10,
        cursor: null,
        ticket: ticket(),
      },
    ];
    for (const body of bodies) {
      const call = await post(postSync, "/api/sync", body, s, ADITYA);
      expect(expectError(call).code).toBe("E_BAD_REQUEST");
    }
    expect(await presenceRows()).toHaveLength(0);
  });

  it("no cookie → the route still answers 200 (it bootstraps like every other door)", async () => {
    // The CLIENT gate is what prevents a second project: the Shell does not
    // poll until the first timeline GET has answered and the tab is named.
    // The route itself has no opinion.
    const fresh: Session = { token: null };
    const call = await sync(fresh);
    expect(call.status).toBe(200);
    expect(call.body.ok).toBe(true);
  });
});

describe("POST /api/sync — what a second tab actually sees (the demo beat)", () => {
  it("Priya marks Ready → Aditya's next tick carries `ready-set` and Priya's playhead", async () => {
    const s = await session();
    await makeCut(s);
    const start = (await okSync(s, { tabId: TAB_A, cut: "main" }, ADITYA))
      .cursor;

    expectOk(await postReadyCall(s));
    await okSync(
      s,
      { tabId: TAB_B, cut: CUT, playheadFrame: 120, colourSeed: 200 },
      PRIYA,
    );

    const tick = await okSync(
      s,
      { tabId: TAB_A, cut: "main", cursor: start },
      ADITYA,
    );
    const readySet = tick.events.find((e) => e.kind === "ready-set");
    expect(readySet).toBeDefined();
    expect(readySet!.payload).toEqual({
      cut: CUT,
      by: "Priya",
      note: "Music bed + VO dip",
    });
    expect(tick.peers).toHaveLength(1);
    expect(tick.peers[0]).toMatchObject({ name: "Priya", playheadFrame: 120 });
    expect(tick.cursor).toBeGreaterThan(start);

    const idle = await okSync(
      s,
      { tabId: TAB_A, cut: "main", cursor: tick.cursor },
      ADITYA,
    );
    expect(idle.events).toEqual([]);
    expect(idle.cursor).toBe(tick.cursor);
  });

  it("a Mark on another tab arrives as `commit-created`", async () => {
    const s = await session();
    const start = (await okSync(s, { cursor: null })).cursor;
    await edit(s, "main", 0);
    expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "main", name: "Client pick", ticket: ticket() },
        s,
        PRIYA,
      ),
    );
    const tick = await okSync(s, { cursor: start });
    expect(tick.events.map((e) => e.kind)).toEqual(["edit", "commit-created"]);
  });
});

async function postReadyCall(s: Session) {
  return post(
    postReady,
    "/api/branch/ready",
    { cut: CUT, note: "Music bed + VO dip", ticket: ticket() },
    s,
    PRIYA,
  );
}

/** The one project this suite ever creates. */
async function onlyProjectId(): Promise<string> {
  const [row] = await getDb().select({ id: projects.id }).from(projects);
  return row.id;
}
