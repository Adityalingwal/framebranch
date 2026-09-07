// Bring-in tests: `GET /api/merge/preview` (stateless) and `POST /api/merge`
// (the one-transaction landing). Real Postgres; heads and revs move through
// the normal edit/mark path — a faked race proves nothing.
import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Timeline } from "@framebranch/engine";

import {
  branches,
  commits,
  projectEvents,
  workingState,
} from "../src/db/schema";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { POST as postMerge } from "../src/app/api/merge/route";
import { GET as getPreview } from "../src/app/api/merge/preview/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import type { BringInPreview } from "../src/app/api/merge/preview/route";
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

const CUT = "priya-music";
const PRIYA = { "X-Editor-Name": "Priya" };

/** The demo preset: V1 Interview [0,240) B-roll [240,432) Logo [432,480). */
const INTERVIEW = "clip-1";
const BROLL = "clip-2";
const LOGO = "clip-3";
const MUSIC = "clip-4";
const WELCOME = "clip-5";

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
  headers: Record<string, string> = {},
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

async function mark(
  s: Session,
  branch: string,
  name: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const data = expectOk(
    await post(
      postCommit,
      "/api/commit",
      { branch, name, ticket: ticket() },
      s,
      headers,
    ),
  ) as { commitId: string };
  return data.commitId;
}

async function makeCut(s: Session, name = CUT): Promise<void> {
  expectOk(
    await post(
      postBranch,
      "/api/branch",
      { name, from: "main", ticket: ticket() },
      s,
    ),
  );
}

const text = (value: string) => ({
  op: "propertyChange",
  clipId: WELCOME,
  property: "textContent",
  value,
});
const volume = (clipId: string, value: number) => ({
  op: "propertyChange",
  clipId,
  property: "volume",
  value,
});
const move = (clipId: string, start: number) => ({
  op: "move",
  clipId,
  newStart: { value: start, rate: 24 },
});

async function preview(
  s: Session,
  from = CUT,
  choices?: Record<string, string>,
): Promise<BringInPreview> {
  const query =
    choices === undefined
      ? `/api/merge/preview?from=${from}`
      : `/api/merge/preview?from=${from}&choices=${encodeURIComponent(
          JSON.stringify(choices),
        )}`;
  return expectOk(await get(getPreview, query, s)) as BringInPreview;
}

async function land(
  s: Session,
  input: {
    from?: string;
    into?: string;
    token: BringInPreview["token"];
    choices?: Record<string, string>;
    headers?: Record<string, string>;
  },
) {
  return post(
    postMerge,
    "/api/merge",
    {
      from: input.from ?? CUT,
      into: input.into ?? "main",
      token: input.token,
      choices: input.choices ?? {},
      ticket: ticket(),
    },
    s,
    input.headers ?? {},
  );
}

const commitCount = async (): Promise<number> =>
  (await getDb().select({ id: commits.id }).from(commits)).length;
const eventCount = async (): Promise<number> =>
  (await getDb().select({ id: projectEvents.id }).from(projectEvents)).length;
const mergeCommits = async () =>
  getDb().select().from(commits).where(isNotNull(commits.parent2Id));
const headOf = async (name: string): Promise<string> => {
  const rows = await getDb()
    .select()
    .from(branches)
    .where(eq(branches.name, name));
  return rows[0].headCommitId;
};
const revOf = async (name: string): Promise<number> => {
  const rows = await getDb()
    .select()
    .from(branches)
    .where(eq(branches.name, name));
  const state = await getDb()
    .select()
    .from(workingState)
    .where(eq(workingState.branchId, rows[0].id));
  return state[0].workingRev;
};
const timelineOf = async (s: Session, branch: string): Promise<Timeline> =>
  (
    expectOk(
      await get(getTimeline, `/api/timeline?branch=${branch}`, s),
    ) as TimelineData
  ).timeline;

const clipIn = (timeline: Timeline, clipId: string) =>
  timeline.tracks
    .flatMap((track) => track.clips as { id: string }[])
    .find((clip) => clip.id === clipId);

/** A cut with one committed edit on it and nothing touching it on main. */
async function oneSided(s: Session): Promise<void> {
  await makeCut(s);
  await edit(s, CUT, 0, volume(MUSIC, 40));
  await mark(s, CUT, "Quieter music");
}

/** Both sides changed the SAME text — one bucket-1 conflict. */
async function textConflict(s: Session): Promise<void> {
  await makeCut(s);
  await edit(s, CUT, 0, text("Welcome — half price"));
  await mark(s, CUT, "New wording");
  await edit(s, "main", 0, text("Welcome — 40% off"));
  await mark(s, "main", "Sale wording");
}

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

describe("F1 / shape — the doors", () => {
  const DUMMY = { mainHead: "x", cutHead: "y", mainRev: 0, cutRev: 0 };

  it("F1: Bring in only lands on main — any other `into` is refused, nothing written", async () => {
    const s = await session();
    await oneSided(s);
    const headMain = await headOf("main");
    const headCut = await headOf(CUT);
    const before = await commitCount();

    const err = expectError(
      await land(s, { from: "main", into: CUT, token: DUMMY }),
    );
    expect(err.code).toBe("E_BAD_REQUEST");
    expect(err.message).toContain('"main"');

    expect(await headOf("main")).toBe(headMain);
    expect(await headOf(CUT)).toBe(headCut);
    expect(await commitCount()).toBe(before);
  });

  it("E_BAD_REQUEST: a cut cannot be brought into itself, on either endpoint", async () => {
    const s = await session();
    expect(
      expectError(await land(s, { from: "main", into: "main", token: DUMMY }))
        .code,
    ).toBe("E_BAD_REQUEST");
    const call = await get(getPreview, "/api/merge/preview?from=main", s);
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
  });

  it("preview: an unknown cut is 404, a malformed `choices` is 400", async () => {
    const s = await session();
    await oneSided(s);

    const missing = await get(getPreview, "/api/merge/preview?from=nope", s);
    expect(missing.status).toBe(404);
    expect(expectError(missing).code).toBe("E_BRANCH_NOT_FOUND");

    const broken = await get(
      getPreview,
      `/api/merge/preview?from=${CUT}&choices=notjson`,
      s,
    );
    expect(broken.status).toBe(400);
    expect(expectError(broken).code).toBe("E_BAD_REQUEST");

    const wrongChoice = await get(
      getPreview,
      `/api/merge/preview?from=${CUT}&choices=${encodeURIComponent(
        JSON.stringify({ "m4:x": "keep-mine" }),
      )}`,
      s,
    );
    expect(expectError(wrongChoice).code).toBe("E_BAD_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// F3(1) — the preview writes NOTHING
// ---------------------------------------------------------------------------

describe("F3(1) — the preview is stateless", () => {
  it("two identical GETs give identical answers and write nothing at all", async () => {
    const s = await session();
    await textConflict(s);
    // A dirty side too: the preview must not seal it.
    await edit(s, "main", 1, volume(INTERVIEW, 70));

    const commitsBefore = await commitCount();
    const eventsBefore = await eventCount();
    const mainRev = await revOf("main");
    const cutRev = await revOf(CUT);

    const first = await preview(s);
    const second = await preview(s);
    expect(second).toEqual(first);

    expect(await commitCount()).toBe(commitsBefore);
    expect(await eventCount()).toBe(eventsBefore);
    expect(await revOf("main")).toBe(mainRev);
    expect(await revOf(CUT)).toBe(cutRev);
    expect(await mergeCommits()).toHaveLength(0);

    // The token is four plain fields, read in that same transaction.
    expect(first.token).toEqual({
      mainHead: await headOf("main"),
      cutHead: await headOf(CUT),
      mainRev,
      cutRev,
    });
  });

  it("zero conflicts: the Compare shape, no cards, nothing undecided", async () => {
    const s = await session();
    await oneSided(s);

    const answer = await preview(s);
    expect(answer.from).toBe(CUT);
    expect(answer.conflicts).toEqual([]);
    expect(answer.counts).toEqual({ total: 0, decided: 0 });
    expect(answer.undecidedClipIds).toEqual([]);
    expect(answer.count).toBe(answer.rows.length);
    expect(answer.count).toBe(1);
    expect(answer.rows[0].text).toBe("Volume 100% → 40%");
    expect(answer.runtime.before).toBe(answer.runtime.after);
    expect(clipIn(answer.before, MUSIC)).toBeDefined();
    expect(clipIn(answer.after, MUSIC)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// The cards, the undecided clips and the choices (locks (4), (5))
// ---------------------------------------------------------------------------

describe("F3(2) — conflict cards over the wire", () => {
  it("bucket 1: the card, the undecided clip in After, and what a choice changes", async () => {
    const s = await session();
    await textConflict(s);

    const open = await preview(s);
    expect(open.counts).toEqual({ total: 1, decided: 0 });
    const card = open.conflicts[0];
    expect(card.bucket).toBe(1);
    expect(card.title).toBe(`"Welcome" — both cuts changed the text`);
    expect(card.lines.map((l) => `${l.label} · ${l.value}`)).toEqual([
      `main · "Welcome — 40% off"`,
      `${CUT} · "Welcome — half price"`,
      `Original · "Welcome"`,
    ]);
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "ours" },
      { label: `Keep ${CUT}'s`, choice: "theirs" },
      { label: "Keep original", choice: "base" },
    ]);
    expect(card.chosen).toBeNull();

    // The After lane draws the undecided clip at MAIN's position/content…
    expect(open.undecidedClipIds).toEqual([WELCOME]);
    const undecided = clipIn(open.after, WELCOME) as unknown as {
      textContent: string;
    };
    expect(undecided.textContent).toBe("Welcome — 40% off");
    // …and no row talks about it (the card is its row).
    expect(
      open.rows.some((row) =>
        [...row.laneIds.before, ...row.laneIds.after].includes(WELCOME),
      ),
    ).toBe(false);

    // One choice → one new answer: card, counts, After lane and rows.
    const answered = await preview(s, CUT, { [card.conflictId]: "theirs" });
    expect(answered.counts).toEqual({ total: 1, decided: 1 });
    expect(answered.conflicts[0].chosen).toBe("theirs");
    expect(answered.undecidedClipIds).toEqual([]);
    const decided = clipIn(answered.after, WELCOME) as unknown as {
      textContent: string;
    };
    expect(decided.textContent).toBe("Welcome — half price");
    const row = answered.rows.find((r) => r.clipIds.includes(WELCOME));
    expect(row?.kind).toBe("property");
    expect(row?.text).toBe(
      `Text: "Welcome — 40% off" → "Welcome — half price"`,
    );
  });

  it("bucket 2: main removed it, the cut moved it — and the reverse", async () => {
    const s = await session();
    await makeCut(s);
    await edit(s, CUT, 0, move(BROLL, 600));
    await mark(s, CUT, "B-roll later");
    await edit(s, "main", 0, { op: "deleteClip", clipId: BROLL });
    await mark(s, "main", "Dropped the B-roll");

    const answer = await preview(s);
    const card = answer.conflicts[0];
    expect(card.bucket).toBe(2);
    expect(card.title).toBe(`B-roll — main removed it, ${CUT} moved it`);
    expect(card.lines.map((l) => `${l.label} · ${l.value}`)).toEqual([
      "main · Removed",
      `${CUT} · Moved to 00:00:25:00`,
    ]);
    expect(card.buttons).toEqual([
      { label: "Keep main's", choice: "delete" },
      { label: `Keep ${CUT}'s`, choice: "clip" },
    ]);
    // main does not have the clip, so After does not draw it either.
    expect(answer.undecidedClipIds).toEqual([]);
    expect(clipIn(answer.after, BROLL)).toBeUndefined();

    const other = await session();
    await makeCut(other);
    await edit(other, CUT, 0, { op: "deleteClip", clipId: BROLL });
    await mark(other, CUT, "Dropped the B-roll");
    await edit(other, "main", 0, {
      op: "trim",
      clipId: BROLL,
      edge: "end",
      delta: { value: -24, rate: 24 },
    });
    await mark(other, "main", "Tighter B-roll");

    const reverse = await preview(other);
    expect(reverse.conflicts[0].title).toBe(
      `B-roll — ${CUT} removed it, main trimmed it`,
    );
    expect(reverse.conflicts[0].buttons).toEqual([
      { label: "Keep main's", choice: "clip" },
      { label: `Keep ${CUT}'s`, choice: "delete" },
    ]);
  });

  it("bucket 3: the two cuts moved different clips onto the same spot", async () => {
    const s = await session();
    await makeCut(s);
    // The demo preset's V1: Interview [0,240) B-roll [240,432) Logo [432,480).
    await edit(s, CUT, 0, move(BROLL, 620));
    await mark(s, CUT, "B-roll at the end");
    await edit(s, "main", 0, move(LOGO, 600));
    await mark(s, "main", "Logo at the end");

    const answer = await preview(s);
    const card = answer.conflicts[0];
    expect(card.bucket).toBe(3);
    expect(card.title).toBe(
      `"B-roll" and "Logo" overlap on V1 (00:00:25:20–00:00:27:00)`,
    );
    expect(card.lines.map((l) => `${l.label} · ${l.value}`)).toEqual([
      `B-roll · from ${CUT}`,
      "Logo · from main",
      "Original · (this spot was empty)",
    ]);
    expect(card.buttons).toEqual([
      { label: `Move "B-roll" later`, choice: "shift-a" },
      { label: `Move "Logo" later`, choice: "shift-b" },
      { label: "Keep original", choice: "base" },
    ]);
    // Both clips are withheld by the engine; the lanes draw main's copies.
    expect(answer.undecidedClipIds.sort()).toEqual([BROLL, LOGO].sort());

    const decided = await preview(s, CUT, { [card.conflictId]: "shift-b" });
    expect(decided.conflicts[0].chosen).toBe("shift-b");
    expect(decided.undecidedClipIds).toEqual([]);
    expectOk(await land(s, {
      token: decided.token,
      choices: { [card.conflictId]: "shift-b" },
    }));
    expect(await mergeCommits()).toHaveLength(1);
  });

  /**
   * Codex BUG 4. A choice for a conflict that is not in this run — a stale
   * answer still sitting in the client's sessionStorage for something another
   * answer has since dissolved — has no effect on the engine's result
   * (`recompute` consults a saved choice only when it meets that conflict),
   * so it is not a card and not counted. It is deliberately NOT a 400: that
   * would strand the user on a screen they cannot leave.
   */
  it("a choice id nothing in this run knows is inert — not a card, not a count, not a 400", async () => {
    const s = await session();
    await textConflict(s);

    const plain = await preview(s);
    const withGhost = await preview(s, CUT, { "m4:nope": "ours" });

    expect(withGhost.counts).toEqual(plain.counts);
    expect(withGhost.conflicts).toEqual(plain.conflicts);
    expect(withGhost.rows).toEqual(plain.rows);
    expect(withGhost.after).toEqual(plain.after);
    expect(withGhost.undecidedClipIds).toEqual(plain.undecidedClipIds);
  });

  /**
   * Codex BUG 3. Every supplied id the two runs do not describe is recovered
   * with its own lookup — no cap — so a decided card can never fall off the
   * list. And an answer that DISSOLVES another open conflict takes that card
   * with it, or `decisions left` could never reach 0.
   */
  it("a cascade: the decided card survives, the dissolved one disappears", async () => {
    const s = await session();
    await makeCut(s);
    // The cut moves B-roll to the end…
    await edit(s, CUT, 0, move(BROLL, 620));
    await mark(s, CUT, "B-roll at the end");
    // …while main moves Logo just before it and Interview just after: in the
    // composed draft B-roll then overlaps BOTH.
    await edit(s, "main", 0, move(LOGO, 600));
    await edit(s, "main", 1, move(INTERVIEW, 700));
    await mark(s, "main", "Logo and Interview at the end");

    const open = await preview(s);
    expect(open.conflicts.map((c) => c.bucket)).toEqual([3, 3]);
    expect(open.counts).toEqual({ total: 2, decided: 0 });
    const pair = open.conflicts.find((c) => c.title.includes("Logo"))!;
    const other = open.conflicts.find((c) => c.conflictId !== pair.conflictId)!;
    expect(other.title).toContain("Interview");

    // `Keep original` puts both of that pair back where they started, which
    // takes B-roll away from Interview too.
    const answered = await preview(s, CUT, { [pair.conflictId]: "base" });
    expect(answered.conflicts).toHaveLength(1);
    expect(answered.conflicts[0].conflictId).toBe(pair.conflictId);
    expect(answered.conflicts[0].chosen).toBe("base");
    expect(answered.counts).toEqual({ total: 1, decided: 1 });
    expect(
      answered.conflicts.some((c) => c.conflictId === other.conflictId),
    ).toBe(false);
    expect(answered.undecidedClipIds).toEqual([]);

    // Nothing is left to decide, so the landing goes through.
    expectOk(
      await land(s, {
        token: answered.token,
        choices: { [pair.conflictId]: "base" },
      }),
    );
    expect(await mergeCommits()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The landing
// ---------------------------------------------------------------------------

describe("F3(1) — the landing", () => {
  it("zero conflicts: one bring-in card with two parents, the cut untouched", async () => {
    const s = await session();
    await oneSided(s);
    const headMain = await headOf("main");
    const headCut = await headOf(CUT);

    const answer = await preview(s);
    const done = expectOk(
      await land(s, { token: answer.token, headers: PRIYA }),
    ) as MergeDone;
    expect(done.done).toBe(true);

    const merges = await mergeCommits();
    expect(merges).toHaveLength(1);
    expect(merges[0].id).toBe(done.mergeCommitId);
    expect(merges[0].parentId).toBe(headMain);
    expect(merges[0].parent2Id).toBe(headCut);
    expect(merges[0].kind).toBe("bring-in");
    expect(merges[0].name).toBe(`Brought "${CUT}" into main`);
    expect(merges[0].actorName).toBe("Priya");
    expect(merges[0].changes).toBe(answer.count);
    expect(merges[0].snapshotDistance).toBe(0);

    expect(await headOf("main")).toBe(done.mergeCommitId);
    expect(await headOf(CUT)).toBe(headCut);

    const events = await getDb().select().from(projectEvents);
    expect(events.at(-1)?.kind).toBe("merge-finalized");

    const merged = await timelineOf(s, "main");
    const music = clipIn(merged, MUSIC) as unknown as {
      properties: { volume?: number };
    };
    expect(music.properties.volume).toBe(40);
  });

  it("dirty sides: BOTH are sealed in the same transaction as the bring-in", async () => {
    const s = await session();
    await oneSided(s);
    await edit(s, "main", 0, volume(INTERVIEW, 70));
    await edit(s, CUT, 1, volume(MUSIC, 30));
    const before = await commitCount();

    const answer = await preview(s);
    // The preview used the WORKING content of both sides.
    const music = clipIn(answer.before, MUSIC);
    expect(music).toBeDefined();

    const done = expectOk(
      await land(s, { token: answer.token }),
    ) as MergeDone;
    const autos = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.kind, "auto"));
    expect(autos).toHaveLength(2);
    expect(await commitCount()).toBe(before + 3);
    expect(await headOf("main")).toBe(done.mergeCommitId);

    const mainView = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(mainView.pendingCount).toBe(0);
  });

  it("a decision still missing → E_MERGE_PRECONDITION, and NOTHING is written", async () => {
    const s = await session();
    await textConflict(s);
    await edit(s, "main", 1, volume(INTERVIEW, 70));
    await edit(s, CUT, 1, volume(MUSIC, 30));

    const answer = await preview(s);
    const before = {
      commits: await commitCount(),
      mainHead: await headOf("main"),
      cutHead: await headOf(CUT),
      mainRev: await revOf("main"),
      cutRev: await revOf(CUT),
    };

    const call = await land(s, { token: answer.token });
    expect(call.status).toBe(400);
    expect(expectError(call).code).toBe("E_MERGE_PRECONDITION");

    // No card, and no SEAL either — the whole transaction rolled back.
    expect(await commitCount()).toBe(before.commits);
    expect(await headOf("main")).toBe(before.mainHead);
    expect(await headOf(CUT)).toBe(before.cutHead);
    expect(await revOf("main")).toBe(before.mainRev);
    expect(await revOf(CUT)).toBe(before.cutRev);
    const mainView = expectOk(
      await get(getTimeline, "/api/timeline?branch=main", s),
    ) as TimelineData;
    expect(mainView.pendingCount).toBe(1);
  });

  it("every decision answered → the landing goes through with the chosen content", async () => {
    const s = await session();
    await textConflict(s);
    const answer = await preview(s);
    const choices = { [answer.conflicts[0].conflictId]: "theirs" };

    const decided = await preview(s, CUT, choices);
    expect(decided.counts).toEqual({ total: 1, decided: 1 });

    const done = expectOk(
      await land(s, { token: decided.token, choices }),
    ) as MergeDone;
    const merged = await timelineOf(s, "main");
    const welcome = clipIn(merged, WELCOME) as unknown as {
      textContent: string;
    };
    expect(welcome.textContent).toBe("Welcome — half price");
    expect((await mergeCommits())[0].id).toBe(done.mergeCommitId);
  });

  it("a retried landing with the SAME ticket replays the same answer", async () => {
    const s = await session();
    await oneSided(s);
    const answer = await preview(s);
    const t = ticket();
    const body = {
      from: CUT,
      into: "main",
      token: answer.token,
      choices: {},
      ticket: t,
    };
    const first = expectOk(
      await post(postMerge, "/api/merge", body, s),
    ) as MergeDone;
    const retry = expectOk(
      await post(postMerge, "/api/merge", body, s),
    ) as MergeDone;
    expect(retry).toEqual(first);
    expect(await mergeCommits()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// F4 — someone else moved while you were deciding
// ---------------------------------------------------------------------------

describe("F4 — the staleness refusal (#151, #152)", () => {
  it("main's head moved: #151 with the marker's name, details, nothing written", async () => {
    const s = await session();
    await oneSided(s);
    const answer = await preview(s);

    await edit(s, "main", 0, volume(INTERVIEW, 70), PRIYA);
    await mark(s, "main", "Louder interview", PRIYA);

    const before = await commitCount();
    const call = await land(s, { token: answer.token });
    expect(call.status).toBe(409);
    const err = expectError(call);
    expect(err.code).toBe("E_STALE_HEAD");
    expect(err.message).toBe(
      "Priya changed main while you were working on this. Start the bring-in again to include their change.",
    );
    expect(err.details).toEqual({ side: "main", who: "Priya" });
    expect(await commitCount()).toBe(before);
    expect(await mergeCommits()).toHaveLength(0);

    // Start again → a fresh token → the landing goes through.
    const again = await preview(s);
    expectOk(await land(s, { token: again.token }));
    expect(await mergeCommits()).toHaveLength(1);
  });

  it("the cut's working rev moved (no head move): #152 with the last editor", async () => {
    const s = await session();
    await oneSided(s);
    const answer = await preview(s);

    const cutHead = await headOf(CUT);
    await edit(s, CUT, 1, volume(MUSIC, 55), PRIYA);
    expect(await headOf(CUT)).toBe(cutHead); // an edit does not move a head

    const call = await land(s, { token: answer.token });
    const err = expectError(call);
    expect(err.code).toBe("E_STALE_HEAD");
    expect(err.message).toBe(
      `Priya changed "${CUT}" while you were working on this. Start again to include their change.`,
    );
    expect(err.details).toEqual({ side: "cut", who: "Priya" });
  });

  it("nobody's name is known: the fallback sentence claims no one", async () => {
    const s = await session();
    await oneSided(s);
    const answer = await preview(s);

    await edit(s, CUT, 1, volume(MUSIC, 55));
    const rows = await getDb()
      .select()
      .from(branches)
      .where(eq(branches.name, CUT));
    await getDb()
      .update(workingState)
      .set({ lastEditorName: null })
      .where(eq(workingState.branchId, rows[0].id));

    const err = expectError(await land(s, { token: answer.token }));
    expect(err.message).toBe(
      `"${CUT}" changed while you were working on this. Start again to include the change.`,
    );
    expect(err.details).toEqual({ side: "cut", who: null });
  });
});
