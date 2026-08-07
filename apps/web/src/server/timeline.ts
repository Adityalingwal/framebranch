/**
 * timeline.ts — turning stored rows back into a Timeline.
 *
 * Storage is hybrid: every commit stores its ops, every Nth commit stores a
 * full snapshot. To materialize a commit: walk parents until a snapshot is
 * found (≤N steps), then replay the ops in between in seq order.
 *
 * The working view = base commit + pending_ops replayed on top.
 *
 * Deterministic replay: addClip mints a clip id. Replay must mint the SAME
 * id or later ops' clipIds would dangle. Ids are derived from the op's row
 * id (which is stored) rather than stored twice.
 */

import { and, asc, eq } from "drizzle-orm";

import { applyCommand } from "@framebranch/engine";
import type { Timeline } from "@framebranch/engine";

import { commits, ops, snapshots } from "../db/schema";
import type { PendingOp } from "./types";
import type { Tx } from "./tx";

/** The id minter for one op. `@` is deliberately absent — that character
 * is the reserved split-lineage namespace. */
export function minterFor(opId: string): () => string {
  let n = 0;
  return () => `clip-${opId}-${n++}`;
}

export function replayOps(
  timeline: Timeline,
  list: readonly PendingOp[],
): Timeline {
  let current = timeline;
  for (const op of list) {
    const result = applyCommand(current, op.command, {
      mintId: minterFor(op.id),
    });
    if (!result.ok) {
      // Every stored op was accepted by this same engine before it was
      // stored, so this is unreachable unless the row set is corrupt. There
      // is no C4 error code for "our own storage is inconsistent" and one
      // will not be invented here.
      throw new Error(
        `replay failed for op ${op.id} (${op.command.op}): ${result.error.code} ${result.error.message}`,
      );
    }
    current = result.timeline;
  }
  return current;
}

/** Materialize one commit: nearest snapshot + the ops recorded after it. */
export async function loadCommitTimeline(
  tx: Tx,
  projectId: string,
  commitId: string,
): Promise<Timeline> {
  const replayChain: string[] = [];
  let cursor: string | null = commitId;
  let base: Timeline | null = null;

  while (cursor !== null) {
    const snapshotRow = await tx
      .select({ timeline: snapshots.timeline })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.commitId, cursor),
          eq(snapshots.projectId, projectId), // always project-scoped
        ),
      )
      .limit(1);
    if (snapshotRow.length > 0) {
      base = snapshotRow[0].timeline;
      break;
    }

    replayChain.push(cursor);
    const commitRow: { parentId: string | null }[] = await tx
      .select({ parentId: commits.parentId })
      .from(commits)
      .where(and(eq(commits.id, cursor), eq(commits.projectId, projectId)))
      .limit(1);
    if (commitRow.length === 0) {
      throw new Error(`commit ${cursor} not found in project ${projectId}`);
    }
    cursor = commitRow[0].parentId;
  }

  if (base === null) {
    // The root commit is always an import commit, and import commits are
    // always full snapshots — so reaching the root without a snapshot
    // cannot happen.
    throw new Error(`no snapshot reachable from commit ${commitId}`);
  }

  let timeline = base;
  for (const id of replayChain.reverse()) {
    const opRows = await tx
      .select()
      .from(ops)
      .where(and(eq(ops.commitId, id), eq(ops.projectId, projectId)))
      .orderBy(asc(ops.seq));
    timeline = replayOps(
      timeline,
      opRows.map((row) => ({
        id: row.id,
        actor: row.actor,
        command: row.command,
      })),
    );
  }
  return timeline;
}
