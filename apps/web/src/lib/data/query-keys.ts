/**
 * query-keys.ts — TanStack Query keys, in one place (brief §7), so every
 * invalidation call site agrees on the exact same key shape.
 *
 * History and diff are CUT-scoped (B2/D2): the cut is part of the key.
 * `queryKeys.historyAll` / `diffAll` are the prefixes an invalidation uses
 * when the cut is not known at the call site.
 */

export const queryKeys = {
  timeline: (branch: string) => ["timeline", branch] as const,
  /**
   * B1 §2.3 — one card's frozen timeline (View mode). Deliberately NOT a
   * child of `timeline(branch)`: an edit invalidates the live view, and a
   * frozen commit can never change, so the two must not share a prefix.
   */
  timelineAt: (cut: string, commitId: string) =>
    ["timeline-at", cut, commitId] as const,
  branches: () => ["branches"] as const,
  historyAll: () => ["history"] as const,
  history: (cut: string) => ["history", cut] as const,
  diffAll: (cut?: string) =>
    cut === undefined ? (["diff"] as const) : (["diff", cut] as const),
  diff: (cut: string, a: string, b: string) => ["diff", cut, a, b] as const,
  /**
   * B2 §2.2 — the Compare view's own answer (rows AND both timelines) for a
   * pair. A CHILD of `diffAll(cut)` on purpose: `useOpsMutation` already
   * invalidates that prefix after every edit, so lanes and rows refresh
   * together from one query.
   */
  compare: (cut: string, a: string, b: string) =>
    ["diff", cut, "compare", a, b] as const,
};
