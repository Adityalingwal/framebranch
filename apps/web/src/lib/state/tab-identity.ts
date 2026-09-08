"use client";

/**
 * tab-identity.ts — J1 lock (4): who this TAB is, for presence.
 *
 * Two values, minted once and never changed:
 *  - `tabId`   — what `/api/sync` upserts a presence row against, and what
 *                the answer's peer list excludes (never yourself).
 *  - `colourSeed` — an HSL hue (0-359); the colour of this tab's playhead
 *                and chip dot in everyone else's window.
 *
 * Stored in `sessionStorage` under `fb_tab`, exactly like the editor name
 * (`editor-name.ts`): per-TAB by design, so two windows of one browser are
 * two collaborators on one project — which is what the two-tab demo needs.
 * A duplicated tab inherits the session storage of its source, so it would
 * start with the same id; the first heartbeat then simply keeps one row
 * alive between them. That is a demo-scale wart, not a correctness problem
 * (presence is display-only).
 *
 * Storage blocked (private mode, a hardened profile) → the identity lives
 * in this module for the life of the page. It is still stable within the
 * session, so presence still works; only a reload mints a new id.
 */

export const TAB_IDENTITY_KEY = "fb_tab";

export type TabIdentity = {
  /** Satisfies `syncBodySchema`'s `min(8).max(64)` — a UUID is 36 chars. */
  tabId: string;
  /** An HSL hue, 0-359 (`syncBodySchema` bounds it too). */
  colourSeed: number;
};

let cached: TabIdentity | null = null;

function mint(): TabIdentity {
  return {
    tabId: crypto.randomUUID(),
    colourSeed: Math.floor(Math.random() * 360),
  };
}

function isIdentity(value: unknown): value is TabIdentity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TabIdentity>;
  return (
    typeof candidate.tabId === "string" &&
    candidate.tabId.length >= 8 &&
    candidate.tabId.length <= 64 &&
    typeof candidate.colourSeed === "number" &&
    Number.isInteger(candidate.colourSeed) &&
    candidate.colourSeed >= 0 &&
    candidate.colourSeed <= 359
  );
}

/**
 * This tab's identity, minted on the first call. A plain lazy getter, not
 * an external store: unlike the editor name it can never change while the
 * page is open, so nothing ever has to re-render because of it.
 */
export function getTabIdentity(): TabIdentity {
  if (cached !== null) return cached;

  try {
    const raw = window.sessionStorage.getItem(TAB_IDENTITY_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (isIdentity(parsed)) {
        cached = parsed;
        return cached;
      }
    }
  } catch {
    // Unreadable or blocked storage → fall through and mint.
  }

  const identity = mint();
  try {
    window.sessionStorage.setItem(TAB_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Blocked storage → in-memory for this page's life; see the note above.
  }
  cached = identity;
  return identity;
}

/** Tests only — drops the memoised value so a fresh mint can be observed. */
export function resetTabIdentityForTests(): void {
  cached = null;
}
