/**
 * B4b S3 — the client half of J1, without a DOM.
 *
 * `createSyncPoller` is the poller's whole decision-making (cursor,
 * overlap, failure) and `syncInvalidations` is what a tick's events mean.
 * Both are framework-free, so fake timers and a stubbed `send` prove the
 * behaviours §6 asks about without adding `@testing-library/react` — this
 * app's vitest has no jsdom environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncData, SyncEvent } from "../src/lib/data/api-client";
import { SYNC_INTERVAL_MS, createSyncPoller } from "../src/lib/data/sync-poller";
import {
  SELF_RESET_WINDOW_MS,
  decideSyncAction,
  syncInvalidations,
} from "../src/lib/data/sync-plan";

function answer(over: Partial<SyncData> = {}): SyncData {
  return { cursor: 0, events: [], peers: [], ...over };
}

function event(
  id: number,
  kind: string,
  payload: Record<string, unknown> = {},
): SyncEvent {
  return { id, kind, payload, at: "2026-09-08T12:00:00.000Z" };
}

function here() {
  return { tabId: "tab-aaaaaaaa", colourSeed: 10, cut: "main", playheadFrame: 0 };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createSyncPoller", () => {
  it("nothing is sent until start(); the first tick is immediate, then every 3s", async () => {
    const send = vi.fn().mockResolvedValue(answer());
    const poller = createSyncPoller({ send, read: here, onAnswer: () => {} });

    // The Shell's `enabled` gate is what decides whether start() is ever
    // called — before it, a tick would bootstrap a SECOND project.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).not.toHaveBeenCalled();

    poller.start();
    expect(send).toHaveBeenCalledTimes(1); // immediate, not after 3s

    await vi.advanceTimersByTimeAsync(3000);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(send).toHaveBeenCalledTimes(4);

    poller.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("the first tick sends cursor null; the answer's cursor is what the next tick sends", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(answer({ cursor: 41 }))
      .mockResolvedValueOnce(answer({ cursor: 43 }))
      .mockResolvedValue(answer({ cursor: 43 }));
    const poller = createSyncPoller({ send, read: here, onAnswer: () => {} });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls[0][0]).toEqual({ ...here(), cursor: null });

    await vi.advanceTimersByTimeAsync(3000);
    expect(send.mock.calls[1][0].cursor).toBe(41);
    await vi.advanceTimersByTimeAsync(3000);
    expect(send.mock.calls[2][0].cursor).toBe(43);

    poller.stop();
  });

  it("every tick re-reads where the tab stands — the interval closure never goes stale", async () => {
    const send = vi.fn().mockResolvedValue(answer());
    let cut = "main";
    let playheadFrame = 0;
    const poller = createSyncPoller({
      send,
      read: () => ({ tabId: "tab-aaaaaaaa", colourSeed: 10, cut, playheadFrame }),
      onAnswer: () => {},
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    cut = "priya-music";
    playheadFrame = 120;
    await vi.advanceTimersByTimeAsync(3000);

    expect(send.mock.calls[0][0]).toMatchObject({ cut: "main", playheadFrame: 0 });
    expect(send.mock.calls[1][0]).toMatchObject({
      cut: "priya-music",
      playheadFrame: 120,
    });
    poller.stop();
  });

  it("a tick still in flight makes the next one skip, rather than pile up", async () => {
    let release: ((data: SyncData) => void) | null = null;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<SyncData>((resolve) => (release = resolve)),
      )
      .mockResolvedValue(answer({ cursor: 7 }));
    const poller = createSyncPoller({ send, read: here, onAnswer: () => {} });

    poller.start();
    await vi.advanceTimersByTimeAsync(9000); // three intervals pass
    expect(send).toHaveBeenCalledTimes(1); // all skipped: still busy

    release!(answer({ cursor: 5 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].cursor).toBe(5); // the slow answer still counted
    poller.stop();
  });

  it("a rejected tick is swallowed and the interval keeps running (never the C6 banner)", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValue(answer({ cursor: 9 }));
    const onAnswer = vi.fn();
    const poller = createSyncPoller({ send, read: here, onAnswer });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(poller.cursor()).toBeNull(); // a failed tick advances nothing

    await vi.advanceTimersByTimeAsync(3000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(poller.cursor()).toBe(9);
    expect(debug).toHaveBeenCalled();
    poller.stop();
  });

  it("initialCursor is what the first tick sends — the hook's ref survives a recycle", async () => {
    const send = vi.fn().mockResolvedValue(answer({ cursor: 44 }));
    const poller = createSyncPoller({
      send,
      read: here,
      onAnswer: () => {},
      initialCursor: 41,
    });

    // `enabled` flips off on every switch to an uncached cut, so the hook
    // throws the poller away and builds another. Starting again at `null`
    // would be answered with the high-water mark and NO events.
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls[0][0].cursor).toBe(41);
    poller.stop();
  });

  it("stop() is final: an answer already in the air never reaches onAnswer", async () => {
    let release: ((data: SyncData) => void) | null = null;
    const send = vi
      .fn()
      .mockImplementation(
        () => new Promise<SyncData>((resolve) => (release = resolve)),
      );
    const onAnswer = vi.fn();
    const poller = createSyncPoller({ send, read: here, onAnswer });

    poller.start();
    poller.stop();
    release!(
      answer({ cursor: 5, events: [event(5, "commit-created", { kind: "seed" })] }),
    );
    await vi.advanceTimersByTimeAsync(100);

    // A double `refreshBranches` would be harmless; a second project reset
    // from the same batch would not.
    expect(onAnswer).not.toHaveBeenCalled();
    expect(poller.cursor()).toBeNull();
  });

  /**
   * B4b fix 5 (Codex GAP) — the two rules the React wrapper owns, driven
   * through the core the wrapper is a thin shell over. `useSyncPoller`
   * keeps the cursor in a ref OUTSIDE the poller and keys its effect on
   * `enabled` alone, with `cut` / `playheadFrame` behind refs; these two
   * tests reproduce exactly that arrangement.
   */
  it("stop → start with the kept cursor: the next request carries it, nothing is missed", async () => {
    // `enabled` flips false on every switch to a cut whose timeline is not
    // cached, so the hook throws the poller away and builds another. The
    // handoff below is the hook's `cursorRef` doing its job.
    const send = vi
      .fn()
      .mockResolvedValueOnce(answer({ cursor: 41 }))
      .mockResolvedValue(answer({ cursor: 55 }));

    let cursorRef: number | null = null; // the hook's ref
    const build = () =>
      createSyncPoller({
        send,
        read: here,
        initialCursor: cursorRef,
        onAnswer: (data) => {
          cursorRef = data.cursor;
        },
      });

    const first = build();
    first.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls[0][0].cursor).toBeNull();
    expect(cursorRef).toBe(41);

    first.stop(); // enabled → false

    const second = build(); // enabled → true again
    second.start();
    await vi.advanceTimersByTimeAsync(0);

    // Not null. A fresh cursor would be answered with the high-water mark
    // and NO events, silently swallowing everything that happened while
    // the switch was in the air.
    expect(send.mock.calls[1][0].cursor).toBe(41);
    expect(second.cursor()).toBe(55);
    second.stop();
  });

  it("a cut change or a playhead move neither restarts the poller nor fires an extra tick", async () => {
    // The hook's effect depends on `enabled` ALONE; `cut` and
    // `playheadFrame` live in refs. If they were effect dependencies, a
    // scrub would tear the interval down and rebuild it dozens of times a
    // second, each rebuild firing an immediate tick.
    const send = vi.fn().mockResolvedValue(answer({ cursor: 1 }));
    const state = { cut: "main", playheadFrame: 0 };
    const poller = createSyncPoller({
      send,
      read: () => ({ tabId: "tab-aaaaaaaa", colourSeed: 10, ...state }),
      onAnswer: () => {},
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    // 40 renders' worth of scrubbing and a cut change, inside one interval.
    for (let frame = 1; frame <= 40; frame += 1) {
      state.playheadFrame = frame;
      await vi.advanceTimersByTimeAsync(10);
    }
    state.cut = "priya-music";
    expect(send).toHaveBeenCalledTimes(1); // still only the first tick

    await vi.advanceTimersByTimeAsync(3000 - 400);
    expect(send).toHaveBeenCalledTimes(2); // the scheduled tick, on time
    expect(send.mock.calls[1][0]).toMatchObject({
      cut: "priya-music",
      playheadFrame: 40,
    });
    poller.stop();
  });

  it("start() twice does not double the interval", async () => {
    const send = vi.fn().mockResolvedValue(answer());
    const poller = createSyncPoller({ send, read: here, onAnswer: () => {} });

    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(send).toHaveBeenCalledTimes(2); // 1 immediate + 1 interval
    poller.stop();
  });
});

describe("syncInvalidations", () => {
  it("no events → no invalidation at all (a quiet tick touches nothing)", () => {
    expect(syncInvalidations([])).toEqual({
      refreshBranches: false,
      resetProject: false,
    });
  });

  it("five mixed events are ONE refreshBranches, not five", () => {
    const plan = syncInvalidations([
      event(1, "edit"),
      event(2, "ready-set"),
      event(3, "commit-created"),
      event(4, "merge-finalized"),
      event(5, "ready-cleared"),
    ]);
    // The flag is what the Shell acts on once; there is no per-event path.
    expect(plan).toEqual({ refreshBranches: true, resetProject: false });
  });

  it("an unknown kind still means 'something changed' — refreshBranches", () => {
    expect(syncInvalidations([event(1, "something-B6-adds")])).toEqual({
      refreshBranches: true,
      resetProject: false,
    });
  });

  it("an `import` is NOT a project reset — only a refresh", () => {
    // `POST /api/import` lands OTIO on ONE cut; the project and every
    // other cut survive, so resetting the whole tab would be the wrong
    // reaction. (The B4b brief listed `import` as a reset trigger; the
    // review's recommendation to drop it was taken.)
    expect(syncInvalidations([event(1, "edit"), event(2, "import")])).toEqual({
      refreshBranches: true,
      resetProject: false,
    });
    expect(syncInvalidations([event(2, "import")])).toEqual({
      refreshBranches: true,
      resetProject: false,
    });
  });

  it("a seed card is the reset signal New project ACTUALLY writes", () => {
    // `resetProjectToPreset` deletes the whole feed and re-seeds, so this
    // is the first row of a brand new feed — the other tab's project has
    // been replaced under it.
    expect(
      syncInvalidations([event(9, "commit-created", { kind: "seed" })]),
    ).toEqual({ refreshBranches: true, resetProject: true });
  });

  it("an ordinary commit is NOT a reset — only `kind: \"seed\"` is", () => {
    expect(
      syncInvalidations([event(9, "commit-created", { kind: "manual" })]),
    ).toEqual({ refreshBranches: true, resetProject: false });
    expect(syncInvalidations([event(9, "commit-created")])).toEqual({
      refreshBranches: true,
      resetProject: false,
    });
  });

  it("the plan can never name the bring-in key: it is two booleans", () => {
    const plan = syncInvalidations([event(1, "ready-set")]);
    expect(Object.keys(plan).sort()).toEqual(["refreshBranches", "resetProject"]);
    expect(JSON.stringify(plan)).not.toContain("bring-in");
  });
});

/**
 * Codex BUG 1 — the one-shot guard that stops the tab which CLICKED
 * New project from resetting itself a second time when its own `seed`
 * event comes home 0-3s later.
 */
describe("decideSyncAction — the self-reset guard", () => {
  const NOW = 1_700_000_000_000;
  const seed = () => syncInvalidations([event(9, "commit-created", { kind: "seed" })]);
  const edit = () => syncInvalidations([event(9, "edit")]);

  it("no arm → a seed is the OTHER tab's New project: reset, as always", () => {
    expect(decideSyncAction(seed(), null, NOW)).toEqual({
      action: "reset-project",
      disarmSelfReset: true,
    });
  });

  it("armed → this tab's OWN seed is swallowed, but the batch still refreshes", () => {
    // The reset already ran on the click. Running it again would undo the
    // playhead move / selection / panel switch made since.
    expect(decideSyncAction(seed(), NOW - 2500, NOW)).toEqual({
      action: "refresh-branches",
      disarmSelfReset: true,
    });
  });

  it("the arm is ONE-SHOT: the second seed in the same window still resets", () => {
    const first = decideSyncAction(seed(), NOW - 100, NOW);
    expect(first.disarmSelfReset).toBe(true);
    // The Shell drops the arm on `disarmSelfReset`, so the next call is
    // the unarmed one — the other tab is allowed to reset us immediately.
    expect(decideSyncAction(seed(), null, NOW + 50).action).toBe("reset-project");
  });

  it("the arm expires with the window, so a stale one cannot swallow a real reset", () => {
    expect(decideSyncAction(seed(), NOW - (SELF_RESET_WINDOW_MS - 1), NOW).action).toBe(
      "refresh-branches",
    );
    expect(decideSyncAction(seed(), NOW - SELF_RESET_WINDOW_MS, NOW).action).toBe(
      "reset-project",
    );
    expect(decideSyncAction(seed(), NOW - 60_000, NOW).action).toBe("reset-project");
  });

  it("a batch with no reset does NOT consume the arm", () => {
    // The tick already in the air when the mutation answered can come back
    // holding the other tab's `edit`. Clearing here would leave the seed on
    // the NEXT tick to reset this tab anyway — the exact bug being fixed.
    expect(decideSyncAction(edit(), NOW - 10, NOW)).toEqual({
      action: "refresh-branches",
      disarmSelfReset: false,
    });
  });

  it("a quiet tick asks for nothing and leaves the arm alone", () => {
    expect(decideSyncAction(syncInvalidations([]), NOW - 10, NOW)).toEqual({
      action: "none",
      disarmSelfReset: false,
    });
  });

  it("the window is one poll interval plus the tick already in flight", () => {
    expect(SELF_RESET_WINDOW_MS).toBe(2 * SYNC_INTERVAL_MS);
  });
});
