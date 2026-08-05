/**
 * project.ts — demo isolation: the capability token, the first-visit
 * bootstrap, and the 100-project cap sweep.
 *
 * HLD #14 LOCK: first visit → new project row + a demo-fixture seed COPY +
 * a random unguessable owner_token in an HTTP-only cookie. Every later
 * request matches token → project; a MISMATCH IS 404 (never 403, never
 * another project's data). Different visitors are different project rows =
 * different worlds.
 *
 * HLD #15 LOCK: total projects capped at 100 — on create, delete the
 * oldest beyond the cap ("chowkidaar code", inline, no dashboard).
 */

import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { importOtio } from "@framebranch/engine";

import type { Db } from "../db/client";
import {
  branches,
  commits,
  projects,
  snapshots,
  workingState,
} from "../db/schema";
import { mintCommitId } from "./commits";
import { demoOtioJson } from "./demo-fixture";
import { IMPORT_COMMIT_NAME } from "./naming";
import type { Tx } from "./tx";

export const TOKEN_COOKIE = "fb_token";

/** HLD #15 — total projects cap. */
export const PROJECT_CAP = 100;

/** C3 — working_rev starts at 0 and only ever goes up (never resets). */
export const INITIAL_WORKING_REV = 0;

export type ProjectRow = typeof projects.$inferSelect;

/**
 * The token is 32 random bytes (256 bits), base64url — i.e. strictly more
 * entropy than the `crypto.randomUUID()` the docs offer as the floor
 * (UUIDv4 carries 122 random bits). It is a bearer capability, so more
 * entropy is free insurance; nothing else about it is special.
 */
export function mintOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenCookieHeader(token: string): string {
  const parts = [
    `${TOKEN_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function readTokenCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const sep = part.indexOf("=");
    if (sep === -1) continue;
    if (part.slice(0, sep).trim() === TOKEN_COOKIE) {
      return part.slice(sep + 1).trim() || null;
    }
  }
  return null;
}

export async function findProjectByToken(
  db: Db,
  token: string,
): Promise<ProjectRow | null> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerToken, token))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * First visit: one transaction that creates the project, imports the
 * demo fixture, writes the import commit (Q1: ALWAYS a full snapshot,
 * snapshot_distance = 0 — an import has no parent, so ops cannot express
 * it), points `main` at it, and opens its working record.
 */
export async function bootstrapProject(
  db: Db,
): Promise<{ project: ProjectRow; token: string }> {
  const token = mintOwnerToken();
  const imported = importOtio(demoOtioJson());
  if (!imported.ok) {
    // The fixture is ours and is covered by a test; if this ever fires the
    // deployment is broken, not the request.
    throw new Error(
      `demo.otio failed to import: ${imported.error.code} ${imported.error.message}`,
    );
  }

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        ownerToken: token,
        // A1.2: the project rate comes from the imported OTIO. Never hardcoded.
        projectRate: imported.timeline.projectRate,
      })
      .returning();

    const commitId = mintCommitId({
      projectId: project.id,
      parentId: null,
      parent2Id: null,
      name: IMPORT_COMMIT_NAME,
      actor: "user",
      ops: [],
      nonce: randomUUID(),
    });
    await tx.insert(commits).values({
      id: commitId,
      projectId: project.id,
      parentId: null,
      parent2Id: null,
      name: IMPORT_COMMIT_NAME,
      actor: "user",
      snapshotDistance: 0,
      // F7 — the itemized skipped-list's permanent home; NULL on every
      // commit that is not an import (the fixture is clean, so this is an
      // empty list, not null: "we imported and skipped nothing").
      importWarnings: imported.warnings,
    });
    await tx
      .insert(snapshots)
      .values({ commitId, projectId: project.id, timeline: imported.timeline });

    const [branch] = await tx
      .insert(branches)
      .values({ projectId: project.id, name: "main", headCommitId: commitId })
      .returning();

    await tx.insert(workingState).values({
      branchId: branch.id,
      projectId: project.id,
      baseCommitId: commitId,
      pendingOps: [],
      workingRev: INITIAL_WORKING_REV,
    });

    await enforceProjectCap(tx);

    return { project, token };
  });
}

/**
 * HLD #15 — keep the newest PROJECT_CAP projects, delete the rest. The
 * cookie of a deleted project is simply gone (its owner gets a fresh demo
 * on the next visit, which "Reset demo" would have done anyway).
 *
 * Every other table hangs off `projects` with ON DELETE CASCADE, so one
 * DELETE cannot leave an orphan row behind in the other seven.
 */
async function enforceProjectCap(tx: Tx): Promise<void> {
  await tx.execute(sql`
    delete from ${projects}
    where ${projects.id} in (
      select ${projects.id} from ${projects}
      order by ${projects.createdAt} desc, ${projects.id} desc
      offset ${PROJECT_CAP}
    )
  `);
}
