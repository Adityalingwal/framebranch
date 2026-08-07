/**
 * tickets.ts — idempotency. Every mutating endpoint carries a browser-
 * generated UUID ticket; reads never do. The whole composite (auto-commit
 * + the work + storing the result) is one transaction.
 *
 * - Same ticket + same endpoint → stored result returned, work done zero
 *   extra times.
 * - Same ticket + different endpoint → E_TICKET_REUSED.
 * - Rows have a 24h per-row TTL, swept inline.
 *
 * A ticket is only recorded when the work succeeded — a failure rolls the
 * transaction back, so a retry is a real retry, not a replay of an error.
 */

import { and, eq, lt, sql } from "drizzle-orm";

import type { Db } from "../db/client";
import { tickets } from "../db/schema";
import { ApiError } from "./envelope";
import type { TicketEndpoint } from "./types";
import type { Tx } from "./tx";

/** Per-row TTL — inline cleanup, no scheduler. */
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
      // Response-lost retry: hand back what the first attempt produced.
      return existing[0].result as T;
    }

    const result = await work(tx);

    // Inline cleanup: drop this project's expired rows on every write.
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
