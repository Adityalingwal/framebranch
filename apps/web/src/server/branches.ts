/**
 * branches.ts — branch + working-state lookups.
 *
 * F5 LOCK: the server NEVER remembers a "current branch". Every
 * branch-scoped request carries an explicit `branch` field; a
 * current-branch column was explicitly rejected (hidden state + multi-tab
 * clash). So every lookup here starts from a name the caller sent.
 */

import { and, eq } from "drizzle-orm";

import type { Timeline } from "@framebranch/engine";

import { branches, workingState } from "../db/schema";
import { ApiError } from "./envelope";
import { loadCommitTimeline, replayOps } from "./timeline";
import type { PendingOp } from "./types";
import type { Tx } from "./tx";

export type BranchRow = typeof branches.$inferSelect;
export type WorkingStateRow = typeof workingState.$inferSelect;

export async function loadBranch(
  tx: Tx,
  projectId: string,
  name: string,
): Promise<BranchRow> {
  const rows = await tx
    .select()
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.name, name)))
    .limit(1);
  if (rows.length === 0) {
    // HLD #14: a branch belonging to a DIFFERENT project is simply not
    // found — the project_id predicate above is what makes that true.
    throw new ApiError("E_BRANCH_NOT_FOUND", `no branch named "${name}"`);
  }
  return rows[0];
}

export async function findBranch(
  tx: Tx,
  projectId: string,
  name: string,
): Promise<BranchRow | null> {
  const rows = await tx
    .select()
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.name, name)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Branch lookup BY ID — the merge path stores branch ids on the attempt row
 * (C3's `branch_into` / `branch_from`) and re-reads the rows at finalize for
 * the both-parents CAS (docs/09 #8). Project-scoped like every other query.
 */
export async function loadBranchById(
  tx: Tx,
  projectId: string,
  branchId: string,
): Promise<BranchRow> {
  const rows = await tx
    .select()
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.id, branchId)))
    .limit(1);
  if (rows.length === 0) {
    throw new ApiError("E_BRANCH_NOT_FOUND", `no branch "${branchId}"`);
  }
  return rows[0];
}

export async function loadWorkingState(
  tx: Tx,
  projectId: string,
  branchId: string,
  lock: boolean,
): Promise<WorkingStateRow> {
  const query = tx
    .select()
    .from(workingState)
    .where(
      and(
        eq(workingState.branchId, branchId),
        eq(workingState.projectId, projectId),
      ),
    );
  // Writers take the row lock so two concurrent edits on one branch
  // serialize (the workingRev CAS and the head CAS both read-then-write).
  // Reads deliberately do not: a GET must never block an edit.
  const rows = await (lock ? query.for("update") : query).limit(1);
  if (rows.length === 0) {
    throw new Error(`working_state row missing for branch ${branchId}`);
  }
  return rows[0];
}

export type BranchView = {
  branch: BranchRow;
  working: WorkingStateRow;
  pending: PendingOp[];
  /** base commit + pending replayed = what the user is actually looking at. */
  timeline: Timeline;
};

export async function loadBranchView(
  tx: Tx,
  projectId: string,
  name: string,
  /** true on every mutating path (see loadWorkingState). */
  lock = false,
): Promise<BranchView> {
  const branch = await loadBranch(tx, projectId, name);
  const working = await loadWorkingState(tx, projectId, branch.id, lock);
  const pending = working.pendingOps;
  const committed = await loadCommitTimeline(
    tx,
    projectId,
    working.baseCommitId,
  );
  return {
    branch,
    working,
    pending,
    timeline: replayOps(committed, pending),
  };
}

export const isDirty = (view: BranchView): boolean => view.pending.length > 0;
