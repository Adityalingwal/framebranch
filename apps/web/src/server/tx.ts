/**
 * tx.ts — the transaction handle type.
 *
 * Every mutating endpoint runs its whole composite inside a single
 * transaction.
 */

import type { Db } from "../db/client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
