/**
 * schemas.ts — Zod schemas for every request body (docs/09 Item 12).
 *
 * The command schema mirrors the Phase A discriminated union (docs/11 A3 +
 * the F4 addClip forms) at the STRUCTURE level only. It answers "is this
 * even a command?" — it does NOT re-implement any verb's rules. Ranges,
 * overlap, applicability, bounds: all of that belongs to the engine and
 * only to the engine ("the engine decides; the server does not
 * re-implement any verb logic").
 *
 * The two `addClip` forms are strict objects so a payload can never
 * satisfy both: the engine distinguishes them by field presence
 * (`"mediaRefId" in command`), and a body carrying both would be
 * ambiguous.
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

export const commitBodySchema = z
  .object({
    branch: branchName,
    name: z.string().min(1).max(200).optional(),
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
