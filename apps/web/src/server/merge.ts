/**
 * merge.ts — the DB/HTTP side of the three-way merge. The engine does the
 * actual merge computation; this file handles storage concerns:
 *
 *  - finding the merge base in the commit DAG,
 *  - materializing base / ours / theirs from storage,
 *  - the finalize tail: the always-full-snapshot bring-in commit with two
 *    parents and its event.
 *
 * B3 (F3(1)): the draft table is gone. The preview writes nothing at all
 * and `POST /api/merge` is ONE transaction, so there is no row to load, no
 * row to delete and no attempt id anywhere in this file.
 */

import { finalizeCheck } from "@framebranch/engine";
import type { MergeChoices, Timeline } from "@framebranch/engine";

import { ancestorsOf, loadParentMap } from "./ancestry";
import type { BranchRow, WorkingStateRow } from "./branches";
import { createCommit } from "./commits";
import { ApiError } from "./envelope";
import { appendEvent } from "./events";
import { mergeCommitName } from "./naming";
import { loadCommitTimeline } from "./timeline";
import type { Tx } from "./tx";

export type MergeSides = {
  baseCommitId: string;
  base: Timeline;
  ours: Timeline;
  theirs: Timeline;
};

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
  /** `main`, freshly re-read AFTER the seals (its head is the first parent). */
  into: BranchRow;
  /** The cut being brought in; its head becomes the second parent. */
  from: BranchRow;
  /** `main`'s working row, re-read after the seals (clean by then). */
  working: WorkingStateRow;
  /** The cut's sealed head — the card's `parent2Id`. */
  headFrom: string;
  sides: MergeSides;
  choices: MergeChoices;
  /** F2a — who pressed the button; stored on the bring-in card. */
  actorName: string;
};

/**
 * The tail of the land transaction (§2.3 steps 4-5): the engine's final
 * check, the bring-in card and the event.
 *
 * The staleness check is NOT here any more (F4 + lock (3)): the route
 * compares the request's four-field token against both branches' heads and
 * working revs BEFORE any write, so by the time this runs the two heads are
 * the ones the seals just produced.
 *
 * Everything below runs inside the caller's transaction. Any throw rolls
 * the WHOLE thing back — that is the mechanism by which "E_MERGE_PRECONDITION
 * → no commit, no seal, nothing written at all" is true, not a sequence of
 * undo steps.
 */
export async function finalizeMerge({
  tx,
  projectId,
  into,
  from,
  working,
  headFrom,
  sides,
  choices,
  actorName,
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

  const commit = await createCommit({
    tx,
    projectId,
    branch: into,
    working,
    timeline: check.timeline,
    name: mergeCommitName(from.name),
    actor: "user",
    kind: "bring-in",
    actorName,
    // The second parent exists ONLY on merge commits (in the commits table,
    // parent2Id is non-null only here).
    parent2Id: headFrom,
    // Merge commits are always full snapshots — a merge is not expressible
    // as ops, and a snapshot removes two-parent replay ambiguity.
    forceSnapshot: true,
  });

  await appendEvent(tx, projectId, "merge-finalized", {
    into: into.name,
    from: from.name,
    commitId: commit.commitId,
    actorName,
  });

  // B4: F3(4)(d) clears ready_note/ready_by/ready_at/ready_working_rev on
  // `from` here — the cut stops being "Ready for main" the moment it lands.
  //
  // The `from` branch is untouched: no head move, no working-state change.
  return { done: true, mergeCommitId: commit.commitId };
}
