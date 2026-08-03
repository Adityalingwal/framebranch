# IMPLEMENTATION-NOTES

**Rule of this file:** every assumption a coding agent makes while implementing
goes here as a dated entry (what was assumed + why it was safe to decide
locally). Only _trivial tooling details_ may be assumed; anything design-level
that a doc does not answer is a **blocker — stop work and report it, do not
guess** (docs/00-INDEX.md standing rules). This file is the audit trail the
owner reads to see what was decided without him.

## 2026-08-03 — Milestone 3 (diff engine)

Trivial code-level choices made while implementing C1 (`src/diff.ts`).
Everything design-level came straight from the locked docs (C1 pipeline,
B2.1 khaane, B1.1 khandaan, B3.1 defaults+ID-matching); the items below are
the code-level details the docs leave open:

- **Rule numbers #2–#5 mapped to (edge × direction):** C1 locks "#2-#5 trim
  shortened/extended per edge" without pinning which number is which.
  Chosen: #2 start-shortened, #3 start-extended, #4 end-shortened,
  #5 end-extended (start before end, shortened before extended). Test names
  and the machine entries carry the mapping.
- **Sentence templates (exact wording):** C1 locks the rule structure +
  "old → new values" + the literal #16 example ("Clip A changed:
  sourceRange 5–15 → 5–12" — followed verbatim, en dash in ranges, spaced
  arrow). The other 15 templates are code-level phrasings, now locked by
  the goldens: "Clip A moved from frame 10 to frame 40" / "Clip A shortened
  by 3 frames at the start" / "Clip A slipped: source window moved from 5
  to 8" / "Clip A volume changed: 80 → 40" / "Clip TX text changed:
  \"Welcome\" → \"Hello\"" / "Clip TX text style changed: Arial 48 #ffffff
  → Georgia 60 #00ff00" / "Clip N added at frame 70 (5 frames long)" /
  "Clip B removed" / "Clip A split into two at 5". Values render as plain
  integer frame numbers (A1.1 — division is UI-only, so no seconds here).
- **#15 cut coordinate = ROOT-LOCAL (khandaan coordinate):** "split into
  two at X" renders X in the B1.1 root-local coordinate — the one the
  khandaan-record stores and the only one that is move-invariant (the same
  reason B1.1 names segments in root-local numbers). Piece counts render as
  words ("two", "three", … up to "ten", digits beyond).
- **Classification works on content-anchored atoms derived from the
  lineage span** (B2.1's normalized khaane made executable): anchor =
  tlStart − spanStart (#1), coverage = the span itself (#2–#5),
  sourceOffset = srcStart − spanStart (#6). M2 keeps the span in lockstep
  with trims, so move/trim/slip each touch exactly one atom and composed
  edits decompose into independent sentences; the atoms are split-invariant,
  so khandaan pieces compare directly against their base clip. In a mixed
  move+trim sentence pair, the "moved from" value is the content-anchored
  position (where the surviving coverage sat in `a`), not the raw old
  tlStart — that keeps each sentence's numbers self-consistent.
- **Split-family diff semantics (diff-level only; merge projections are
  M4):** pieces are compared piece-vs-base for anchor/sourceOffset/
  properties; the coverage khaana is handled family-level — leading-edge
  delta reported on the first piece, trailing-edge on the last piece
  (#2–#5), interior non-contiguity (gap/overlap in spans — out-of-family)
  reported as a #16 raw "coverage" entry on the base. A missing base id
  (left piece deleted) renders #14 for the base + no leading-edge entry
  (B1.1 left-survives: the leftmost content always carries the base id, so
  the #14 owns that content). A split whose right piece was deleted leaves
  a net state identical to an end-trim and therefore renders as #4, not
  #15 — net-state authority, regression-tested.
- **#16 scoped completeness net (I3 owner clarification 2026-08-04):** every
  diff-relevant raw field not covered by an atom has an explicit compare — kind
  flip (text↔media), track membership (cross-track is V1 OUT), lineage.rootId,
  mediaRefId, the two BC.4-family consistency deltas
  (tlDuration−spanDuration and srcDuration−tlDuration, rendered with the raw
  timelineRange/sourceRange values), projectRate, and track existence/kind.
  `Timeline.mediaRefs` metadata is excluded because V1 fixtures are immutable
  and no upload/replace verb exists; individual `RationalTime.rate` members are
  excluded because valid seed/import/command boundaries normalize them to
  `projectRate`. #16 is not an arbitrary corrupted-JSON deep differ. Within the
  valid-state diff scope, changes hit a rule or #16 — never crash/skip.
- **Deterministic output order (documented in diff.ts header):**
  timeline-level #16 first; tracks in `a`'s order then `b`-only tracks;
  track-level #16 before that track's clips; clips by the B3.1 sort key
  (tl start, tl end, rootId, span start, clipId) taken from the `b` state
  when the clip exists there, else `a`; within one clip a fixed khaana
  order (removed, added, split, moved, trims start/end, slipped, the six
  properties in C1 order, raw).
- **Machine form:** `DiffResult = { entries, sentences }` parallel arrays,
  sentences[i] rendered from entries[i] (strict 1:1 — no ad-hoc sentence
  can exist). M4 merge composes on `entries`; the C4 GET-diff endpoint
  serves `sentences`. Entry numbers are integer frames at `a.projectRate`.
- **T2-F "A3.8 errors" golden NOT duplicated:** M2's verbs.test.ts already
  covers all four A3.8 error codes (E_SPLIT_AT_BOUNDARY,
  E_SPLIT_OUT_OF_RANGE, E_CLIP_NOT_FOUND, E_RATE_MISMATCH) — recorded here
  per the M3 brief instead of writing duplicate tests. T2-F "import
  skip-warnings" golden is M5 (otio) — deliberately absent.
- **No new dependencies** were added; diff.ts imports only ./types +
  ./verbs (PROPERTY_DEFAULTS — the B3.1 defaults live in one place).

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
  gap-script (step 5, TODO M7 CI-closure per I4 owner clarification) are
  commented placeholders in the locked T5 order; benchmarks deliberately
  absent (T5 lock).
