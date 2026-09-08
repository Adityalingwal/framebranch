/**
 * I1 — the agent preset registry, `POST /api/agent/run` and the DERIVED run
 * state behind `GET /api/agent/presets`.
 *
 * The boundary properties of a run (one commit, agent ops, atomic failure,
 * no orphan cut) are asserted in `boundary.test.ts`; this file covers the
 * registry's contents, the derived state, and the 3x2 matrix that proves
 * every preset runs on every shipped fixture.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Clip, TextClip, Timeline } from "@framebranch/engine";

import { branches, commits, projectEvents } from "../src/db/schema";
import { GET as getAgentPresets } from "../src/app/api/agent/presets/route";
import type { AgentPresetsData } from "../src/app/api/agent/presets/route";
import { POST as postAgentRun } from "../src/app/api/agent/run/route";
import {
  GET as getBranches,
  POST as postBranch,
} from "../src/app/api/branch/route";
import { POST as postCommit } from "../src/app/api/commit/route";
import { GET as getDiff } from "../src/app/api/diff/route";
import type { DiffResponse } from "../src/app/api/diff/route";
import { GET as getHistory } from "../src/app/api/history/route";
import type { HistoryItem } from "../src/app/api/history/route";
import { POST as postOps } from "../src/app/api/ops/route";
import { POST as postProjectNew } from "../src/app/api/project/new/route";
import { GET as getTimeline } from "../src/app/api/timeline/route";
import { clipDisplayName, findMediaRef } from "../src/lib/clip-helpers";
import { runSummary } from "../src/server/diff-rows";
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
type RunData = {
  cut: string;
  commitId: string;
  name: string;
  opsApplied: number;
};

const NAME_HEADER = { "X-Editor-Name": "Priya" };

async function session(): Promise<Session> {
  const s: Session = { token: null };
  await get(getTimeline, "/api/timeline?branch=main", s);
  return s;
}

/** Swap the whole project over to another preset (New project). */
async function startProject(s: Session, preset: string): Promise<void> {
  expectOk(
    await post(postProjectNew, "/api/project/new", { preset, ticket: ticket() }, s),
  );
}

const view = async (s: Session, cut = "main"): Promise<TimelineData> =>
  expectOk(
    await get(getTimeline, `/api/timeline?branch=${cut}`, s),
  ) as TimelineData;

const presetsOf = async (s: Session): Promise<AgentPresetsData> =>
  expectOk(
    await get(getAgentPresets, "/api/agent/presets", s),
  ) as AgentPresetsData;

const historyOf = async (
  s: Session,
  cut: string,
): Promise<{ commits: HistoryItem[] }> =>
  expectOk(await get(getHistory, `/api/history?cut=${cut}`, s)) as {
    commits: HistoryItem[];
  };

const run = async (
  s: Session,
  preset: string,
  key = ticket(),
): Promise<RunData> =>
  expectOk(
    await post(
      postAgentRun,
      "/api/agent/run",
      { preset, ticket: key },
      s,
      NAME_HEADER,
    ),
  ) as RunData;

/** Clips of the first video track, left to right. */
function videoClips(timeline: Timeline) {
  const track = timeline.tracks.find((t) => t.kind === "video");
  return [...(track?.clips ?? [])].sort(
    (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
  );
}

function textClips(timeline: Timeline) {
  const track = timeline.tracks.find((t) => t.kind === "text");
  return [...(track?.clips ?? [])].sort(
    (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
  );
}

/**
 * `Track.clips` is `Clip[] | TextClip[]`, so reading a media clip's own
 * fields needs the narrowing the track kind already guarantees.
 */
const asMediaClip = (clip: unknown): Clip => clip as Clip;
const asTextClip = (clip: unknown): TextClip => clip as TextClip;

/** The name the editor sees on a clip — what a caption has to read. */
const displayNameOf = (timeline: Timeline, clip: unknown): string =>
  clipDisplayName(
    asMediaClip(clip),
    findMediaRef(timeline, asMediaClip(clip).mediaRefId),
  );

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// The registry (copy #176-#178)
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("GET /api/agent/presets — the registry", () => {
  it("lists exactly three presets, in order, with their one-liners verbatim", async () => {
    const s = await session();
    const data = await presetsOf(s);
    expect(data.presets).toEqual([
      {
        id: "tighten-intro",
        name: "Tighten intro",
        description:
          "Trims the opening, dips a clip's volume and swaps the caption for B-roll.",
        run: null,
      },
      {
        id: "trim-silences",
        name: "Trim silences",
        description: "Shortens the interview clip at both ends.",
        run: null,
      },
      {
        id: "add-captions",
        name: "Add captions",
        description: "Puts a text caption over the second and third video clips.",
        run: null,
      },
    ]);
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// One click = one transaction (I1 patch (a))
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("POST /api/agent/run — one click, one cut, one card", () => {
  it("forks `agent-‹id›` off main's head with createdBy Agent, even under X-Editor-Name", async () => {
    const s = await session();
    const mainBefore = (
      await getDb().select().from(branches).where(eq(branches.name, "main"))
    )[0];

    const data = await run(s, "tighten-intro");
    expect(data.cut).toBe("agent-tighten-intro");
    expect(data.opsApplied).toBe(4);

    const cuts = expectOk(await get(getBranches, "/api/branch", s)) as {
      branches: { name: string; head: string; createdBy: string | null }[];
    };
    const agentCut = cuts.branches.find((b) => b.name === "agent-tighten-intro");
    // F2a: a person clicked, but the CUT belongs to the agent (#186).
    expect(agentCut?.createdBy).toBe("Agent");
    expect(agentCut?.head).toBe(data.commitId);

    // main is untouched: same head, same working rev, no pending ops.
    const mainAfter = (
      await getDb().select().from(branches).where(eq(branches.name, "main"))
    )[0];
    expect(mainAfter.headCommitId).toBe(mainBefore.headCommitId);
    const mainView = await view(s, "main");
    expect(mainView.workingRev).toBe(0);
    expect(mainView.pendingCount).toBe(0);

    // History on the agent cut: the run card on top, one parent = main's head.
    const history = await historyOf(s, "agent-tighten-intro");
    expect(history.commits[0].kind).toBe("agent-run");
    expect(history.commits[0].name).toBe("Tighten intro");
    expect(history.commits[0].actorName).toBe("Agent");
    expect(history.commits[0].parents).toEqual([mainBefore.headCommitId]);
    expect(history.commits[0].changes).toBeGreaterThan(0);

    // Both events rode in the run's own transaction, with their payloads.
    const events = await getDb().select().from(projectEvents);
    const branchCreated = events.filter((e) => e.kind === "branch-created");
    expect(branchCreated).toHaveLength(1);
    expect(branchCreated[0].payload).toEqual({
      branch: "agent-tighten-intro",
      from: "main",
      head: mainBefore.headCommitId,
      // #186 — the CUT belongs to the agent, on the event too.
      createdBy: "Agent",
    });
    // The seed's first card already wrote a `commit-created` event, so the
    // run's own is found by its commit id, never by kind alone.
    const commitEvents = events.filter(
      (e) =>
        e.kind === "commit-created" && e.payload.commitId === data.commitId,
    );
    expect(commitEvents).toHaveLength(1);
    expect(commitEvents[0].payload).toEqual({
      commitId: data.commitId,
      kind: "agent-run",
      name: "Tighten intro",
      branch: "agent-tighten-intro",
      actorName: "Agent",
    });
  });

  it("a dirty main is sealed first and the fork starts at that auto card", async () => {
    const s = await session();
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
            value: 80,
          },
        },
        s,
        NAME_HEADER,
      ),
    );

    const data = await run(s, "tighten-intro");

    const mainHistory = await historyOf(s, "main");
    // Exactly one auto card on main, named by the summary presenter and
    // carrying the EDITOR's name — the person is who left main dirty.
    expect(mainHistory.commits[0].kind).toBe("auto");
    expect(mainHistory.commits[0].actorName).toBe("Priya");
    expect(mainHistory.commits.filter((c) => c.kind === "auto")).toHaveLength(1);

    const agentHistory = await historyOf(s, "agent-tighten-intro");
    expect(agentHistory.commits[0].commitId).toBe(data.commitId);
    // The fork is from the SEAL, not from the pre-seal head.
    expect(agentHistory.commits[0].parents).toEqual([
      mainHistory.commits[0].commitId,
    ]);
    // And the agent's timeline carries the human's edit.
    const agentView = await view(s, "agent-tighten-intro");
    const first = videoClips(agentView.timeline)[0];
    // the agent then overrode it with its own 40
    expect((first as { properties: { volume: number } }).properties.volume).toBe(40);
  });

  it("a second click on the same preset is E_BRANCH_EXISTS and writes nothing", async () => {
    const s = await session();
    await run(s, "tighten-intro");
    const before = await getDb().select().from(commits);

    const call = await post(
      postAgentRun,
      "/api/agent/run",
      { preset: "tighten-intro", ticket: ticket() },
      s,
    );
    expect(expectError(call).code).toBe("E_BRANCH_EXISTS");
    const after = await getDb().select().from(commits);
    expect(after).toHaveLength(before.length);
  });

  it("replaying the SAME ticket returns the identical answer, still one cut and one card", async () => {
    const s = await session();
    const key = ticket();
    const first = await run(s, "tighten-intro", key);
    const replay = await run(s, "tighten-intro", key);
    expect(replay).toEqual(first);

    const rows = await getDb().select().from(branches);
    expect(rows.filter((r) => r.name === "agent-tighten-intro")).toHaveLength(1);
    const cards = await getDb()
      .select()
      .from(commits)
      .where(eq(commits.kind, "agent-run"));
    expect(cards).toHaveLength(1);
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// The 3x2 matrix — every preset on every shipped fixture
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("every preset runs on every shipped preset project", () => {
  for (const project of ["travel-vlog", "thirty-second-ad"] as const) {
    describe(project, () => {
      it("tighten-intro: volume, caption delete, B-roll at 0:20, end-trim", async () => {
        const s = await session();
        await startProject(s, project);
        const before = await view(s, "main");
        // Everything is identified by the id it had BEFORE the run: the
        // added clip lands inside the track, so positions move.
        const beforeVideo = videoClips(before.timeline);
        const [clipA, clipB] = beforeVideo;
        const caption = textClips(before.timeline)[0];

        const data = await run(s, "tighten-intro");
        expect(data.opsApplied).toBe(4);

        const after = await view(s, data.cut);
        const afterVideo = videoClips(after.timeline);
        // the added B-roll clip sits in the free 0:20-0:25 stretch
        expect(afterVideo).toHaveLength(beforeVideo.length + 1);
        const added = afterVideo.find(
          (c) => c.timelineRange.start.value === 480,
        );
        expect(added).toBeDefined();
        expect(added?.timelineRange.duration.value).toBe(120);
        // …and it really is the fixture's b-roll, not some other media ref
        const broll = before.timeline.mediaRefs.find((ref) =>
          ref.url.endsWith("broll.mp4"),
        );
        expect(broll).toBeDefined();
        expect(asMediaClip(added).mediaRefId).toBe(broll?.id);

        // V1[0] carries the agent's 40 …
        const afterA = afterVideo.find((c) => c.id === clipA.id);
        expect(asMediaClip(afterA).properties.volume).toBe(40);
        // … V1[1] is exactly 2s (48 frames) shorter, trimmed at its END
        // (its start does not move) …
        const afterB = afterVideo.find((c) => c.id === clipB.id);
        expect(afterB?.timelineRange.duration.value).toBe(
          clipB.timelineRange.duration.value - 48,
        );
        expect(afterB?.timelineRange.start.value).toBe(
          clipB.timelineRange.start.value,
        );
        // … and T1's first clip is gone, that one and no other.
        expect(textClips(after.timeline)).toHaveLength(
          textClips(before.timeline).length - 1,
        );
        expect(
          textClips(after.timeline).some((c) => c.id === caption.id),
        ).toBe(false);
      });

      it("trim-silences: the first video clip loses 48 frames (1s at each end)", async () => {
        const s = await session();
        await startProject(s, project);
        const before = await view(s, "main");
        const beforeFirst = videoClips(before.timeline)[0];

        const data = await run(s, "trim-silences");
        expect(data.opsApplied).toBe(2);

        const after = await view(s, data.cut);
        const afterFirst = videoClips(after.timeline)[0];
        // Assert the RESULT, not the sign: the engine's trim convention is
        // "minus = cut, plus = extend" on both edges.
        expect(afterFirst.timelineRange.duration.value).toBe(
          beforeFirst.timelineRange.duration.value - 48,
        );
        expect(afterFirst.timelineRange.start.value).toBe(
          beforeFirst.timelineRange.start.value + 24,
        );
      });

      it("add-captions: two text clips whose ranges equal V1[1] and V1[2]", async () => {
        const s = await session();
        await startProject(s, project);
        const before = await view(s, "main");
        const [, second, third] = videoClips(before.timeline);

        const data = await run(s, "add-captions");
        expect(data.opsApplied).toBe(2);

        const after = await view(s, data.cut);
        const captions = textClips(after.timeline).filter(
          (c) =>
            c.timelineRange.start.value === second.timelineRange.start.value ||
            c.timelineRange.start.value === third.timelineRange.start.value,
        );
        expect(captions).toHaveLength(2);
        expect(captions[0].timelineRange).toEqual(second.timelineRange);
        expect(captions[1].timelineRange).toEqual(third.timelineRange);
        // Each caption reads exactly what the editor sees on the clip it
        // covers — the SAME `clipDisplayName` the Inspector and the Compare
        // rows use, so the two can never disagree.
        expect(asTextClip(captions[0]).textContent).toBe(
          displayNameOf(before.timeline, second),
        );
        expect(asTextClip(captions[1]).textContent).toBe(
          displayNameOf(before.timeline, third),
        );
      });

      it("all three run on one project and none of them applies zero ops", async () => {
        const s = await session();
        await startProject(s, project);
        for (const preset of [
          "tighten-intro",
          "trim-silences",
          "add-captions",
        ]) {
          const data = await run(s, preset);
          // A run with 0 applied ops WOULD still create the cut and a card
          // (an empty commit); no preset/fixture combination reaches it.
          expect(data.opsApplied).toBeGreaterThan(0);
        }
        const answers = await presetsOf(s);
        expect(answers.presets.every((p) => p.run !== null)).toBe(true);
      });
    });
  }
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// The derived run state (I1 patch (b) — OPTION B, no table)
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("GET /api/agent/presets — the derived run state", () => {
  it("after a run, `run` matches the card and `summary` is runSummary of the diff", async () => {
    const s = await session();
    const data = await run(s, "tighten-intro");
    const history = await historyOf(s, data.cut);
    const card = history.commits[0];

    const answers = await presetsOf(s);
    const preset = answers.presets.find((p) => p.id === "tighten-intro");
    expect(preset?.run).toEqual({
      cut: "agent-tighten-intro",
      commitId: data.commitId,
      parentId: card.parents[0],
      at: card.createdAt,
      changes: card.changes,
      summary: expect.any(String),
    });

    const diff = expectOk(
      await get(
        getDiff,
        `/api/diff?cut=${data.cut}&a=${card.parents[0]}&b=${data.commitId}`,
        s,
      ),
    ) as DiffResponse;
    expect(preset?.run?.summary).toBe(runSummary(diff.rows));
    expect(preset?.run?.changes).toBe(diff.count);
    // The other two are still offered.
    expect(
      answers.presets.filter((p) => p.run === null).map((p) => p.id),
    ).toEqual(["trim-silences", "add-captions"]);
  });

  it("the run state still points at the run card after the cut's head moves past it", async () => {
    const s = await session();
    const data = await run(s, "tighten-intro");

    // An extra op + Mark on the agent cut: the head is no longer the card.
    const agentView = await view(s, data.cut);
    expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: data.cut,
          workingRev: agentView.workingRev,
          ticket: ticket(),
          command: {
            op: "propertyChange",
            clipId: videoClips(agentView.timeline)[0].id,
            property: "volume",
            value: 55,
          },
        },
        s,
        NAME_HEADER,
      ),
    );
    expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: data.cut, name: "Later", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );

    const answers = await presetsOf(s);
    const preset = answers.presets.find((p) => p.id === "tighten-intro");
    expect(preset?.run?.commitId).toBe(data.commitId);
  });

  it("New project deletes every cut, so every preset is offered again", async () => {
    const s = await session();
    await run(s, "tighten-intro");
    await run(s, "trim-silences");
    expect((await presetsOf(s)).presets.filter((p) => p.run !== null)).toHaveLength(2);

    await startProject(s, "thirty-second-ad");
    const answers = await presetsOf(s);
    expect(answers.presets.every((p) => p.run === null)).toBe(true);
  });

  /**
   * B4a fix 2 (Codex BUG 2) — nothing reserves the `agent-` prefix, so a
   * person can make `agent-add-captions` by hand from the New-cut box. The
   * preset then reads `Done` with no run card behind it, and the time the
   * panel shows must be when that CUT appeared — the head card's time moves
   * on every Mark, which is a run log that changes by itself.
   */
  it("a hand-made `agent-‹id›` cut reports the branch's creation time, not its head card's", async () => {
    const s = await session();
    const cut = "agent-add-captions";
    expectOk(
      await post(
        postBranch,
        "/api/branch",
        { name: cut, from: "main", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    );

    const created = (await getDb().select().from(projectEvents)).find(
      (event) =>
        event.kind === "branch-created" && event.payload.branch === cut,
    );
    expect(created).toBeDefined();

    // …and then Marks a version on it: the head moves, with a later time.
    const cutView = await view(s, cut);
    expectOk(
      await post(
        postOps,
        "/api/ops",
        {
          branch: cut,
          workingRev: cutView.workingRev,
          ticket: ticket(),
          command: {
            op: "propertyChange",
            clipId: videoClips(cutView.timeline)[0].id,
            property: "volume",
            value: 55,
          },
        },
        s,
        NAME_HEADER,
      ),
    );
    const mark = expectOk(
      await post(
        postCommit,
        "/api/commit",
        { branch: cut, name: "By hand", ticket: ticket() },
        s,
        NAME_HEADER,
      ),
    ) as { commitId: string };

    const answers = await presetsOf(s);
    const preset = answers.presets.find((p) => p.id === "add-captions");
    // The panel-facing shape is unchanged: `Done`, and a log entry with no
    // line 3 and a dead `View` (commitId null).
    expect(preset?.run).toEqual({
      cut,
      commitId: null,
      parentId: null,
      at: created!.createdAt.toISOString(),
      changes: 0,
      summary: "",
    });

    const head = (
      await getDb().select().from(commits).where(eq(commits.id, mark.commitId))
    )[0];
    expect(preset?.run?.at).not.toBe(head.createdAt.toISOString());
  });
});
