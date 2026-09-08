/**
 * GET /api/agent/presets — read-only. The Agent panel's whole data source:
 * the three presets in registry order, each with the run it has already had
 * (or `null`).
 *
 * I1 patch (b), OPTION B — there is NO `agent_runs` table. "This preset has
 * run" is DERIVED, per request, from the branch list: the cut
 * `agent-‹id›` exists → walk that cut's chain from its head back to the
 * newest `agent-run` card. Two sources of truth were rejected; this way
 * `POST /api/project/new` (which deletes every cut) automatically brings
 * every preset back, with nothing to clean up.
 *
 * A cut that exists with NO `agent-run` card on its chain is only reachable
 * with hand-made data. It answers with a `run` whose `commitId`/`parentId`
 * are null (the panel then shows `Done` and an entry without line 3) rather
 * than pretending the preset never ran — the cut is there, and the run
 * button would fail with E_BRANCH_EXISTS.
 */

import { AGENT_PRESETS, agentCutName } from "../../../../server/agent-scripts";
import { chainOf } from "../../../../server/ancestry";
import { findBranch } from "../../../../server/branches";
import { presentDiff, runSummary } from "../../../../server/diff-rows";
import { handleRequest } from "../../../../server/handler";
import { loadCommitTimeline } from "../../../../server/timeline";
import type { Tx } from "../../../../server/tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AgentRun = {
  /** The cut the run happened on (copy #184 line 2). */
  cut: string;
  /** null only for a cut with no `agent-run` card on its chain. */
  commitId: string | null;
  /** The card's first parent — the `View` pair's Before side (I1(3)). */
  parentId: string | null;
  at: string;
  /** Copy #184 line 3, first half: the card's stored `‹N› changes`. */
  changes: number;
  /** Copy #184 line 3, second half: `3 trimmed, 1 removed, 2 moved`. */
  summary: string;
};

export type AgentPreset = {
  id: string;
  name: string;
  description: string;
  run: AgentRun | null;
};

export type AgentPresetsData = { presets: AgentPreset[] };

async function runOf(
  tx: Tx,
  projectId: string,
  presetId: string,
): Promise<AgentRun | null> {
  const cut = agentCutName(presetId);
  const branch = await findBranch(tx, projectId, cut);
  if (!branch) return null;

  const chain = await chainOf(tx, projectId, branch.headCommitId);
  // Newest first (B2 order), so the first match IS the latest run — the
  // state survives extra edits and Marks made on the agent cut afterwards.
  const card = chain.find((row) => row.kind === "agent-run");
  // `parentId` is null only on a root commit (the seed), and an agent-run
  // card is a fork of main's head by construction — but the column allows
  // it, and without a parent there is neither a before/after to show nor a
  // diff to summarise, so it takes the same shape as "no card at all".
  const parentId = card?.parentId ?? null;
  if (!card || parentId === null) {
    return {
      cut,
      commitId: null,
      parentId: null,
      // `branches` has no created_at (A1a deliberately did not add one and
      // B4a adds no migration), so the head card's time is the honest
      // stand-in for "when this cut appeared".
      at: (chain[0]?.createdAt ?? new Date(0)).toISOString(),
      changes: 0,
      summary: "",
    };
  }

  const presented = presentDiff(
    await loadCommitTimeline(tx, projectId, parentId),
    await loadCommitTimeline(tx, projectId, card.id),
  );

  return {
    cut,
    commitId: card.id,
    parentId,
    at: card.createdAt.toISOString(),
    // Stored at commit time (B1 §2.2); the fallback covers a pre-column row.
    changes: card.changes ?? presented.count,
    summary: runSummary(presented.rows),
  };
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    return db.transaction(async (tx): Promise<AgentPresetsData> => {
      const presets = [];
      for (const preset of AGENT_PRESETS) {
        presets.push({
          ...preset,
          run: await runOf(tx, project.id, preset.id),
        });
      }
      return { presets };
    });
  });
}
