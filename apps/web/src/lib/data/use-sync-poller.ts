"use client";

/**
 * use-sync-poller.ts — the Shell's one line of collaboration.
 *
 * Called ONCE, from `Shell.tsx`. It keeps this tab's presence row alive,
 * hands back the peers to draw, and reports the events that arrived so the
 * Shell can invalidate what they touched (`sync-plan.ts` decides what).
 *
 * The `enabled` gate is not a nicety — it is two traps:
 *  - a tick before the first `GET /api/timeline` would hit `handleRequest`
 *    with no cookie and BOOTSTRAP A SECOND PROJECT, swapping the cookie
 *    under the running app;
 *  - a tick before the name gate would write a presence row literally
 *    named `Editor`, and everyone else would see that name.
 * So the Shell passes `timeline.isSuccess && editorName !== null`.
 *
 * A hidden tab keeps ticking: the browser throttles the timer (typically
 * to 1/minute), which is exactly right — the row stays alive so the tab
 * does not vanish from everyone's screen while it is merely in the
 * background, and it is not worth a wake-up beyond that.
 */

import { useEffect, useRef, useState } from "react";

import * as api from "./api-client";
import type { Peer, SyncEvent } from "./api-client";
import { createSyncPoller } from "./sync-poller";
import { getTabIdentity } from "../state/tab-identity";

export type UseSyncPollerInput = {
  enabled: boolean;
  cut: string;
  playheadFrame: number;
  onEvents: (events: SyncEvent[]) => void;
};

export function useSyncPoller(input: UseSyncPollerInput): { peers: Peer[] } {
  const [peers, setPeers] = useState<Peer[]>([]);

  // Read fresh at every tick instead of captured by the effect, so a
  // scrubbing playhead does not tear the interval down 30 times a second
  // and a cut switch is picked up by the tick already scheduled.
  const cutRef = useRef(input.cut);
  cutRef.current = input.cut;
  const playheadRef = useRef(input.playheadFrame);
  playheadRef.current = input.playheadFrame;
  const onEventsRef = useRef(input.onEvents);
  onEventsRef.current = input.onEvents;
  /**
   * The cursor lives HERE, not inside the poller, because the effect
   * recycles the poller whenever `enabled` flips — and it flips on every
   * switch to a cut whose timeline is not cached yet
   * (`timeline.isSuccess` goes false while the GET is in the air). A new
   * poller starting at `null` would be answered with the high-water mark
   * and NO events, silently swallowing everything that happened in that
   * window.
   */
  const cursorRef = useRef<number | null>(null);

  useEffect(() => {
    // Not enabled → no fetch at all. The peers already drawn are LEFT
    // standing: `enabled` drops for a few hundred milliseconds on every
    // switch to an uncached cut, and blanking there would make everyone
    // else's chip and playhead flicker for no reason. They go on the
    // first tick after it comes back, or when the 10s window expires
    // them server-side.
    if (!input.enabled) return;

    const poller = createSyncPoller({
      send: api.postSync,
      initialCursor: cursorRef.current,
      read: () => ({
        ...getTabIdentity(),
        cut: cutRef.current,
        playheadFrame: playheadRef.current,
      }),
      onAnswer: (data) => {
        cursorRef.current = data.cursor;
        setPeers(data.peers);
        if (data.events.length > 0) onEventsRef.current(data.events);
      },
    });

    poller.start();
    return () => poller.stop();
  }, [input.enabled]);

  return { peers };
}
