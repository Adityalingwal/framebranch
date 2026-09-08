/**
 * commits.ts — creating a commit ("sealing"), the one place it happens.
 *
 * - Commits are created in ONE transaction (row + ops + snapshot + branch pointer).
 * - Optimistic concurrency: the branch head must still be the base this work
 *   started from (compare-and-swap), else E_STALE_HEAD.
 * - Snapshot cadence: every 10th commit is a full snapshot; import / restore /
 *   merge commits are always full snapshots.
 * - Names are deterministic templates or presenter summaries (naming.ts,
 *   seal.ts); every card carries an explicit `kind` (B4).
 */

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { ImportWarning, Timeline } from "@framebranch/engine";

import { branches, commits, ops, snapshots, workingState } from "../db/schema";
import { presentDiff } from "./diff-rows";
import { ApiError } from "./envelope";
import { appendEvent } from "./events";
import { loadCommitTimeline } from "./timeline";
import type { BranchRow, WorkingStateRow } from "./branches";
import type { Actor, CommitKind, PendingOp } from "./types";
import type { Tx } from "./tx";

/** Snapshot interval: every Nth commit is a full snapshot. */
export const SNAPSHOT_INTERVAL = 10;

/**
 * commits.id is a hash. The hashed payload deliberately includes the
 * project id and a per-commit nonce: every project is seeded from the same
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
  /** B4 — the card kind. Explicit on every call; there is no default. */
  kind: CommitKind;
  /**
   * F2a — display name of who made the card. `Agent` for agent runs; the
   * request's editor name otherwise. Only the seed (written elsewhere) is
   * null.
   */
  actorName: string | null;
  /**
   * B1 §2.2 — the card's `‹N› changes`, stored instead of recomputed by
   * every `GET /api/history`. Pass it when the caller has already diffed
   * this content against the parent (`sealIfDirty` has `presented.count`);
   * omit it and this function counts once, here. `import` cards are 0 by
   * definition (fresh ids make the diff noise), like the seed.
   */
  changes?: number;
  /** The second parent — non-null ONLY on merge commits. */
  parent2Id?: string | null;
  /**
   * Import / restore / merge commits are always full snapshots. Their
   * content has no op-representation (there is no "become commit X" verb,
   * an import has no parent, a merge is not expressible as ops), so a
   * full snapshot is their only honest form.
   */
  forceSnapshot?: boolean;
  /** The itemized skipped-list from import, non-null ONLY on import commits. */
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
  kind,
  actorName,
  changes,
  parent2Id = null,
  forceSnapshot = false,
  importWarnings = null,
}: CreateCommitInput): Promise<{ commitId: string; name: string }> {
  const parentId = working.baseCommitId;
  const pending: PendingOp[] = working.pendingOps;

  // B1 §2.2 — `changes` is written here, once, and never recomputed on read.
  // For a bring-in, `parentId` is the `into` side by construction, which is
  // exactly the side the old per-request rule counted against.
  const changeCount =
    kind === "import"
      ? 0
      : (changes ??
        presentDiff(await loadCommitTimeline(tx, projectId, parentId), timeline)
          .count);

  const parentRows = await tx
    .select({ snapshotDistance: commits.snapshotDistance })
    .from(commits)
    .where(and(eq(commits.id, parentId), eq(commits.projectId, projectId)))
    .limit(1);
  if (parentRows.length === 0) {
    throw new Error(`parent commit ${parentId} missing`);
  }

  const nextDistance = parentRows[0].snapshotDistance + 1;
  // Forced snapshot skips the cadence entirely (distance 0).
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
    kind,
    actorName,
    changes: changeCount,
    snapshotDistance,
    importWarnings,
  });

  if (pending.length > 0) {
    await tx.insert(ops).values(
      pending.map((op, index) => ({
        id: op.id,
        projectId,
        commitId,
        seq: index, // preserves the order edits were applied in
        command: op.command,
        actor: op.actor,
      })),
    );
  }

  if (takeSnapshot) {
    await tx.insert(snapshots).values({ commitId, projectId, timeline });
  }

  // CAS — move the head only if it is still where this work started. A
  // concurrent writer that already moved it gets E_STALE_HEAD.
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
      `cut "${branch.name}" moved while this version was being marked`,
    );
  }

  // The pending list becomes the commit's op-log, then the working record
  // restarts on the new commit. working_rev is never reset — monotonic for
  // the life of the branch.
  await tx
    .update(workingState)
    .set({ baseCommitId: commitId, pendingOps: [] })
    .where(
      and(
        eq(workingState.branchId, branch.id),
        eq(workingState.projectId, projectId),
      ),
    );

  // J1 — the event rides in the same transaction as the card.
  await appendEvent(tx, projectId, "commit-created", {
    commitId,
    kind,
    name,
    branch: branch.name,
    actorName,
  });

  return { commitId, name };
}

export type CommitRow = typeof commits.$inferSelect;

/**
 * Look one commit up by id, project-scoped. A commit belonging to another
 * project is simply "not there".
 *
 * E_BAD_REQUEST is used for unknown commits because the dividing line is
 * who rejected it — this is rejected at the door, before any engine work.
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
