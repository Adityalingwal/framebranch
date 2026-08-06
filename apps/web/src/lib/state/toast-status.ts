"use client";

/**
 * toast-status.ts — a quiet, ephemeral toast (same external-store shape as
 * connection-status.ts). Used exactly once by the brief: "if the response
 * carries `sealedCommitId`, tell the user plainly... a quiet toast is
 * right" (§8.4) — silent is wrong, a popup is also wrong.
 */

import { useSyncExternalStore } from "react";

export type ToastKind = "info" | "error";

type ToastState = { message: string; id: number; kind: ToastKind } | null;

let state: ToastState = null;
let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function showToast(
  message: string,
  kind: ToastKind = "info",
  durationMs = 4000,
): void {
  if (hideTimer) clearTimeout(hideTimer);
  state = { message, id: nextId++, kind };
  emit();
  hideTimer = setTimeout(() => {
    state = null;
    emit();
  }, durationMs);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastState {
  return state;
}

export function useToast(): ToastState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
