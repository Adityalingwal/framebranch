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

const replaceTracks = z
  .object({
    op: z.literal("replaceTracks"),
    tracks: z.array(z.unknown()),
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
  replaceTracks,
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
    message: "a branch cannot be merged into itself",
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
 * C4 (4) + F5(a) — POST agent/simulate {branch, script}. `script` is a NAME
 * (C3's branch template is literally `agent/<script>-N`), not a payload of
 * commands; the scripted edits are a server-side fixture (C8).
 */
export const agentSimulateBodySchema = z
  .object({
    branch: branchName,
    script: z.string().min(1).max(100),
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
