/**
 * tx.ts — the transaction handle type, in one place.
 *
 * Every mutating endpoint runs its WHOLE composite (ticket lookup +
 * optional boundary auto-seal + the actual work + storing the ticket
 * result) inside a single transaction — docs/09 Item 4b + #16(1).
 */

import type { Db } from "../db/client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
