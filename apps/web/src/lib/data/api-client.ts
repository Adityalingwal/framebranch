/**
 * api-client.ts — the single module that talks to the API.
 *
 * Free of React: every function here is plain async code, so the envelope
 * handling, the error-code switch and the C6 retry ladder can each be unit
 * tested without a browser. React-facing code (TanStack Query hooks, the
 * connection-lost store) lives in sibling files and calls into this one.
 *
 * It owns three things:
 *  1. Envelope handling — `{ ok:false }` becomes a typed `ApiClientError`
 *     carrying `code` + a human `message`; never a thrown string, never a
 *     raw Response (the standard envelope).
 *  2. The error-code → message switch, in one place.
 *  3. The retry ladder for mutations: 2 silent retries (1s, then 3s),
 *     same ticket every time; after that, the caller is told via
 *     `RetryHooks.onConnectionLost` and gets a `retry()` closure that keeps
 *     reusing the SAME ticket for as long as the user keeps pressing it.
 */

import type {
  Command,
  DiffResult,
  ImportWarning,
  MergeChoice,
  MergeConflict,
  MergeCounts,
  Timeline,
} from "@framebranch/engine";
import type { PendingOp } from "../../server/types";

// ---------------------------------------------------------------------------
// Envelope + error mapping
// ---------------------------------------------------------------------------

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** A designed answer from the server — not a transport problem. */
export class ApiClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

/** Network failure, or a response with no readable envelope at all. */
class TransportFailure extends Error {}

/**
 * A mutation's `onError` message, always the friendly text — `ApiClientError`
 * already carries it (the C4(5) switch above ran when it was constructed).
 * Transport failures never reach here (C6's ladder + banner handle those).
 */
export function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "Something went wrong.";
}

/**
 * Error-code → message switch, in one place. Anything not listed
 * falls back to the server's own `message` — never a raw code to the user.
 */
const FRIENDLY_MESSAGES: Partial<Record<string, string>> = {
  E_STALE_HEAD: "This version moved — reload and try again.",
  E_BRANCH_EXISTS: "That name is taken.",
  E_BRANCH_NOT_FOUND: "That branch no longer exists.",
  E_PROJECT_NOT_FOUND: "This demo was reset elsewhere — reload the page.",
  E_BAD_REQUEST: "That request wasn't valid.",
  E_INTERNAL: "Something went wrong.",
};

function friendlyMessage(code: string, serverMessage: string): string {
  if (code === "E_TICKET_REUSED") {
    // A bug in us — log it, don't scare the user with it.
    console.error("[framebranch] E_TICKET_REUSED (client bug)", serverMessage);
    return "Something went wrong — please try again.";
  }
  return FRIENDLY_MESSAGES[code] ?? serverMessage;
}

async function fetchEnvelope<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin" });
  } catch {
    throw new TransportFailure("network error");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // No envelope at all — e.g. a raw platform 500/502 with no JSON body.
    throw new TransportFailure("response was not JSON");
  }

  if (typeof json !== "object" || json === null || !("ok" in json)) {
    throw new TransportFailure("malformed envelope");
  }

  const envelope = json as Envelope<T>;
  if (envelope.ok) return envelope.data;

  // A real `{ ok:false, error:{code,message} }` is an ANSWER (C6): it never
  // goes through the retry ladder, no matter the HTTP status.
  throw new ApiClientError(
    envelope.error.code,
    friendlyMessage(envelope.error.code, envelope.error.message),
  );
}

function get<T>(path: string): Promise<T> {
  return fetchEnvelope<T>(path, { method: "GET" });
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchEnvelope<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// C6 retry ladder (mutations only)
// ---------------------------------------------------------------------------

const SILENT_RETRY_DELAYS_MS = [1000, 3000] as const;

export type RetryHooks = {
  /** Called once the 2 silent retries are exhausted; call `retry()` again
   * for as many manual [Retry] presses as the user makes. */
  onConnectionLost: (retry: () => void) => void;
  onConnectionRestored: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `attempt` with the exact C6 ladder. `attempt` must be a closure that
 * always sends the SAME ticket (the caller generates it once, before the
 * first try) — that is what makes every retry, silent or manual, safe to
 * replay.
 */
export async function runMutation<T>(
  attempt: () => Promise<T>,
  hooks: RetryHooks,
): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    if (!(err instanceof TransportFailure)) throw err;
  }

  for (const delay of SILENT_RETRY_DELAYS_MS) {
    await sleep(delay);
    try {
      const result = await attempt();
      hooks.onConnectionRestored();
      return result;
    } catch (err) {
      if (!(err instanceof TransportFailure)) throw err;
    }
  }

  // 2 silent retries exhausted: banner + manual [Retry], same ticket,
  // forever (or until it works / the component gives up).
  return new Promise<T>((resolve, reject) => {
    const retry = () => {
      attempt()
        .then((result) => {
          hooks.onConnectionRestored();
          resolve(result);
        })
        .catch((err: unknown) => {
          if (!(err instanceof TransportFailure)) {
            hooks.onConnectionRestored();
            reject(err);
            return;
          }
          hooks.onConnectionLost(retry);
        });
    };
    hooks.onConnectionLost(retry);
  });
}

function newTicket(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// C4 shapes — one function per endpoint this milestone calls (§3)
// ---------------------------------------------------------------------------

export type TimelineData = {
  timeline: Timeline;
  workingRev: number;
  pendingCount: number;
  sealedCommitId?: string;
};

export type HistoryCommit = {
  commitId: string;
  name: string;
  actor: "user" | "agent";
  createdAt: string;
  parents: string[];
  importWarnings: ImportWarning[] | null;
};

export type HistoryData = {
  commits: HistoryCommit[];
};

export type DiffData = DiffResult;

export function getTimeline(branch: string): Promise<TimelineData> {
  return get<TimelineData>(
    `/api/timeline?branch=${encodeURIComponent(branch)}`,
  );
}

export function getHistory(): Promise<HistoryData> {
  return get<HistoryData>("/api/history");
}

export function getDiff(from: string, to: string): Promise<DiffData> {
  return get<DiffData>(
    `/api/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function postCommit(
  input: { branch: string; name?: string },
  hooks: RetryHooks,
): Promise<{ commitId: string; name: string }> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/commit", { ...input, ticket }),
    hooks,
  );
}

export function postBranch(
  input: { name: string; from: string },
  hooks: RetryHooks,
): Promise<{
  branchId: string;
  name: string;
  headCommitId: string;
  sealedCommitId?: string;
}> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/branch", { ...input, ticket }),
    hooks,
  );
}

export function postBranchSwitch(
  input: { from: string; to: string },
  hooks: RetryHooks,
): Promise<TimelineData> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/branch/switch", { ...input, ticket }),
    hooks,
  );
}

export function postRestore(
  input: { branch: string; commitId: string },
  hooks: RetryHooks,
): Promise<{ commitId: string; name: string }> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/restore", { ...input, ticket }),
    hooks,
  );
}

export function postDemoReset(hooks: RetryHooks): Promise<{ done: true }> {
  const ticket = newTicket();
  return runMutation(() => postJson("/api/demo/reset", { ticket }), hooks);
}

// ---------------------------------------------------------------------------
// Editing, merge, agent, import/export
// ---------------------------------------------------------------------------

/**
 * POST /api/ops success shape: {workingRev, pendingCount} for a real
 * edit, or the same with noChange:true for a no-op. Modelled as one type
 * with an optional flag.
 */
export type OpsResult = {
  workingRev: number;
  pendingCount: number;
  noChange?: boolean;
};

export function postOps(
  input: { branch: string; workingRev: number; command: Command },
  hooks: RetryHooks,
): Promise<OpsResult> {
  const ticket = newTicket();
  return runMutation(() => postJson("/api/ops", { ...input, ticket }), hooks);
}

export type OpsHistoryResult = OpsResult & { operation?: PendingOp };

export function postOpsHistory(
  input: {
    branch: string;
    workingRev: number;
    action: "undo" | "redo";
    operation?: PendingOp;
  },
  hooks: RetryHooks,
): Promise<OpsHistoryResult> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/ops/history", { ...input, ticket }),
    hooks,
  );
}

export type MergeStartResult =
  | { done: true; mergeCommitId: string }
  | { attemptId: string; conflicts: MergeConflict[]; counts: MergeCounts };

export function postMergeStart(
  input: { from: string; into: string },
  hooks: RetryHooks,
): Promise<MergeStartResult> {
  const ticket = newTicket();
  return runMutation(() => postJson("/api/merge", { ...input, ticket }), hooks);
}

export type MergeResolveResult =
  | { done: true; mergeCommitId: string }
  | { counts: MergeCounts; conflicts: MergeConflict[] };

export function postMergeResolve(
  input: { attemptId: string; conflictId: string; choice: MergeChoice },
  hooks: RetryHooks,
): Promise<MergeResolveResult> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/merge/resolve", { ...input, ticket }),
    hooks,
  );
}

export function postMergeAbort(
  input: { attemptId: string },
  hooks: RetryHooks,
): Promise<{ aborted: true }> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/merge/abort", { ...input, ticket }),
    hooks,
  );
}

export function postAgentSimulate(
  input: { branch: string; script: string },
  hooks: RetryHooks,
): Promise<{
  commitId: string;
  name: string;
  actor: "agent";
  opsApplied: number;
}> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/agent/simulate", { ...input, ticket }),
    hooks,
  );
}

export function postImport(
  input: { branch: string; otioJson: unknown },
  hooks: RetryHooks,
): Promise<{ commitId: string; skippedItems: ImportWarning[] }> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/import", { ...input, ticket }),
    hooks,
  );
}

export function postExport(
  input: { branch: string },
  hooks: RetryHooks,
): Promise<{ otioJson: unknown; commitId: string; name: string }> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/export", { ...input, ticket }),
    hooks,
  );
}
