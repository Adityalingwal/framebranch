import type { Clip, EngineError, RationalTime, TextClip, TimeRange } from "../types";
import type { OtioJson } from "./types";

type AnyClip = Clip | TextClip;

/**
 * Import aborts (E_INVALID_OTIO / E_UNSUPPORTED_OTIO_VERSION) unwind
 * through this private error and are caught at the public boundary, so
 * `importOtio` itself can never throw.
 */
class OtioAbortError extends Error {
  readonly engineError: EngineError;

  constructor(engineError: EngineError) {
    super(engineError.message);
    this.name = "OtioAbortError";
    this.engineError = engineError;
  }
}

function invalid(message: string): never {
  throw new OtioAbortError({ code: "E_INVALID_OTIO", message });
}

function unsupportedVersion(label: string): never {
  throw new OtioAbortError({
    code: "E_UNSUPPORTED_OTIO_VERSION",
    message: `unsupported OTIO schema version "${label}"`,
  });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const rt = (value: number, rate: number): RationalTime => ({ value, rate });

const rangeEnd = (r: TimeRange): number => r.start.value + r.duration.value;

type SchemaLabel = { name: string; version: number; raw: string };

/**
 * Read one node's `OTIO_SCHEMA` label and apply O7(a): a whitelisted name
 * at a non-whitelisted version aborts the whole import.
 */
function requireSchema(
  node: Record<string, unknown>,
  where: string,
): SchemaLabel {
  const raw = node.OTIO_SCHEMA;
  if (typeof raw !== "string") {
    invalid(`${where}: missing OTIO_SCHEMA label`);
  }
  const match = /^(.+)\.(\d+)$/.exec(raw);
  if (!match) {
    invalid(`${where}: malformed OTIO_SCHEMA label "${raw}"`);
  }
  const label: SchemaLabel = {
    name: match[1],
    version: Number(match[2]),
    raw,
  };
  const supported = SCHEMA_WHITELIST[label.name];
  if (supported !== undefined && label.version !== supported) {
    unsupportedVersion(label.raw);
  }
  return label;
}

function requireObject(value: unknown, where: string): Record<string, unknown> {
  if (!isObject(value)) invalid(`${where}: expected an object`);
  return value;
}

/** A1.1 — rates and frame counts are integers; floats cannot be stored. */
function requireInteger(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    invalid(`${where}: expected an integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireRate(value: unknown, where: string): number {
  const rate = requireInteger(value, where);
  if (rate <= 0) invalid(`${where}: rate must be > 0`);
  return rate;
}

function parseRationalTime(value: unknown, where: string): RationalTime {
  const node = requireObject(value, where);
  const schema = requireSchema(node, where);
  if (schema.name !== "RationalTime") {
    invalid(`${where}: expected a RationalTime, got "${schema.raw}"`);
  }
  return rt(
    requireInteger(node.value, `${where}.value`),
    requireRate(node.rate, `${where}.rate`),
  );
}

function parseTimeRange(value: unknown, where: string): TimeRange {
  const node = requireObject(value, where);
  const schema = requireSchema(node, where);
  if (schema.name !== "TimeRange") {
    invalid(`${where}: expected a TimeRange, got "${schema.raw}"`);
  }
  return {
    start: parseRationalTime(node.start_time, `${where}.start_time`),
    duration: parseRationalTime(node.duration, `${where}.duration`),
  };
}

/** A1.2/A1.3 — the ONE conversion door: everything lands in projectRate. */
function convertTimeRange(range: TimeRange, rate: number): TimeRange {
  return {
    start: convertRate(range.start, rate),
    duration: convertRate(range.duration, rate),
  };
}

function childrenOf(node: Record<string, unknown>, where: string): unknown[] {
  const children = node.children;
  if (children === undefined || children === null) return [];
  if (!Array.isArray(children)) invalid(`${where}.children: expected an array`);
  return children;
}

/** `metadata.framebranch` — O5's extension door (ours; other tools ignore it). */
function framebranchMeta(
  node: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadata = node.metadata;
  if (!isObject(metadata)) return undefined;
  const fb = metadata.framebranch;
  return isObject(fb) ? fb : undefined;
}

export { OtioAbortError, invalid, unsupportedVersion, isObject, rt, rangeEnd, requireSchema, requireObject, requireInteger, requireRate, parseRationalTime, parseTimeRange, convertTimeRange, childrenOf, framebranchMeta };
export type { AnyClip, SchemaLabel };
