"use client";

/**
 * editor-name.ts — F2a: the display name, asked once per browser TAB.
 *
 * Stored in `sessionStorage` under `fb_editor_name` (per-tab by design: two
 * windows on one laptop = two names, one project — J1's road). No login, no
 * server registry of users. The api-client reads it for the
 * `X-Editor-Name` header on every mutating request; the Shell's NameGate
 * asks for it when it is missing.
 *
 * Same external-store shape as connection-status.ts / toast-status.ts.
 */

import { useSyncExternalStore } from "react";

export const EDITOR_NAME_KEY = "fb_editor_name";
export const EDITOR_NAME_MAX = 100;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function read(): string | null {
  try {
    const raw = window.sessionStorage.getItem(EDITOR_NAME_KEY);
    const trimmed = raw?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null; // storage blocked → the gate asks again; nothing breaks
  }
}

/** The name, or null when this tab has not been asked yet. */
export function getEditorName(): string | null {
  if (typeof window === "undefined") return null;
  return read();
}

export function setEditorName(name: string): void {
  const trimmed = name.trim().slice(0, EDITOR_NAME_MAX);
  if (trimmed.length === 0) return;
  try {
    window.sessionStorage.setItem(EDITOR_NAME_KEY, trimmed);
  } catch {
    // storage blocked → keep going; the header simply falls back server-side
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = (): string | null => null;

export function useEditorName(): string | null {
  return useSyncExternalStore(subscribe, getEditorName, getServerSnapshot);
}
