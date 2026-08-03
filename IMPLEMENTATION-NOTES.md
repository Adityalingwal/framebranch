# IMPLEMENTATION-NOTES

**Rule of this file:** every assumption a coding agent makes while implementing
goes here as a dated entry (what was assumed + why it was safe to decide
locally). Only _trivial tooling details_ may be assumed; anything design-level
that a doc does not answer is a **blocker — stop work and report it, do not
guess** (docs/00-INDEX.md standing rules). This file is the audit trail the
owner reads to see what was decided without him.

## 2026-08-03 — Milestone 2 (engine core)

Trivial code-level choices made while implementing A1/A2/A3/A4 + invariants
(anything design-level that looked ambiguous is listed as an OPEN QUESTION in
the M2 report instead of being decided here):

- **`MediaRef.durationInSource` is a RationalTime in the PROJECT rate.** A1.2
  locks "inside the engine everything is single-rate" and the
  source-range-in-file invariant needs exact integer comparison against clip
  sourceRanges (which are project-rate). `sourceRate` stays as the file's
  native fps metadata. Derived from locked A1.2, not invented.
- **BC.4 violations report as `E_INVALID_RANGE`.** BC.4 is in the invariant
  list but no dedicated error code exists in the official C4 list (new codes
  are forbidden). `E_INVALID_RANGE` ("durations invalid") is the closest
  semantic fit; the error message names BC.4 explicitly.
- **Precondition evaluation order:** per verb, non-invariant checks run first
  (existence → rate → kind/value), then the verb builds its candidate state
  and runs THE single invariant list (B2.3 DRY — same function the M4 merge
  sweep will call), mapping the first relevant violation to its code using a
  fixed priority (duration → negative-start → BC.4 → source-bounds → overlap
  → empty-text). A3.x precondition lists were read as SETS, not sequences —
  only a command violating several preconditions at once could observe a
  different code than the doc's listing order.
- **Text-form addClip DOES check rate-match on timelineRange.** F4's explicit
  text-form precondition list omits it, but says only "media-wale checks
  N/A" — rate is not a media check (it guards the single-rate world, A1.2
  defense-in-depth), so it is treated as carried over. Flagged as an open
  question in the M2 report.
- **Engine id minting = `crypto.randomUUID()`** (global WebCrypto; no import
  needed, keeps pure-core rule trivially true), injectable via
  `applyCommand(_, _, { mintId })` so tests/fuzz can be deterministic.
  Random UUIDs make cross-branch collisions impossible (the property the F8
  E_ID_COLLISION removal relies on).
- **Lineage span maintenance:** addClip initializes `{rootId: id, span:
[0, duration)}`; split partitions the span at the root-local cut; trim
  moves the span in lockstep with timelineRange (required so B1.1's
  "same content cut → same formula name" survives trims — regression-tested);
  move/slip/propertyChange leave it untouched (root-local ≠ timeline; slip
  never touches the timeline). Restore form puts the captured span back.
- **Clip arrays are kept sorted by timelineRange.start** (normal form). Ties
  are impossible under no-overlap; this makes undo round-trips structurally
  exact and storage order deterministic.
- **Internal restore form shape:** `{ op:"addClip", trackId, clip }` (full
  captured Clip/TextClip, id included). It lives in types.ts as
  `RestoreClipCommand` but is NOT part of the public `Command` union and is
  not exported via index.ts; `applyCommand` (public) only accepts `Command`,
  the internal `applyEngineCommand` also executes restore steps.
- **Inverse = array of engine commands** applied in order; single-step verbs
  return one element, split/rippleDelete return their locked composites
  (ripple: shift-back moves rightmost-first, then restore — never a
  transient overlap).
- **ApplyResult shape** (`ok/noChange/error` + inverse) is an engine-level
  choice; the C4 `{ok, data|error}` envelope is a server-layer concern (M6).
  A4's "no record" rule is communicated via the `noChange: true` flag +
  unchanged timeline reference.
- **propertyChange no-change compares DEFAULT-MATERIALIZED values** (B3.1 +
  A4): setting volume 100 on a clip with no volume written = noChange. The
  inverse of a change to a previously-unset property writes the default
  explicitly — a B3.1-equal representation.
- **textStyle values:** propertyChange takes a FULL {font,size,color} object
  (textStyle is whole-atom per B2.1); addClip's text form accepts a partial
  style and materializes BC.5 defaults per missing field. Engine validates
  the BC.5 storage rule (lowercase #rrggbb) and rejects short forms —
  expansion of #FFF etc. is the API door's job (M6 Zod).
- **No new dependencies** were added.

## 2026-08-03 — Milestone 1 (repo skeleton)

- **README.md replaced with the M1 stub.** The old research-phase README
  (2026-07-27, pointing at superseded docs 01–06) was overwritten per the M1
  brief's deliverable + its README carve-out. Since the folder is not yet a
  git repo, the old content was backed up to the session scratchpad
  (`README-pre-M1-backup.md`) before overwriting.
- **pnpm via corepack:** pnpm was not installed globally; activated through
  corepack (`corepack enable`), resolved to pnpm 10.34.5, pinned in root
  `package.json` `"packageManager"` so CI and local use the same version.
- **tsconfig.base.json:** `strict: true` (locked) plus standard non-behavioral
  options only: ES2022 target/lib, ESNext modules + Bundler resolution,
  `esModuleInterop`, `isolatedModules`, `skipLibCheck`,
  `forceConsistentCasingInFileNames`, `noEmit` (no build output needed yet).
- **ESLint = flat config** (`eslint.config.mjs`) with `@eslint/js` recommended
  - `typescript-eslint` recommended + `eslint-config-prettier` (so lint never
    fights formatting). No custom rules — "default/recommended" lock.
- **Prettier = pure defaults** (`.prettierrc.json` is `{}`). `docs/`,
  `archive/`, and the historical analysis file are prettier-ignored so tooling
  never touches hand-written design docs.
- **Engine package named `@framebranch/engine`**, `private: true`, version
  0.0.0, `"exports"` pointing at `src/index.ts` directly (no build step in M1;
  a build/dist setup is a later-milestone tooling decision).
- **Placeholder test location:** `packages/engine/tests/index.test.ts` —
  matches C7's `tests/` folder mention. Vitest picked with zero config
  (default include pattern covers it).
- **CI pins Node 20** (matches local Node v20.19.6) and takes pnpm's version
  from the `packageManager` field. Fuzz (step 4, TODO M4) and coverage +
  gap-script (step 5, TODO) are commented placeholders in the locked T5 order;
  benchmarks deliberately absent (T5 lock).
