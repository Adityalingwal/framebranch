/**
 * B2 tests — the one server-visible piece of the Compare batch: the
 * `timelines=1` flag on `GET /api/diff` (§2.2, lock (4): rows AND lanes come
 * from ONE snapshot). Everything else in B2 is client-side and this repo has
 * no component tests, so the presenter (`diff-rows.test.ts`) and this file
 * are where B2's behaviour is pinned.
 */

import type { Timeline } from "@framebranch/engine";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { commits } from "../src/db/schema";
import { GET as getDiff } from "../src/app/api/diff/route";
import type { DiffResponse } from "../src/app/api/diff/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { POST as postBranch } from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
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

const NAME_HEADER = { "X-Editor-Name": "Aditya" };

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

async function working(s: Session, branch = "main"): Promise<Timeline> {
  const data = expectOk(
    await get(getTimeline, `/api/timeline?branch=${branch}`, s),
  ) as { timeline: Timeline; workingRev: number };
  return data.timeline;
}

async function revOf(s: Session, branch: string): Promise<number> {
  const data = expectOk(
    await get(getTimeline, `/api/timeline?branch=${branch}`, s),
  ) as { workingRev: number };
  return data.workingRev;
}

async function edit(
  s: Session,
  branch: string,
  command: Record<string, unknown>,
): Promise<void> {
  const workingRev = await revOf(s, branch);
  expectOk(
    await post(
      postOps,
      "/api/ops",
      { branch, workingRev, ticket: ticket(), command },
      s,
      NAME_HEADER,
    ),
  );
}

async function seedId(): Promise<string> {
  return (await getDb().select().from(commits))[0].id;
}

async function diff(
  s: Session,
  query: string,
): Promise<DiffResponse> {
  return expectOk(await get(getDiff, `/api/diff?${query}`, s)) as DiffResponse;
}

describe("B2 §2.2 — GET /api/diff?…&timelines=1", () => {
  it("returns both timelines, `after` being the Now side's working timeline", async () => {
    const s = await session();
    const seed = await seedId();
    // Shortening the first clip is always legal — a move could overlap its
    // neighbour and the demo's exact layout is not this test's subject.
    await edit(s, "main", {
      op: "trim",
      clipId: "clip-1",
      edge: "end",
      delta: { value: -12, rate: 24 },
    });

    const data = await diff(s, `cut=main&a=${seed}&b=now&timelines=1`);
    expect(data.before).toBeDefined();
    expect(data.after).toBeDefined();
    // `after` IS the Now side — same object the timeline GET serves.
    expect(data.after).toEqual(await working(s, "main"));
    // `before` is the OLDER input — the seed card, not the working state.
    expect(data.before).not.toEqual(data.after);
    expect(data.before!.tracks.length).toBeGreaterThan(0);
    expect(data.older).toBe("a");
    // The rows are still the presenter's, computed from these two.
    expect(data.count).toBe(data.rows.length);
    expect(data.rows.every((r) => r.jump !== undefined)).toBe(true);
    expect(data.rows.every((r) => r.laneIds !== undefined)).toBe(true);
  });

  it("without the flag neither key exists — the chip's count query is unchanged", async () => {
    const s = await session();
    const seed = await seedId();
    await edit(s, "main", {
      op: "propertyChange",
      clipId: "clip-1",
      property: "volume",
      value: 80,
    });

    const plain = await diff(s, `cut=main&a=${seed}&b=now`);
    expect("before" in plain).toBe(false);
    expect("after" in plain).toBe(false);
    expect(plain.count).toBe(1);

    // Same rows either way — the flag adds, it never changes.
    const withTimelines = await diff(s, `cut=main&a=${seed}&b=now&timelines=1`);
    expect(withTimelines.rows).toEqual(plain.rows);
    expect(withTimelines.count).toBe(plain.count);
    expect(withTimelines.runtime).toEqual(plain.runtime);
  });

  it("the lanes always read older → newer, whichever way the pair is asked", async () => {
    const s = await session();
    const seed = await seedId();
    await edit(s, "main", {
      op: "deleteClip",
      clipId: "clip-2",
    });

    const forward = await diff(s, `cut=main&a=${seed}&b=now&timelines=1`);
    const backward = await diff(s, `cut=main&a=now&b=${seed}&timelines=1`);
    expect(backward.older).toBe("b");
    expect(backward.before).toEqual(forward.before);
    expect(backward.after).toEqual(forward.after);
    expect(backward.rows).toEqual(forward.rows);
  });

  it("the same point twice → no rows, and both lanes are the same timeline", async () => {
    const s = await session();
    const seed = await seedId();
    const data = await diff(s, `cut=main&a=${seed}&b=${seed}&timelines=1`);
    expect(data.count).toBe(0);
    expect(data.rows).toEqual([]);
    expect(data.before).toEqual(data.after);
  });

  it("the flag does not change any error code", async () => {
    const s = await session();
    const unknown = expectError(
      await get(getDiff, "/api/diff?cut=main&a=nope&b=now&timelines=1", s),
    );
    expect(unknown.code).toBe("E_COMMIT_NOT_FOUND");

    const noCut = expectError(
      await get(getDiff, "/api/diff?cut=ghost&a=now&b=now&timelines=1", s),
    );
    expect(noCut.code).toBe("E_BRANCH_NOT_FOUND");

    // A commit that exists in the project but sits on ANOTHER cut's chain.
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "side", from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );
    await edit(s, "side", {
      op: "propertyChange",
      clipId: "clip-1",
      property: "volume",
      value: 55,
    });
    const sideCard = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: "side", name: "Side pick", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    ) as { commitId: string };
    const wrongCut = expectError(
      await get(
        getDiff,
        `/api/diff?cut=main&a=${sideCard.commitId}&b=now&timelines=1`,
        s,
      ),
    );
    expect(wrongCut.code).toBe("E_BAD_REQUEST");
  });
});
