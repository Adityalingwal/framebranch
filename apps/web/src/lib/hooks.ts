"use client";

/**
 * hooks.ts — TanStack Query wiring over api-client.ts (brief §7).
 *
 * Invalidation rules, exactly as locked:
 *  - after a commit          → invalidate timeline + history.
 *  - after branch create/switch → invalidate timeline (+ history if a seal
 *    happened, i.e. `sealedCommitId` came back).
 *  - after restore           → both.
 *  - after demo reset        → invalidate everything.
 *
 * Every mutation also gets a shared `onError`: a designed `{ok:false}`
 * answer (e.g. E_BRANCH_EXISTS) never goes through the C6 retry ladder, so
 * without this the UI would just... do nothing (M8a review finding).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api-client";
import {
  reportConnectionLost,
  reportConnectionRestored,
} from "./connection-status";
import { queryKeys } from "./query-keys";
import { showToast } from "./toast-status";

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
    mutationFn: (name?: string) =>
      api.postCommit({ branch, name }, retryHooks),
    onSuccess: () => {
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
    onSuccess: () => {
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
      queryClient.invalidateQueries();
    },
    onError: onMutationError,
  });
}
