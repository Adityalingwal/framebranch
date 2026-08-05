/**
 * POST /api/export — docs/11 C4 (4) + F6 + F5(a), a BOUNDARY door.
 *
 * req:  { branch, ticket }
 * data: { otioJson, commitId, name }
 *
 * Export is a POST, not a GET (docs/09 #4): it may create a commit. If the
 * branch is dirty it is sealed first with the name that lock fixes verbatim
 * — "Auto — before export" — and the exported file is then tied to exactly
 * one version, which is the traceability the POST buys.
 *
 * `mediaWarnings` is optional in the locked shape and is OMITTED here. It
 * would mean "these media refs did not resolve", but `exportOtio` returns
 * only `OtioJson`, and V1 media are deployment URL fixtures with no runtime
 * resolution check at all (docs/09 #12/#13). There is no honest signal to
 * fill the field with, and neither a fabricated warning nor a network fetch
 * to manufacture one would be. Export always succeeds (#13(e)) — OTIO
 * carries pointers, never bytes.
 */

import { exportOtio } from "@framebranch/engine";

import { isDirty, loadBranchView } from "../../../server/branches";
import { createCommit, loadCommitRow } from "../../../server/commits";
import { handleRequest, readBody } from "../../../server/handler";
import { SEAL_BEFORE_EXPORT } from "../../../server/naming";
import { exportBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, exportBodySchema);

    return runWithTicket(db, project.id, "export", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      if (isDirty(view)) {
        await createCommit({
          tx,
          projectId: project.id,
          branch: view.branch,
          working: view.working,
          timeline: view.timeline,
          name: SEAL_BEFORE_EXPORT,
          actor: "user",
        });
      }

      // Re-read after the seal. The branch is clean now, so its working
      // timeline IS its head commit's timeline — the version being exported.
      const fresh = await loadBranchView(tx, project.id, body.branch, true);
      const head = await loadCommitRow(
        tx,
        project.id,
        fresh.branch.headCommitId,
      );

      return {
        otioJson: exportOtio(fresh.timeline),
        commitId: head.id,
        name: head.name,
      };
    });
  });
}
