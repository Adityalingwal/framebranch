/**
 * Bootstrap and seed tests — project creation, demo fixture import, project rate.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { importOtio } from "@framebranch/engine";
import type { Timeline } from "@framebranch/engine";

import { commits, projects, snapshots } from "../src/db/schema";
import { demoOtioJson } from "../src/server/demo-fixture";
import { bootstrapProject } from "../src/server/project";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { GET as getHistory } from "../src/app/api/history/route";
import {
  closeDb,
  expectError,
  expectOk,
  get,
  getDb,
  resetDatabase,
} from "./helpers";
import type { Session } from "./helpers";

beforeEach(resetDatabase);
afterAll(closeDb);

const countClips = (timeline: Timeline): number =>
  timeline.tracks.reduce((n, track) => n + track.clips.length, 0);

describe("C8 step 1 — the demo.otio fixture", () => {
  it("C8: imports through the M5 importer with ZERO warnings and 5 clips", () => {
    const result = importOtio(demoOtioJson());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(countClips(result.timeline)).toBe(5);
    expect(result.timeline.tracks.map((t) => t.kind)).toEqual([
      "video",
      "audio",
      "text",
    ]);
    // The b-roll media the agent's step-3 addClip of clip D needs is
    // already in the fixture (C8 F12).
    expect(result.timeline.mediaRefs.map((m) => m.url)).toContain(
      "/media/broll.mp4",
    );
  });
});

describe("first visit bootstrap", () => {
  it("a first request with no cookie creates a project, seeds it, and sets an HttpOnly cookie", async () => {
    const session: Session = { token: null };
    const call = await get(getTimeline, "/api/timeline?branch=main", session);
    const data = expectOk(call) as {
      timeline: Timeline;
      workingRev: number;
      pendingCount: number;
    };

    expect(call.status).toBe(200);
    const cookie = call.response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(session.token).toBeTruthy();

    expect(countClips(data.timeline)).toBe(5);
    expect(data.workingRev).toBe(0);
    expect(data.pendingCount).toBe(0);
  });

  it("project_rate comes from the imported OTIO, not a hardcoded default", async () => {
    await get(getTimeline, "/api/timeline?branch=main");
    const rows = await getDb().select().from(projects);
    expect(rows).toHaveLength(1);
    const imported = importOtio(demoOtioJson());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(rows[0].projectRate).toBe(imported.timeline.projectRate);
  });

  it("the import commit is a full snapshot and stores its warning list", async () => {
    await get(getTimeline, "/api/timeline?branch=main");
    const commitRows = await getDb().select().from(commits);
    expect(commitRows).toHaveLength(1);
    expect(commitRows[0].parentId).toBeNull();
    expect(commitRows[0].parent2Id).toBeNull();
    expect(commitRows[0].snapshotDistance).toBe(0);
    expect(commitRows[0].importWarnings).toEqual([]);

    const snapshotRows = await getDb()
      .select()
      .from(snapshots)
      .where(eq(snapshots.commitId, commitRows[0].id));
    expect(snapshotRows).toHaveLength(1);
    expect(countClips(snapshotRows[0].timeline)).toBe(5);
  });

  it("C4/B2: GET history?cut=main reports the seed card with kind, names, parents and 0 changes", async () => {
    const session: Session = { token: null };
    await get(getTimeline, "/api/timeline?branch=main", session);
    const data = expectOk(
      await get(getHistory, "/api/history?cut=main", session),
    ) as {
      cut: string;
      commits: {
        name: string;
        kind: string;
        actorName: string | null;
        parents: string[];
        changes: number;
        importWarnings: unknown;
      }[];
    };
    expect(data.cut).toBe("main");
    expect(data.commits).toHaveLength(1);
    expect(data.commits[0].kind).toBe("seed");
    expect(data.commits[0].name).toBe("Travel vlog");
    expect(data.commits[0].actorName).toBeNull();
    expect(data.commits[0].parents).toEqual([]);
    expect(data.commits[0].changes).toBe(0);
    expect(data.commits[0].importWarnings).toEqual([]);

    // B2: the cut is required, and an unknown cut is the usual 404.
    expect(expectError(await get(getHistory, "/api/history", session)).code).toBe(
      "E_BAD_REQUEST",
    );
    const unknown = await get(getHistory, "/api/history?cut=nope", session);
    expect(unknown.status).toBe(404);
    expect(expectError(unknown).code).toBe("E_BRANCH_NOT_FOUND");
  });

  it("E_BRANCH_NOT_FOUND: asking for a branch that does not exist is a 404, not a crash", async () => {
    const call = await get(getTimeline, "/api/timeline?branch=nope");
    expect(call.status).toBe(404);
    expect(expectError(call).code).toBe("E_BRANCH_NOT_FOUND");
  });
});

describe("100-project cap", () => {
  it("creating projects past the cap deletes the oldest and leaves no orphan rows", async () => {
    const db = getDb();
    for (let i = 0; i < 103; i += 1) {
      await bootstrapProject(db);
    }
    const projectRows = await db.select({ id: projects.id }).from(projects);
    expect(projectRows.length).toBe(100);

    // Cascading deletes: nothing may survive its project.
    const orphanCommits = await db.execute(
      "select count(*)::int as n from commits c left join projects p on p.id = c.project_id where p.id is null",
    );
    expect((orphanCommits as unknown as { n: number }[])[0].n).toBe(0);
  });
});
