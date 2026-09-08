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
  ImportWarning,
  MergeChoice,
  Timeline,
} from "@framebranch/engine";
// Type-only imports: erased at build time, so no server code reaches the
// browser bundle — but the client and the route share ONE shape definition.
import type { BranchListItem } from "../../app/api/branch/route";
import type { DiffResponse } from "../../app/api/diff/route";
import type {
  BringInPreview,
  BringInToken,
} from "../../app/api/merge/preview/route";
import type { HistoryItem } from "../../app/api/history/route";
import type { TimelineAtResponse } from "../../app/api/timeline/route";
import { getEditorName } from "../state/editor-name";

// ---------------------------------------------------------------------------
// Envelope + error mapping
// ---------------------------------------------------------------------------

type Envelope<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };

/**
 * A designed answer from the server — not a transport problem.
 *
 * `message` is the friendly text (the switch below already ran when this was
 * constructed). B3 adds `serverMessage`: F4's staleness refusal is the one
 * case where the server knows more than the map does — who moved what — and
 * the Bring-in panel shows that sentence verbatim (lock (3)). `details`
 * carries the same facts in machine form (`{ side, who }`).
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly serverMessage: string;
  readonly details?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    serverMessage: string = message,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.serverMessage = serverMessage;
    this.details = details;
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
  E_NAME_REQUIRED: "Give this version a name first.",
  E_BRANCH_EXISTS: "That name is taken.",
  E_BRANCH_NOT_FOUND: "That branch no longer exists.",
  E_PROJECT_NOT_FOUND: "This demo was reset elsewhere — reload the page.",
  E_BAD_REQUEST: "That request wasn't valid.",
  E_INTERNAL: "Something went wrong.",
  // #207 — the engine's own precondition prose is for logs and tests; the
  // Bring-in panel shows #159 with the cut's name, and this is the
  // name-less version for anywhere else.
  E_MERGE_PRECONDITION: "Couldn't finish bringing in. Start again.",
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
    envelope.error.message,
    envelope.error.details,
  );
}

function get<T>(path: string): Promise<T> {
  return fetchEnvelope<T>(path, { method: "GET" });
}

/** F2a — the header every mutating request carries; reads never do. */
export const EDITOR_NAME_HEADER = "X-Editor-Name";

function postJson<T>(path: string, body: unknown): Promise<T> {
  const editorName = getEditorName();
  return fetchEnvelope<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The NameGate makes sure a name exists before the UI can mutate;
      // when it somehow does not, the server attributes the work to
      // `Editor` (B0 leniency) rather than refusing it.
      ...(editorName ? { [EDITOR_NAME_HEADER]: editorName } : {}),
    },
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

export type HistoryCommit = HistoryItem;

/** B2 — one cut's chain, head first. */
export type HistoryData = {
  cut: string;
  commits: HistoryCommit[];
};

/** A1a/A1b — every cut with its head + Ready state, `main` first. */
export type BranchesData = {
  branches: BranchListItem[];
};

/** D4 — presenter rows, canonicalised older → newer by the server. */
export type DiffData = DiffResponse;

/** D2 — the working-timeline side of a diff. */
export const NOW_SIDE = "now";

export function getTimeline(branch: string): Promise<TimelineData> {
  return get<TimelineData>(
    `/api/timeline?branch=${encodeURIComponent(branch)}`,
  );
}

/** B1 §2.3 — one card's frozen content, for View mode. */
export type TimelineAtData = TimelineAtResponse;

export function getTimelineAt(
  cut: string,
  commitId: string,
): Promise<TimelineAtData> {
  const q = new URLSearchParams({ branch: cut, at: commitId });
  return get<TimelineAtData>(`/api/timeline?${q.toString()}`);
}

export function getBranches(): Promise<BranchesData> {
  return get<BranchesData>("/api/branch");
}

export function getHistory(cut: string): Promise<HistoryData> {
  return get<HistoryData>(`/api/history?cut=${encodeURIComponent(cut)}`);
}

/**
 * B2 §2.2 — `timelines: true` additionally brings back the two materialised
 * timelines the rows were computed from (the Compare lanes). Without it the
 * answer is exactly what B1 asked for, so the chip's count stays light.
 */
export function getDiff(
  cut: string,
  a: string,
  b: string,
  options: { timelines?: boolean } = {},
): Promise<DiffData> {
  const q = new URLSearchParams({ cut, a, b });
  if (options.timelines) q.set("timelines", "1");
  return get<DiffData>(`/api/diff?${q.toString()}`);
}

/** C2 — a Mark always carries a name (the server refuses an empty one). */
export function postCommit(
  input: { branch: string; name: string },
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

/** B3 — the whole Bring-in screen, computed by one GET (F3(1)). */
export type BringInPreviewData = BringInPreview;
export type { BringInToken };
export type { ConflictCard } from "../../server/conflict-cards";

/**
 * Stateless: the choices travel with every request and nothing is remembered
 * server-side. Conflict ids carry an encoded payload, so the parameter is
 * URL-encoded JSON rather than an `id:choice,…` list.
 */
export function getBringInPreview(
  from: string,
  choices: Record<string, MergeChoice>,
): Promise<BringInPreviewData> {
  const q = new URLSearchParams({ from });
  if (Object.keys(choices).length > 0) {
    q.set("choices", JSON.stringify(choices));
  }
  return get<BringInPreviewData>(`/api/merge/preview?${q.toString()}`);
}

/** The landing. `into` is always `main` (F1); the token is F4's whole check. */
export function postBringIn(
  input: {
    from: string;
    token: BringInToken;
    choices: Record<string, MergeChoice>;
  },
  hooks: RetryHooks,
): Promise<{ done: true; mergeCommitId: string }> {
  const ticket = newTicket();
  return runMutation(
    () => postJson("/api/merge", { ...input, into: "main", ticket }),
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
