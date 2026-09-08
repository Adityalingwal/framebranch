"use client";

/**
 * bring-in-choices.ts — F3(1) / lock (3): the decisions a person makes in the
 * Bring-in preview live in the BROWSER, not on the server. The preview writes
 * nothing, so there is nowhere else for them to be, and a reload of the tab
 * does not lose the ten answers already given.
 *
 * Key: `fb_bringin:‹cut›:‹mainHead›:‹cutHead›:‹mainRev›:‹cutRev›` — the
 * FROZEN token the Shell captured from the first preview answer. Because the
 * token is part of the key, `Start again` (the only thing that re-captures
 * it) leaves the old answers behind without any code deleting them: F4 says
 * the decisions are re-asked, and pre-filling them is a later re-open.
 *
 * `sessionStorage`, per tab, same external-store shape as editor-name.ts.
 * The SNAPSHOT IS THE RAW STRING: `useSyncExternalStore` compares snapshots
 * by identity, and a freshly parsed object would be a new reference on every
 * render. Callers parse it once, in a memo.
 */

import { useSyncExternalStore } from "react";

import type { MergeChoice } from "@framebranch/engine";

import type { BringInToken } from "../data/api-client";

export type BringInChoices = Record<string, MergeChoice>;

const PREFIX = "fb_bringin";
export const EMPTY_CHOICES = "{}";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** The one place the key is built, so the store and the query key agree. */
export function choicesKeyFor(cut: string, token: BringInToken | null): string {
  if (token === null) return "";
  return `${PREFIX}:${cut}:${token.mainHead}:${token.cutHead}:${token.mainRev}:${token.cutRev}`;
}

/** The raw stored JSON — stable between renders, so it is safe as a snapshot. */
export function readRaw(key: string): string {
  if (key === "" || typeof window === "undefined") return EMPTY_CHOICES;
  try {
    return window.sessionStorage.getItem(key) ?? EMPTY_CHOICES;
  } catch {
    // Storage blocked → the decisions simply do not survive a reload.
    return EMPTY_CHOICES;
  }
}

export function parseChoices(raw: string): BringInChoices {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as BringInChoices;
  } catch {
    return {};
  }
}

export function setChoice(
  key: string,
  conflictId: string,
  choice: MergeChoice,
): void {
  if (key === "") return;
  const next = { ...parseChoices(readRaw(key)), [conflictId]: choice };
  // Sorted keys: the serialisation is part of the query key, so two equal
  // answer sets must produce the same string.
  const sorted = Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => a.localeCompare(b)),
  );
  try {
    window.sessionStorage.setItem(key, JSON.stringify(sorted));
  } catch {
    // Blocked storage: this choice is lost on reload, nothing else breaks.
  }
  emit();
}

export function clearChoices(key: string): void {
  if (key === "") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // nothing to do — there was nothing to clear
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = (): string => EMPTY_CHOICES;

/** The raw JSON for this key; parse it in a memo where it is used. */
export function useBringInChoicesRaw(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    getServerSnapshot,
  );
}
