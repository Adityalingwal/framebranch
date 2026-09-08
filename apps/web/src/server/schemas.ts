/**
 * schemas.ts — Zod schemas for every request body.
 *
 * The command schema mirrors the Phase A discriminated union at the
 * STRUCTURE level only — it answers "is this even a command?" It does NOT
 * re-implement any verb's rules. Ranges, overlap, applicability, bounds:
 * all of that belongs to the engine.
 */

import { z } from "zod";

import type { Command } from "@framebranch/engine";

const rationalTime = z
  .object({
    // A1.1: time is a pair of integers. Floats cannot exist in this world.
    value: z.number().int(),
    rate: z.number().int().positive(),
  })
  .strict();

const timeRange = z
  .object({ start: rationalTime, duration: rationalTime })
  .strict();

const position = z.object({ x: z.number(), y: z.number() }).strict();

/** BC.5 — the V1 font whitelist is exactly these three. */
const textStyle = z
  .object({
    font: z.enum(["Arial", "Georgia", "Courier New"]),
    size: z.number().int(),
    color: z.string(),
  })
  .strict();

const addClipMedia = z
  .object({
    op: z.literal("addClip"),
    trackId: z.string(),
    mediaRefId: z.string(),
    sourceRange: timeRange,
    timelineRange: timeRange,
  })
  .strict();

const addClipText = z
  .object({
    op: z.literal("addClip"),
    trackId: z.string(),
    textContent: z.string(),
    textStyle: textStyle.partial().optional(),
    timelineRange: timeRange,
  })
  .strict();

const deleteClip = z
  .object({ op: z.literal("deleteClip"), clipId: z.string() })
  .strict();

const move = z
  .object({
    op: z.literal("move"),
    clipId: z.string(),
    newStart: rationalTime,
  })
  .strict();

const trim = z
  .object({
    op: z.literal("trim"),
    clipId: z.string(),
    edge: z.enum(["start", "end"]),
    delta: rationalTime,
  })
  .strict();

const slip = z
  .object({
    op: z.literal("slip"),
    clipId: z.string(),
    delta: rationalTime,
  })
  .strict();

const propertyChange = z
  .object({
    op: z.literal("propertyChange"),
    clipId: z.string(),
    property: z.enum([
      "volume",
      "opacity",
      "scale",
      "position",
      "textContent",
      "textStyle",
    ]),
    // A3.6's own value rules (0-100, 0.1-10, max 500 chars, hex colour…)
    // are the engine's job; this only fixes the SHAPE.
    value: z.union([z.number(), z.string(), position, textStyle]),
  })
  .strict();

const rippleDelete = z
  .object({ op: z.literal("rippleDelete"), clipId: z.string() })
  .strict();

const split = z
  .object({
    op: z.literal("split"),
    clipId: z.string(),
    at: rationalTime,
  })
  .strict();

export const commandSchema = z.union([
  addClipMedia,
  addClipText,
  deleteClip,
  move,
  trim,
  slip,
  propertyChange,
  rippleDelete,
  split,
  // H1 — `replaceTracks` is deliberately absent: track management left the
  // product, so the web API refuses the verb (400 E_BAD_REQUEST). The
  // engine's Command union still carries it (public API); the cast below
  // absorbs the narrower web schema.
]) as unknown as z.ZodType<Command>;

/** C6(1) — the ticket is a browser `crypto.randomUUID()`. */
const ticket = z.uuid();

const branchName = z.string().min(1).max(100);

/** C4(3) + F5: every branch-scoped request names its branch explicitly. */
export const opsBodySchema = z
  .object({
    branch: branchName,
    workingRev: z.number().int().nonnegative(),
    ticket,
    command: commandSchema,
  })
  .strict();

/**
 * C2 — the name is required, but the SHAPE check stays loose (any string ≤
 * 200, or absent) so that a missing AND a whitespace-only name both reach
 * the route's one check and get the same E_NAME_REQUIRED answer.
 */
export const commitBodySchema = z
  .object({
    branch: branchName,
    name: z.string().max(200).optional(),
    ticket,
  })
  .strict();

/** F5(c) — POST branch is create+switch: the new branch starts at `from`. */
export const branchCreateBodySchema = z
  .object({
    name: branchName,
    from: branchName,
    ticket,
  })
  .strict();

/** F5(b) — POST branch/switch. */
export const branchSwitchBodySchema = z
  .object({
    from: branchName,
    to: branchName,
    ticket,
  })
  .strict();

/**
 * F3(4)(a) + B4b lock (1) — POST /api/branch/ready: mark a cut "Ready for
 * main". The note is REQUIRED (the lock says "ek line note (zaroori)"): the
 * dialog keeps `Mark ready` disabled while it is empty (#164) and this is
 * the safety net, so a whitespace-only note is a 400 here, not an empty
 * line in main's Bring-in list.
 *
 * `by` and `at` are NOT in the body: the name comes from `X-Editor-Name`
 * (F2a) and the time from the database.
 */
export const readySetBodySchema = z
  .object({
    cut: branchName,
    note: z.string().trim().min(1).max(200),
    ticket,
  })
  .strict();

/** F3(4)(a) — DELETE /api/branch/ready: un-mark. No note to un-say. */
export const readyClearBodySchema = z
  .object({
    cut: branchName,
    ticket,
  })
  .strict();

/**
 * J1 — POST /api/sync. The ONE body with no ticket: a heartbeat is not a
 * mutation anyone may replay, and a lost tick is simply the next tick's
 * problem (expiry covers a tab that stopped).
 *
 * `cut` is NOT validated against `branches`: a peer can be mid-switch, and
 * the client sends what it is standing on. Presence is display-only.
 */
export const syncBodySchema = z
  .object({
    tabId: z.string().min(8).max(64),
    cut: branchName,
    /** J1 IMPL-NOTE: the cursor is a FRAME (timecode), never a pixel. */
    playheadFrame: z.number().int().nonnegative(),
    /** The tab's colour, as an HSL hue. */
    colourSeed: z.number().int().min(0).max(359),
    /** null = a fresh tab: it gets the current max id and NO replay. */
    cursor: z.number().int().nonnegative().nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// M7b bodies. Same discipline: SHAPE only. Merge rules belong to the engine
// (startMerge / applyChoice / finalizeCheck), OTIO rules to importOtio.
// ---------------------------------------------------------------------------

/**
 * C7 — the union of the three buckets' fixed button sets (B1 ours/theirs/
 * base · B2 delete/clip/base · B3 shift-a/shift-b/base). Whether a given
 * choice is legal for a given conflict is the ENGINE's call, not this
 * schema's. Exported because the preview's `choices` query parameter is a
 * record of these (B3 §2.2).
 */
export const mergeChoiceSchema = z.enum([
  "ours",
  "theirs",
  "base",
  "delete",
  "clip",
  "shift-a",
  "shift-b",
]);

/**
 * C4 (4) + B3 lock (3) — POST merge: the LANDING. `from` is brought into
 * `into` (always `main`, F1 — kept in the body so the door can refuse a
 * wrong target explicitly rather than by omission).
 *
 * `token` is the four plain fields the preview handed out (both heads, both
 * working revs); the route revalidates them before any write, which is F4's
 * whole mechanism. `choices` is the complete answer set — the server holds
 * no draft, so the request carries everything.
 *
 * The `from !== into` refusal is a SHAPE rule (two distinct branch names are
 * required), not a merge rule: merging a branch into itself would write a
 * commit whose two parents are the same commit, which C3's "SIRF merge — 2
 * baap" cannot mean. Rejected at the door → E_BAD_REQUEST (reported as an
 * assumption).
 */
export const bringInTokenSchema = z
  .object({
    mainHead: z.string().min(1),
    cutHead: z.string().min(1),
    mainRev: z.number().int().nonnegative(),
    cutRev: z.number().int().nonnegative(),
  })
  .strict();

export const mergeBodySchema = z
  .object({
    from: branchName,
    into: branchName,
    token: bringInTokenSchema,
    choices: z.record(z.string(), mergeChoiceSchema).default({}),
    ticket,
  })
  .strict()
  .refine((body) => body.from !== body.into, {
    // Copy sheet #209 — the Cut vocabulary sweep. Dev-facing and mapped by
    // `api-client`, but the row locks these words; `GET /api/merge/preview`
    // gives the same sentence for the same refusal.
    message: "a cut cannot be brought into itself",
    path: ["from"],
  });

/** C4 (4) + F5(a) — POST restore {branch, commitId}. */
export const restoreBodySchema = z
  .object({
    branch: branchName,
    commitId: z.string().min(1),
    ticket,
  })
  .strict();

/**
 * C4 (4) — POST import. `otioJson` is arbitrary JSON: the schema only checks
 * that it is PRESENT and lets `importOtio` judge it (O7/H11 — it takes
 * `unknown` and never throws). Re-validating OTIO here would duplicate the
 * engine, which is exactly what the locks forbid.
 */
export const importBodySchema = z
  .object({
    branch: branchName,
    otioJson: z.unknown(),
    ticket,
  })
  .strict()
  .refine((body) => "otioJson" in body, {
    message: "otioJson is required",
    path: ["otioJson"],
  });

/** C4 (4) + F5(a) — POST export {branch}. */
export const exportBodySchema = z
  .object({
    branch: branchName,
    ticket,
  })
  .strict();

/**
 * I1 patch (a) — POST agent/run { preset }. A preset ID, not a payload of
 * commands (the scripted edits are a server-side fixture, C8) and NOT a
 * branch either: the run makes its own cut, `agent-‹preset›`.
 */
export const agentRunBodySchema = z
  .object({
    preset: z.string().min(1).max(100),
    ticket,
  })
  .strict();

/** C4 (4) — POST demo/reset {}: nothing but the ticket. */
export const demoResetBodySchema = z
  .object({
    ticket,
  })
  .strict();

/** G1 — POST project/new { preset }: a preset id from the registry. */
export const projectNewBodySchema = z
  .object({
    preset: z.string().min(1).max(100),
    ticket,
  })
  .strict();
