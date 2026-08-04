# Codex Code Review — M2 + M3 (Checkpoint #1)

**Date:** 2026-08-03
**Branch reviewed:** `feat/engine` at `4671b49`
**Scope:** Milestone 2 engine core + Milestone 3 diff engine only
**Mode:** read-only review; this report is the only file written

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| Important | 5 |
| Minor | 1 |

The core is substantially aligned with the locked design: all eight verbs,
typed outcomes, trim arithmetic, split identity, the 6x4 applicability matrix,
rules #1-#15, deterministic rendering, and the public M2/M3 surface are present.
The claimed local checks are also genuinely green: typecheck, lint, and all 183
tests passed during this review.

The original review found three implementation gaps and two incomplete locked
test-plan gates. Owner triage has since deferred I1 to M4, closed I2 under the
clarified reserved ID namespace, and closed I3 by narrowing #16 to valid,
diff-relevant state rather than arbitrary corrupted JSON; the current blockers
are kept accurate in the final line. The three owner-tracked open items named in
the review brief were deliberately not re-reported.

## Owner triage and reviewer-correction record (2026-08-04)

This record supersedes the original **current-blocker interpretation** below;
the original evidence remains for audit history. Claude Code should challenge
these resolutions against the cited code/docs, but must not implement I1–I4 as
M2/M3 fixes.

### I1 — reviewer promoted a future/malformed-state safeguard too early

- **Checkpoint decision:** DEFERRED TO M4; no M2/M3 code/test change.
- **Reviewer mistake:** The concrete failure manually zeroed
  `lineage.span.duration` and treated that as a current reachable edit result.
  For a valid input state, current add initializes lineage from timeline
  duration (`packages/engine/src/verbs.ts:337-350`), trim updates lineage in
  lockstep (`:542-598`), and split partitions positive interior pieces
  (`:889-959`; proof-by-construction is locked at
  `docs/11-lld-checklist.md:319-330`). The missing invariant is a real text/code
  mismatch (`docs/11:120` versus `invariants.ts:21-31,63-102`), but no current
  M2/M3 operation was shown to produce it.
- **Next gate:** After M4 exists, build the cross-branch merge edge-case matrix
  and break-tests. Add the invariant only if a reachable post-merge state or
  necessary merge safety boundary is demonstrated; otherwise reconcile the
  old “every TimeRange” wording and close it.
- **M4 closure (2026-08-04): VERIFIED-CLOSED by proof-by-construction.** The
  section-10 lawful matrix in `docs/16` is covered by the 34 M4 T2 goldens;
  opposite-edge zero/negative composition becomes B1 before materialization.
  T3 independently traverses every surviving lineage after accepted edits,
  each draft replay, and finalization. Seed `1295277908` passed 500 local and
  10,000 CI-mode generated cases. No reachable nonpositive lineage and no
  necessary merge-boundary safeguard appeared, so no runtime check was added.
  The canonical “every TimeRange” reconciliation is recorded in docs/11 A2.3.

### I2 — reviewer treated test shorthand as a lawful production ID

- **Checkpoint decision:** CLOSED — NOT A BUG; no code/test change.
- **Reviewer mistake:** The failure used hand-built `A` and unrelated `A@5` as
  if a production root could lawfully receive that name. Public add commands
  contain no caller-supplied ID (`packages/engine/src/types.ts:143-163`), the
  engine mints an `@`-free UUID/fallback (`verbs.ts:251-255,337-350`), and only
  split appends the reserved root-local suffix (`verbs.ts:907-910`). Thus the
  alleged unrelated formula-shaped root violated the internal ID namespace.
- **Boundary proof:** The canonical namespace clarification is recorded at
  `docs/11-lld-checklist.md:272-290`; future import must mint a fresh `@`-free
  internal root ID rather than preserve an external formula-shaped ID.

### I3 — reviewer turned deliberately corrupted JSON into a product edit

- **Checkpoint decision:** CLOSED — NOT A BUG; no code/test change.
- **Reviewer mistake:** Both examples required directly changing snapshot data:
  a fixture media hash, or only a nested `RationalTime.rate`. V1 media is
  pre-deployed and immutable with no upload/replace flow
  (`docs/09-hld-checklist.md:280-290`); engine command rates are checked against
  `projectRate` (`packages/engine/src/verbs.ts:185-198` and each time-bearing
  verb). Neither example is produced by a lawful user/agent edit.
- **Scope proof:** C1 and `IMPLEMENTATION-NOTES.md` now say #16 is a fallback
  for valid, diff-relevant state, not a universal arbitrary-JSON corruption
  detector (`docs/11-lld-checklist.md:549-565`;
  `IMPLEMENTATION-NOTES.md:59-69`).

### I4 — reviewer treated staged CI tooling as unfinished M2/M3 behavior

- **Checkpoint decision:** DEFERRED TO M7 CI-CLOSURE; no M2/M3 implementation.
- **Reviewer mistake:** Coverage and the lock-ID gap guard are real locked
  tooling, but M4–M7 locks/tests do not exist yet. Running the global guard now
  would false-report intentionally unimplemented milestones or require extra
  milestone-aware machinery. This is process hardening, not a user-facing
  engine defect.
- **Timing proof:** CI labels fuzz as M4 and coverage/gap-check as M7
  (`.github/workflows/ci.yml:41-50`); canonical staged activation is explicit at
  `docs/12-test-benchmark-plan.md:91-106`.

### I5 — current, reachable test gap (implemented and verified)

- **Checkpoint decision:** IMPLEMENTED-VERIFIED — two focused M3 diff goldens
  added; production diff code unchanged.
- **Why this is not speculative:** The locked Group-A list explicitly names
  split-vs-slip and split-vs-trim-extension
  (`docs/12-test-benchmark-plan.md:34-36`). Both operations already exist and a
  user/agent can lawfully apply them to a split piece. Standalone #5/#6 cases
  exist (`packages/engine/tests/diff.test.ts:97-107`), but they do not execute
  `classifyFamily()`; the family suite at `diff.test.ts:403-518` covers split +
  move/property/trim-shrink/deletion/nested cases and contains neither required
  combination. A repository search on 2026-08-04 for
  `split.*slip|slip.*split|split.*trim.*extend|extend.*split` found no test.
- **Implemented at `packages/engine/tests/diff.test.ts:468-501`:**
  1. split `A` at frame 15, slip `A@5` by +3, then assert #15 plus exactly one
     #6 on `A@5` with truthful source-window values;
  2. split `A` at frame 15, extend the end of `A@5` by +3, then assert #15 plus
     exactly one #5 on the trailing piece.
- **Verification result:** Both goldens passed immediately, proving the existing
  `classifyFamily()` behavior was already correct. No production diff change was
  needed. Typecheck PASS, lint PASS, full suite PASS — 5 files, 185/185 tests.

## Findings

### I1 — THE invariant list omits `lineage.span` duration

**Severity:** Important

**Owner triage (2026-08-04): DEFERRED TO M4 — not an M2/M3 fix blocker.**
No invariant or test change will be made at checkpoint M2/M3. After M4 merge
composition exists, build a targeted edge-case matrix for operations that can
interact across branches and affect timeline/source/lineage ranges, then use
break-tests to determine whether a zero/negative `lineage.span.duration` can
actually be produced. Add the check only if that evidence shows a reachable
post-merge state or a necessary M4 safety boundary; if proof-by-construction
shows it is unreachable, close I1 without adding a redundant runtime check and
formally reconcile the locked “every TimeRange” wording at the M4 gate. Until
that decision, I1 is deferred, not `VERIFIED-CLOSED`.

**M4 closure (2026-08-04): VERIFIED-CLOSED.** The paragraph above records the
original checkpoint state. M4's reachable matrix, direct-lineage T3 property,
and 500/10,000-case runs found no supported path that creates a nonpositive
lineage span. docs/11 A2.3 now formally records the proof-by-construction
boundary; `invariants.ts` is deliberately unchanged.

**What:** `Lineage.span` is a `TimeRange`, but the single invariant checker only
tests `timelineRange.duration` and (for media) `sourceRange.duration`. A zero or
negative lineage-span duration therefore passes the join/edit invariant sweep.

**Evidence:**

- Locked doc: `docs/11-lld-checklist.md:109-120` requires `duration > 0` for
  **every** `TimeRange`; `docs/11-lld-checklist.md:457-465` adds
  `lineage { rootId, span }` to both clip types.
- Code: `packages/engine/src/invariants.ts:21-31` only allows
  `sourceRange|timelineRange` in the nonpositive-duration violation, and
  `packages/engine/src/invariants.ts:63-102` checks only those two ranges.
- Test gap: `packages/engine/tests/invariants.test.ts:82-91` covers a zero
  timeline duration, but no test corrupts `lineage.span.duration`.

**Concrete failure:** Set an otherwise-valid clip's
`lineage.span.duration.value` to `0`; `checkInvariants()` returns no
`nonpositive-duration` violation for that range, despite the locked “har
TimeRange” rule. M4's join door is required to reuse this same list, so the gap
would also survive the post-merge sweep.

**Why it matters:** Diff normalization and split-family reasoning use lineage
span as their content boundary. Accepting an invalid span undermines the single
invariant list on which both edit and merge correctness rely.

**Suggested fix direction:** Add lineage-span duration to the existing
nonpositive-duration invariant and its focused regression test, reusing
`E_INVALID_RANGE` rather than adding a code.

### I2 — Split-family matching guesses from the `@`-shaped ID instead of requiring the locked lineage record

**Severity:** Important

**Owner triage (2026-08-04): CLOSED — NOT A BUG; no code/test change.** The
`A`/`A@5` notation in fixtures and docs is shorthand: production root clips get
system-minted `@`-free IDs, while `@<root-local-cut>` is reserved exclusively
for deterministic split descendants. Public `addClip` accepts no caller ID, so
an unrelated root cannot lawfully receive an existing root's formula-shaped
descendant ID. Under this namespace, stripping split suffixes is deterministic
ancestry decoding, not heuristic family guessing. M4 consumes engine-generated
snapshots and is unaffected; future import must mint a fresh `@`-free internal
root ID rather than preserve an external ID in this namespace. The contrary
hand-built state in the original finding violates the ID boundary, so I2 is
closed without an implementation change. Canonical clarification:
`docs/11-lld-checklist.md` B1.1.

**What:** A previously unseen `b`-side ID is classified as a descendant whenever
stripping `@...` reaches any ID in `a`. The matcher does not first require the
new clip's state-carried `lineage.rootId/span` to establish that relationship.

**Evidence:**

- Locked doc: `docs/11-lld-checklist.md:267-286` says the state-carried lineage
  record is the only lawful route and rejects heuristic guessing;
  `docs/11-lld-checklist.md:384-390` says matching is ID-only and a recreated
  clip with a new identity must be reported as delete+add.
- Code: `packages/engine/src/diff.ts:297-311` determines ancestry only by
  stripping `@` suffixes; `packages/engine/src/diff.ts:758-785` groups that clip
  into a family without validating its lineage relation.

**Concrete failure:** If `a` contains clip `A` and `b` independently contains a
new clip whose ID is `A@5` but whose lineage is `{rootId:"A@5", ...}`, the code
routes it through `classifyFamily()` and emits a split/raw-lineage result instead
of rule #13 “added”. This is precisely the kind of out-of-family state for which
the catch-all must stay truthful; ID punctuation cannot establish kinship.

**Why it matters:** A false family match changes identity semantics and would
feed the wrong machine entries into M4 merge composition.

**Suggested fix direction:** Require the formula-ID ancestry and the
state-carried lineage relationship to agree; otherwise leave the clip in the
ordinary rule #13 added path (plus any applicable raw catch-all).

### I3 — Rule #16 silently skips canonical state fields

**Severity:** Important

**Owner triage (2026-08-04): CLOSED — NOT A BUG; no code/test change.** V1
`mediaRefs` point at immutable deployment fixtures and have no upload/replace
mutation path. Engine-generated times are single-rate: seed/import/command
boundaries must normalize or reject rates that differ from `projectRate`.
Changing only a media hash or nested time rate therefore requires an invalid,
manually corrupted snapshot; it is not a user/agent version edit. Rule #16 is
now explicitly scoped to valid, diff-relevant state rather than acting as an
arbitrary deep-JSON corruption detector. Canonical wording and the M3 assumption
note were reconciled in `docs/11-lld-checklist.md` C1 and
`IMPLEMENTATION-NOTES.md`.

**What:** The claimed “escape impossible” catch-all does not compare
`Timeline.mediaRefs` or the `rate` members inside clip/source/lineage
`RationalTime` values. Changes confined to those fields can produce an empty
diff.

**Evidence:**

- Locked doc: `docs/11-lld-checklist.md:107-118` makes `mediaRefs` part of the
  canonical `Timeline`; `docs/11-lld-checklist.md:523-540` requires #16 to emit
  truthful raw before/after values for anything outside rules #1-#15—never
  silently skip it.
- Code: `packages/engine/src/diff.ts:690-708` compares only top-level
  `projectRate`; `packages/engine/src/diff.ts:710-756` compares track
  existence/kind; `packages/engine/src/diff.ts:758-817` then compares clips.
  There is no media-ref comparison. The normalized clip comparisons at
  `packages/engine/src/diff.ts:382-450` use `.value` and do not compare the
  corresponding rates.
- The M3 assumption claim at `IMPLEMENTATION-NOTES.md:59-65` says every raw
  field outside an atom has an explicit comparison, which is not true for
  these fields.

**Concrete failure:** Clone a timeline and change only
`mediaRefs[0].hash`, or change only `clip.timelineRange.start.rate` while
leaving its value unchanged. None of the implemented comparison branches sees
the change, so `computeDiff(a, b)` returns empty instead of a #16 entry.

**Why it matters:** `mediaRefs` are saved inside snapshots, and #16 is the
locked safety net for corrupted/future/unexpected state. An empty result is a
silent lie and breaks the catch-all's main guarantee.

**Suggested fix direction:** Extend the existing deterministic raw comparison
to every remaining canonical Timeline/MediaRef/TimeRange field, emitting #16
entries without changing the 15 semantic rules.

### I4 — Locked coverage and lock-ID gap guards are still commented-out TODOs

**Severity:** Important

**Owner triage (2026-08-04): DEFERRED TO M7 CI-CLOSURE — not an M2/M3 fix
blocker.** The guards are real locked tooling, not a product defect, but running
the gap-script before M4–M7 exist would either false-fail on intentionally
unimplemented locks or require unnecessary milestone-aware machinery. CI steps
1–3 remain active now, fuzz activates with M4, and coverage + lock-ID gap-check
activate after the engine/OTIO/server test universe is complete at M7; from then
on all five steps are merge-blocking. Canonical activation timing is reconciled
in `docs/12-test-benchmark-plan.md` T1/T5; the existing CI TODO is retained with
the correct M7 label.

**What:** The branch runs typecheck/lint/tests, but it does not provide the two
T1 “missing test” guards or execute locked T5 step 5 on push/PR.

**Evidence:**

- Locked doc: `docs/12-test-benchmark-plan.md:17-29` requires a lock-ID
  gap-script and a CI coverage report; `docs/12-test-benchmark-plan.md:91-96`
  makes coverage + gap-script T5 step 5 and says every failed step blocks merge.
- Code/config: `.github/workflows/ci.yml:47-50` leaves the entire step commented
  as TODO. Root `package.json:6-11` has no coverage or gap-check script, and the
  repository contains no `scripts/lock-id-gap-check.mjs`.

**Concrete failure:** A new lock can lose all test-name coverage and CI still
passes because the promised lock-ID comparison never runs; unexecuted branches
are likewise invisible because no coverage report is generated.

**Why it matters:** The current 183 green tests do not replace the two locked
guards whose exact purpose is detecting tests the suite forgot to write.

**Suggested fix direction:** Implement and enable T5 step 5 in its existing
position; keep M4 fuzz step 4 deferred as already documented.

### I5 — Two M3-relevant T2 split-family goldens are missing

**Severity:** Important

**Owner triage (2026-08-04): IMPLEMENTED-VERIFIED.** The two focused
`diff.test.ts` goldens specified in the correction record were added at lines
468-501 and both passed. Existing production diff behavior was correct; no
`diff.ts` change was made.

**What:** Group A explicitly names split-vs-slip and split-vs-trim-extension.
Those cases exercise `classifyFamily()`'s piece-level source offset and family
edge-extension paths, but the M3 suite has neither golden.

**Evidence:**

- Locked doc: `docs/12-test-benchmark-plan.md:30-35` names
  split-vs-untouched/property/move/**slip**/trim-shrink and
  trim-**EXTENSION** among Group A's 11 goldens.
- Tests: `packages/engine/tests/diff.test.ts:403-518` covers untouched, nested,
  piece move, piece property, end-trim shrink, deletion shapes, and cut
  refinement, but contains no split+slip or split+trim-extension case. A
  repository search over `packages/engine/tests` also finds no such test.

**Concrete failure scenario left unguarded:** After splitting `A`, slipping only
`A@5` must emit #15 + one #6 for that piece; extending the trailing piece must
emit #15 + #5. Plain-clip #5/#6 tests do not execute the separate family path at
`packages/engine/src/diff.ts:511-604`.

**Why it matters:** M3 is marked complete, but two answer-key cases belonging
to the implemented diff layer are absent; a family-only regression can pass all
183 pre-triage tests. The two added goldens now guard these paths.

**Suggested fix direction:** Add the two lock-prefixed Group A goldens in
`diff.test.ts`; leave merge outcomes/buttons for M4.

### M1 — `TextStyle.font` does not encode the exact locked whitelist

**Severity:** Minor

**Owner triage (2026-08-04): IMPLEMENTED-VERIFIED.** Added exported `TextFont =
"Arial" | "Georgia" | "Courier New"`, changed `TextStyle.font` to that union,
and compile-checked the runtime whitelist with `satisfies readonly TextFont[]`.
Runtime validation remains intact for untrusted JSON. Blast-radius verification:
typecheck PASS, lint PASS, full suite 185/185 PASS.

**What:** Runtime verb validation uses the correct whitelist, but the public
domain type still accepts any string.

**Evidence:**

- Locked doc: `docs/11-lld-checklist.md:493-503` locks the exact V1 font set to
  `Arial`, `Georgia`, and `Courier New`.
- Code: `packages/engine/src/types.ts:74-78` declares `font: string`, while the
  actual whitelist is separately declared in `packages/engine/src/verbs.ts:55-63`.

**Concrete failure:** `{font:"Papyrus", size:48, color:"#ffffff"}` satisfies
the exported `TextStyle` type and can therefore be used to construct a public
`Timeline`, even though it is not a legal canonical state. The verb door rejects
it, but the type contract does not.

**Why it matters:** Direct engine fixtures and later adapters/merge code can
compile while constructing a state that violates BC.5.

**Suggested fix direction:** Encode one shared string-literal font type and
derive/reuse the runtime whitelist from that single source.

## M2/M3 assumption audit

Every dated M2/M3 entry in `IMPLEMENTATION-NOTES.md` was checked:

| Entry | Verdict |
|---|---|
| M3 rule #2-#5 number mapping | Fine — deterministic code-level mapping; all four locked edge/direction behaviors are present. |
| M3 sentence wording | Fine — deterministic English templates; the locked #16 example is reproduced exactly. |
| M3 root-local split coordinate | Fine — follows B1.1 and is move-invariant. |
| M3 content-anchored atom formulas | Fine — move/trim/slip decompose into the locked khaane. |
| M3 split-family diff semantics | Fine for the listed net-state cases; the separate family-matcher defect is I2. |
| M3 #16 completeness net | **Not fine — I3.** The note overclaims exhaustive raw-field coverage. |
| M3 deterministic output order | Fine — fixed keys and rendering produce stable repeated output. |
| M3 machine form parallel to sentences | Fine — entries and sentences are constructed 1:1. |
| M3 T2-F deferrals | Fine — A3.8 errors live in `verbs.test.ts`; OTIO warnings correctly wait for M5. Group A omissions are separately I5. |
| M3 no new dependencies | Fine. |
| M2 `durationInSource` uses project rate | Fine as a representation choice under A1.2; image-duration meaning remains the owner-tracked M5 item and was not re-reported. |
| M2 BC.4 uses `E_INVALID_RANGE` | Owner-tracked known item; deliberately not re-reported. |
| M2 precondition evaluation order | Fine — deterministic and no locked multi-error precedence is contradicted. |
| M2 text-form addClip rate check | Owner-tracked known item; deliberately not re-reported. |
| M2 UUID minting + injectable test mint | Fine for the current supported runtime/test determinism; F8 was not reopened. |
| M2 lineage-span maintenance | Fine for verb-produced states; the invariant checker omission is I1. |
| M2 sorted clip-array normal form | Fine — deterministic and preserves semantic state. |
| M2 internal restore shape | Fine — excluded from the public Command union/index surface and preserves identity. |
| M2 inverse command arrays | Fine — locked composites apply in safe order. |
| M2 engine-level ApplyResult | Fine — does not replace the later C4 HTTP envelope. |
| M2 default-materialized property noChange/inverse | Fine under B3.1 equivalence. |
| M2 full-atom textStyle + partial add defaults | Fine at runtime; the compile-time font-type gap is M1. |
| M2 no new dependencies | Fine. |

## Checked clean

- **A1:** Integer-frame conversion behavior, nearest rounding, positive and
  negative exact-tie floor behavior, and rate-agnostic fixtures are correct for
  the locked/tested range.
- **A2/F3/BC.1:** Media kind, Timeline mediaRefs storage, image-to-video-track
  mapping, TextClip properties, and lineage-bearing Clip/TextClip shapes are
  present; M1 is the only type-level exception found.
- **A3.1-A3.8:** All eight public verbs exist. Media/text/internal-restore
  addClip forms, typed preconditions, exact transitions, text applicability,
  no-gap delete, same-track move, BC.3 trim equations, slip, property matrix,
  ripple behavior, split partition, and LIFO inverses were traced.
- **A4/B3.1:** Delta-zero, same-position, and default-materialized property
  noChange outcomes return the unchanged timeline reference; empty timelines
  are accepted; explicit defaults compare equal to absent defaults.
- **B1.1:** Left-survives identity, parent-chained formula IDs, root-local cuts,
  nested splits, moved/start-trimmed cuts, and exact split undo are correct for
  engine-produced families. I2 is owner-closed: the reserved `@`-free-root /
  split-suffix namespace makes the formula walk deterministic.
- **B2.3/BC.4:** Same-track overlap, source bounds, timeline/source positive
  durations, nonnegative timeline start, 1:1 media duration, and empty text are
  centralized in one checker. I1 is the sole missing locked range found.
- **A3.6/N1/BC.5/F10:** All 24 matrix cells and numeric/text-style runtime
  validations are covered; image applicability and text defaults are correct.
- **C1:** Rules #1-#15, multi-sentence output, ripple #14 + N x #1, defaults,
  empty diff, English rendering, structured-entry/sentence 1:1 mapping, and
  repeated-run deterministic ordering are correct. I2 and I3 are owner-closed
  under the clarified ID namespace and valid-state catch-all scope.
- **C4 point 5:** The M2 engine error-code union matches the locked verb subset;
  no new code and no `E_ID_COLLISION` were introduced.
- **C7:** `packages/engine` remains DB/network/UI-free; only `applyCommand` and
  `computeDiff` are exported as the currently implemented public functions.
  M4+ files/functions are correctly absent rather than stubbed.
- **Verification run:** `pnpm typecheck` PASS; `pnpm lint` PASS; `pnpm test`
  PASS — 5 files, 185/185 tests after I5 + M1 closure.
- **Explicit exclusions honored:** text-addClip's extra rate check, image
  `durationInSource` semantics, and BC.4's `E_INVALID_RANGE` reuse were not
  re-reported.

**MERGE-READY — no current M2/M3 blocking findings. I1 is owner-deferred to the
M4 closure gate; I4 is deferred to M7 CI-closure; I2 and I3 are owner-closed as
NOT A BUG; I5 and M1 are implemented and verified.**
