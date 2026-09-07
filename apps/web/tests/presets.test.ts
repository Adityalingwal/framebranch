/**
 * C-B — preset registry, `POST /api/project/new`, `GET /api/presets`,
 * and the C7 dev-time guard (every preset is 24 fps).
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { importOtio } from "@framebranch/engine";

import { commits, projectEvents } from "../src/db/schema";
import { GET as getPresets } from "../src/app/api/presets/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { POST as postDemoReset } from "../src/app/api/demo/reset/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { POST as postProjectNew } from "../src/app/api/project/new/route";
import { PRESETS, loadPresetOtio } from "../src/server/presets";
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

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

describe("preset registry", () => {
  it("C7 dev-time guard: every preset imports cleanly at 24 fps with names on every clip", () => {
    expect(PRESETS.length).toBeGreaterThan(0);
    for (const preset of PRESETS) {
      const imported = importOtio(loadPresetOtio(preset));
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      expect(imported.timeline.projectRate).toBe(24);
      expect(imported.warnings).toEqual([]);
      for (const track of imported.timeline.tracks) {
        expect(track.name).toBeTruthy();
        for (const clip of track.clips) expect(clip.name).toBeTruthy();
      }
    }
  });

  it("GET /api/presets lists id, name, clip count and a 4-part duration", async () => {
    const s = await session();
    const data = expectOk(await get(getPresets, "/api/presets", s)) as {
      presets: { id: string; name: string; clipCount: number; duration: string }[];
    };
    expect(data.presets).toEqual([
      {
        id: "travel-vlog",
        name: "Travel vlog",
        clipCount: 5,
        duration: "00:00:22:00",
      },
    ]);
  });
});

describe("POST /api/project/new", () => {
  it("with an unknown preset → 400 E_BAD_REQUEST and nothing is deleted", async () => {
    const s = await session();
    const before = await getDb().select().from(commits);
    const call = await post(
      postProjectNew,
      "/api/project/new",
      { preset: "does-not-exist", ticket: ticket() },
      s,
    );
    expect(call.status).toBe(400);
    expect(expectError(call).code).toBe("E_BAD_REQUEST");
    const after = await getDb().select().from(commits);
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
  });

  it("with the only preset → a fresh project whose seed card is kind=seed, named after the preset, actor_name null", async () => {
    const s = await session();
    // dirty the project first so the reset is visible
    expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: "main",
          workingRev: 0,
          ticket: ticket(),
          command: {
            op: "propertyChange",
            clipId: "clip-1",
            property: "volume",
            value: 10,
          },
        },
        s,
      ),
    );

    const data = expectOk(
      await post(
        postProjectNew,
        "/api/project/new",
        { preset: "travel-vlog", ticket: ticket() },
        s,
      ),
    ) as {
      preset: { id: string; name: string };
      branch: string;
      head: string;
      workingRev: number;
      pendingCount: number;
      timeline: { tracks: { clips: unknown[] }[] };
    };
    expect(data.preset).toEqual({ id: "travel-vlog", name: "Travel vlog" });
    expect(data.branch).toBe("main");
    expect(data.workingRev).toBe(0);
    expect(data.pendingCount).toBe(0);

    const rows = await getDb().select().from(commits);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(data.head);
    expect(rows[0].kind).toBe("seed");
    expect(rows[0].name).toBe("Travel vlog");
    expect(rows[0].actorName).toBeNull();

    // events were wiped with the project state; only the new seed's remains
    const events = await getDb()
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.projectId, rows[0].projectId));
    expect(events).toHaveLength(1);
  });

  it("POST /api/demo/reset is a thin alias: same seed, default preset", async () => {
    const s = await session();
    expectOk(
      await post(postDemoReset, "/api/demo/reset", { ticket: ticket() }, s),
    );
    const rows = await getDb().select().from(commits);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("seed");
    expect(rows[0].name).toBe("Travel vlog");
  });
});
