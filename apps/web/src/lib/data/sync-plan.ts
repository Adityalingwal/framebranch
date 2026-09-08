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
   * An `import` event means the OTHER tab started a New project. The
   * cookie is shared, so this tab's project has been replaced under it and
   * its cut may not exist any more: the Shell runs the same reset it runs
   * after its own New project.
   */
  resetProject: boolean;
};

export const EMPTY_SYNC_PLAN: SyncPlan = {
  refreshBranches: false,
  resetProject: false,
};

export function syncInvalidations(events: readonly SyncEvent[]): SyncPlan {
  if (events.length === 0) return EMPTY_SYNC_PLAN;
  return {
    refreshBranches: true,
    resetProject: events.some((event) => event.kind === "import"),
  };
}
