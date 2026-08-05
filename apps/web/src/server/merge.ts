/**
 * merge.ts — the DB/HTTP side of the three-way merge. The merge ITSELF is
 * the engine's (`startMerge` / `applyChoice` / `finalizeCheck`, C7); nothing
 * here re-implements a merge rule. What lives here is the part the engine
 * deliberately does not do (C7: "DB commit M7 ka kaam"):
 *
 *  - finding the merge BASE in the commit DAG,
 *  - materializing base / ours / theirs out of storage,
 *  - the finalize: the both-parents CAS (docs/09 #8), the two-parent
 *    always-snapshot merge commit (C3 + #9 + Q1), and deleting the draft row
 *    in the SAME transaction (docs/09 triage #1 + C3).
 *
 * `POST merge` and `POST merge/resolve` both end here, which is why the
 * finalize exists exactly once.
 */

import { and, eq } from "drizzle-orm";

import { finalizeCheck } from "@framebranch/engine";
import type { MergeChoices, Timeline } from "@framebranch/engine";

import { commits, mergeAttempts } from "../db/schema";
import { loadBranchById, loadWorkingState } from "./branches";
import { createCommit } from "./commits";
import { ApiError } from "./envelope";
import { mergeCommitName } from "./naming";
import { loadCommitTimeline } from "./timeline";
import type { Tx } from "./tx";

/**
 * C3 gives `merge_attempts` a `status` text column. The locked vocabulary is
 * ONE value, `"open"`, because C3 also says the row is DELETED on finalize
 * and on abort ("finalize/abort par YE ROW delete, table nahi"). A stored
 * row can therefore only ever be in one state: awaiting resolution. Adding
 * "resolved"/"aborted" values would be a soft delete, which docs/09 triage
 * #1 explicitly rejected (it duplicates the provenance).
 */
export const MERGE_ATTEMPT_OPEN = "open";

export type MergeSides = {
  baseCommitId: string;
  base: Timeline;
  ours: Timeline;
  theirs: Timeline;
};

type ParentMap = Map<string, string[]>;

async function loadParentMap(tx: Tx, projectId: string): Promise<ParentMap> {
  // Project-scoped, like every query (HLD #14 + F1). One read of this
  // project's commit graph: the demo-scale DAG is tiny and this keeps the
  // walk below pure and obviously terminating.
  const rows = await tx
    .select({
      id: commits.id,
      parentId: commits.parentId,
      parent2Id: commits.parent2Id,
    })
    .from(commits)
    .where(eq(commits.projectId, projectId));

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
function ancestorsOf(map: ParentMap, start: string): Set<string> {
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
 * The merge base = the common ancestor of the two heads.
 *
 * Merge commits have TWO parents, so ancestry is a DAG, not a chain, and
 * both edges are walked. Determinism (same two heads → same base, always) is
 * built from graph facts only, never from timestamps: two commits written in
 * one transaction share `now()`, so ordering by `created_at` would not be a
 * total order.
 *
 *   candidates = ancestors(into) ∩ ancestors(from)
 *   drop every candidate that is a PROPER ancestor of another candidate
 *   → the maximal (latest) common ancestors; take the smallest id.
 *
 * The last step only ever chooses in a criss-cross history (two independent
 * maximal ancestors); with one it is the LCA. Ids are content hashes, so the
 * tie-break is stable across runs and machines.
 */
export async function findMergeBase(
  tx: Tx,
  projectId: string,
  headInto: string,
  headFrom: string,
): Promise<string> {
  const map = await loadParentMap(tx, projectId);
  const intoAncestors = ancestorsOf(map, headInto);
  const fromAncestors = ancestorsOf(map, headFrom);

  const candidates = [...intoAncestors].filter((id) => fromAncestors.has(id));
  if (candidates.length === 0) {
    // Impossible in this design: every branch descends from the project's
    // import commit. If it ever happens it is OUR bug, not a user error —
    // it escapes as E_INTERNAL and is logged, exactly as handler.ts does
    // for any unexpected state.
    throw new Error(
      `no common ancestor for ${headInto} and ${headFrom} in project ${projectId}`,
    );
  }

  const properAncestors = new Set<string>();
  for (const candidate of candidates) {
    for (const id of ancestorsOf(map, candidate)) {
      if (id !== candidate) properAncestors.add(id);
    }
  }
  const maximal = candidates.filter((id) => !properAncestors.has(id)).sort();
  return maximal[0];
}

/**
 * base / ours / theirs, materialized from storage.
 * `ours` = the branch being merged INTO; `theirs` = the branch merged FROM.
 */
export async function loadMergeSides(
  tx: Tx,
  projectId: string,
  headInto: string,
  headFrom: string,
): Promise<MergeSides> {
  const baseCommitId = await findMergeBase(tx, projectId, headInto, headFrom);
  return {
    baseCommitId,
    base: await loadCommitTimeline(tx, projectId, baseCommitId),
    ours: await loadCommitTimeline(tx, projectId, headInto),
    theirs: await loadCommitTimeline(tx, projectId, headFrom),
  };
}

export type FinalizeInput = {
  tx: Tx;
  projectId: string;
  intoBranchId: string;
  fromBranchId: string;
  /** The heads the merge was computed from — what the CAS revalidates. */
  headInto: string;
  headFrom: string;
  sides: MergeSides;
  choices: MergeChoices;
  /** Present when a draft row exists; it is deleted in this transaction. */
  attemptId?: string;
};

/**
 * The finalize, shared by `POST merge` (zero conflicts → immediate) and
 * `POST merge/resolve` (last conflict answered → automatic; docs/09 6d:
 * no extra "Confirm merge?" screen).
 *
 * Everything below is one transaction. Any throw rolls the WHOLE thing back
 * — that is the mechanism by which "E_STALE_HEAD → no commit, nothing
 * written at all" is true, not a sequence of undo steps.
 */
export async function finalizeMerge({
  tx,
  projectId,
  intoBranchId,
  fromBranchId,
  headInto,
  headFrom,
  sides,
  choices,
  attemptId,
}: FinalizeInput): Promise<{ done: true; mergeCommitId: string }> {
  const check = finalizeCheck({
    base: sides.base,
    ours: sides.ours,
    theirs: sides.theirs,
    choices,
  });
  if (!check.ok) {
    throw new ApiError("E_MERGE_PRECONDITION", check.error.message);
  }

  // docs/09 #8 — CAS on BOTH parents. The draft recorded the two head ids it
  // started from; either one moving means the merge was computed against a
  // history that no longer exists, and silently committing it would be the
  // "ghost loss" that lock exists to prevent. The user restarts the merge.
  const into = await loadBranchById(tx, projectId, intoBranchId);
  const from = await loadBranchById(tx, projectId, fromBranchId);
  if (into.headCommitId !== headInto || from.headCommitId !== headFrom) {
    throw new ApiError(
      "E_STALE_HEAD",
      `branch "${into.headCommitId !== headInto ? into.name : from.name}" moved while this merge was open — restart the merge`,
    );
  }

  const working = await loadWorkingState(tx, projectId, into.id, true);
  if (working.pendingOps.length > 0 || working.baseCommitId !== headInto) {
    // Unsaved edits made on `into` AFTER the merge started. They do not move
    // the head, so the CAS above cannot see them — but committing the merge
    // would reset the working record and take them with it, which is the
    // same silent loss #8 forbids. Same code, same remedy (restart), because
    // the cause is the same: the branch changed under an open merge.
    // [ASSUMPTION — reported: the docs answer the head case explicitly and
    // this one only by its reasoning.]
    throw new ApiError(
      "E_STALE_HEAD",
      `branch "${into.name}" has unsaved changes made after this merge started — save or discard them, then restart the merge`,
    );
  }

  const commit = await createCommit({
    tx,
    projectId,
    branch: into,
    working,
    timeline: check.timeline,
    name: mergeCommitName(from.name, into.name),
    actor: "user",
    // C3: the second parent exists ONLY here.
    parent2Id: headFrom,
    // docs/09 #9 + Q1: a merge commit is ALWAYS a full snapshot (the cadence
    // is skipped) — a merge is not expressible as ops, and the two-parent
    // replay ambiguity is exactly what the snapshot removes.
    forceSnapshot: true,
  });

  if (attemptId !== undefined) {
    // C3: the ROW goes on finalize (and on abort), in the same transaction
    // that creates the commit — a wrong-moment delete is impossible.
    await tx
      .delete(mergeAttempts)
      .where(
        and(
          eq(mergeAttempts.id, attemptId),
          eq(mergeAttempts.projectId, projectId),
        ),
      );
  }

  // The `from` branch is untouched: no head move, no working-state change.
  return { done: true, mergeCommitId: commit.commitId };
}

export type MergeAttemptRow = typeof mergeAttempts.$inferSelect;

/**
 * Load a merge draft, project-scoped and locked.
 *
 * ⚠ There is no "attempt not found" error code in C4 and one is not being
 * invented. `E_MERGE_PRECONDITION` is the code C7 gives for "real boundary
 * misuse" of the merge API, and asking to resolve/abort a draft that does
 * not exist (wrong id, or already finalized/aborted) is exactly that.
 * Reported as a choice.
 */
export async function loadMergeAttempt(
  tx: Tx,
  projectId: string,
  attemptId: string,
): Promise<MergeAttemptRow> {
  const rows = await tx
    .select()
    .from(mergeAttempts)
    .where(
      and(
        eq(mergeAttempts.id, attemptId),
        eq(mergeAttempts.projectId, projectId),
      ),
    )
    .for("update")
    .limit(1);
  if (rows.length === 0) {
    throw new ApiError(
      "E_MERGE_PRECONDITION",
      `no open merge "${attemptId}" in this project`,
    );
  }
  return rows[0];
}
