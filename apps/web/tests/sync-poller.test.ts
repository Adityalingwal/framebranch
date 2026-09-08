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
import { createSyncPoller } from "../src/lib/data/sync-poller";
import { syncInvalidations } from "../src/lib/data/sync-plan";

function answer(over: Partial<SyncData> = {}): SyncData {
  return { cursor: 0, events: [], peers: [], ...over };
}

function event(id: number, kind: string): SyncEvent {
  return { id, kind, payload: {}, at: "2026-09-08T12:00:00.000Z" };
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

  it("an `import` event asks for the New-project reset as well", () => {
    expect(syncInvalidations([event(1, "edit"), event(2, "import")])).toEqual({
      refreshBranches: true,
      resetProject: true,
    });
  });

  it("the plan can never name the bring-in key: it is two booleans", () => {
    const plan = syncInvalidations([event(1, "ready-set")]);
    expect(Object.keys(plan).sort()).toEqual(["refreshBranches", "resetProject"]);
    expect(JSON.stringify(plan)).not.toContain("bring-in");
  });
});
