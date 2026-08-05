# IMPLEMENTATION-NOTES

**Rule of this file:** every assumption a coding agent makes while implementing
goes here as a dated entry (what was assumed + why it was safe to decide
locally). Only _trivial tooling details_ may be assumed; anything design-level
that a doc does not answer is a **blocker — stop work and report it, do not
guess** (docs/00-INDEX.md standing rules). This file is the audit trail the
owner reads to see what was decided without him.

## 2026-08-04 — Milestone 4 (merge engine)

Trivial code-level choices made while implementing the locked M4 merge
contracts. No new product behavior, conflict bucket, public function, or error
code was added:

- **Private lossless fuzz delta:** `MergeDelta`, `makeDelta`, and `applyDelta`
  live in `src/merge.ts` for T3 only. The representation is a base fingerprint
  plus lossless top-level replacements. It is not re-exported from `index.ts`;
  public semantic `computeDiff` remains unchanged and no public `applyDiff` was
  added.
- **Common-refinement IDs (rewritten 2026-08-04, N1 fix pass):** refinement
  cut points come only from actual piece boundaries carried in the three
  input families' state lineage spans — nothing is parsed out of ID strings,
  and a family whose pieces are identical across all three inputs refines to
  a byte-identical no-op. A refined segment whose span exactly matches a
  surviving branch piece keeps that piece's actual ID; only a genuinely
  refined piece (created by unioning different cuts) gets an ID, and it is
  exactly the parent-chained `@cut` formula the split verb itself would mint
  for that cut. Merge never invents novel IDs; the old merge-time
  collision-suffix loop is gone. One reality the fix pass surfaced (fuzz
  seed 1295277908 case 157): the SAME birth ID can carry different spans on
  the two branches (trims move spans), so per-segment exact matching alone
  can pick the stale side. Final IDs are therefore assigned left-to-right,
  uniqueness-aware over lawful candidates only (exact surviving-piece IDs,
  then covering-piece split-formula mints) — consistent with B1.1
  left-survives: the parent ID belongs to the leftmost surviving content. A
  last-resort deterministic `@start` suffix sits behind that selection as a
  defensive-only guard with no observed reachable path (same status as the
  Q1 fallbacks below).
- **Defensive `E_MERGE_PRECONDITION` fallbacks (Q1 owner resolution,
  2026-08-04):** the messages "merge resolution did not terminate", "saved
  overlap choices did not reach a clean fixed point", "unsupported merge
  invariant", and "final merge timeline is invalid" are defensive-only
  guards with no known reachable public-command path; they exist so an
  unforeseen state degrades to a typed error instead of a crash. If one
  ever becomes reachable, that is a bug to triage against the C7 locked
  4-case `E_MERGE_PRECONDITION` boundary.
- **Conflict IDs:** collision-safe content addressing uses the literal `m4:`
  prefix plus URI-encoded canonical JSON of the locked payload (class,
  participant IDs/track, and B1 field). The docs leave the hash primitive
  private; this encoding keeps the full payload, so stability does not depend
  on a truncating hash.
- **Canonical replay:** saved choices are key-sorted before returning or
  replaying, so equivalent choice sets serialize identically regardless of
  click order. Saved B3 answers are replayed to a deterministic placement
  fixed point. The same conflict ID may be applied again when a later
  base-revert changes the timeline and legitimately recreates that pair; an
  exact repeated state is guarded as a cycle. T3 case 617 is the fixed
  regression for this reachable cascade.
- **File layout:** merge types, normalization, refinement, conflict creation,
  choice replay, and deterministic Shift remain in one sectioned `merge.ts`.
  They form one pure-core responsibility and share private normalized types;
  no actual dependency boundary justified splitting the file during M4.
- **Fuzz controls:** default seed is `1295277908`; local default is 500 cases,
  `CI=true` selects 10,000, `FRAMEBRANCH_FUZZ_CASES` overrides the count,
  `FRAMEBRANCH_FUZZ_SEED` overrides the seed, and
  `FRAMEBRANCH_FUZZ_CASE=<index>` replays one printed case. Normal `pnpm test`
  excludes this deliberately long harness; the package `fuzz` script is its
  only execution door. The runner executes at most 500 generated cases per
  Vitest process (1,000 until 2026-08-04; the strengthened N3/I4 fix-pass
  harness pushed a 1,000-case chunk past the window) because Vitest 3's
  worker RPC times out after 60 seconds even when a longer test timeout is
  configured; offsets preserve the single 0–9,999 case universe and each
  chunk exits cleanly.
- **I1 proof shape:** merge never constructs a zero/negative refined segment.
  Opposite-edge collapse/crossing is classified as same-clip B1 before a
  nonpositive `TimeRange` is materialized. T2 exercises the lawful matrix and
  T3 directly checks every surviving `lineage.span.duration.value > 0` after
  accepted edits and merge replay; this is independent of the current runtime
  invariant checker.
- **N5 split-ID uniqueness (2026-08-04, owner-locked in docs/18):** the
  strengthened fuzz proved the bare B1.1 formula is not collision-proof when
  trims heal a previously cut coordinate while the original descendant
  survives on a shifted span (seed 1295277908 case 329). The split verb now
  extends the formula deterministically until unique among live clips
  (`A@1` taken → `A@1@1`); same state mints the same name on both branches,
  so same-cut merge convergence is preserved. The fuzz generator's temporary
  avoid-guard was removed (the path is fuzzed again), and the
  split→delete→extend chain reads the survivor ID from the split result
  instead of precomputing the formula. docs/11 B1.1 carries the dated
  amendment.

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

## 2026-08-04 — CI speed optimization

Trivial tooling-level choices made while implementing the owner-locked
7-decision CI speed brief (docs/12 T5 amendment, same date). No engine
source touched; no test contract changed:

- **Concurrency default formula lives only in `run-fuzz.mjs`,** not
  duplicated anywhere else: `FRAMEBRANCH_FUZZ_CONCURRENCY` env if set, else
  `CI === "true" ? cores : max(2, floor(cores/2))` using
  `os.availableParallelism?.() ?? os.cpus().length`. This was explicitly
  specified in the brief, not invented — recorded here only because it's the
  kind of number someone will later ask "why this and not X" about.
- **Progress-line format** for a successful chunk:
  `chunk <n>/<total> ok (cases <start>-<end>)` — one line per chunk, in
  completion order (not offset order), matching the brief's example
  literally. Only failing chunks' full output is printed, and that IS
  ordered by ascending offset (brief requirement, for determinism of the
  failure report regardless of which shard/chunk finished first).
- **`spawnSync` → `spawn` + `Promise`-based worker pool.** The old script
  used a blocking loop; concurrency requires non-blocking children. Picked a
  minimal manual pool (no new dependency) — `N` workers each pull the next
  chunk off a shared index until either the queue is empty or a failure is
  observed, matching the brief's "stop launching new chunks, let in-flight
  finish" rule exactly.
- **`gh pr list` fail-open implemented as `if ! gh ... ; then skip_all=false`**
  in the `plan` job — any non-zero exit from the `gh` call (auth hiccup, API
  outage, rate limit) is treated identically to "no open PR found", per the
  brief's explicit fail-open instruction. Same fail-open pattern used for the
  docs-only diff-base lookup (`before` all-zeros / not present in repo →
  treated as not-docs-only, i.e. full pipeline runs).
- **docs-only file-match regex:** `git diff --name-only` piped through
  `grep -v -E '(^|/)[^/]+\.md$|^docs/'` — anything NOT matching "ends in
  .md" or "starts with docs/" counts as non-docs; if that grep finds nothing,
  the diff is docs-only. Chosen over a marketplace path-filter action per the
  brief's "no marketplace path-filter actions" rule.
- **`ci-success` reads `needs.plan.result` too** (not just gate/fuzz) so a
  `plan` failure (e.g. its own script bug) fails the aggregate check instead
  of silently reporting green — not explicitly required by the brief's wording
  but consistent with its intent ("fails otherwise").
- **GitHub-side behavior is NOT verified by this work** — the `gh pr list`
  lookup, real matrix expansion (5 shards actually landing on 5 separate
  runners), real GitHub Actions timings, and `concurrency.cancel-in-progress`
  behavior can only be confirmed on Aditya's first real push/PR. Everything
  else (script logic, determinism, YAML validity, local fuzz timings) was
  run and verified locally — see docs/07 2026-08-04 entry and the verification
  report for the actual commands/output.
- **Fuzz matrix carries OFFSETS, not shard indexes** (fix on first real push,
  2026-08-04): the first pushed version computed the shard start as
  `${{ matrix.shard * needs.plan.outputs.fuzz_cases_per_shard }}`, which
  GitHub rejected outright — *"Invalid workflow file (Line 180): Unexpected
  symbol: '*'"*. GitHub Actions expressions have **no arithmetic operators**
  at all (only comparison/logical operators and functions), so the run
  produced zero jobs. The `plan` job now emits the offsets directly
  (`fuzz_offsets=[0,2000,4000,6000,8000]`) and the matrix variable is
  `matrix.offset`, keeping all arithmetic in bash. Shard count and windows
  are unchanged.
- **Chunk size 500 → 250** (second fix on the same first-push cycle,
  2026-08-04): with the workflow finally valid, all five shards failed on
  `[vitest-worker]: Timeout calling "onTaskUpdate"` while every fuzz case
  itself passed (`Tests 2 passed`, CI run 30928377322). Cause: a chunk runs
  its cases synchronously inside one `it()`, so chunk wall-clock = time the
  worker spends unable to answer Vitest's RPC; past 60s Vitest kills it. The
  500-case size was calibrated on the owner's Mac (18.5s sequential); on a
  slower GitHub runner with chunks now running concurrently it measured
  66.01s. 250 brings that to ~33s. Chunk size is now env-tunable via
  `FRAMEBRANCH_FUZZ_CHUNK`. This is a harness-timing constraint only — no
  case, seed, or coverage change (case seed is still `f(seed, global index)`,
  and the 0-9999 universe is unchanged).

## 2026-08-04 — Milestone 5 (OTIO adapter)

Trivial code-level choices made while implementing the locked O1-O10 spec.
No new error code, verb, public function, or product behaviour was added; every
item below is a detail the locked docs do not name, where OTIO's own format
left a hole that the adapter had to fill deterministically.

- **Import mints deterministic ids** (`track-1`, `clip-1`, `media-1`, …)
  instead of UUIDs. Import is a fresh start (docs/09 #10), so uniqueness only
  has to hold inside the produced timeline; a counter also makes "same file in
  → same timeline out" true, which the round-trip test relies on. The ids are
  `@`-free, so the B1.1 split namespace stays reserved.
- **`MediaRef.hash` is `""` on import.** OTIO carries no fingerprint and the
  engine never opens the file (URL-only pointer model, HLD #12/#13). `hash` is
  an integration-ready field no V1 flow reads (A2.1).
- **`MediaRef.sourceRate`** = the rate of `available_range` when the file has
  one, otherwise the rate the clip's own `source_range` was written in. OTIO
  states no "native fps" anywhere else. Note this means `sourceRate` is not
  part of the O10 round-trip comparison (it isn't in the locked compare list).
- **A clip's own rate, for O6 rule (2),** is read from
  `source_range.start_time.rate` of the first `Clip` in document order.
- **Every parsed `RationalTime` must have an integer `value` and an integer
  `rate > 0`;** anything else is `E_INVALID_OTIO`. A1.1 makes the engine an
  integer-only world, so a 23.976 rate or a half-frame value cannot be
  represented — and inventing a rounding for it at the door would be exactly
  the silent lie the locks forbid. Real 23.976 NTSC files therefore do not
  import; flagged to the owner rather than worked around.
- **A `Clip` with no `source_range`** (legal in OTIO — it means "the whole
  media") is `E_INVALID_OTIO`. Our model has no "whole media" position; the
  brief's malformed list already treats a `source_range` that isn't a valid
  `TimeRange` as invalid, and an absent one is the same hole.
- **A skipped CLIP still advances the import cursor.** O4 only writes the
  cursor rule down for `Transition` (which must NOT advance). A clip occupies
  its own span in the OTIO file whether or not we can represent it, so the O2 /
  O7b / A4 skips advance the cursor — otherwise every later clip on the track
  would silently slide left. Unsupported NON-clip items (transition, nested
  `Stack`, …) never advance the cursor, exactly as O4 states for transitions.
- **Zero/negative-duration clip on import** (A4 rule 3 — reachable through
  rate conversion, e.g. 1@60 → 0@24) is skipped with warning code
  `skipped-unsupported`, detail `"zero-duration clip"`. A4 locks the skip and
  the itemized warning but predates the O8 code union, which has no code that
  names this case; `skipped-unsupported` is the closest honest fit. Reported to
  the owner as under-specified.
- **Clip/track kind mismatches are skipped, not coerced:** a framebranch text
  clip on a non-text track, or a media clip on a text track, becomes
  `skipped-unknown-clip`. Track arrays are homogeneous by type (`Clip[] |
  TextClip[]`), and guessing the track's real kind from its contents would be
  shape-matching (rejected project-wide, B3.1).
- **A track whose kind is neither `"Video"` nor `"Audio"` nor framebranch-text**
  is skipped with `skipped-unsupported` (O7b's "we don't support it → skip and
  say so"), rather than aborting the import.
- **A present-but-invalid `textStyle`/`textContent` inside
  `metadata.framebranch` skips the clip** (`skipped-unknown-clip`); only
  MISSING style fields materialize BC.5 defaults. We never silently repair a
  value we were handed.
- **Post-import invariant sweep:** the imported timeline is run through
  `checkInvariants` and a surviving violation returns `E_INVALID_OTIO`. Only an
  internally inconsistent document can get there (e.g. a `source_range` outside
  its own `available_range`) — that is malformed input, and dropping the clip
  instead would be a skip rule nobody locked.
- **Export writes `global_start_time` with value 0 and rate = `projectRate`.**
  Nothing requires it, but it makes O6 rule (1) round-trip the project rate
  exactly, including for an empty timeline. The value is always 0: our
  timelines have no broadcast start offset.
- **Export writes `"name": ""`** on tracks and clips (and the real sample's
  `"Filler"` on gaps) — never an internal id (docs/09 #11). Each exported
  `RationalTime` carries the rate of the value it came from.
- **Export of a clip whose `MediaRef` is missing** emits a `MissingReference.1`
  (with no framebranch metadata) rather than failing: `exportOtio` never fails
  (docs/09 #12/#13).
- **`fuzz.test.ts` touched only for the O1 nullable type** — a `sourceLength()`
  helper narrows `durationInSource` and throws if the harness ever generates an
  unbounded media (it does not). Note the side effect of O3: slip commands the
  fuzz generates for image clips are now rejected, and `editBranch` already
  ignores rejected commands, so those steps are no-ops. Case count, seed, and
  every invariant/merge property are unchanged.
- **`diff.test.ts` 1:1-machine-form golden** now slips the audio clip `AU`
  instead of the image clip `IM` — O3 makes an image slip an error, and the
  test only needs any valid `#6 slipped` sentence.

### 2026-08-05 — M5 post-review fixes (owner-triaged, applied inline)

The M5 implementation report flagged six under-specified points. Four were
"leave as is" owner calls (non-integer NTSC rates stay `E_INVALID_OTIO` and go
into the README limitations list; the zero-duration skip keeps
`skipped-unsupported` + detail rather than a fifth warning code; the small
fuzz slip-density dip stays, because slip on an image is genuinely
inapplicable and reshuffling the 10k case universe would invalidate the M4
evidence seed for no real coverage gain). Four fixes were applied:

- **Clip `properties` now survive OTIO** (docs/11 O5 amendment 2026-08-05):
  `metadata.framebranch.properties` on both media and text clips, validated
  with the same ranges as `verbs.ts` propertyChange, invalid payload skips the
  clip rather than being repaired. Without this, export → re-import silently
  reset every volume/opacity/scale/position to its default — visible in the
  C8 demo itself (step 3 sets `A.volume=80`, step 9 exports).
- **The H10 round-trip fixture now carries non-default properties**
  (`volume: 80, scale: 1.5` on the video clip; `opacity: 40, position` on the
  image — the N1 matrix's image column). Verified load-bearing by mutation:
  disabling the export side turns H10 red, restoring it turns it green.
- **Cursor rule completed** (docs/11 O4 amendment 2026-08-05): a skipped item
  advances the cursor by its own `source_range` duration when it has one.
  Transition still does not (it has no `source_range`), but a nested `Stack`
  does — previously everything after a nested Stack landed too early.
- **NUL byte removed from `otio.ts`.** The warning-grouping key was
  `` `${code}\0${detail}` ``. Git sniffs the first 8000 bytes for a NUL to
  decide text-vs-binary, and this one sat at offset 7760 — so `git diff`
  reported `Bin 0 -> 26498 bytes`, "0 insertions", and GitHub would have shown
  "Binary file not shown" for the whole 838-line file. Key is now
  `JSON.stringify([code, detail])`; identical behaviour, and git reports 838
  insertions again.
- **`tests/fixtures.ts`: `mI` image `durationInSource` is now `null`** — O1
  says that is the only value import can produce for an image, so the shared
  fixture no longer models an impossible state. No test depended on the old
  made-up 1000 (all 279 stayed green).

### 2026-08-05 — M5 independent review triage (6 findings)

An independent review (different model, read-only, runtime witnesses for every
finding) raised 6. Five fixed, one deliberately left:

- **F1 (HIGH, regression from the 2026-08-05 cursor fix):** the guard read
  `child.source_range !== undefined`, but real serializers write
  `"source_range": null` on an untrimmed Item — the *default* form of the very
  nested-Stack case that fix was written for. `null` fell through to the range
  parser and aborted the whole import (`E_INVALID_OTIO`) instead of skipping
  per O7(b). Guard now checks both; regression test added under H2.
- **F2 (HIGH):** `available_range.start` was dropped. Fixed by normalizing at
  the door — see the docs/11 A2.1 amendment (2026-08-05) and the new optional
  `MediaRef.sourceStartInFile`. Four tests added (valid non-zero-start window
  imports normalized; a window the file does not contain is refused; export
  restores the offset; round-trip identical).
- **F3 (MEDIUM):** property applicability (N1 matrix) was not enforced on
  import — an image could arrive carrying `volume`, a state no verb can
  produce. Allowed keys now come from the resolved kind.
- **F4 (MEDIUM):** media/track-kind mapping was not enforced — a `.png` on an
  Audio track imported cleanly. Now skipped with `skipped-unknown-clip`.
- **F5 (LOW) — deliberately NOT fixed (owner call):** a skipped item with a
  negative `source_range.duration` pulls the cursor backwards. Unreachable
  from any real exporter (durations are never negative); the owner judged the
  clamp not worth carrying. Recorded here so it is a decision, not an
  oversight.
- **F6 (LOW):** `firstClipRate` could take the project rate from a clip inside
  a nested Stack that the walk then skips. It now only considers real
  `Track` children.

Also confirmed by the review and worth keeping visible: an extension-less URL
on an Audio track resolves to `"audio"` (the track decides), which reads
against O9's literal "treat as video" sentence but is the self-consistent
behaviour — a video-kind media on an audio lane is exactly what N1 forbids.
Goes in the README limitations note alongside the extension-sniffing
assumption and the NTSC (23.976/29.97) rate limitation.

## 2026-08-05 — M6 benchmarks

Trivial code-level choices made while closing the four T4 benchmark gaps
(`vite-node` devDependency, conflict-heavy fixtures, hardcoded test count,
docs). No `packages/engine/src/**` file was touched (engine frozen for this
task):

- **`vite-node` version specifier: `^3.2.4`** — matches the installed
  `vitest@^3.2.4` release train per the brief's instruction. It resolved
  cleanly to `3.2.4` in `pnpm-lock.yaml`, the exact version already present
  transitively, so no fallback/deviation was needed.
- **Conflicting-edit atom priority (in `generateConflictingPair`,
  `benchmarks/generator.mjs`): `volume` → `opacity` → trim-end shorten.**
  `move` is excluded entirely, per the brief — the standard generator only
  leaves 0–3 frame gaps between clips while `move` shifts 1–5 frames, so it
  can create an overlap and invalidate the fixture. This was confirmed
  empirically as the real explanation for why the OLD (non-conflict-heavy)
  `startMerge @1k/@10k` fixtures show a much higher total conflict count
  (19 @1k, 251 @10k) than the brief's back-of-envelope ~8 estimate: broken
  down by bucket, almost all of those are bucket-3 overlap conflicts caused
  by `move`, not bucket-1 value conflicts (only 0 @1k / 5 @10k are genuine
  value conflicts — that part matches the brief's estimate closely). See the
  docs/07 2026-08-05 entry for the full numbers.
- **Clip eligibility for the trim-end atom:** `timelineRange.duration.value
  > 3` (not `> 2`, like the existing `applyRandomEdits` trim) — the
  conflict-heavy trim shortens by 1 frame on `ours` and 2 frames on
  `theirs` (brief's own example), so both need to stay positive after their
  respective shorten. Text clips have no `properties` object at all, so
  they fall through to this branch automatically (no special-casing
  needed); a clip with neither an eligible property nor a long-enough
  duration is skipped, not forced. The generator returns the REAL applied
  count as `expectedConflicts`, cross-checked in `run.mjs` against the
  actual `startMerge(...).conflicts.length` at runtime — both matched
  exactly (50/50 @1k, 500/500 @10k), so no discrepancy to report there.
- **Different-value formula:** property atoms use `ours = (base + 37) %
  101`, `theirs = (base + 71) % 101` — guaranteed distinct from the base
  value and from each other (37 ≠ 0, 71 ≠ 0, 37 ≠ 71, all mod 101), and
  stays in the valid 0–100 range. Trim-end uses the brief's literal
  example (`-1` / `-2`).
- **`checkInvariants` fallback used (not the primary path):** it is not
  re-exported from `packages/engine/src/index.ts` (only `applyCommand`,
  `computeDiff`, `applyChoice`, `finalizeCheck`, `startMerge`,
  `exportOtio`, `importOtio` are public), so per the brief's explicit
  fallback, fixture validity is asserted via an untimed `startMerge(...).ok
  === true` probe before the timed measurement loop, rather than importing
  the internal invariant checker directly.
- **Fresh seed `909`** used for `generateConflictingPair` at both scales
  (not reusing 101/202/301/402, per the brief's determinism rule).
- **Hardcoded test count (`run.mjs` headline) updated 245 → 287 by hand**,
  per the owner's explicit "keep it hand-maintained, do not count
  programmatically" instruction. Ran `pnpm test` from the repo root: 287
  passed (matches the M5 entry's final count in docs/07).

### 2026-08-05 — M6 follow-up (independent-edits fixture + per-row conflict counts)

Same-day follow-up after the owner triaged the value/overlap-bucket finding
above. Still zero `packages/engine/src/**` changes:

- **`applyRandomEdits` options argument, `{ excludeMove = false } = {}`,
  designed for zero effect on existing call sites:** when `excludeMove` is
  false (every pre-existing caller), the function makes exactly the same
  `rng` calls in exactly the same order as before the option existed — the
  `excludeMove` branch only executes (and only then makes its one extra
  `rng.int(0, 1)` call to remap `move` → trim/property) when a caller
  explicitly opts in. Verified empirically, not just by inspection: probed
  the standard and split-heavy fixtures' real `startMerge(...).conflicts.length`
  before and after this change — both identical (19/251 standard, 32/338
  split-heavy).
- **New seeds `1111`/`2222`** for the independent-edits `ours`/`theirs` pair
  (not reusing 101/202/301/402/909). Picked before ever running the
  benchmark — not tuned after seeing the result. Measured conflict count:
  0 @1k, 4 @10k (not forced to 0, per the brief's explicit instruction not
  to hunt for a zero-conflict seed).
- **Row name `startMerge independent-edits`, not "zero-conflict" or
  "clean"**: two independently-random edit sequences can coincidentally
  land on the same clip and atom (and did, at 10k: 4 conflicts), so a name
  implying a guarantee would be inaccurate. Same reasoning killed "clean
  merge"/"conflict-free" wording everywhere in the report template — the
  standard fixture is not conflict-free either (19/251 measured).
- **All merge-row labels now carry their real conflict count** via a shared
  `probeConflictCount(label, fixture)` helper (one untimed `startMerge`
  call before the timed `measure()` loop) — factored out once conflict-heavy,
  standard, split-heavy, AND independent-edits all needed the identical
  probe-and-throw-on-!ok pattern.
- **Bug found and fixed in the same pass:** the report's headline built its
  "3-way merge in X ms" number via `results.find(r => r.label === "startMerge
  @ 10k")`. Adding the conflict-count suffix to every label (e.g. `"startMerge
  @ 10k (251 conflicts)"`) broke that exact match, so the headline silently
  fell through to `?? 0` and printed "3-way merge in 0 µs" on the first
  post-change run. Fixed by matching on `label.startsWith("startMerge @
  10k")`, which is unambiguous against the other three variants' different
  prefixes (`startMerge split-heavy @`, `startMerge conflict-heavy @`,
  `startMerge independent-edits @`). Caught by actually reading the
  generated `REPORT.md` after the change, not assumed correct.
