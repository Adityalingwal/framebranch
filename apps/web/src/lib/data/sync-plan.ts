/**
 * sync-plan.ts — what a tick of `/api/sync` events means for this tab.
 *
 * Framework-free on purpose: this is the whole decision, so it can be
 * tested without a DOM, and the Shell is left with nothing but the two
 * calls the plan asks for.
 *
 * The rule is deliberately coarse — ONE set of invalidations per tick,
 * however many events came back. B0 already warned that a restore, a
 * bring-in and an import each write TWO events; the poller must not turn
 * that into two refetch storms.
 */

import type { SyncEvent } from "./api-client";

export type SyncPlan = {
  /**
   * `refreshBranches(queryClient)` — the cut list, every cut's History,
   * every diff and the agent presets. That single helper is the whole
   * answer for every event kind there is, INCLUDING kinds this build has
   * never heard of: an unknown kind still means "something changed on the
   * server", and the helper is what "something changed" means here.
   *
   * What it deliberately does NOT invalidate:
   *  - `["bring-in"]` — a refetch mints a new preview token and drops the
   *    decisions the user is halfway through (see `query-keys.ts`).
   *  - `timeline(currentCut)` — the live timeline is this editor's own
   *    optimistic surface. Nothing another tab does changes this tab's
   *    working rev (a seal from a bring-in clears pending without bumping
   *    it), so the next op still passes CAS.
   *
   * Self-events are NOT filtered out. This tab's own `edit` event is
   * exactly what flips its own top-bar tag to `Edited since ready` —
   * nothing else invalidates `branches` after an edit.
   */
  refreshBranches: boolean;
  /**
   * The project was replaced under this tab (the cookie is shared, so the
   * OTHER tab's New project is this tab's too) and its cut may not exist
   * any more: the Shell runs the same reset it runs after its own.
   *
   * ONE kind means that: `commit-created` with `payload.kind === "seed"`.
   * That is what New project actually writes — `resetProjectToPreset`
   * DELETES the whole event feed and re-seeds, so a seed card is the first
   * row of a brand new feed. A seed can reach a tab from nowhere else: the
   * only other place one is written is the first-visit bootstrap, and a
   * project nobody yet holds a cookie for has no second tab to tell, while
   * a fresh tab's own first tick asks with `cursor: null` and is answered
   * with no events at all.
   *
   * `import` is deliberately NOT one (the review's recommendation, taken).
   * `POST /api/import` lands OTIO on ONE cut and leaves the project and
   * every other cut standing, so a full tab reset — playhead to 0,
   * selection gone, view back to Agent — is the wrong reaction to it. It
   * gets the ordinary `refreshBranches` like every other event kind. It is
   * reachable only by curl today (no interface caller since G1), so this
   * changes nothing that fires; it stops a wrong reaction being waiting
   * there for whoever gives import a button.
   */
  resetProject: boolean;
};

function isProjectReplaced(event: SyncEvent): boolean {
  return event.kind === "commit-created" && event.payload.kind === "seed";
}

export const EMPTY_SYNC_PLAN: SyncPlan = {
  refreshBranches: false,
  resetProject: false,
};

export function syncInvalidations(events: readonly SyncEvent[]): SyncPlan {
  if (events.length === 0) return EMPTY_SYNC_PLAN;
  return {
    refreshBranches: true,
    resetProject: events.some(isProjectReplaced),
  };
}

/**
 * How long the tab that CLICKED New project stays armed to swallow its
 * OWN seed event — one poll window (3s) plus a whole one for the tick
 * that was already in the air when the mutation answered.
 *
 * A ceiling rather than a flag that waits forever: if the seed never
 * arrives (the poller is disabled through the whole window, the answer
 * fails, the feed is past its 200-event page) the arm must not survive to
 * swallow a LATER, genuine reset started by the other tab.
 */
export const SELF_RESET_WINDOW_MS = 6000;

/** What the Shell does with one tick's events. Exactly one of these. */
export type SyncAction =
  /** Nothing came back that this tab cares about. */
  | "none"
  /** `refreshBranches(queryClient)` and nothing else. */
  | "refresh-branches"
  /** The project was replaced: the full New-project reset + a wholesale invalidate. */
  | "reset-project";

export type SyncDecision = {
  action: SyncAction;
  /** The self-reset arm has been used up (or judged expired): drop it. */
  disarmSelfReset: boolean;
};

/**
 * Codex BUG 1 — the tab that starts New project must not reset itself a
 * SECOND time.
 *
 * The click already ran the whole reset locally (playhead 0, selection
 * null, view Agent, `timelineResetToken++`, every query invalidated). The
 * same transaction also appends `commit-created { kind: "seed" }`, and the
 * poller does not filter self-events — so 0-3s later this tab is handed
 * its own seed and runs the identical reset again, silently undoing every
 * playhead move, clip selection, panel switch and eye/mute toggle made in
 * that window. That window is the demo's first beat, where a presenter is
 * most likely to touch something.
 *
 * The fix is a ONE-SHOT arm, set only on this tab's own New-project
 * success path (`NewProjectDialog` → `onStarted`), never on the poller
 * path. `armedAt` is the moment of that success:
 *
 *  - a reset within `SELF_RESET_WINDOW_MS` → this is our own seed coming
 *    home. Skip the reset, still `refreshBranches` for the batch (the
 *    events beside the seed are real), and consume the arm.
 *  - a reset outside the window, or with no arm at all → the OTHER tab
 *    replaced the project. Reset as always, and drop any stale arm.
 *
 * Deliberately NOT keyed on the batch carrying no reset: the tick already
 * in flight when the mutation answered can come back holding the other
 * tab's `edit` — consuming the arm there would leave the seed on the NEXT
 * tick to reset us anyway. The time window has no such hole, and it needs
 * no timer to clear itself.
 *
 * `tabId` cannot do this job: `/api/sync` events carry no author.
 */
export function decideSyncAction(
  plan: SyncPlan,
  selfResetArmedAt: number | null,
  now: number,
): SyncDecision {
  if (plan.resetProject) {
    const armed =
      selfResetArmedAt !== null && now - selfResetArmedAt < SELF_RESET_WINDOW_MS;
    return {
      action: armed ? "refresh-branches" : "reset-project",
      disarmSelfReset: true,
    };
  }
  return {
    action: plan.refreshBranches ? "refresh-branches" : "none",
    disarmSelfReset: false,
  };
}
