/**
 * B4b fix 5 (Codex GAP) — `getTabIdentity()` had no direct test.
 *
 * It is the one piece of J1 that owns bespoke storage behaviour: the id
 * `/api/sync` upserts this tab's presence row against, and the hue everyone
 * else draws this tab's playhead and chip in. If it were re-minted per call
 * the server would collect a new presence row every 3 seconds and this tab
 * would appear as a crowd of strangers to everybody.
 *
 * This app's vitest runs on `node` with no jsdom (and the brief forbids
 * adding one for a hook), so `window` is stubbed with just the one API the
 * module touches. That is enough: the module reads nothing else.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TAB_IDENTITY_KEY,
  getTabIdentity,
  resetTabIdentityForTests,
} from "../src/lib/state/tab-identity";

/** A `sessionStorage` that can be told to throw, like a hardened profile. */
function fakeStorage(options: { getThrows?: boolean; setThrows?: boolean } = {}) {
  const items = new Map<string, string>();
  return {
    items,
    getItem(key: string): string | null {
      if (options.getThrows) throw new DOMException("blocked", "SecurityError");
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (options.setThrows) throw new DOMException("blocked", "SecurityError");
      items.set(key, value);
    },
  };
}

function install(storage: ReturnType<typeof fakeStorage>) {
  vi.stubGlobal("window", { sessionStorage: storage });
  return storage;
}

beforeEach(() => {
  resetTabIdentityForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTabIdentityForTests();
});

describe("getTabIdentity", () => {
  it("is minted ONCE and is the same object every call", () => {
    install(fakeStorage());

    const first = getTabIdentity();
    const second = getTabIdentity();

    // Not merely equal — the same memoised value, so nothing downstream
    // re-renders or re-registers because identity "changed".
    expect(second).toBe(first);
    expect(getTabIdentity().tabId).toBe(first.tabId);
  });

  it("satisfies the shapes `syncBodySchema` enforces on the wire", () => {
    install(fakeStorage());

    const { tabId, colourSeed } = getTabIdentity();

    // `min(8).max(64)` — a UUID is 36.
    expect(tabId.length).toBeGreaterThanOrEqual(8);
    expect(tabId.length).toBeLessThanOrEqual(64);
    // An HSL hue the server also bounds.
    expect(Number.isInteger(colourSeed)).toBe(true);
    expect(colourSeed).toBeGreaterThanOrEqual(0);
    expect(colourSeed).toBeLessThanOrEqual(359);
  });

  it("is persisted under `fb_tab`, and read back rather than re-minted", () => {
    const storage = install(fakeStorage());

    const minted = getTabIdentity();
    expect(JSON.parse(storage.items.get(TAB_IDENTITY_KEY)!)).toEqual(minted);

    // A reload of the SAME tab: the module is fresh, the storage is not.
    resetTabIdentityForTests();
    expect(getTabIdentity()).toEqual(minted);
    expect(storage.items.size).toBe(1);
  });

  it("a second tab of the same browser gets its OWN identity", () => {
    // `sessionStorage` is per-tab, which is the whole reason J1 uses it:
    // two windows of one browser must be two collaborators, not one.
    install(fakeStorage());
    const tabA = getTabIdentity();

    resetTabIdentityForTests();
    install(fakeStorage()); // a different tab → a different storage
    const tabB = getTabIdentity();

    expect(tabB.tabId).not.toBe(tabA.tabId);
  });

  it("junk in storage is replaced by a fresh mint, not trusted", () => {
    const storage = install(fakeStorage());
    storage.items.set(TAB_IDENTITY_KEY, "{not json");
    expect(getTabIdentity().tabId.length).toBeGreaterThanOrEqual(8);

    resetTabIdentityForTests();
    storage.items.set(TAB_IDENTITY_KEY, JSON.stringify({ tabId: "short" }));
    const minted = getTabIdentity();
    expect(minted.tabId).not.toBe("short");
    // The bad value is overwritten, so the next reload reads a good one.
    expect(JSON.parse(storage.items.get(TAB_IDENTITY_KEY)!)).toEqual(minted);
  });

  it("an out-of-range colourSeed in storage is not trusted either", () => {
    const storage = install(fakeStorage());
    storage.items.set(
      TAB_IDENTITY_KEY,
      JSON.stringify({ tabId: "aaaaaaaaaaaa", colourSeed: 900 }),
    );

    const minted = getTabIdentity();
    expect(minted.colourSeed).toBeLessThanOrEqual(359);
    expect(minted.tabId).not.toBe("aaaaaaaaaaaa");
  });

  it("blocked storage (private mode) falls back to memory, still stable", () => {
    // Reading throws...
    const storage = install(fakeStorage({ getThrows: true, setThrows: true }));

    const first = getTabIdentity();
    expect(first.tabId.length).toBeGreaterThanOrEqual(8);
    // ...writing throws too, so nothing is stored — and the identity is
    // still the same for the life of the page, so presence still works.
    expect(storage.items.size).toBe(0);
    expect(getTabIdentity()).toBe(first);
  });

  it("readable but unwritable storage still yields one stable identity", () => {
    const storage = install(fakeStorage({ setThrows: true }));

    const first = getTabIdentity();
    expect(getTabIdentity()).toBe(first);
    expect(storage.items.size).toBe(0);
  });
});
