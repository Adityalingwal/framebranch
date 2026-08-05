"use client";

/**
 * head-tracking.ts — a client-side memory of "the last commit id I saw
 * become branch X's head", built ONLY from data every mutation already
 * returns (postCommit/postBranch/postRestore/postAgentSimulate/merge
 * finalize all echo the commit they just created).
 *
 * Why this exists (spec gap — see the M8b findings file for the full
 * writeup): the Changes panel (§6) needs to default to "this branch's
 * current head vs its parent", and the demo needs "main head vs
 * tighten-intro head" as two pickable commit ids. No GET endpoint in C4
 * returns a branch's head commit id, and `commits` rows (C3) carry no
 * branch attribution — a commit can outlive the branch it was made on. So
 * there is no way to ask the server "what is branch X's head" directly.
 * This store is the workaround: every mutation that moves a head reports
 * the new head commit id in its own response (F6), and the Changes panel
 * reads this alongside `GET /api/history` (which DOES carry each commit's
 * `parents`) to compute the default pair. It is best-effort by
 * construction — a hard page reload loses it — so the Changes panel always
 * also offers manual pickers over the full history list, which need no
 * tracking at all.
 *
 * Same external-store shape as connection-status.ts / toast-status.ts.
 */

import { useSyncExternalStore } from "react";

type HeadMap = Readonly<Record<string, string>>;

let state: HeadMap = {};
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function recordHead(branch: string, commitId: string): void {
  if (state[branch] === commitId) return;
  state = { ...state, [branch]: commitId };
  emit();
}

/** Reset demo (§ "sab invalidate") starts a fresh commit graph. */
export function resetHeads(): void {
  state = {};
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): HeadMap {
  return state;
}

export function useHeadCommits(): HeadMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
