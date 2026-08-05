/**
 * schema.ts — the 8 locked tables, exactly as docs/11 C3 specifies
 * (+ the F1 amendment: ops / snapshots / working_state each carry
 * `project_id` too, because HLD #14's rule is "every row carries
 * project_id").
 *
 * The table count is LOCKED at 8 (HLD #16). Nothing here may grow a ninth
 * table or a column C3 does not name.
 *
 * Locked indexes (C3): project_id on every table;
 * branches(project_id, name) unique; ops(commit_id, seq) unique;
 * snapshots(commit_id) unique; working_state(branch_id) unique;
 * tickets(project_id, endpoint, ticket) unique.
 */

import {
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

import type { PendingOp } from "../server/types";

/**
 * (1) projects — HLD #14 (capability token) + #15 (100-project cap).
 * `project_rate` comes from the imported OTIO (A1.2); never hardcoded.
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
    // Not in C3's index list, which only speaks about project_id and the
    // five unique keys; added because a capability token identifies exactly
    // ONE project (HLD #14) and every request looks the project up by it.
    uniqueIndex("projects_owner_token_key").on(table.ownerToken),
    index("projects_created_at_idx").on(table.createdAt),
  ],
);

/** (2) branches — head_commit_id is the sticky note the CAS guards (HLD 7a). */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    headCommitId: text("head_commit_id").notNull(),
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
  },
  (table) => [index("working_state_project_id_idx").on(table.projectId)],
);

/**
 * (7) merge_attempts — the merge draft lives in the DB, never in memory
 * (HLD triage #1). Created and consumed by M7b; the table is created here
 * because the schema and its migration are one artefact.
 */
export const mergeAttempts = pgTable(
  "merge_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    branchInto: uuid("branch_into")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    branchFrom: uuid("branch_from")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    headInto: text("head_into").notNull(),
    headFrom: text("head_from").notNull(),
    draftTimeline: jsonb("draft_timeline").notNull(),
    conflicts: jsonb("conflicts").notNull(),
    choices: jsonb("choices").notNull(),
    status: text("status").notNull(),
  },
  (table) => [index("merge_attempts_project_id_idx").on(table.projectId)],
);

/**
 * (8) tickets — the shared idempotency register for ALL mutating endpoints
 * (HLD #16). No payload fingerprint column: F2 cut payload comparison, so
 * the original payload is not stored at all. Rows have a 24h TTL.
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
