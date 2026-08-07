/**
 * handler.ts — the one door every route goes through.
 *
 * It does three things:
 *  1. capability token → project. No cookie → bootstrap a fresh project.
 *     Unknown cookie → 404 E_PROJECT_NOT_FOUND (never anyone else's data).
 *  2. runs the route's work.
 *  3. wraps the result in the standard response envelope.
 *
 * Designed failures throw ApiError with a locked code. Unexpected exceptions
 * become E_INTERNAL — the original message is logged server-side, never
 * sent to the client.
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
 * Body parsing + validation — every input is schema-validated at the
 * API door; bad input never reaches the engine. A malformed body is
 * E_BAD_REQUEST.
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
