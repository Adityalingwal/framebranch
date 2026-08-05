/**
 * tickets.ts — idempotency (docs/09 Item 14 + #16, docs/11 C3/C6).
 *
 * LOCKED behaviour:
 *  - every MUTATING endpoint carries a browser-generated UUID ticket (C6);
 *    reads never do (they change nothing).
 *  - the whole composite — auto-commit + the work + storing the result —
 *    is ONE transaction (#16(1)).
 *  - retry with the SAME ticket + SAME endpoint → the STORED result comes
 *    back and the work is done ZERO extra times (#16(2), test G1).
 *  - same ticket + a DIFFERENT endpoint → explicit E_TICKET_REUSED
 *    (#16(3), test G2). F2 cut payload comparison entirely: the original
 *    payload is not stored, so there is no fingerprint column and no
 *    same-endpoint-different-payload check.
 *  - rows have a 24h per-row TTL (C6(4)) — swept inline, no scheduler.
 *
 * A ticket is only recorded when the work SUCCEEDED. A failure throws, the
 * transaction rolls back, and the ticket row rolls back with it — so a
 * retry of a failed call is a real retry, not a replay of an error.
 */

import { and, eq, lt, sql } from "drizzle-orm";

import type { Db } from "../db/client";
import { tickets } from "../db/schema";
import { ApiError } from "./envelope";
import type { TicketEndpoint } from "./types";
import type { Tx } from "./tx";

/** C6(4) — per-row TTL. */
export const TICKET_TTL_HOURS = 24;

export async function runWithTicket<T>(
  db: Db,
  projectId: string,
  endpoint: TicketEndpoint,
  ticket: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ endpoint: tickets.endpoint, result: tickets.result })
      .from(tickets)
      .where(and(eq(tickets.projectId, projectId), eq(tickets.ticket, ticket)))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].endpoint !== endpoint) {
        throw new ApiError(
          "E_TICKET_REUSED",
          `ticket already used for "${existing[0].endpoint}", cannot reuse it for "${endpoint}"`,
        );
      }
      // Response-lost retry (HLD #16 Scene-B): hand back what the first
      // attempt produced. Nothing runs again.
      return existing[0].result as T;
    }

    const result = await work(tx);

    // Cheap inline maintenance: drop this project's expired rows while we
    // are already writing here (C6(4)); the table never has to be emptied
    // wholesale and no scheduler exists.
    await tx
      .delete(tickets)
      .where(
        and(
          eq(tickets.projectId, projectId),
          lt(
            tickets.createdAt,
            sql`now() - interval '${sql.raw(String(TICKET_TTL_HOURS))} hours'`,
          ),
        ),
      );

    await tx.insert(tickets).values({
      ticket,
      projectId,
      endpoint,
      result: result as never,
    });

    return result;
  });
}
