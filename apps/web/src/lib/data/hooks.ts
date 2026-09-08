"use client";

/**
 * hooks.ts — TanStack Query wiring over api-client.ts.
 *
 * Invalidation rules:
 *  - after a commit          → invalidate timeline + refreshBranches.
 *  - after branch create/switch → invalidate timelines + refreshBranches.
 *  - after restore/bring-in/agent/export → same.
 *  - after new project → invalidate everything.
 *
 * A1a/A1b: `refreshBranches` = the branch list (heads) AND every cut's
 * History — the two must move together or the new head has no card.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type { Command, MergeChoice } from "@framebranch/engine";

import * as api from "./api-client";
import { ApiClientError, type TimelineData } from "./api-client";
import {
  reportConnectionLost,
  reportConnectionRestored,
} from "../state/connection-status";
import { computeOptimisticResult, isOptimisticVerb } from "../optimistic";
import { queryKeys } from "./query-keys";
import { showToast } from "../state/toast-status";

/**
 * A1a patch (a): called after create / switch / commit / bring-in /
 * restore / agent / export — anything that can move a head or add a cut.
 *
 * I1 patch (b): the Agent panel's run state is DERIVED from the cut list
 * (there is no `agent_runs` table), so it belongs to exactly this set —
 * whatever can move a cut or its head can move a preset's `Done`.
 */
export function refreshBranches(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.branches() });
  queryClient.invalidateQueries({ queryKey: queryKeys.historyAll() });
  queryClient.invalidateQueries({ queryKey: queryKeys.diffAll() });
  queryClient.invalidateQueries({ queryKey: queryKeys.agentPresets() });
}

function onMutationError(error: unknown): void {
  showToast(api.mutationErrorMessage(error), "error");
}

const retryHooks: api.RetryHooks = {
  onConnectionLost: reportConnectionLost,
  onConnectionRestored: reportConnectionRestored,
};

export function useTimelineQuery(branch: string) {
  return useQuery({
    queryKey: queryKeys.timeline(branch),
    queryFn: () => api.getTimeline(branch),
  });
}

/**
 * B1 §2.3 — the frozen timeline behind View mode. `commitId === null`
 * (nobody is viewing) keeps the query idle, so leaving View cannot leave a
 * stale card refetching after a reset has invalidated everything.
 */
export function useTimelineAtQuery(cut: string, commitId: string | null) {
  return useQuery({
    queryKey: queryKeys.timelineAt(cut, commitId ?? ""),
    queryFn: () => api.getTimelineAt(cut, commitId as string),
    enabled: commitId !== null,
    // A commit's content is immutable — never refetch what cannot change.
    staleTime: Infinity,
  });
}

/**
 * A1a — the cut list with heads. A1a patch (b): the app turns
 * refetchOnWindowFocus off globally; this query alone turns it back on.
 * A1a patch (c): pass `enabled: false` until the timeline GET has answered
 * on first load (two cookie-less parallel calls would mint two projects).
 */
export function useBranchesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.branches(),
    queryFn: () => api.getBranches(),
    refetchOnWindowFocus: true,
    enabled,
  });
}

/**
 * B2 — the current cut's chain only. A1a patch (c): Shell passes
 * `enabled = false` until the first timeline GET has answered — two
 * cookie-less parallel calls would mint two projects.
 */
export function useHistoryQuery(cut: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.history(cut),
    queryFn: () => api.getHistory(cut),
    enabled,
  });
}

/**
 * I1 — the Agent panel's presets and their run state. A1a patch (c) applies
 * with extra force here: the Agent panel is the DEFAULT view, so this query
 * is live at boot and a cookie-less race with the timeline GET would mint a
 * second project. Shell gates it on `timeline.isSuccess`, like the cut list.
 */
export function useAgentPresetsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.agentPresets(),
    queryFn: () => api.getAgentPresets(),
    enabled,
  });
}

/** What `useAgentPresetsQuery` hands the Agent panel. */
export type AgentPresetsQuery = ReturnType<typeof useAgentPresetsQuery>;

/**
 * G1 — the New project picker's rows. Enabled ONLY while the dialog is
 * open: the fixtures are read and imported server-side per request, and
 * nothing at boot needs them.
 */
export function usePresetsQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.presets(),
    queryFn: () => api.getPresets(),
    enabled,
  });
}

/** D2/D4 — `a`/`b` are commit ids or `api.NOW_SIDE`; server orders them. */
export function useDiffQuery(cut: string, a: string | null, b: string | null) {
  return useQuery({
    queryKey: queryKeys.diff(cut, a ?? "", b ?? ""),
    queryFn: () => api.getDiff(cut, a as string, b as string),
    enabled: a !== null && b !== null,
  });
}

/**
 * B2 §2.2 — the Compare view's ONE query: rows, count, runtime, `older` AND
 * both timelines, from a single snapshot. Its key is a child of
 * `diffAll(cut)`, so an edit refreshes lanes and rows together.
 */
export function useCompareQuery(
  cut: string,
  a: string | null,
  b: string | null,
) {
  return useQuery({
    queryKey: queryKeys.compare(cut, a ?? "", b ?? ""),
    queryFn: () => api.getDiff(cut, a as string, b as string, { timelines: true }),
    enabled: a !== null && b !== null,
  });
}

/** What `useCompareQuery` hands the Compare surfaces. */
export type CompareQuery = ReturnType<typeof useCompareQuery>;

export function useSaveVersionMutation(branch: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.postCommit({ branch, name }, retryHooks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(branch) });
      refreshBranches(queryClient);
    },
    onError: onMutationError,
  });
}

export function useCreateBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; from: string }) =>
      api.postBranch(input, retryHooks),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.from),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(data.name),
      });
      refreshBranches(queryClient);
    },
    onError: onMutationError,
  });
}

export function useSwitchBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { from: string; to: string }) =>
      api.postBranchSwitch(input, retryHooks),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.from),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.to),
      });
      refreshBranches(queryClient);
    },
    onError: onMutationError,
  });
}

export function useRestoreMutation(branch: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commitId: string) =>
      api.postRestore({ branch, commitId }, retryHooks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(branch) });
      refreshBranches(queryClient);
    },
    onError: onMutationError,
  });
}

/**
 * G1 — "New project". The open project is replaced wholesale, so EVERY
 * query is invalidated; nothing that was cached is about the new project.
 */
export function useNewProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { preset: string }) =>
      api.postProjectNew(input, retryHooks),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
    onError: onMutationError,
  });
}

// ---------------------------------------------------------------------------
// The optimistic mutation wrapper. ONE hook, every one of
// the 8 edit verbs goes through it (rule c: rollback/refetch/E_STALE_REV
// handling live here once).
// ---------------------------------------------------------------------------

type MutateContext = { previous: TimelineData | undefined };

/**
 * `POST /api/ops` wrapped with the hybrid optimistic behaviour.
 *
 * - `onMutate` (runs BEFORE the request): if `command.op` is in the
 *   `optimistic.ts` opt-in list, compute the result with `applyCommand`
 *   (rule b) and paint it into the cache immediately (rule a's default is
 *   the ABSENCE of this branch, not a flag to check per call site).
 * - `onError`: always roll back to the snapshot taken in `onMutate`.
 *   E_STALE_REV gets silent treatment — invalidate timeline and do a quiet
 *   toast, then a fresh GET. Any other designed error shows the human
 *   sentence the error-code switch already produced.
 * - `onSuccess`: a `noChange` answer touches nothing. Otherwise the
 *   server's `workingRev`/`pendingCount` are written straight from its
 *   answer (never invented/incremented locally), and the timeline query is
 *   invalidated so a fresh `GET /api/timeline` becomes the final truth
 *   (rule d) — `POST /api/ops` itself never returns the timeline, so this
 *   refetch is what "replace the client's guess with the server's" means
 *   here, and it runs even when the two would already match.
 */
export function useOpsMutation(branch: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.timeline(branch);

  return useMutation<api.OpsResult, unknown, Command, MutateContext>({
    mutationFn: (command: Command) => {
      const current = queryClient.getQueryData<TimelineData>(key);
      const workingRev = current?.workingRev ?? 0;
      return api.postOps({ branch, workingRev, command }, retryHooks);
    },
    onMutate: async (command: Command) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TimelineData>(key);
      if (previous && isOptimisticVerb(command.op)) {
        const result = computeOptimisticResult(previous.timeline, command);
        if (result.ok && !result.noChange) {
          queryClient.setQueryData<TimelineData>(key, {
            ...previous,
            timeline: result.timeline,
          });
        }
        // A rejected/no-change optimistic guess leaves the cache untouched —
        // the real answer (rollback text or "nothing happened") comes from
        // the server response below, never invented here.
      }
      return { previous };
    },
    onError: (error, _command, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
      if (error instanceof ApiClientError && error.code === "E_STALE_REV") {
        queryClient.invalidateQueries({ queryKey: key });
        // #198 — with live edits from another tab, say WHY the edit was
        // dropped rather than announcing a refresh with no reason.
        showToast("Timeline updated — someone else edited this cut.");
        return;
      }
      onMutationError(error);
    },
    onSuccess: (data) => {
      if (data.noChange) return; // F9: workingRev/pendingCount untouched
      const latest = queryClient.getQueryData<TimelineData>(key);
      if (latest) {
        queryClient.setQueryData<TimelineData>(key, {
          ...latest,
          workingRev: data.workingRev,
          pendingCount: data.pendingCount,
        });
      }
      queryClient.invalidateQueries({ queryKey: key });
      // D2 patch: an edit changes every "‹card› → Now" diff on this cut.
      queryClient.invalidateQueries({ queryKey: queryKeys.diffAll(branch) });
    },
  });
}

// ---------------------------------------------------------------------------
// B3 — Bring in. The preview is a QUERY (stateless, re-asked on every
// choice); the landing is the only mutation.
// ---------------------------------------------------------------------------

/**
 * §2.4 — the preview. `enabled` only while the preview is open, so no other
 * screen pays for it. `staleTime: Infinity` because nothing but a choice or
 * `Start again` may change this answer: an automatic refetch would mint a
 * new token behind the user's back. `keepPreviousData` so a choice does not
 * blank the lanes while the next answer is in flight.
 */
export function useBringInPreviewQuery(
  cut: string | null,
  choices: Record<string, MergeChoice>,
  choicesKey: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.bringIn(cut ?? "", choicesKey),
    queryFn: () => api.getBringInPreview(cut as string, choices),
    enabled: enabled && cut !== null,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export type BringInPreviewQuery = ReturnType<typeof useBringInPreviewQuery>;

/**
 * The landing. On success main's head moved and the cut may have been
 * auto-sealed, so both timelines and the branch list / History / diff
 * prefixes are refreshed.
 *
 * `onError` stays SILENT for the two answers the panel renders itself (F4's
 * staleness patti and the engine precondition, §2.6) — a toast on top of the
 * patti would say the same thing twice.
 */
export function useBringInMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      from: string;
      token: api.BringInToken;
      choices: Record<string, MergeChoice>;
    }) => api.postBringIn(input, retryHooks),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline("main") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.from),
      });
      refreshBranches(queryClient);
    },
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        (error.code === "E_STALE_HEAD" ||
          error.code === "E_MERGE_PRECONDITION")
      ) {
        return;
      }
      onMutationError(error);
    },
  });
}

// ---------------------------------------------------------------------------
// F3(4) — Ready for main. Marking changes nothing on main and locks
// nothing: only the cut's own four `ready_*` columns move, so the cut list
// (and with it the top-bar tag, the Bring-in dot and the badge) is the
// whole refresh.
//
// The success toasts (#166 / #169) live in the CALLER, following the
// convention `Marked "‹name›".` set in `TopBar.tsx` — no hook in this file
// toasts on success. Errors go through `onMutationError` like everything
// else; 400 and 404 are already in the friendly map, so B4b adds no code.
// ---------------------------------------------------------------------------

export function useReadyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cut: string; note: string }) =>
      api.postReady(input, retryHooks),
    onSuccess: () => refreshBranches(queryClient),
    onError: onMutationError,
  });
}

export function useUnreadyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cut: string }) => api.deleteReady(input, retryHooks),
    onSuccess: () => refreshBranches(queryClient),
    onError: onMutationError,
  });
}

// ---------------------------------------------------------------------------
// Agent / export (both boundary/server-first). Import has no UI caller any
// more (G1) — `POST /api/import` stays as an API.
// ---------------------------------------------------------------------------

export function useAgentRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { preset: string }) =>
      api.postAgentRun(input, retryHooks),
    onSuccess: (data) => {
      // The cut the server just made, plus the cut list (which is where the
      // preset's `Done` and the run-log come from) — and main, because a
      // dirty main was sealed on the way in.
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(data.cut) });
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline("main") });
      refreshBranches(queryClient);
    },
    // An agent-run failure is all-or-nothing — one verb failing mid-script
    // writes nothing at all, not even the cut. Show a fixed message (#188)
    // rather than the per-code error switch, since "this one edit failed"
    // reads differently from "the whole run was thrown away".
    onError: () => showToast("Agent run failed — nothing changed.", "error"),
  });
}

export function useExportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch: string) => api.postExport({ branch }, retryHooks),
    onSuccess: (_data, branch) => {
      // Export is a boundary endpoint — it auto-seals if dirty. The response
      // carries no `sealedCommitId`, so refresh unconditionally (a no-op
      // refetch if nothing changed).
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(branch) });
      refreshBranches(queryClient);
    },
    onError: onMutationError,
  });
}
