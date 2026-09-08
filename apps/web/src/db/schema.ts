/**
 * schema.ts — the 9-table schema (7 original + project_events + presence —
 * merge_attempts dropped in 0004).
 */

import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Timeline } from "@framebranch/engine";
import type { ImportWarning } from "@framebranch/engine";

import type { CommitKind, PendingOp } from "../server/types";

/**
 * (1) projects — capability token identification + 100-project cap.
 * `project_rate` comes from the imported OTIO; never hardcoded.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerToken: text("owner_token").notNull(),
    projectRate: integer("project_rate").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A capability token identifies exactly one project and every request
    // looks the project up by it.
    uniqueIndex("projects_owner_token_key").on(table.ownerToken),
    index("projects_created_at_idx").on(table.createdAt),
  ],
);

/** (2) branches — head_commit_id is where the compare-and-swap guards. */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    headCommitId: text("head_commit_id").notNull(),
    /** F2a — display name of whoever created the cut; seeded `main` has none. */
    createdBy: text("created_by"),
    /**
     * F3(4) — "Ready for main". Ready = `ready_at IS NOT NULL`; the four
     * columns are set and cleared together. `ready_working_rev` is the
     * working_state.working_rev at the moment of marking: "Edited since
     * ready" = the working rev moved, not the head.
     */
    readyNote: text("ready_note"),
    readyBy: text("ready_by"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    readyWorkingRev: integer("ready_working_rev"),
  },
  (table) => [
    index("branches_project_id_idx").on(table.projectId),
    uniqueIndex("branches_project_id_name_key").on(table.projectId, table.name),
  ],
);

/**
 * (3) commits — `id` is a hash. `parent2_id` is non-null ONLY on merge
 * commits. `import_warnings` is non-null ONLY on import commits (F7): it is
 * the permanent home of #17's itemized skipped-list, which is how the list
 * survives a refresh.
 */
export const commits = pgTable(
  "commits",
  {
    id: text("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    parent2Id: text("parent2_id"),
    name: text("name").notNull(),
    actor: text("actor").$type<"user" | "agent">().notNull(),
    /**
     * B4 — which kind of card this is. Every createCommit caller names one
     * explicitly; there is no default. `actor` (user/agent) stays as-is.
     */
    kind: text("kind").$type<CommitKind>().notNull(),
    /**
     * F2a — display name of who made this card (`Agent` for agent runs).
     * NULL only on `seed` cards: the seed is written before the first-visit
     * name box exists, so its meta shows `Start · ‹time›` only (C1(6)).
     */
    actorName: text("actor_name"),
    /**
     * B1 §2.2 — the presenter's row count of this card vs its first parent,
     * written once at commit time (`GET /api/history` used to recompute it
     * per card per request). NULLABLE on purpose: SQL cannot backfill a
     * diff, so rows written before this column exists carry NULL and the
     * History GET fills them in, once each.
     */
    changes: integer("changes"),
    snapshotDistance: integer("snapshot_distance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    importWarnings: jsonb("import_warnings").$type<ImportWarning[]>(),
  },
  (table) => [
    index("commits_project_id_idx").on(table.projectId),
    index("commits_parent_id_idx").on(table.parentId),
  ],
);

/** (4) ops — `seq` is the order WITHIN one commit; replay follows it. */
export const ops = pgTable(
  "ops",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    commitId: text("commit_id")
      .notNull()
      .references(() => commits.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    command: jsonb("command").$type<PendingOp["command"]>().notNull(),
    actor: text("actor").$type<"user" | "agent">().notNull(),
  },
  (table) => [
    index("ops_project_id_idx").on(table.projectId),
    uniqueIndex("ops_commit_id_seq_key").on(table.commitId, table.seq),
  ],
);

/**
 * (5) snapshots — commit_id + full timeline JSON. NO schema_version column:
 * C5 cut the whole schemaVersion concept.
 */
export const snapshots = pgTable(
  "snapshots",
  {
    commitId: text("commit_id")
      .primaryKey()
      .references(() => commits.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    timeline: jsonb("timeline").$type<Timeline>().notNull(),
  },
  (table) => [index("snapshots_project_id_idx").on(table.projectId)],
);

/**
 * (6) working_state — one row per branch. `working_rev` is MONOTONIC: +1 on
 * every accepted edit, never reset (a reset would let a stale tab's number
 * collide). It is NOT the pending count.
 */
export const workingState = pgTable(
  "working_state",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references(() => branches.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    baseCommitId: text("base_commit_id")
      .notNull()
      .references(() => commits.id, { onDelete: "cascade" }),
    pendingOps: jsonb("pending_ops").$type<PendingOp[]>().notNull(),
    workingRev: integer("working_rev").notNull(),
    /** F2a/F4 — display name of the last editor whose op was accepted. */
    lastEditorName: text("last_editor_name"),
  },
  (table) => [index("working_state_project_id_idx").on(table.projectId)],
);

/**
 * (8) tickets — the shared idempotency register for all mutating endpoints.
 * No payload fingerprint column — the original payload is not stored.
 * Rows have a 24h TTL.
 */
export const tickets = pgTable(
  "tickets",
  {
    ticket: uuid("ticket").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "tickets_project_id_endpoint_ticket_key",
      columns: [table.projectId, table.endpoint, table.ticket],
    }),
    index("tickets_project_id_idx").on(table.projectId),
    index("tickets_created_at_idx").on(table.createdAt),
    // C3 (8) says the ticket itself is "UNIQUE index — do baar entry
    // DB-level impossible". The composite key above alone does not deliver
    // that: the SAME ticket could enter the register twice under two
    // different endpoints, and two concurrent instances could both pass the
    // app-level check in runWithTicket and both commit. A ticket is a
    // browser `crypto.randomUUID()` (C6), i.e. globally unique already, so
    // the database is simply told the truth. [ADDED 2026-08-05, M7a review
    // finding F1 — owner chose the index over relaxing the doc.]
    uniqueIndex("tickets_ticket_key").on(table.ticket),
  ],
);

/**
 * (9) project_events — J1's sync feed. Appended INSIDE the transaction of
 * every commit / branch create / branch switch / restore / merge finalize /
 * import (server/events.ts). `id` is the cursor a poller resumes from.
 * No route reads it in B0.
 */
export const projectEvents = pgTable(
  "project_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_events_project_id_id_idx").on(table.projectId, table.id),
  ],
);

/**
 * (10) presence — J1's live presence, one row per (project, browser tab).
 * Display-only: never read by any CAS. No route reads or writes it in B0.
 */
export const presence = pgTable(
  "presence",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tabId: text("tab_id").notNull(),
    name: text("name").notNull(),
    cut: text("cut").notNull(),
    playheadFrame: integer("playhead_frame").notNull(),
    colourSeed: integer("colour_seed").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "presence_project_id_tab_id_pk",
      columns: [table.projectId, table.tabId],
    }),
  ],
);
