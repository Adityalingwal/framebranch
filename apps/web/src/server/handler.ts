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
 * Unexpected exceptions are deliberately NOT swallowed into an invented
 * "E_INTERNAL": the C4 error list is closed, and inventing a code to
 * describe our own bug would be inventing design. Designed failures all
 * throw `ApiError` with a locked code; anything else is a crash and is
 * reported as one.
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
    throw error;
  }
}

/**
 * Body parsing + validation (docs/09 Item 12: every input is
 * schema-validated at the API door; bad input never reaches the engine).
 *
 * A malformed body is reported as E_INVALID_VALUE — the closest member of
 * the locked C4 list. See IMPLEMENTATION-NOTES: the list has no dedicated
 * "malformed request" code and none was invented.
 */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("E_INVALID_VALUE", "request body is not valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      "E_INVALID_VALUE",
      `invalid request body: ${issue.path.join(".") || "(root)"} ${issue.message}`,
    );
  }
  return parsed.data;
}

/** Query-string reader for the two GET endpoints. */
export function requiredQuery(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name);
  if (value === null || value === "") {
    throw new ApiError("E_INVALID_VALUE", `missing "${name}" query parameter`);
  }
  return value;
}
