"use client";

/**
 * connection-status.ts — the global "Connection lost" banner state (C6).
 *
 * A tiny external store (module-level, subscribed via
 * `useSyncExternalStore`) rather than React context: the banner is a
 * single global fact ("is any mutation currently stuck after its 2 silent
 * retries"), and every mutation hook needs to be able to set it without
 * being inside a particular provider's subtree.
 *
 * The exact banner text is locked (C6): "Connection lost — your saved work
 * is safe."
 */

import { useSyncExternalStore } from "react";

export const CONNECTION_LOST_MESSAGE =
  "Connection lost — your saved work is safe";

type ConnectionState = {
  lost: boolean;
  retry: (() => void) | null;
};

let state: ConnectionState = { lost: false, retry: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Passed as `RetryHooks.onConnectionLost` to api-client mutations. */
export function reportConnectionLost(retry: () => void): void {
  state = { lost: true, retry };
  emit();
}

/** Passed as `RetryHooks.onConnectionRestored`. */
export function reportConnectionRestored(): void {
  if (!state.lost) return;
  state = { lost: false, retry: null };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ConnectionState {
  return state;
}

export function useConnectionStatus(): ConnectionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
