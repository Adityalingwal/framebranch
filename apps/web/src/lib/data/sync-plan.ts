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
   * TWO kinds mean that, and the brief named only the second:
   *
   *  - `commit-created` with `payload.kind === "seed"`. This is what New
   *    project actually writes: `resetProjectToPreset` DELETES the whole
   *    event feed and re-seeds, so a seed card is the first row of a brand
   *    new feed. A seed can reach a tab from nowhere else — the only other
   *    place one is written is the first-visit bootstrap, and a project
   *    nobody yet holds a cookie for has no second tab to tell, while a
   *    fresh tab's own first tick asks with `cursor: null` and is answered
   *    with no events at all.
   *  - `import`. `POST /api/import` has had no interface caller since G1
   *    (it lands OTIO on ONE cut, leaving the project standing), so this
   *    is kept because B4b's brief locks it, not because it fires — see
   *    the reviewer question in the findings.
   */
  resetProject: boolean;
};

function isProjectReplaced(event: SyncEvent): boolean {
  if (event.kind === "import") return true;
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
