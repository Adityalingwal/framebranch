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

import type { Timeline } from "@framebranch/engine";

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
};

/**
 * Q1's OTHER rule — "import / restore / merge commits are ALWAYS full
 * snapshots with snapshot_distance = 0" — has exactly one reachable case in
 * M7a: the import commit, which has no parent and no working record yet and
 * is therefore written directly by the bootstrap (server/project.ts).
 * Restore and merge are M7b, so no forced-snapshot flag is threaded through
 * here for them; M7b adds it when it has a caller.
 */
export async function createCommit({
  tx,
  projectId,
  branch,
  working,
  timeline,
  name,
  actor,
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
  const takeSnapshot = nextDistance >= SNAPSHOT_INTERVAL;
  const snapshotDistance = takeSnapshot ? 0 : nextDistance;

  const commitId = mintCommitId({
    projectId,
    parentId,
    // parent2_id is non-null only on merge commits (C3) — M7b's job.
    parent2Id: null,
    name,
    actor,
    ops: pending.map((op) => [op.id, op.command]),
    nonce: randomUUID(),
  });

  await tx.insert(commits).values({
    id: commitId,
    projectId,
    parentId,
    name,
    actor,
    snapshotDistance,
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

/** How many versions this project has (used by the `Version N` template). */
export async function countCommits(tx: Tx, projectId: string): Promise<number> {
  const rows = await tx
    .select({ id: commits.id })
    .from(commits)
    .where(eq(commits.projectId, projectId));
  return rows.length;
}
