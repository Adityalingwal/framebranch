/**
 * branches.ts — branch + working-state lookups.
 *
 * The server never remembers a "current branch". Every branch-scoped request
 * carries an explicit branch field — a current-branch column was deliberately
 * rejected (hidden state + multi-tab clash). Every lookup starts from a name
 * the caller sent.
 */

import { and, eq } from "drizzle-orm";

import type { Timeline } from "@framebranch/engine";

import { branches, workingState } from "../db/schema";
import { ApiError } from "./envelope";
import { appendEvent } from "./events";
import { INITIAL_WORKING_REV } from "./project";
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
    // A branch belonging to a different project is simply not found —
    // the project_id predicate makes that true.
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
 * Branch lookup by id — the merge path stores branch ids on the attempt row
 * and re-reads the rows at finalize for the both-parents CAS.
 * Project-scoped like every other query.
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

/**
 * Create a cut at a head that already exists, plus its working row and the
 * `branch-created` event. Two callers: `POST /api/branch` (a person makes a
 * cut) and `POST /api/agent/run` (the agent makes its own, I1 patch (a)) —
 * so the shape of a new cut is written once.
 *
 * `headCommitId` is passed IN rather than read off a `BranchView`, because
 * both callers auto-seal the source first and the fork must start at the
 * POST-seal head. The seal stays in the caller: only it knows whose name to
 * put on the auto card.
 *
 * `createdBy` is the editor's typed name (F2a) — or `AGENT_ACTOR_NAME` for
 * an agent cut, which is why it is a parameter and not read from the
 * request here.
 */
export async function createBranch(
  tx: Tx,
  projectId: string,
  input: {
    name: string;
    /** The cut this one forks from — recorded on the event. */
    from: string;
    headCommitId: string;
    createdBy: string | null;
  },
): Promise<{ branch: BranchRow; headCommitId: string }> {
  const [created] = await tx
    .insert(branches)
    .values({
      projectId,
      name: input.name,
      headCommitId: input.headCommitId,
      createdBy: input.createdBy,
    })
    .returning();

  await tx.insert(workingState).values({
    branchId: created.id,
    projectId,
    baseCommitId: input.headCommitId,
    pendingOps: [],
    workingRev: INITIAL_WORKING_REV,
  });

  await appendEvent(tx, projectId, "branch-created", {
    branch: created.name,
    from: input.from,
    head: input.headCommitId,
    createdBy: input.createdBy,
  });

  return { branch: created, headCommitId: input.headCommitId };
}
