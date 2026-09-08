/**
 * sync-poller.ts — the 3s heartbeat, without React.
 *
 * J1's whole client channel is a `setInterval` that POSTs where this tab
 * is and what it last saw. Everything that could go wrong in that loop —
 * the cursor, an overlapping tick, a failed tick — is decided here, in a
 * plain object, so it can be driven by fake timers in a node test. The
 * hook next door is only refs and state around `start()` / `stop()`.
 *
 * There is no jsdom in this app's test setup and the brief forbids adding
 * a dependency for one hook, so this split is what keeps the gate and the
 * cadence provable rather than merely argued.
 */

import type { SyncData } from "./api-client";

/** J1 IMPL-NOTE — the locked cadence. Not configurable in the app. */
export const SYNC_INTERVAL_MS = 3000;

export type SyncRequest = {
  tabId: string;
  cut: string;
  playheadFrame: number;
  colourSeed: number;
  cursor: number | null;
};

export type SyncPollerOptions = {
  /** Usually `api.postSync`; a stub in tests. */
  send: (body: SyncRequest) => Promise<SyncData>;
  /**
   * Where this tab stands RIGHT NOW, read fresh at every tick. The hook
   * backs this with refs, so a moving playhead never restarts the timer
   * and the interval's closure can never go stale.
   */
  read: () => { tabId: string; colourSeed: number; cut: string; playheadFrame: number };
  /** Called with each successful answer, on the tick's own turn. */
  onAnswer: (data: SyncData) => void;
  /**
   * Where to carry on from. The hook keeps the cursor in a ref OUTSIDE
   * this object, because the effect recycles the poller whenever
   * `enabled` flips — which it does on every switch to a cut whose
   * timeline is not cached yet. Starting again at `null` there would make
   * the server answer with the high-water mark and NO events, silently
   * losing everything that happened during that window.
   */
  initialCursor?: number | null;
  intervalMs?: number;
};

export type SyncPoller = {
  start: () => void;
  stop: () => void;
  /** Tests only — what the next tick will send as its cursor. */
  cursor: () => number | null;
};

export function createSyncPoller(options: SyncPollerOptions): SyncPoller {
  const intervalMs = options.intervalMs ?? SYNC_INTERVAL_MS;

  /**
   * null only on a genuinely fresh tab. The server reads that as "this
   * tab has just fetched everything it shows": it hands back the current
   * high-water mark and NO events, because replaying the feed would only
   * re-run invalidations.
   */
  let cursor: number | null = options.initialCursor ?? null;
  /** A tick still in flight → skip this one rather than pile up. */
  let busy = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  /**
   * `stop()` must be final. The hook throws this instance away and builds
   * another; without the guard a tick already in the air would land after
   * the swap and hand the SAME batch of events to `onAnswer` a second
   * time. A double `refreshBranches` is harmless — a double project reset
   * is not.
   */
  let stopped = false;

  function tick(): void {
    if (busy || stopped) return;
    busy = true;
    const here = options.read();
    options
      .send({ ...here, cursor })
      .then((data) => {
        if (stopped) return;
        cursor = data.cursor;
        options.onAnswer(data);
      })
      .catch((error: unknown) => {
        // Swallowed on purpose. A lost poll must NOT reach the C6
        // connection-lost banner: that banner belongs to the mutation
        // ladder and it locks editing. The interval keeps running; the
        // next tick either works or does not.
        console.debug("[framebranch] sync tick failed", error);
      })
      .finally(() => {
        busy = false;
      });
  }

  return {
    start(): void {
      if (timer !== null || stopped) return;
      // First tick immediately: presence should not wait 3s to appear,
      // and the cursor should be claimed before anything else happens.
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop(): void {
      stopped = true;
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    cursor: () => cursor,
  };
}
