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

### M2 — the documented focused test command is not focused

**Severity: Minor**

Running the command documented at `docs/16-m4-implementation-brief.md:506-510`
runs all 226 normal tests, not only `merge.test.ts`, because the package test
script's existing arguments consume the appended selector differently than the
brief assumes.

Required closure: record a command that actually selects the merge test file.

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
