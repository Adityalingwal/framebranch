# Codex Code Review — M4 Merge Engine

**Date:** 2026-08-04  
**Branch reviewed:** `feat/merge-otio` at `d3e6c80`  
**Scope:** committed M4 diff only; M5, M7, M8, V2, malformed snapshots, and
future unsupported workflows excluded  
**Mode:** fresh read-only implementation review; this report is the only file
written after the review

## Verdict

**FIX REQUIRED.** The implementation is not M4-complete yet.

| Severity | Count |
|---|---:|
| Critical | 1 |
| Important | 5 |
| Minor | 2 |

The normal suite is green, but three reachable supported product scenarios
still break locked merge behaviour. The locked T2/T3/I1 evidence is also not
complete enough to close the milestone.

## Independent reviewer verification (Claude, 2026-08-04)

Second reviewer (Claude Code) independently checked every finding against
`feat/merge-otio` HEAD `e368f28` before the fix pass:

- **No fix commits exist yet.** `git diff d3e6c80..e368f28 -- packages/` is
  empty; the two commits after the implementation are docs-only. The PR code
  still contains every defect below.
- **C1 live-reproduced.** Base `A=[0,10)`, `C=[20,30)`; ours split A@5 + move
  `A@5`→40; theirs move C→40; B3 `base` choice returned status `ready` with
  only `A=[0,5)` and `C=[20,30)` — A's `[5,10)` content silently deleted.
- **I2 live-reproduced.** ours position `{x:10,y:20}` vs theirs `{y:20,x:10}`
  (same value, different key order) produced a false B1 on `position`.
- **I1 code-confirmed.** `processOverlaps()` withholds unanswered participants
  only inside `if (Object.keys(ctx.choices).length === 0 ...)`.
- **I3/I5 confirmed by search.** No same-edge-trim golden, no exact-ID
  assertion on A11's merged output, no keep-ours/keep-theirs branch in the C1
  golden, no adjacent-cut / move+trim branch-swap / all-three-choice
  zero-negative-trim witnesses exist in `merge.test.ts`.
- **I4 confirmed.** `assertNoSilentResurrection()` fires only when a root is
  absent from both branches; not branch-change-aware or choice-aware.
- **M1 confirmed.** `StartMergeInput`/`ApplyChoiceInput`/`FinalizeCheckInput`
  are exported from `index.ts` beyond the locked type list.
- **M2 reproduced.** `pnpm --filter @framebranch/engine test -- merge.test.ts`
  ran all 226 tests across 6 files, not just `merge.test.ts`.

All eight findings are genuine; none was rejected as unreachable or
over-engineered. Per-finding fix specs are recorded below each finding as
**Fix spec (2026-08-04)** blocks; the single fix pass must implement all of
them together and then rerun the full gate (typecheck, lint, 226 suite, 500
local + 10,000 CI-mode fuzz with printed seed).

**Owner triage lock (2026-08-04):** after per-finding discussion, ALL EIGHT
findings (C1, I1–I5, M1, M2) are owner-locked FIX APPROVED per the fix specs
below. The fix pass is deliberately held until the second independent
(Claude fresh-eyes) review of the same commit completes, so any additional
owner-accepted findings land in the same single pass.

## Findings

### C1 — Bucket-3 `base` can silently delete split-family content

**Severity: Critical**

`revertPairToBase()` resolves each overlap participant by exact clip ID
(`packages/engine/src/merge.ts:1347-1362`). A split descendant such as `A@5`
does not exist by that exact ID in the unsplit merge base, so the resolver treats
it like a genuinely new add and removes it.

Reachable public-command witness:

1. Base: `A=[0,10)`, `C=[20,30)`.
2. Ours: split A at frame 5, then move `A@5` to frame 40.
3. Theirs: move C to frame 40.
4. Merge produces the lawful B3 `A@5` versus C.
5. Choose B3 `base` (Remove both — back to original).
6. The result says `ready`, but only `A=[0,5)` and base C remain. A's original
   `[5,10)` content is silently lost.

The symmetric left-piece variant restores unsplit A but leaves `A@5`, creating a
false A-versus-A@5 overlap cascade. Both witnesses use only valid base state and
`applyCommand` branches.

This violates the locked rule that B3 `base` undoes both conflicting changes and
returns the participants to merge-base condition; only a genuinely base-absent
new add disappears (`docs/11-lld-checklist.md:352-360,914-916`). Split-family
common refinement is locked at `docs/11-lld-checklist.md:300-318`.

Required closure: resolve base state by lineage family/refinement, not raw output
clip ID, and add both split-right and split-left regressions.

**Owner lock — 2026-08-04:** FIX APPROVED. B3 `base` must distinguish a
genuinely base-absent add from a descendant of a base lineage family. A genuine
new add is removed. A split descendant is not deleted as new content: the
affected lineage family is restored to its exact merge-base state, including
original placement and unsplit shape. Both right-piece and left-piece overlap
regressions are required. This is an implementation correction to the existing
locked contract, not a new merge behaviour.

**Fix spec (2026-08-04):**

1. Replace the per-ID logic in `revertPairToBase()` with a family-aware
   helper, e.g. `revertParticipantToBase(draft, base, clipId)`:
   - Read the participant's `lineage.rootId` from the draft clip (lineage is
     state-carried on both `Clip` and `TextClip` — B1.1).
   - Collect every base clip whose `lineage.rootId` matches. If the base has
     **none**, the participant is a genuinely base-absent add → remove just
     that clip (current behaviour, still correct for that case).
   - If the base has the family: remove **all** draft clips carrying that
     `rootId` from the participant's track, then re-insert the exact base
     family clips (for an unsplit base that is the single original clip with
     its original placement, ranges, properties, and lineage). This is one
     uniform rule — for an unsplit, unmoved participant it degrades to
     today's behaviour, so no special-casing by bucket history is needed.
   - Apply the helper to both participants of the pair; family restore must be
     idempotent so a pair from the same family restores once, cleanly.
2. Interaction with replay: a restored family can create a new overlap with an
   already-materialized clip. No new machinery — the existing fixed-point
   replay + B3.4 dynamic-conflict discovery must see the restored clips on the
   next pass. Verify the restored family participates in overlap detection.
3. Required regressions (both from public commands only):
   - **Right-piece:** base `A=[0,10)`, `C=[20,30)`; ours split A at 5 then
     move `A@5`→40; theirs move C→40; choose B3 `base` → result must be
     exactly unsplit `A=[0,10)` + `C=[20,30)`, status `ready`, invariant-clean.
   - **Left-piece:** ours split A at 5 then move `A` (left piece)→40; theirs
     move C→40; choose B3 `base` → same expected result; assert no `A@5`
     remnant and no follow-up A-vs-A@5 overlap conflict.
   - Keep the existing genuine-new-add regression (B3 `base` removes a
     base-absent `D`) green alongside.

### I1 — unanswered B3 participants leak into the returned safe draft

**Severity: Important**

`processOverlaps()` removes unanswered overlap participants only when the entire
choice map is empty (`packages/engine/src/merge.ts:1404-1439`). After any saved
answer exists, other unanswered B3 participants remain materialized.

Executable reachable witness:

- Base has A and B.
- Ours changes A's volume and moves B to `[10,20)`.
- Theirs changes A's volume differently and adds D at `[10,20)`.
- Start returns B1(A) plus B3(B,D), with participants withheld.
- Answer B1 first.
- The response still says `needs-resolution` for B3, but its timeline contains
  both B and D at the same range and therefore has an overlap violation.

This violates the exact public packet contract: `timeline` is the current safe
materialized draft and unanswered conflict participants are absent
(`docs/11-lld-checklist.md:907-912`; `docs/16-m4-implementation-brief.md:263-267`).

Required closure: withhold every currently unanswered participant on every
recompute, independent of how many unrelated permanent answers already exist.

**Fix spec (2026-08-04):**

1. In `processOverlaps()`, the withhold step currently sits behind
   `if (Object.keys(ctx.choices).length === 0 && overlaps.length > 0)`. Drop
   the choices-map-empty guard: after the fixed-point replay settles, collect
   the participant IDs of every **still-unanswered** overlap conflict
   (`ctx.conflicts` of kind overlap) and remove them from the returned draft —
   on every recompute. Answered overlaps stay materialized per their choice.
2. The withheld clips must still be discoverable on the next recompute
   (guaranteed today because every `applyChoice` recomputes from
   base/ours/theirs — confirm no caching breaks this).
3. Regression (Codex witness, public commands only): base has A and B; ours
   changes A volume to 40 and moves B to `[10,20)`; theirs changes A volume
   to 60 and adds D at `[10,20)`. Start → B1(A) + B3(B,D). Answer the B1
   first → returned packet must still withhold both B and D from `timeline`,
   report the B3 as remaining, and the draft must pass `checkInvariants()`.
4. Test hardening (would have caught this class): in the fuzz harness, run
   `checkInvariants()` on the returned draft `timeline` after `startMerge`
   and after **every** intermediate `applyChoice`, not only on the final
   merged result. The locked packet contract says every returned draft is
   safe, so a violation at any intermediate step is a failure.

### I2 — semantically equal object atoms can produce a false Bucket-1

**Severity: Important**

Merge atom equality uses `JSON.stringify()` fingerprints
(`packages/engine/src/merge.ts:198,242-246`). Object key insertion order
therefore changes equality.

Two independently verified public-command witnesses:

- `position`: ours `{x:10,y:20}`, theirs `{y:20,x:10}`;
- `textStyle`: both sides select the same font/size/color but pass the keys in a
  different order.

Both pairs are valid and semantically identical, yet `startMerge()` returns a
false B1. Position and textStyle are locked whole semantic atoms, and the same
final atom value must converge (`docs/11-lld-checklist.md:263-272`). The verb
engine already compares these values field-by-field
(`packages/engine/src/verbs.ts:666-672`).

Required closure: compare known object atoms structurally by their locked fields
or canonicalize them before comparison; add both regressions.

**Fix spec (2026-08-04):**

1. Root cause: `equalValue()` compares `JSON.stringify` fingerprints, so key
   insertion order changes equality. Fix at one place: make the private
   `fingerprint()`/`equalValue()` pair canonical — recursively serialize
   objects with **sorted keys** (arrays keep order; primitives unchanged).
   This fixes `position` and `textStyle` uniformly, keeps every scalar atom's
   behaviour identical, and also makes any other fingerprint use (e.g.
   `overlapStateFingerprint`, `MergeDelta.baseFingerprint`) order-robust.
   Alternative (equally acceptable): typed per-atom comparators for the two
   locked object atoms (`position` = x,y; `textStyle` = font,size,color) —
   pick whichever is smaller/cleaner, but do it once, not per call-site.
2. The verb engine already compares these objects field-by-field for its
   noChange detection (`verbs.ts`), so merge equality must match that
   semantics — same value = converge, never a false B1.
3. Regressions (public commands only):
   - position: ours `{x:10,y:20}`, theirs `{y:20,x:10}` on the same clip →
     zero conflicts, merged value converges, status `ready`.
   - textStyle: both sides set the same font/size/color with different key
     order → zero conflicts, converges.
   - Negative control: genuinely different position values (e.g. `{x:10,y:20}`
     vs `{x:11,y:20}`) still produce exactly one B1 on `position`.

### I3 — required T2 answer-key assertions are incomplete

**Severity: Important**

The suite has 34 M4-labelled T2 tests, but these locked outcomes are not fully
proved:

- Same-edge trims: same final value converges; different values produce B1
  (`docs/12-test-benchmark-plan.md:40-44`). The current B2 golden tests only
  opposite-edge trims (`packages/engine/tests/merge.test.ts:542-584`).
- A11 checks exact nested IDs on the input branch, but the merged result checks
  uniqueness only (`packages/engine/tests/merge.test.ts:505-521`). It would pass
  if a required child were silently dropped. The exact answer key is
  `docs/16-m4-implementation-brief.md:338`.
- C1 proves the `base` branch only. The locked witness also requires Keep-ours
  and Keep-theirs to remain overlap-free
  (`packages/engine/tests/merge.test.ts:746-753`;
  `docs/16-m4-implementation-brief.md:357`).

Required closure: add exact output assertions for all three rows; test names or
count alone do not satisfy the answer keys.

**Fix spec (2026-08-04):**

1. **Same-edge trim golden (new):** base A tl `[10,20)` src `[10,20)`.
   - Converge case: both branches `trim(end, -3)` → merged A exactly
     `[10,17)`, zero conflicts.
   - Conflict case: ours `trim(end,-3)` → `[10,17)`; theirs `trim(end,-5)` →
     `[10,15)` → exactly one B1 on `coverage-end`; then assert **all three
     choices** produce the exact outcome: `ours`→`[10,17)`,
     `theirs`→`[10,15)`, `base`→`[10,20)`, each `ready` and invariant-clean.
2. **A11 merged-result exactness:** after the split-delete-extend-resplit
   merge, assert the exact surviving IDs and spans in the merged output
   (`A@40` and `A@40@40` both present with their exact timeline ranges), not
   just ID-set uniqueness. A silently dropped child must fail the test.
3. **C1 golden — remaining branches:** using the same spurious-B3 scenario,
   additionally resolve the A move-vs-move B1 with `ours` and with `theirs`
   (fresh scenario each time): both must complete overlap-free with exact
   final placements (`ours`: A=`[10,20)`, C=`[0,10)`; `theirs`: A=`[30,40)`,
   C=`[0,10)`), no B3 ever appearing. The existing `base` branch stays.

### I4 — T3-P6 does not actually detect silent resurrection

**Severity: Important**

`assertNoSilentResurrection()` fails only when a base root is missing from both
branches and reappears (`packages/engine/tests/fuzz.test.ts:624-642`). A normal
delete-versus-untouched case would therefore let a buggy automatic restoration
pass because the root is still present on the untouched side. The helper also
does not distinguish an explicit B2 restoration choice from silent automatic
restoration.

This does not implement the locked property “No silent resurrection; explicit
B2 restoration is allowed and distinguishable”
(`docs/16-m4-implementation-brief.md:416`).

Required closure: make P6 branch-change-aware and choice-aware, then retain seed
replay.

**Fix spec (2026-08-04):**

1. Rewrite `assertNoSilentResurrection()` with per-root branch awareness:
   for each base `rootId`, compute `deletedInOurs` / `deletedInTheirs`
   (family absent from that branch).
   - Deleted on **both** sides → must never appear in any draft or final
     result, under any choices (keep the existing check).
   - Deleted on **one** side → the family may appear in the result **only
     if** the choices-map contains an explicit B2 answer for that family with
     choice `clip` or `base`. Otherwise its presence is a silent
     resurrection → fail with the seed.
2. To make it choice-aware, the fuzz `resolveMerge()` helper should record,
   while answering conflicts, which B2 conflicts (participants kind
   `delete`, with their `rootId`) were answered and with which choice; pass
   that map into the assertion instead of only the raw choices record.
3. Keep seed printing on failure and deterministic replay unchanged. Rerun
   500 local + 10,000 CI-mode cases after the change; if the strengthened
   property finds a real engine bug, that bug is triaged under the normal
   rules before closure.

### I5 — the deterministic I1 closure claim is ahead of its evidence

**Severity: Important**

Section 10 requires the deterministic reachable-scenario matrix plus T3 direct
lineage checks before proof-by-construction closure
(`docs/16-m4-implementation-brief.md:426-472`). At least these exact witnesses
are absent:

- move + trim with branch-swap equality;
- adjacent concurrent cuts with an exact one-frame middle piece;
- nested split using a valid merged output as the next merge base; and
- all three choices for zero and negative opposite-trim conflicts.

Therefore the current “entire matrix covered / VERIFIED-CLOSED” record
(`docs/15-codex-code-review-m2-m3.md:28-41` and
`docs/16-m4-implementation-brief.md:491-498`) is not yet fully supported by the
test evidence. The 10,000-case fuzz pass is useful, but it does not replace the
explicit deterministic matrix required by the closure rule.

Required closure: add the missing public-command-derived witnesses, rerun the
matrix and fuzz, then either retain proof-by-construction or follow the already
locked I1 fallback if a real counterexample appears. No new invariant should be
invented now.

**Fix spec (2026-08-04):** add these deterministic goldens (public commands
only; every one asserts positive `lineage.span.duration` on all surviving
clips):

1. **move + trim branch-swap:** base A=`[0,10)`; ours move A→30; theirs
   `trim(end,-3)`. Assert exact composed result (A=`[30,37)`, source
   shortened in lockstep), then rerun with ours/theirs swapped and assert the
   two merged outputs are byte-identical (fingerprint equality).
2. **Adjacent concurrent cuts:** base A=`[0,10)`; ours split at 4; theirs
   split at 5 → union refinement must yield exactly three pieces
   `[0,4)`, `[4,5)`, `[5,10)` — a real 1-frame middle piece, unique IDs, all
   spans positive, deterministic on repeat.
3. **Nested split from a merged base:** take a `ready` merged output (e.g.
   the A9 same-cut convergence result) as the next merge's base; split a
   descendant further on one branch, edit the other branch independently →
   parent-chained IDs continue correctly, merge is deterministic, all spans
   positive.
4. **All three choices on zero/negative opposite-edge trims:** for both the
   exactly-zero and the crossing-negative combined-trim B1s, resolve with
   `ours`, `theirs`, and `base` (fresh scenario each time) and assert each
   outcome's exact spans, `ready` status, and invariant-clean state — no
   clamp, no silent fix.

After these land plus the I4 strengthening, rerun the full matrix + fuzz. If
everything stays green, the existing VERIFIED-CLOSED record in docs/15 and
docs/11 A2.3 stands with the evidence now actually complete; if a
counterexample appears, follow the locked I1 fallback (add `lineage.span` to
the nonpositive-duration violation reusing `E_INVALID_RANGE`) instead.

### M1 — public type exports are wider than the locked boundary list

**Severity: Minor**

`StartMergeInput`, `ApplyChoiceInput`, and `FinalizeCheckInput` are exported from
`packages/engine/src/index.ts:29-50`, but the locked required boundary-type list
does not include them (`docs/16-m4-implementation-brief.md:226-231`). The call
shapes are already public inline contracts; the extra aliases widen the small
public door without a recorded lock.

Required closure: keep the aliases private to `merge.ts`, unless canonical docs
are deliberately amended first. No new API decision is needed for the current
locked surface.

**Fix spec (2026-08-04):** remove `StartMergeInput`, `ApplyChoiceInput`, and
`FinalizeCheckInput` from the `index.ts` type exports; they stay as private
aliases inside `merge.ts` (the three functions' parameter shapes remain
public through their signatures, which is what C7 locks). Same F8 discipline
as before: sync the surface to the lock, don't widen the lock to match code.
Verify with typecheck + the existing C7 export test.

### M2 — the documented focused test command is not focused

**Severity: Minor**

Running the command documented at `docs/16-m4-implementation-brief.md:506-510`
runs all 226 normal tests, not only `merge.test.ts`, because the package test
script's existing arguments consume the appended selector differently than the
brief assumes.

Required closure: record a command that actually selects the merge test file.

**Fix spec (2026-08-04):** verified live — the documented command runs all
226 tests. Replace the docs/16 section-12 convenience command with a form
that was verified to select only the merge file:

```bash
cd packages/engine && npx vitest run tests/merge.test.ts
```

(`pnpm --filter @framebranch/engine exec vitest run tests/merge.test.ts` is
an equivalent workspace-root spelling.) Docs-only change; the package `test`
script and CI commands stay untouched.

## Verified green on the reviewed commit

- `pnpm --filter @framebranch/engine typecheck` — pass.
- `pnpm lint` — pass.
- `pnpm --filter @framebranch/engine test` — 226/226 pass.
- Previously recorded seed `1295277908` — 500 local and 10,000 CI-mode fuzz
  cases pass.
- CI order is typecheck → lint → normal tests → 10,000-case M4 fuzz; M7 coverage
  and lock-gap work remains deferred.
- M5/M7/M8/V2 code, extra merge functions, DB/network/UI imports, malformed
  split IDs, and corrupted snapshot scenarios were not used as findings.

Note: `pnpm --filter @framebranch/engine lint` is not a valid package command;
lint is correctly run from the workspace root as `pnpm lint`.

## Review closure checklist

- [x] Review used committed `d3e6c80`, not an uncommitted working diff.
- [x] Canonical docs and the derived M4 brief were checked independently by the
      root reviewer.
- [x] Contract, tests/API, and adversarial passes were separate and read-only.
- [x] Every implementation finding has a reachable supported scenario and a
      locked-contract mismatch.
- [x] Unsupported forged IDs, malformed future state, and later milestones were
      excluded.
- [ ] C1 and I1-I2 are fixed with regressions.
- [ ] I3-I5 locked evidence gates are complete and rerun.
- [ ] M1-M2 are reconciled.
- [ ] Fresh post-fix review finds no remaining M4 blocker.

## Open decisions

None. The required behaviour and test gates are already locked; this is a fix
and evidence pass, not a new design discussion.

No PR was created.
