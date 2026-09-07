/**
 * project.ts — demo isolation: the capability token, the first-visit
 * bootstrap, seeding/resetting from a preset, and the 100-project cap sweep.
 *
 * HLD #14 LOCK: first visit → new project row + a preset seed COPY +
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

import type { Db } from "../db/client";
import {
  branches,
  commits,
  ops,
  presence,
  projectEvents,
  projects,
  snapshots,
  workingState,
} from "../db/schema";
import { mintCommitId } from "./commits";
import { appendEvent } from "./events";
import {
  DEFAULT_PRESET_ID,
  importPreset,
  presetById,
  type Preset,
} from "./presets";
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

export type SeededProject = {
  preset: Preset;
  commitId: string;
  branchId: string;
};

/**
 * Seed ONE project's state from a preset: the seed commit (kind `seed`,
 * named after the preset — C1(6); Q1: ALWAYS a full snapshot,
 * snapshot_distance = 0, carrying its F7 import_warnings — a seed has no
 * parent, so ops cannot express it; `actor_name` NULL — it is written before
 * anyone has a name), `main` pointing at it, and an open working record.
 * `project_rate` is refreshed from the imported OTIO (A1.2 — never
 * hardcoded; C7: every preset is 24 fps, guarded by a test, never at runtime).
 *
 * ONE function serves every caller: the first-visit bootstrap below,
 * `POST project/new` and its alias `POST demo/reset` (both via
 * `resetProjectToPreset`). A second copy of the seed logic is exactly what
 * this exists to prevent.
 *
 * Precondition: the project's per-project rows are already gone (fresh
 * project, or `resetProjectToPreset`'s delete).
 */
export async function seedProjectFromPreset(
  tx: Tx,
  projectId: string,
  presetId: string,
): Promise<SeededProject> {
  const preset = presetById(presetId);
  const imported = importPreset(preset);

  await tx
    .update(projects)
    .set({ projectRate: imported.timeline.projectRate })
    .where(eq(projects.id, projectId));

  const commitId = mintCommitId({
    projectId,
    parentId: null,
    parent2Id: null,
    name: preset.name,
    actor: "user",
    ops: [],
    nonce: randomUUID(),
  });
  await tx.insert(commits).values({
    id: commitId,
    projectId,
    parentId: null,
    parent2Id: null,
    name: preset.name,
    actor: "user",
    kind: "seed",
    actorName: null,
    // B1 §2.2 — a seed has no "before"; its meta is `Start · ‹time›` (C1(6)).
    changes: 0,
    snapshotDistance: 0,
    // F7 — the itemized skipped-list's permanent home; NULL on every
    // commit that is not an import/seed (the fixture is clean, so this is
    // an empty list, not null: "we imported and skipped nothing").
    importWarnings: imported.warnings,
  });
  await tx
    .insert(snapshots)
    .values({ commitId, projectId, timeline: imported.timeline });

  const [branch] = await tx
    .insert(branches)
    .values({ projectId, name: "main", headCommitId: commitId })
    .returning();

  await tx.insert(workingState).values({
    branchId: branch.id,
    projectId,
    baseCommitId: commitId,
    pendingOps: [],
    workingRev: INITIAL_WORKING_REV,
  });

  await appendEvent(tx, projectId, "commit-created", {
    commitId,
    kind: "seed",
    name: preset.name,
    branch: "main",
    actorName: null,
  });

  return { preset, commitId, branchId: branch.id };
}

/**
 * "New project" (G1): wipe this project's state and re-seed it in place
 * from `presetId`, keeping the project row, owner token and cookie. Explicit
 * deletes in FK order (children first); every WHERE is project-scoped.
 * Tickets survive so the calling endpoint stays idempotent.
 */
export async function resetProjectToPreset(
  tx: Tx,
  projectId: string,
  presetId: string,
): Promise<SeededProject> {
  // Validate first so an unknown preset deletes nothing.
  presetById(presetId);
  await tx.delete(presence).where(eq(presence.projectId, projectId));
  await tx.delete(projectEvents).where(eq(projectEvents.projectId, projectId));
  await tx.delete(workingState).where(eq(workingState.projectId, projectId));
  await tx.delete(branches).where(eq(branches.projectId, projectId));
  await tx.delete(ops).where(eq(ops.projectId, projectId));
  await tx.delete(snapshots).where(eq(snapshots.projectId, projectId));
  await tx.delete(commits).where(eq(commits.projectId, projectId));
  return seedProjectFromPreset(tx, projectId, presetId);
}

/**
 * First visit: one transaction that creates the project row, seeds it from
 * the default preset (G1 patch (a): no choice on first visit) and enforces
 * the 100-project cap.
 */
export async function bootstrapProject(
  db: Db,
): Promise<{ project: ProjectRow; token: string }> {
  const token = mintOwnerToken();
  const imported = importPreset(presetById(DEFAULT_PRESET_ID));

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        ownerToken: token,
        // A1.2: the project rate comes from the imported OTIO. Never
        // hardcoded. (seedProjectFromPreset writes the same value again —
        // the insert needs a NOT NULL value, and one seeding function is
        // worth one idempotent UPDATE.)
        projectRate: imported.timeline.projectRate,
      })
      .returning();

    await seedProjectFromPreset(tx, project.id, DEFAULT_PRESET_ID);
    await enforceProjectCap(tx);

    return { project, token };
  });
}

/**
 * HLD #15 — keep the newest PROJECT_CAP projects, delete the rest. The
 * cookie of a deleted project is simply gone (its owner gets a fresh demo
 * on the next visit, which "New project" would have done anyway).
 *
 * Every other table hangs off `projects` with ON DELETE CASCADE, so one
 * DELETE cannot leave an orphan row behind in the other nine.
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
