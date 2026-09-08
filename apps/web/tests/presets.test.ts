/**
 * C-B — preset registry, `POST /api/project/new`, `GET /api/presets`,
 * and the C7 dev-time guard (every preset is 24 fps).
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { importOtio } from "@framebranch/engine";

import { commits, projectEvents } from "../src/db/schema";
import { GET as getBranches, POST as postBranch } from "../src/app/api/branch/route";
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
    // B4a lock (1): two presets, `travel-vlog` first (it is the default).
    expect(data.presets).toEqual([
      {
        id: "travel-vlog",
        name: "Travel vlog",
        clipCount: 5,
        duration: "00:00:22:00",
      },
      {
        id: "thirty-second-ad",
        name: "30s ad",
        clipCount: 7,
        // The name is honest: the fixture really runs 30 seconds.
        duration: "00:00:30:00",
      },
    ]);
  });

  it("the `30s ad` fixture is 720 frames of the SAME four media files", () => {
    const ad = PRESETS.find((preset) => preset.id === "thirty-second-ad");
    expect(ad).toBeDefined();
    const imported = importOtio(loadPresetOtio(ad!));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.warnings).toEqual([]);
    expect(imported.timeline.projectRate).toBe(24);
    expect(
      [...imported.timeline.mediaRefs.map((ref) => ref.url)].sort(),
    ).toEqual([
      "/media/broll.mp4",
      "/media/interview.mp4",
      "/media/logo.png",
      "/media/music.wav",
    ]);
    const end = Math.max(
      ...imported.timeline.tracks.flatMap((track) =>
        track.clips.map(
          (clip) =>
            clip.timelineRange.start.value + clip.timelineRange.duration.value,
        ),
      ),
    );
    expect(end).toBe(720);
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

  it("with `thirty-second-ad` → a seed card named `30s ad` on main", async () => {
    const s = await session();
    const data = expectOk(
      await post(
        postProjectNew,
        "/api/project/new",
        { preset: "thirty-second-ad", ticket: ticket() },
        s,
      ),
    ) as { preset: { id: string; name: string }; branch: string; head: string };
    expect(data.preset).toEqual({ id: "thirty-second-ad", name: "30s ad" });
    expect(data.branch).toBe("main");

    const rows = await getDb().select().from(commits);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("seed");
    expect(rows[0].name).toBe("30s ad");
  });

  it("from a non-main cut the answer is still `main` — the old cuts are gone", async () => {
    const s = await session();
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: "priya-music", from: "main", ticket: ticket() },
        s,
      ),
    );
    const data = expectOk(
      await post(
        postProjectNew,
        "/api/project/new",
        { preset: "thirty-second-ad", ticket: ticket() },
        s,
      ),
    ) as { branch: string };
    expect(data.branch).toBe("main");

    const cuts = expectOk(await get(getBranches, "/api/branch", s)) as {
      branches: { name: string }[];
    };
    expect(cuts.branches.map((cut) => cut.name)).toEqual(["main"]);
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
