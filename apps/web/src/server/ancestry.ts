/**
 * ancestry.ts — walking the commit DAG. Shared by merge (merge base) and
 * the cut-scoped History / diff routes (B2: History = the current cut's
 * chain only, both parents followed, de-duplicated).
 *
 * Everything here is built from graph facts (parent edges) plus
 * `created_at` for display order; the tie-break is graph-based because two
 * commits written in one transaction share `now()`.
 */

import { eq } from "drizzle-orm";

import { commits } from "../db/schema";
import type { CommitRow } from "./commits";
import type { Tx } from "./tx";

export type ParentMap = Map<string, string[]>;

/** Project-scoped: one read of this project's commit graph (demo-scale). */
export async function loadParentMap(
  tx: Tx,
  projectId: string,
): Promise<ParentMap> {
  const rows = await tx
    .select({
      id: commits.id,
      parentId: commits.parentId,
      parent2Id: commits.parent2Id,
    })
    .from(commits)
    .where(eq(commits.projectId, projectId));
  return parentMapOf(rows);
}

export function parentMapOf(
  rows: readonly {
    id: string;
    parentId: string | null;
    parent2Id: string | null;
  }[],
): ParentMap {
  const map: ParentMap = new Map();
  for (const row of rows) {
    map.set(
      row.id,
      [row.parentId, row.parent2Id].filter((id): id is string => id !== null),
    );
  }
  return map;
}

/** Every commit reachable from `start` through parent_id AND parent2_id. */
export function ancestorsOf(map: ParentMap, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue; // the visited set is what makes this terminate
    seen.add(id);
    for (const parent of map.get(id) ?? []) stack.push(parent);
  }
  return seen;
}

/**
 * Generation depth: root = 0, child = 1 + max(parents). A parent is always
 * strictly shallower than its child, which is exactly the tie-break B2
 * needs ("tie → parent below, child above").
 */
export function depthsOf(map: ParentMap): Map<string, number> {
  const depth = new Map<string, number>();
  const visit = (id: string, trail: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (trail.has(id)) return 0; // cycles cannot exist; guard anyway
    trail.add(id);
    let d = 0;
    for (const parent of map.get(id) ?? []) {
      if (!map.has(parent)) continue; // parent outside the project (impossible)
      d = Math.max(d, visit(parent, trail) + 1);
    }
    trail.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const id of map.keys()) visit(id, new Set());
  return depth;
}

/**
 * B2 — the History list for one cut: every ancestor of `head` (both
 * parents, de-duplicated), ordered time DESC; equal timestamps → the
 * deeper (child) card first, then id for determinism. Index 0 = the head.
 */
export async function chainOf(
  tx: Tx,
  projectId: string,
  head: string,
): Promise<CommitRow[]> {
  const rows = await tx
    .select()
    .from(commits)
    .where(eq(commits.projectId, projectId));
  const map = parentMapOf(rows);
  const members = ancestorsOf(map, head);
  const depth = depthsOf(map);
  return rows
    .filter((row) => members.has(row.id))
    .sort((x, y) => {
      const dt = y.createdAt.getTime() - x.createdAt.getTime();
      if (dt !== 0) return dt;
      const dd = (depth.get(y.id) ?? 0) - (depth.get(x.id) ?? 0);
      if (dd !== 0) return dd;
      return x.id < y.id ? -1 : 1;
    });
}
