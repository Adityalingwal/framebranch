/**
 * naming.ts — generated card names (copy sheet sub-table G4-N).
 *
 * Names come from deterministic templates only, never from AI. Every
 * template used anywhere in the server is in this one file so the whole
 * vocabulary can be read at a glance. Per kind:
 *
 *   mark      → the user's text (required — C2; see api/commit)
 *   auto      → the presenter's summary (`3 clips moved, 1 trimmed`) — seal.ts
 *   agent-run → the preset's display name (`Tighten intro`) — agent-scripts.ts
 *   bring-in  → `Brought "‹cut›" into main`
 *   restore   → `Restored "‹card›"`
 *   seed      → the preset's name (`Travel vlog`) — presets.ts
 *   import    → `Imported timeline` (API-only)
 */

import { quoted } from "../lib/format";

/** The card a user-supplied `POST import` writes (API-only, G1). */
export const IMPORTED_TIMELINE_COMMIT_NAME = "Imported timeline";

/**
 * C4 / C1(4) — the bring-in card (the only card with two parents). Reads
 * `Brought "priya-music" into main`; `into` is spelled out rather than
 * hard-coded so the name stays honest until B3 makes main the only target.
 */
/**
 * F1/C4: Bring in only ever lands on `main`; the card says so literally.
 *
 * B5 fix 1 — the cut name goes through `quoted()`, the SAME non-nesting rule
 * `restoreCommitName` uses (B1 fix 4). `branchName` permits `"`, so a cut
 * literally named `"client"` would otherwise land as `Brought ""client""
 * into main`; it now reads `Brought "client" into main`, one pair of quotes.
 */
export const mergeCommitName = (from: string): string =>
  `Brought ${quoted(from)} into main`;

/**
 * B5-2b / C1(5) — restore: a NEW card whose content is an old version.
 * `name` is the name of the card that was restored FROM.
 *
 * B5 — the name goes through `quoted()`, the SAME non-nesting rule the UI
 * uses inside sentences (B1 fix 4): a name that already carries quotes is
 * not wrapped again, so restoring `Restored "Client pick"` reads
 * `Restored Restored "Client pick"` and never grows a nested pair.
 */
export const restoreCommitName = (name: string): string =>
  `Restored ${quoted(name)}`;
