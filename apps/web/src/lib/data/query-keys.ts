/**
 * query-keys.ts — TanStack Query keys, in one place (brief §7), so every
 * invalidation call site agrees on the exact same key shape.
 */

export const queryKeys = {
  timeline: (branch: string) => ["timeline", branch] as const,
  history: () => ["history"] as const,
  diff: (from: string, to: string) => ["diff", from, to] as const,
};
