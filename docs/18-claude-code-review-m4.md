# Claude Code Review — M4 Merge Engine (Second Independent Review)

**Date:** 2026-08-04
**Branch reviewed:** `feat/merge-otio` at `e368f28` (M4 code = commit `d3e6c80`)
**Mode:** fresh-eyes independent review (background reviewer + foreground
verification), scoped to the committed M4 diff. docs/17's eight findings
(C1, I1–I5, M1–M2) were excluded by mandate; everything below is distinct.
**Verification discipline:** every finding below was live-reproduced through
public commands (`applyCommand` → `startMerge`/`applyChoice`) by the
background reviewer AND independently re-run by the foreground reviewer
before being accepted. No finding rests on hand-mutated state, forged IDs,
or out-of-scope inputs.

## Verdict

**FIX REQUIRED** (in the same single fix pass as docs/17's findings).

| Severity | Count |
|---|---:|
| Critical | 1 |
| Important | 2 |
| Minor | 1 |

**Owner triage lock (2026-08-04):** after per-finding discussion, ALL FOUR
findings (N1–N4) are owner-locked FIX APPROVED per the fix specs below.
Question Q2 is owner-resolved as **Option A (piece-scoped erase-B2)**;
Question Q1 is owner-resolved as **keep the defensive fallbacks + document
them**. One fix pass implements docs/17 + docs/18 together, then the full
gate reruns.

---

## N1 (Critical) — Refinement recomputes IDs from the base: a no-change
merge splits a committed clip; one-sided merges rename IDs

**What happens:** split-family refinement builds output piece IDs with
`canonicalPieceId()` from the **base** family plus an `@cut` formula, instead
of preserving the surviving branch pieces' actual IDs. Worse,
`lineageIdCuts()` harvests cut numbers out of ID **strings** (`A@40` → cut
40) and treats them as live cut points even when no piece boundary exists
there, and `mergeSegments()` refuses to coalesce across those phantom cuts.
A collision `while`-loop additionally mints merge-time IDs no verb ever
created.

**Witness W1 (live-reproduced twice, foreground values):** public flow
`A=[0,100)` → split@40 → delete A → start-extend `A@40` by 10 gives the
committed state `[{id: A@40, tl [30,100), span [30,100)}]`. Then
`startMerge({base: B, ours: B, theirs: B})` — zero changes — returned
`status:"ready"`, zero conflicts, and **two** clips:
`A@40 [30,40)` + freshly minted `A@40@40 [40,100)`.

**Witness W5:** same base, ours = one `propertyChange volume 55`, theirs
untouched → output is the same phantom two-piece split (both pieces vol 55)
instead of the single clip with vol 55.

**Witness W2:** ours = the A11 resplit flow (family `A@40 [30,40)`,
`A@40@40 [40,100)`), theirs untouched → output IDs renamed to
`A [30,40)` + `A@40 [40,100)` — the deleted `A` ID revives and both
branch IDs are silently rewritten.

**Locked rules violated:** three-way row 1 "No/No → keep base" and row 2
"Yes/No → apply ours" (docs/16 §2.2; B2.1); identity = birth-ID, merge never
mints new clips (B1.1, B3.1, N4 finite-universe premise "koi button nayi
clip nahi banata"); deterministic surprise-free merge (docs/07 5.5).

**Fix spec (2026-08-04):**

1. **Cut sources:** refinement cut points must come ONLY from actual piece
   boundaries present in the three input families' state-carried lineage
   spans (base/ours/theirs). Delete `lineageIdCuts()`-style ID-string
   parsing as a cut source entirely. A family whose pieces are identical
   across all three inputs must refine to a byte-identical no-op.
2. **ID preservation:** a refined segment whose span exactly matches a
   surviving branch piece keeps that branch piece's **actual ID** (same-cut
   convergence already yields equal formula IDs on both branches — B1.1).
   Only a genuinely new piece created by unioning DIFFERENT cuts gets an ID,
   and that ID must be exactly what the split verb itself would have minted
   for that cut (parent-chained root-local formula) — nothing else. Remove
   the collision-suffix `while` loop; under the formula + reserved namespace
   a collision is impossible, so surviving code must not invent IDs.
3. **Required regressions (lock-prefixed, exact assertions):**
   - W1: no-change merge of the extended-descendant state returns a
     byte-identical timeline (fingerprint equality), `ready`, 0 conflicts.
   - W5: one-sided property change returns exactly one clip
     `A@40 [30,100) vol 55`.
   - W2: one-sided nested-resplit merge preserves ours' exact IDs/spans
     (`A@40 [30,40)`, `A@40@40 [40,100)`), and the deleted root ID `A`
     appears nowhere.
4. Note: docs/17 I3's A11 merged-result exact-ID assertions land in the same
   pass and lock this from the golden side.

---

## N2 (Important) — Trim-erase B2 resolves by wholesale family swap,
silently dropping the other side's independent edits

**What happens:** when one branch's trim fully erases a split piece that the
other branch edited, B1.2(5) makes that **piece** a B2. The implementation
creates the B2 correctly but resolves every choice by cloning one side's
ENTIRE family (`cloneFamily(...)`), skipping atom composition for the
untouched pieces.

**Witness W3 (live-reproduced twice):** base `A [10,20) vol 80`; ours =
split@15 + left-piece vol 30 + right-piece vol 40; theirs = end-trim −5
(erases the right piece's region). One B2 (correct). Choosing `delete`
returned `A [10,15) vol 80` — ours' left-piece vol 30, which was outside the
conflict and untouched by theirs, silently reverted. **Witness W4:** the
symmetric variant silently dropped theirs' volume change with zero
conflicts.

**Locked rules violated:** "alag units = dono changes compose" (B2.1);
"independent edits never conflict" and no-silent-loss (docs/07 5.5;
docs/16 §5).

**Owner resolution of Q2 — Option A locked (2026-08-04): piece-scoped
erase-B2.** B1.2(5)'s wording ("us tukde par B2") governs; docs/16 §3's
family-level B2 row describes only the true delete-vs-family case
(B1.2(2)), not trim-erase.

**Fix spec (2026-08-04):**

1. Scope the erase-B2 to the erased+edited piece region. All other family
   pieces flow through normal atom composition (one-sided changes apply;
   same-atom divergences become their own B1s under existing machinery).
2. Choice outcomes for the erased piece:
   - `delete` → the piece's region stays erased (the trim side wins there);
   - `clip` → the edited piece survives with its edits;
   - `base` → the piece's region returns to its exact base state.
   Composition of the REST of the family is identical across all three
   choices. Dynamic conflicts discovered after materialization follow B3.4
   honest-count machinery as usual.
3. **Required regressions (exact assertions):** for W3 —
   `delete` → `A [10,15) vol 30`; `clip` → `A [10,15) vol 30` +
   `A@5 [15,20) vol 40`; `base` → `A [10,15) vol 30` + `A@5 [15,20) vol 80`.
   For W4 — left piece must carry theirs' vol 50 in every outcome
   (one-sided there); `clip` must surface the vol 40-vs-50 divergence on the
   surviving piece as a B1, never silently pick one.
4. If implementing piece-scoped resolution surfaces a genuine contradiction
   with any locked rule, STOP and report — do not improvise a third model.

---

## N3 (Important) — The T3 fuzz generator never produces trim-EXTENSION,
so entire locked merge paths (including N1's bug class) sit outside the net

**What happens:** `makeAwareCommand`'s trim always emits a negative delta
(`delta: time(-rng.int(1, duration-1))`); blind commands add no extension
either. Therefore across all 10,000 CI cases: B1.2's "extension modifies the
edge piece" projection, the joint `source-bounds`/`negative-start` B1
classes (T2-B5/B6), and every split→delete→extend chain (N1's exact bug
class) are structurally unreachable. This is why a green 10k run coexisted
with the live N1 witnesses.

**Locked rules violated:** T3 generator contract — verb-aware choices "so
code paths execute" (docs/12 T3; docs/16 §9).

**Fix spec (2026-08-04):**

1. Give generated trims both signs, keeping validity by construction: pick
   extensions only within available source material on that edge AND the
   available neighbor gap on the timeline (start-extends also respect
   frame 0). Text clips follow their timeline-only constraints.
2. Occasionally generate the chain split → delete(left) → extend(survivor)
   so refinement/lineage paths are exercised.
3. Preserve full seed determinism; rerun 500 local + 10,000 CI-mode cases
   after the engine fixes land. If the strengthened generator exposes a NEW
   engine bug: fix it if the locked contract clearly dictates the behavior;
   otherwise STOP and report with the failing seed.

---

## N4 (Minor) — IMPLEMENTATION-NOTES "Common-refinement IDs" entry records
an unlocked contract decision and overclaims

The entry claims merge-side ID reconstruction + collision-suffix minting
"preserves B1.1 ancestry". W1/W2 disprove the claim, and merge-time ID
minting was never a locked behavior — B1.1 mints IDs only in the split verb;
docs/16 §6.1 restricts NOTES to trivial tooling choices.

**Fix spec (2026-08-04):** after N1 lands, rewrite the entry to the truth:
refinement preserves surviving piece IDs and mints only split-formula IDs
for genuinely refined pieces; no merge-time novel minting exists. Also add
the Q1 line below to NOTES.

---

## Questions — owner-resolved (2026-08-04)

- **Q1 — defensive `E_MERGE_PRECONDITION` messages beyond the locked 4-case
  list** (`"merge resolution did not terminate"`, `"saved overlap choices
  did not reach a clean fixed point"`, `"unsupported merge invariant"`,
  `"final merge timeline is invalid"`): no lawful public-command witness
  reaches them. **Resolution: KEEP as defensive fallbacks** (better than a
  crash), and document in IMPLEMENTATION-NOTES that these are
  defensive-only with no known reachable path. If one ever becomes
  reachable, that is a bug to triage against the C7 4-case lock.
- **Q2 — resolved above in N2 (Option A, piece-scoped).**

## Post-fix-pass additions (2026-08-04, owner-locked)

### N5 — split verb re-mints a surviving sibling's ID after trims heal a cut

Found by the strengthened N3 fuzz during the fix pass (seed 1295277908,
case 329) and reported OPEN by the fix agent (verbs.ts was frozen for that
pass). **Owner decision: fix in this same PR, inline.**

- **Witness (4 public commands):** clip `A` span `[0,3)` → split@1
  (`A [0,1)` + `A@1 [1,3)`) → shrink `A@1` start (span `[2,3)`) → extend
  `A`'s end across the healed cut (span `[0,2)`) → split `A`@1 again: the
  formula mints `A@1`, which still exists → duplicate ID accepted into
  committed state.
- **Fix (implemented):** the split verb extends the formula ID
  deterministically until it is unique among live clips (`A@1` taken →
  `A@1@1`). Same state mints the same name on both branches, so B1.1
  same-cut merge convergence is untouched. Regression:
  `verbs.test.ts` "B1.1: re-splitting a healed cut cannot duplicate a
  surviving sibling id". The fuzz generator's temporary avoid-guard was
  removed so this path is fuzzed again; docs/11 B1.1 carries the dated
  amendment narrowing the old "mathematically impossible" wording.

### Owner sign-off — N1 uniqueness-aware ID assignment deviation

The fix agent's N1 implementation deviates from the literal "remove all
collision handling" spec: fuzz case 157 proved the same birth ID can carry
different spans across branches, so refined IDs are assigned left-to-right
over lawful candidates with a used-set (B1.1 left-survives), with a
deterministic defensive-only suffix fallback behind it (never reached in
10,500 cases). **Owner sign-off given 2026-08-04: implementation and the
retained defensive fallback are approved as-is.**

## Checked clean (second-review coverage)

The review independently confirmed conformance of: the exact C7 public
surface and all 16 boundary types; the four locked `E_MERGE_PRECONDITION`
paths + same-choice retry; purity/no-input-mutation; conflict ordering and
content-addressed conflictId payload discipline; parchi fresh-recompute +
click-order independence + honest dynamic counts; B2.4 delete-vs-ripple
auto-convergence; all four Shift rules (placement-only verified); base-revert
for base-present/base-absent non-split participants; BC.2 explicit-restore
discipline; defaults-materialized equality (D1–D4); the narrowed
overlap→B3 / same-clip→B1 mapping (B2/B5/B6/B7); T2 count/naming and
deferred-row discipline; T3 properties P1–P9 + I1-P10 genuinely implemented
with seed determinism; run-fuzz.mjs case counts genuinely executed
(500 local; 10×1000 CI chunks, seed 1295277908); CI step-4 placement; the
A11 verbs-side collision test. Known docs/17 findings were excluded, not
re-verified clean.

## Verification runs

Both reviewers ran: `pnpm typecheck` PASS; `pnpm lint` PASS; `pnpm test`
226/226 PASS; fuzz 500 local + 10,000 CI-mode PASS (seed 1295277908) — all
green at `e368f28`, which is precisely why N3 matters: green fuzz did not
cover the broken paths. All witness runs used temporary test files that were
deleted afterward; the working tree was left clean.
