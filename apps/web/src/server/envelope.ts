/**
 * envelope.ts — every response has the same outer shape:
 *
 *   success → { ok: true,  data: {...} }
 *   failure → { ok: false, error: { code, message } }
 *
 * code is the machine contract (the UI switches on it), message is for a
 * human. Per-endpoint custom shapes were explicitly rejected.
 */

/** Phase A verb codes. Mirrors the engine's own ErrorCode union. */
const VERB_CODES = [
  "E_CLIP_NOT_FOUND",
  "E_TRACK_NOT_FOUND",
  "E_MEDIA_NOT_FOUND",
  "E_OVERLAP",
  "E_SOURCE_OUT_OF_BOUNDS",
  "E_INVALID_RANGE",
  "E_NEGATIVE_TIME",
  "E_TRACK_KIND_MISMATCH",
  "E_RATE_MISMATCH",
  "E_PROPERTY_NOT_APPLICABLE",
  "E_INVALID_VALUE",
  "E_NOT_APPLICABLE",
  "E_SPLIT_AT_BOUNDARY",
  "E_SPLIT_OUT_OF_RANGE",
] as const;

/** C4 (5) — system codes. */
const SYSTEM_CODES = [
  "E_STALE_REV",
  "E_STALE_HEAD",
  "E_TICKET_REUSED",
  "E_BRANCH_NOT_FOUND",
  "E_PROJECT_NOT_FOUND",
  "E_MERGE_PRECONDITION",
  "E_UNSUPPORTED_OTIO_VERSION",
  "E_INVALID_OTIO",
  "E_PAYLOAD_TOO_LARGE",
] as const;

/**
 * Transport codes — named later for three situations that needed codes:
 *
 * - E_BAD_REQUEST   — the request itself does not parse (bad JSON, a command
 *                     outside the union, a missing field). Distinguished from
 *                     E_INVALID_VALUE which means "that value is illegal for
 *                     this clip" — a different failure.
 * - E_BRANCH_EXISTS — the branches(project_id, name) unique index makes this
 *                     real and detectable. The branch is still never created;
 *                     this only lets the UI say "that name is taken".
 * - E_INTERNAL      — an unexpected exception. Without it, a crash escaped the
 *                     envelope entirely and the single response reader met a
 *                     raw platform 500.
 */
const TRANSPORT_CODES = [
  "E_BAD_REQUEST",
  "E_BRANCH_EXISTS",
  "E_INTERNAL",
] as const;

export const ERROR_CODES = [
  ...VERB_CODES,
  ...SYSTEM_CODES,
  ...TRANSPORT_CODES,
] as const;

export type ApiErrorCode = (typeof ERROR_CODES)[number];

/**
 * HTTP status is transport, not contract: the UI reads `error.code`.
 * Capability-token mismatches use 404 — never 403, never another project's data.
 */
const STATUS_BY_CODE: Partial<Record<ApiErrorCode, number>> = {
  E_PROJECT_NOT_FOUND: 404,
  E_BRANCH_NOT_FOUND: 404,
  E_CLIP_NOT_FOUND: 404,
  E_TRACK_NOT_FOUND: 404,
  E_MEDIA_NOT_FOUND: 404,
  E_STALE_REV: 409,
  E_STALE_HEAD: 409,
  E_TICKET_REUSED: 409,
  E_PAYLOAD_TOO_LARGE: 413,
  E_BRANCH_EXISTS: 409,
  E_INTERNAL: 500,
};

/** Every designed failure path throws one of these. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code] ?? 400;
}

export function okResponse(data: unknown, headers?: HeadersInit): Response {
  return Response.json({ ok: true, data }, { status: 200, headers });
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status: statusForCode(code), headers },
  );
}
