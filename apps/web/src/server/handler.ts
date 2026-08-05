/**
 * handler.ts — the one door every route goes through.
 *
 * It does three things, in this order:
 *  1. capability token → project (HLD #14). No cookie at all = first visit
 *     → bootstrap a fresh project and set the cookie. A cookie that
 *     matches NO project = 404 E_PROJECT_NOT_FOUND — never 403, and never
 *     anyone else's data (test G5).
 *  2. runs the route's work.
 *  3. wraps whatever comes back in the C4 envelope.
 *
 * Designed failures throw `ApiError` with a locked code. An UNEXPECTED
 * exception becomes `E_INTERNAL` [ADDED 2026-08-05, M7a owner triage: the
 * code did not exist, so a crash used to escape the envelope entirely and
 * the UI's single reader — the whole point of C4 (1) — met a raw platform
 * 500]. The original message is never sent to the client; it is logged
 * server-side so a stack trace or a connection string cannot leak.
 */

import { z } from "zod";

import { getDb } from "../db/client";
import type { Db } from "../db/client";
import { ApiError, errorResponse, okResponse } from "./envelope";
import {
  bootstrapProject,
  findProjectByToken,
  readTokenCookie,
  tokenCookieHeader,
} from "./project";
import type { ProjectRow } from "./project";

export type RequestContext = {
  db: Db;
  project: ProjectRow;
};

export async function handleRequest(
  request: Request,
  work: (ctx: RequestContext) => Promise<unknown>,
): Promise<Response> {
  const db = getDb();
  const token = readTokenCookie(request);

  let project: ProjectRow;
  let headers: HeadersInit | undefined;

  if (token === null) {
    const created = await bootstrapProject(db);
    project = created.project;
    // Set on success AND on failure: the project row exists either way, so
    // dropping the cookie here would orphan it immediately.
    headers = { "Set-Cookie": tokenCookieHeader(created.token) };
  } else {
    const found = await findProjectByToken(db, token);
    if (found === null) {
      return errorResponse(
        "E_PROJECT_NOT_FOUND",
        "no project for this session",
      );
    }
    project = found;
  }

  try {
    const data = await work({ db, project });
    return okResponse(data, headers);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.code, error.message, headers);
    }
    // Unexpected — our bug, not the caller's. Log the real thing, tell the
    // client only that it happened (C4 (1): the envelope has no exceptions).
    console.error("[framebranch] unhandled error", error);
    return errorResponse("E_INTERNAL", "something went wrong", headers);
  }
}

/**
 * Body parsing + validation (docs/09 Item 12: every input is
 * schema-validated at the API door; bad input never reaches the engine).
 *
 * A malformed body is E_BAD_REQUEST [ADDED 2026-08-05, M7a owner triage].
 * It used to borrow E_INVALID_VALUE, but that is a Phase-A VERB code meaning
 * "that value is illegal for this clip" — a request that does not even parse
 * is a different failure, and the UI could not tell the two apart.
 */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("E_BAD_REQUEST", "request body is not valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      "E_BAD_REQUEST",
      `invalid request body: ${issue.path.join(".") || "(root)"} ${issue.message}`,
    );
  }
  return parsed.data;
}

/** Query-string reader for the two GET endpoints. */
export function requiredQuery(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name);
  if (value === null || value === "") {
    throw new ApiError("E_BAD_REQUEST", `missing "${name}" query parameter`);
  }
  return value;
}
