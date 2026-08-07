"use client";

/**
 * hooks.ts — TanStack Query wiring over api-client.ts.
 *
 * Invalidation rules:
 *  - after a commit          → invalidate timeline + history.
 *  - after branch create/switch → invalidate timeline (+ history if a seal
 *    happened).
 *  - after restore           → both.
 *  - after demo reset        → invalidate everything.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Command, MergeChoice } from "@framebranch/engine";

import * as api from "./api-client";
import { ApiClientError, type TimelineData } from "./api-client";
import {
  reportConnectionLost,
  reportConnectionRestored,
} from "../state/connection-status";
import { recordHead, resetHeads } from "../state/head-tracking";
import { computeOptimisticResult, isOptimisticVerb } from "../optimistic";
import { queryKeys } from "./query-keys";
import { showToast } from "../state/toast-status";

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

export function useHistoryQuery() {
  return useQuery({
    queryKey: queryKeys.history(),
    queryFn: () => api.getHistory(),
  });
}

export function useDiffQuery(from: string | null, to: string | null) {
  return useQuery({
    queryKey: queryKeys.diff(from ?? "", to ?? ""),
    queryFn: () => api.getDiff(from as string, to as string),
    enabled: from !== null && to !== null,
  });
}

export function useSaveVersionMutation(branch: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => api.postCommit({ branch, name }, retryHooks),
    onSuccess: (data) => {
      recordHead(branch, data.commitId); // head-tracking.ts
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(branch) });
      queryClient.invalidateQueries({ queryKey: queryKeys.history() });
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
      recordHead(data.name, data.headCommitId);
      if (data.sealedCommitId) recordHead(variables.from, data.sealedCommitId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.from),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(data.name),
      });
      if (data.sealedCommitId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.history() });
      }
    },
    onError: onMutationError,
  });
}

export function useSwitchBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { from: string; to: string }) =>
      api.postBranchSwitch(input, retryHooks),
    onSuccess: (data, variables) => {
      if (data.sealedCommitId) recordHead(variables.from, data.sealedCommitId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.from),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.to),
      });
      if (data.sealedCommitId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.history() });
      }
    },
    onError: onMutationError,
  });
}

export function useRestoreMutation(branch: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commitId: string) =>
      api.postRestore({ branch, commitId }, retryHooks),
    onSuccess: (data) => {
      recordHead(branch, data.commitId);
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(branch) });
      queryClient.invalidateQueries({ queryKey: queryKeys.history() });
    },
    onError: onMutationError,
  });
}

export function useDemoResetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.postDemoReset(retryHooks),
    onSuccess: () => {
      resetHeads();
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
        showToast("Timeline updated.");
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
    },
  });
}

// ---------------------------------------------------------------------------
// M8b — merge. No GET exists for a merge draft (C4 has none), so the
// attempt/conflicts/counts live in the Merge panel's own component state;
// these hooks are plain request wrappers, same shared `onError` as everyone
// else. Invalidation after a `done` answer happens where the branch name is
// known (the panel), same as BranchControl's inline `onSuccess` callbacks.
// ---------------------------------------------------------------------------

export function useMergeStartMutation() {
  return useMutation({
    mutationFn: (input: { from: string; into: string }) =>
      api.postMergeStart(input, retryHooks),
    onError: onMutationError,
  });
}

export function useMergeResolveMutation() {
  return useMutation({
    mutationFn: (input: {
      attemptId: string;
      conflictId: string;
      choice: MergeChoice;
    }) => api.postMergeResolve(input, retryHooks),
    onError: (error) => {
      // §7 locked exception: E_STALE_HEAD on the LAST resolve gets its own
      // plain sentence + [Restart merge] action in the Merge panel, not the
      // generic toast (the panel's own onError, passed at the call site,
      // renders that). Every other merge-resolve error still gets it.
      if (error instanceof ApiClientError && error.code === "E_STALE_HEAD") {
        return;
      }
      onMutationError(error);
    },
  });
}

export function useMergeAbortMutation() {
  return useMutation({
    mutationFn: (input: { attemptId: string }) =>
      api.postMergeAbort(input, retryHooks),
    onError: onMutationError,
  });
}

// ---------------------------------------------------------------------------
// Agent / import / export (all boundary/server-first).
// ---------------------------------------------------------------------------

export function useAgentSimulateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branch: string; script: string }) =>
      api.postAgentSimulate(input, retryHooks),
    onSuccess: (data, variables) => {
      recordHead(variables.branch, data.commitId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.branch),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.history() });
    },
    // An agent-run failure is all-or-nothing — one verb failing mid-script
    // writes nothing at all. Show a fixed message rather than the per-code
    // error switch, since "this one edit failed" reads differently from
    // "the whole run was thrown away".
    onError: () =>
      showToast("Agent run failed — no changes were made.", "error"),
  });
}

export function useImportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branch: string; otioJson: unknown }) =>
      api.postImport(input, retryHooks),
    onSuccess: (data, variables) => {
      recordHead(variables.branch, data.commitId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.timeline(variables.branch),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.history() });
    },
    onError: onMutationError,
  });
}

export function useExportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch: string) => api.postExport({ branch }, retryHooks),
    onSuccess: (_data, branch) => {
      // Export is a boundary endpoint — auto-seal if dirty.
      // auto-sealed first. The locked response shape carries no
      // `sealedCommitId` for export (unlike branch/switch), so there is no
      // signal telling the UI whether that happened — invalidating both
      // unconditionally is the safe default (a no-op refetch if nothing
      // changed).
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(branch) });
      queryClient.invalidateQueries({ queryKey: queryKeys.history() });
    },
    onError: onMutationError,
  });
}
