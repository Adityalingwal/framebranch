/**
 * envelope.ts — docs/11 C4 (1): EVERY response has the same outer shape.
 *
 *   success → { ok: true,  data: {...} }
 *   failure → { ok: false, error: { code, message } }
 *
 * `code` is the machine contract (the UI switches on it), `message` is for
 * a human. Per-endpoint custom shapes were explicitly rejected.
 *
 * The error CODES below are exactly C4 point (5) + its F8 amendment — the
 * official list, nothing else. `E_ID_COLLISION` is absent on purpose (F8
 * removed it: unreachable by design).
 */

/** C4 (5) — Phase A verb codes. Mirrors the engine's own `ErrorCode`. */
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

export const ERROR_CODES = [...VERB_CODES, ...SYSTEM_CODES] as const;

export type ApiErrorCode = (typeof ERROR_CODES)[number];

/**
 * HTTP status is transport, not contract: the UI reads `error.code`. The
 * only status the docs pin down is 404 for a capability-token mismatch
 * (HLD #14 — "mismatch = 404, never 403, never another project's data").
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
