/**
 * commits.ts — creating a commit ("sealing"), the one place it happens.
 *
 * Locked rules implemented here:
 *  - docs/09 #4 terminology: seal / auto-seal / auto-commit are all just
 *    COMMIT; only three triggers exist (user button, agent run complete,
 *    boundary + pending).
 *  - docs/09 Item 4b: commit row + ops + snapshot + branch pointer move in
 *    ONE transaction.
 *  - docs/09 7a: optimistic concurrency — the branch head must still be the
 *    base this work started from (compare-and-swap), else E_STALE_HEAD.
 *  - docs/09 #9 + docs/11 Q1: snapshot cadence N = 10; import / restore /
 *    merge commits are ALWAYS full snapshots with snapshot_distance = 0.
 *  - docs/09 Item 6a(5): names are deterministic templates (see naming.ts).
 */

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { ImportWarning, Timeline } from "@framebranch/engine";

import { branches, commits, ops, snapshots, workingState } from "../db/schema";
import { ApiError } from "./envelope";
import type { BranchRow, WorkingStateRow } from "./branches";
import type { Actor, PendingOp } from "./types";
import type { Tx } from "./tx";

/** docs/09 Item 4a: N = config constant, default 10 (benchmark-validated). */
export const SNAPSHOT_INTERVAL = 10;

/**
 * commits.id is a hash (C3). The hashed payload deliberately includes the
 * project id and a per-commit nonce: every project is seeded from the SAME
 * demo.otio, so a purely content-addressed root commit would mint the
 * identical id in every project and collide on the primary key.
 */
export function mintCommitId(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type CreateCommitInput = {
  tx: Tx;
  projectId: string;
  branch: BranchRow;
  working: WorkingStateRow;
  /** The full working timeline (base + pending) that this commit records. */
  timeline: Timeline;
  name: string;
  actor: Actor;
  /**
   * C3 — the SECOND parent, non-null ONLY on merge commits. [ADDED by M7b,
   * which is the first milestone with a caller: `POST merge` finalize.]
   */
  parent2Id?: string | null;
  /**
   * docs/11 Q1 + docs/09 #9 — import / restore / merge commits are ALWAYS
   * full snapshots with `snapshot_distance = 0`; the every-Nth cadence is
   * skipped for them. Their content has no op-representation at all (there
   * is no "become commit X" verb, an import has no parent, and a merge is
   * not expressible as ops), so a full snapshot is their only honest form.
   */
  forceSnapshot?: boolean;
  /**
   * C3 + F7 — the itemized skipped-list, non-null ONLY on import commits.
   * This column is how #17's list survives a refresh.
   */
  importWarnings?: ImportWarning[] | null;
};

/**
 * The one place a commit is written.
 *
 * Callers that pass `forceSnapshot` / `parent2Id` / `importWarnings` are the
 * boundary endpoints M7b added (restore, import, merge). Every other call
 * site behaves exactly as it did before: the three fields are optional and
 * default to the old behaviour.
 *
 * NOTE for those callers: the commit's ops come from `working.pendingOps`.
 * Restore / import / merge commits have NO ops (Q1), so they are created
 * only AFTER the branch is clean — i.e. the boundary auto-seal ran first and
 * the working row was RE-READ — and the content timeline is passed in
 * explicitly.
 */
export async function createCommit({
  tx,
  projectId,
  branch,
  working,
  timeline,
  name,
  actor,
  parent2Id = null,
  forceSnapshot = false,
  importWarnings = null,
}: CreateCommitInput): Promise<{ commitId: string; name: string }> {
  const parentId = working.baseCommitId;
  const pending: PendingOp[] = working.pendingOps;

  const parentRows = await tx
    .select({ snapshotDistance: commits.snapshotDistance })
    .from(commits)
    .where(and(eq(commits.id, parentId), eq(commits.projectId, projectId)))
    .limit(1);
  if (parentRows.length === 0) {
    throw new Error(`parent commit ${parentId} missing`);
  }

  const nextDistance = parentRows[0].snapshotDistance + 1;
  // Q1: a forced snapshot skips the cadence entirely (distance 0).
  const takeSnapshot = forceSnapshot || nextDistance >= SNAPSHOT_INTERVAL;
  const snapshotDistance = takeSnapshot ? 0 : nextDistance;

  const commitId = mintCommitId({
    projectId,
    parentId,
    // C3: non-null only on merge commits.
    parent2Id,
    name,
    actor,
    ops: pending.map((op) => [op.id, op.command]),
    nonce: randomUUID(),
  });

  await tx.insert(commits).values({
    id: commitId,
    projectId,
    parentId,
    parent2Id,
    name,
    actor,
    snapshotDistance,
    importWarnings,
  });

  if (pending.length > 0) {
    await tx.insert(ops).values(
      pending.map((op, index) => ({
        id: op.id,
        projectId,
        commitId,
        seq: index, // C3: seq preserves the order edits were applied in
        command: op.command,
        actor: op.actor,
      })),
    );
  }

  if (takeSnapshot) {
    await tx.insert(snapshots).values({ commitId, projectId, timeline });
  }

  // docs/09 7a — CAS: move the head only if it is still where this work
  // started. A concurrent writer that already moved it loses the race and
  // gets E_STALE_HEAD (its work is never silently applied on top).
  const moved = await tx
    .update(branches)
    .set({ headCommitId: commitId })
    .where(
      and(
        eq(branches.id, branch.id),
        eq(branches.projectId, projectId),
        eq(branches.headCommitId, parentId),
      ),
    )
    .returning({ id: branches.id });
  if (moved.length !== 1) {
    throw new ApiError(
      "E_STALE_HEAD",
      `branch "${branch.name}" moved while this version was being saved`,
    );
  }

  // docs/09 triage #2: the pending list becomes the commit's op-log, then
  // the working record restarts on the new commit. working_rev is NOT
  // reset — it is monotonic for the life of the branch (C3).
  await tx
    .update(workingState)
    .set({ baseCommitId: commitId, pendingOps: [] })
    .where(
      and(
        eq(workingState.branchId, branch.id),
        eq(workingState.projectId, projectId),
      ),
    );

  return { commitId, name };
}

export type CommitRow = typeof commits.$inferSelect;

/**
 * Look one commit up BY ID, project-scoped (HLD #14 + F1). A commit that
 * belongs to another project is simply "not there" — never someone else's
 * data.
 *
 * ⚠ SPEC GAP (reported, not invented): C4's error list has no
 * "commit not found" code. `E_BAD_REQUEST` is used because the locked
 * dividing line is *who rejected it* — this is rejected at the door, before
 * any engine work, exactly like a missing field. The alternatives were worse:
 * `E_CLIP_NOT_FOUND` is a VERB code about clips, and `E_PROJECT_NOT_FOUND`
 * would lie about which thing is missing. See the M7b findings.
 */
export async function loadCommitRow(
  tx: Tx,
  projectId: string,
  commitId: string,
): Promise<CommitRow> {
  const rows = await tx
    .select()
    .from(commits)
    .where(and(eq(commits.id, commitId), eq(commits.projectId, projectId)))
    .limit(1);
  if (rows.length === 0) {
    throw new ApiError(
      "E_BAD_REQUEST",
      `no version "${commitId}" in this project`,
    );
  }
  return rows[0];
}

/** How many versions this project has (used by the `Version N` template). */
export async function countCommits(tx: Tx, projectId: string): Promise<number> {
  const rows = await tx
    .select({ id: commits.id })
    .from(commits)
    .where(eq(commits.projectId, projectId));
  return rows.length;
}
