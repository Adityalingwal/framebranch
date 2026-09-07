/**
 * GET /api/history?cut=‹name› — read-only. B2: the current cut's chain ONLY
 * — every ancestor of the cut's head through BOTH parents (a bring-in card
 * has two), de-duplicated, ordered time desc; equal timestamps → child
 * above its parent (B2 patch). Index 0 is the head.
 *
 * Each card carries its kind, actor name and `changes` = the presenter's
 * row count of this card vs its FIRST parent (D2 patch: real differences,
 * never op counts). 0 for seed and import cards (a seed has no parent; an
 * import is a fresh start with new ids, so a diff would be noise).
 *
 * `cut` missing → E_BAD_REQUEST; unknown → E_BRANCH_NOT_FOUND (the same
 * answer `GET /api/timeline` gives).
 */

import type { ImportWarning, Timeline } from "@framebranch/engine";

import { chainOf } from "../../../server/ancestry";
import { loadBranch } from "../../../server/branches";
import type { CommitRow } from "../../../server/commits";
import { presentDiff } from "../../../server/diff-rows";
import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadCommitTimeline } from "../../../server/timeline";
import type { CommitKind } from "../../../server/types";
import type { Tx } from "../../../server/tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type HistoryItem = {
  commitId: string;
  kind: CommitKind;
  name: string;
  /** null only on the seed card (meta shows `Start · ‹time›`). */
  actorName: string | null;
  /** Kept for today's UI badges (👤/🤖); B1 switches to `kind`. */
  actor: "user" | "agent";
  createdAt: string;
  parents: string[];
  /** Presenter row count vs the first parent; 0 for seed/import. */
  changes: number;
  importWarnings: ImportWarning[] | null;
};

/** Cards whose `changes` is 0 by definition (no meaningful "before"). */
const NO_CHANGES_KINDS: ReadonlySet<CommitKind> = new Set(["seed", "import"]);

export async function historyOf(
  tx: Tx,
  projectId: string,
  cut: string,
): Promise<HistoryItem[]> {
  const branch = await loadBranch(tx, projectId, cut);
  const chain = await chainOf(tx, projectId, branch.headCommitId);

  // Materialising each card and its parent: at demo scale (tens of cards,
  // snapshot every 10) this is cheap; the cache keeps each id to one load.
  const timelines = new Map<string, Promise<Timeline>>();
  const timelineOf = (id: string): Promise<Timeline> => {
    let hit = timelines.get(id);
    if (!hit) {
      hit = loadCommitTimeline(tx, projectId, id);
      timelines.set(id, hit);
    }
    return hit;
  };

  const items: HistoryItem[] = [];
  for (const row of chain) {
    items.push({
      commitId: row.id,
      kind: row.kind,
      name: row.name,
      actorName: row.actorName,
      actor: row.actor,
      createdAt: row.createdAt.toISOString(),
      // parent2_id is non-null only on bring-in cards (C3), so a normal
      // card reports one parent and the root reports none.
      parents: [row.parentId, row.parent2Id].filter(
        (id): id is string => id !== null,
      ),
      changes: await changesOf(row, timelineOf),
      importWarnings: row.importWarnings,
    });
  }
  return items;
}

async function changesOf(
  row: CommitRow,
  timelineOf: (id: string) => Promise<Timeline>,
): Promise<number> {
  if (row.parentId === null || NO_CHANGES_KINDS.has(row.kind)) return 0;
  // For a bring-in, parent 1 (`parentId`) is the `into` side by construction
  // (createCommit sets it from the into-branch's working base).
  const [before, after] = await Promise.all([
    timelineOf(row.parentId),
    timelineOf(row.id),
  ]);
  return presentDiff(before, after).count;
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const cut = requiredQuery(request, "cut");
    return db.transaction(async (tx) => ({
      cut,
      commits: await historyOf(tx, project.id, cut),
    }));
  });
}
