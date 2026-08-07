// Shared test harness. Uses TRUNCATE (not transaction rollback) — code under test opens its own
// transactions; an outer rollback would nest them and stop testing real DB behaviour.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "The server tests need a real Postgres database. Set TEST_DATABASE_URL " +
      "(or DATABASE_URL) to a database you are happy to have TRUNCATEd, e.g.\n" +
      "  createdb framebranch_test\n" +
      "  TEST_DATABASE_URL=postgres://localhost:5432/framebranch_test pnpm test",
  );
}
// The app's client reads DATABASE_URL; point it at the test database.
process.env.DATABASE_URL = url;

import { closeDb, getDb } from "../src/db/client";
import { TOKEN_COOKIE } from "../src/server/project";

export { closeDb, getDb };

const TABLES = [
  "tickets",
  "merge_attempts",
  "working_state",
  "snapshots",
  "ops",
  "commits",
  "branches",
  "projects",
];

export async function resetDatabase(): Promise<void> {
  await getDb().execute(
    sql.raw(`truncate table ${TABLES.join(", ")} restart identity cascade`),
  );
}

export const ticket = (): string => randomUUID();

const BASE = "http://framebranch.test";

export type Session = { token: string | null };

function cookieHeader(session: Session): Record<string, string> {
  return session.token ? { cookie: `${TOKEN_COOKIE}=${session.token}` } : {};
}

/** Captures the Set-Cookie the bootstrap issues, like a browser would. */
function captureToken(session: Session, response: Response): void {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;
  const match = new RegExp(`${TOKEN_COOKIE}=([^;]+)`).exec(setCookie);
  if (match) session.token = match[1];
}

export type Envelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type Call<T = unknown> = {
  status: number;
  body: Envelope<T>;
  response: Response;
};

export async function get<T = unknown>(
  handler: (request: Request) => Promise<Response>,
  path: string,
  session: Session = { token: null },
): Promise<Call<T>> {
  const response = await handler(
    new Request(`${BASE}${path}`, { headers: cookieHeader(session) }),
  );
  captureToken(session, response);
  return { status: response.status, body: await response.json(), response };
}

export async function post<T = unknown>(
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
  session: Session = { token: null },
): Promise<Call<T>> {
  const response = await handler(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieHeader(session) },
      body: JSON.stringify(body),
    }),
  );
  captureToken(session, response);
  return { status: response.status, body: await response.json(), response };
}

export function expectOk<T>(call: Call<T>): T {
  if (!call.body.ok) {
    throw new Error(
      `expected ok, got ${call.body.error.code}: ${call.body.error.message}`,
    );
  }
  return call.body.data;
}

export function expectError(call: Call): { code: string; message: string } {
  if (call.body.ok) {
    throw new Error(`expected an error, got ok: ${JSON.stringify(call.body)}`);
  }
  return call.body.error;
}
