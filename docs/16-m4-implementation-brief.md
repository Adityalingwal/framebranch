# M4 Implementation Brief — Three-Way Merge Engine

> **Status:** implementation-ready docs checkpoint; U1/U2 discussion is closed
> and no M4 implementation code has been written.
> **Prepared from live repo:** `feat/merge-otio` at `06c182d`, clean and aligned
> with `origin/feat/merge-otio` on 2026-08-04.
> **Authority:** this brief reconciles the canonical set in the order required by
> `docs/00-INDEX.md`: 07 → 11 → 12 → 09 → 13 → 15. If this brief ever conflicts
> with an amended canonical lock, the precedence rules in `docs/00-INDEX.md:27-37`
> win.

## 1. Outcome and phase boundary

M4 delivers the **pure merge engine only**:

- three-way merge from `base`, `ours`, and `theirs`;
- split-family refinement and projection;
- Bucket 1/2/3 conflict production;
- deterministic conflict ordering and content-addressed IDs;
- choices-map (parchi) replay with fresh recomputation;
- dynamic conflicts, deterministic Shift, and termination;
- merge goldens plus the 500/10,000-case fuzz harness; and
- M4's three public engine functions through `packages/engine/src/index.ts`.

The milestone gate is: **three-way + refinement + conflicts + parchi + fuzz,
with 10,000 fuzz cases green** (`docs/07-session-progress.md:351-357`).

### Explicitly out of scope

| Out-of-scope work | Milestone / evidence |
|---|---|
| OTIO import/export, round-trip, import warnings, missing-media/export warnings | M5; `docs/07-session-progress.md:356-358`, `docs/09-hld-checklist.md:265-295` |
| Benchmarks and `benchmarks/REPORT.md` | M6; `docs/07-session-progress.md:357-359`, `docs/12-test-benchmark-plan.md:81-91` |
| DB tables, durable `merge_attempts`, API routes/envelopes, double-head CAS, `E_STALE_HEAD`, abort-row deletion, tickets | M7; `docs/07-session-progress.md:358-360`, `docs/09-hld-checklist.md:192-200,250-264`, `docs/11-lld-checklist.md:619-744` |
| Timeline/diff/conflict/history UI and the manual 9-step demo | M8/Part 9; `docs/07-session-progress.md:359-361`, `docs/11-lld-checklist.md:789-833` |
| Coverage and lock-ID gap script | M7 CI closure; `docs/12-test-benchmark-plan.md:17-30,92-103`, `docs/15-codex-code-review-m2-m3.md:80-90` |
| New verbs/endpoints/error codes, cross-track move, track add/delete/reorder, transitions/effects/speed change, CRDT/multi-user, real AI, V2 workflows | `docs/00-INDEX.md:55-62`, `docs/07-session-progress.md:75-103`, `docs/11-lld-checklist.md:174-180,243-245,496-507` |

M4 must not add a public `abortMerge` or `applyDiff` merely to host a test. C7
locks seven public functions total (`docs/11-lld-checklist.md:769-783`).

## 2. Locked merge model

### 2.1 Authority and normalized atoms

1. Find/use the common ancestor as `base`; compare `base → ours` and
   `base → theirs` (`docs/07-session-progress.md:45-59`).
2. Merge authority is **net state**, never op-log. The op-log remains provenance
   only (`docs/09-hld-checklist.md:49-57`).
3. Compare exact integer-frame normalized atoms, not verbs:
   - anchor / timeline placement;
   - coverage start and end;
   - source offset for media clips;
   - each of volume, opacity, scale, position, textContent, and textStyle;
   - existence; and
   - split partition/family structure.
   `position` and `textStyle` are whole atoms (`docs/11-lld-checklist.md:252-271`).
4. Materialize defaults before compare. Match identity by stable ID only, never
   by visual shape. Canonical sort key is `(timeline start, timeline end,
   rootId, span start, clipId)` (`docs/11-lld-checklist.md:392-408`).

### 2.2 Exact three-way field rule

For each refined identity/atom:

| Ours changed? | Theirs changed? | Result |
|---|---|---|
| No | No | Keep base. |
| Yes | No | Apply ours. |
| No | Yes | Apply theirs. |
| Yes | Yes, same final value | Converge automatically. |
| Yes | Yes, different final values on the same atom | Bucket 1. |
| Yes | Yes, but on different atoms | Compose, then run the join invariant sweep. |

This is B2.1's locked same-unit/different-unit rule
(`docs/11-lld-checklist.md:252-271`). Exact equality only; no float tolerance,
randomness, AI, or op-intent guessing is allowed.

### 2.3 Split-family refinement and projection

- Root IDs are engine-minted and `@`-free. `@<root-local-cut>` is reserved for
  split descendants. Every piece carries `{ rootId, span }` in state
  (`docs/11-lld-checklist.md:272-299`; I2 closure at
  `docs/15-codex-code-review-m2-m3.md:53-64`).
- Same cut on both branches produces the same formula IDs and auto-converges.
- Different cuts are unioned into a common refinement; refined pieces then
  recurse through atom comparison.
- Split vs property/move/slip/trim auto-projects the other side's change across
  the family where the piece is still at the base value. A piece that changed
  that atom differently becomes Bucket 1.
- Move shifts the whole family together; slip shifts every media window; trim
  maps its coverage boundary across pieces; extension modifies the edge piece.
- Split vs delete is one family-atomic Bucket 2. Half-family resolution is
  forbidden.
- If trim fully erases a piece, an unedited piece auto-erases; an edited piece
  becomes Bucket 2.
- Ripple-delete of the family victim follows delete rules. Ripple movement caused
  by a different victim projects like move.

All of the above comes from B1.2 (`docs/11-lld-checklist.md:300-318`). Zero-length
pieces/tombstones must not be created; split itself partitions only strict,
positive interior pieces (`docs/11-lld-checklist.md:319-335`).

## 3. Conflict doors and exact resolutions

There are exactly three doors; fuzz must prove no conflict escapes them
(`docs/11-lld-checklist.md:336-358`).

| Bucket | Reachable cause | Fixed user-visible choices | Exact outcome |
|---|---|---|---|
| 1 — value/same-clip | Same atom changed to different values; or composed same-clip source-bounds, negative-start, or nonpositive-duration violation | `[Keep yours]`, `[Keep agent's]`, `[Keep original]` | Select the complete ours/theirs/base outcome for that conflicting atom/clip. All three buttons must be live. |
| 2 — delete vs change | One side deletes a base lineage while the other changes/splits it | `[Keep delete]`, `[Keep clip]`, `[Keep original]` | Delete the whole family; keep the changed family; or restore the unsplit base clip. Resurrection is legal only through this explicit choice. |
| 3 — join overlap | Both branch states are valid alone, but composition creates same-track overlap | `[Shift A]`, `[Shift B]`, `[Remove both — back to original]` | Shift the selected participant to the nearest fitting free slot; or revert both conflicting changes to base. A base-absent add disappears on base-revert. |

The Bucket-A-#8 amendment is binding: **overlap → B3; same-clip joint violation
→ B1**, not “every invariant failure → B3” (`docs/11-lld-checklist.md:359-376`).

Special non-conflict: normal delete vs rippleDelete of the same victim converges
to deletion plus the ripple side's one-sided downstream movement; the gap closes
(`docs/11-lld-checklist.md:377-391`).

## 4. Resolution machinery and determinism

### 4.1 Conflict order and identity

- Order: track stacking order (video → audio → text), then timeline start, then
  `rootId`, then `clipId` (`docs/11-lld-checklist.md:409-415`).
- Same inputs must produce the same conflict list in the same order.
- `conflictId` is content-addressed from conflict class + participant clips +
  atom. It must remain stable across recomputation (`docs/11-lld-checklist.md:428-430`).
- The hash algorithm and private collection choices are implementation details;
  stability and collision-safe deterministic encoding are the contract.

### 4.2 Parchi replay

- A click permanently adds one `conflictId → choice` answer to the choices-map.
- Recompute the entire merge from `base/ours/theirs` on every click, replaying all
  saved choices. Do not mutate the previous draft in place.
- Same choice-set must yield a byte-identical result regardless of click order.
- Unresolved conflict participants remain outside the materialized draft.
- A conflict discovered by the recompute appears immediately, in canonical order,
  with honest counts. `remaining` may rise.
- An already-materialized clip remains in the draft; it can become a new
  participant but never returns to “pending”.

Sources: B3.3/B3.4 (`docs/11-lld-checklist.md:416-447`) and the future storage
shape (`docs/11-lld-checklist.md:619-624`).

### 4.3 Termination

Use the amended proof only:

1. every click permanently answers one previously unanswered content-addressed
   conflict;
2. buttons create no new clips and every clip has a finite deterministic set of
   candidate positions/outcomes;
3. therefore the conflict-ID universe is finite; and
4. every click consumes one new member of that universe, so resolution terminates.

The old “pending clips strictly decrease” or “Shift alone cannot chain” proof is
superseded (`docs/11-lld-checklist.md:448-464`).

### 4.4 Shift

For Bucket 3 Shift (`docs/11-lld-checklist.md:564-576`):

1. search left and right for the nearest gap in which the full clip fits;
2. minimum distance wins, independent of side;
3. exact tie goes left;
4. a left placement crossing frame 0 is invalid, so use right;
5. the right side is unbounded, so Shift never fails; and
6. Shift changes timeline placement only, not source, duration, properties, or
   lineage.

## 5. Join invariant, error, and finalization boundaries

- M4 must reuse `checkInvariants()` from `invariants.ts`; no second invariant
  list (`docs/11-lld-checklist.md:359-376,496-505`).
- Invalid composed state must become the locked B1/B3 conflict, never an error,
  silent correction, clamp, or committed invalid timeline.
- A final result is available only when no unresolved conflict remains and the
  invariant sweep is clean. Zero-conflict start and the last choice complete
  automatically at the later server boundary (`docs/11-lld-checklist.md:720-728`).
- M4 may use only existing official codes. The pure boundary returns
  `E_MERGE_PRECONDITION` for the exact invalid-call cases in section 6.2; it does
  not throw. `E_STALE_HEAD` belongs to M7 CAS. No `E_ID_COLLISION` exists
  (`docs/11-lld-checklist.md:678-693`; C7 amendment dated 2026-08-04).
- Required determinism: same inputs/choices → byte-identical result; independent
  edits never conflict; finalized merge is invariant-clean; deleted content is
  never silently resurrected (`docs/07-session-progress.md:105-117`).

## 6. Required files, functions, types, and exports

### 6.1 Locked file changes

| File | M4 responsibility |
|---|---|
| `packages/engine/src/merge.ts` | Three-way compare/composition, split refinement, B1/B2/B3 conflicts, choices-map replay, dynamic conflicts, Shift, final check. C7 permits a private `merge/` folder only if `merge.ts` becomes genuinely too large; that is a code-time call (`docs/11-lld-checklist.md:769-788`). |
| `packages/engine/src/index.ts` | Export exactly the M4 public functions/types after their contract is locked. No M5 stubs. |
| `packages/engine/tests/merge.test.ts` | T1/T2 lock-prefixed merge unit/golden tests. Goldens stay in the area test file, not a new golden folder (`docs/12-test-benchmark-plan.md:17-23,48-49`). |
| M4 fuzz harness under `packages/engine/tests/` or another package-private test path | Seeded T3 generator/properties. Exact filename is not locked. |
| `packages/engine/package.json` | Add package-local `fuzz` command. |
| `.github/workflows/ci.yml` | Activate existing M4 T5 step 4 after tests and before the future M7 step 5 (`docs/12-test-benchmark-plan.md:92-103`). |
| `IMPLEMENTATION-NOTES.md` | Record only trivial code/tooling choices, not unresolved contract invention. |

### 6.2 Locked public surface

C7 requires M4 to add these three public functions:

- `startMerge`
- `applyChoice`
- `finalizeCheck`

Together with existing `applyCommand` and `computeDiff`, and future M5
`importOtio`/`exportOtio`, these form the seven-function API
(`docs/11-lld-checklist.md:777-783`).

Exact machine choices:

- B1: `ours | theirs | base`;
- B2: `delete | clip | base`; and
- B3: `shift-a | shift-b | base`, where `base` means “Remove both — back to
  original”.

Required exported boundary types are `ValueChoice`, `DeleteChoice`,
`OverlapChoice`, `MergeChoice`, `MergeChoices`, `MergeField`,
`ValueParticipants`, `DeleteParticipants`, `OverlapParticipants`,
`MergeParticipants`, `MergeConflict`, `MergeCounts`, `MergeSuccess`,
`MergeFailure`, `MergeResult`, and `FinalizeResult`. Their exact shapes are locked
in the C7 2026-08-04 amendment; the essential packet is:

```ts
type MergeSuccess = {
  ok: true;
  status: "ready" | "needs-resolution";
  timeline: Timeline;
  conflicts: readonly MergeConflict[];
  choices: Readonly<Record<string, MergeChoice>>;
  counts: { total: number; resolved: number; remaining: number };
};
type MergeFailure = {
  ok: false;
  error: { code: "E_MERGE_PRECONDITION"; message: string };
};
```

Participant refs are lightweight: B1 carries track, root/family, involved clip
IDs, and field; B2 carries track, root/family, and involved clip IDs; B3 carries
track and exactly two deterministically ordered clip IDs. B1 fields distinguish
`coverage-start` from `coverage-end` and cover timeline/source/property plus the
three same-clip joint-failure classes. No full clip copies or full input timelines
are returned.

Exact calls:

```ts
startMerge({ base, ours, theirs }): MergeResult;
applyChoice({ base, ours, theirs, choices, conflictId, choice }): MergeResult;
finalizeCheck({ base, ours, theirs, choices }): FinalizeResult;
```

`startMerge` and `applyChoice` return the same success packet. Its `timeline` is
the safe materialized draft; unresolved participants are absent. `conflicts`
contains only current unanswered conflicts; `choices` contains permanent saved
answers. `resolved = entries(choices)`, `remaining = conflicts.length`, and
`total = resolved + remaining`.

Every `applyChoice` call recomputes from the three inputs and replays saved
answers. Repeating the same saved choice is successful/no-change; replacing it
with a different choice is an error. `E_MERGE_PRECONDITION` is restricted to an
unknown/non-current conflict ID, a bucket-invalid choice, a different replacement
for a permanent answer, or finalization before a conflict-free invariant-clean
state. No throw/crash. Valid committed input timelines are assumed; M4 does not
add checks for forged IDs, corrupted JSON, or future unsupported states.

Stable `conflictId` hashes only the conflict/participant class, track, stable
clip/family IDs, B1 field, and deterministic B3 A/B order. Whole timelines,
explanations, counts, and resolution state are excluded. The hash primitive is
private.

## 7. Step-by-step implementation order

1. Add the locked merge boundary types/exports and a private lossless
   `MergeDelta` representation; keep all helpers pure and package-internal unless
   C7 requires export.
2. Build deterministic family indexing and common split refinement from the
   existing ID/lineage model. Start with same-cut/different-cut/adjacent-cut
   tests.
3. Normalize base/ours/theirs into B2.1 atoms and implement the five-row
   three-way rule (unchanged/one-sided/same-result/different-atom/same-atom).
4. Implement family projection and family-atomic delete handling from B1.2.
5. Run the shared join invariant sweep and map overlap → B3, same-clip joint
   failures → B1. Add no new invariant yet for I1.
6. Build typed conflicts, canonical order, stable content-addressed IDs, and
   editor-language explanations.
7. Implement choices-map replay from scratch, dynamic discovery, honest counts,
   and termination guards based on the finite-universe proof.
8. Implement deterministic Shift and all four Group-E goldens.
9. Complete all 34 M4-applicable T2 behaviors in section 8, reusing an existing
   exact regression only where it actually proves the same answer key.
10. Implement seeded T3 fuzz. Its lossless property uses private `MergeDelta`;
    public `computeDiff` remains unchanged and no public `applyDiff` is added.
    Include direct lineage-span assertions for I1; run 500 locally, then 10,000
    at the gate.
11. Resolve I1 from evidence, activate CI step 4, and run the full validation
    sequence.
12. Commit the focused M4 implementation only after all gates are green. Then
    perform the separately phased fresh read-only review against the committed
    diff and canonical docs; record findings before any fix pass.

## 8. Required golden / break-test matrix

T2 defines 44 named golden scenarios overall. Exactly **34 are M4-applicable**;
later rows are listed separately so they are not silently lost or pulled forward.
All names must carry the cited lock prefix (`docs/12-test-benchmark-plan.md:17-23`).

Citation shorthand inside the compact matrices only: `docs/07` =
`docs/07-session-progress.md`, `docs/09` = `docs/09-hld-checklist.md`, `docs/11`
= `docs/11-lld-checklist.md`, `docs/12` = `docs/12-test-benchmark-plan.md`, and
`docs/15` = `docs/15-codex-code-review-m2-m3.md`. Every following number is the
exact line range in the live `06c182d` source.

### Group A — split family (11)

| # | Required answer key | Lock/source |
|---:|---|---|
| A1 | split vs untouched → split survives automatically | B1.2; `docs/11:300-318`; T2-A `docs/12:34-36` |
| A2 | split vs property → project across base-valued pieces; divergent piece → B1 | B1.2; `docs/11:300-307`; T2-A |
| A3 | split vs move → whole family moves, cuts intact | B1.2; `docs/11:300-307`; T2-A |
| A4 | split vs slip → source offset projects across media pieces | B1.2; `docs/11:300-307`; T2-A |
| A5 | split vs trim-shrink → trim maps across refined pieces | B1.2; `docs/11:300-307`; T2-A |
| A6 | trim fully erases segment: edited segment → B2; unedited → auto-erase | B1.2; `docs/11:313-315`; T2-A |
| A7 | trim extension modifies the edge piece (advisor-fixed regression) | B1.2; `docs/11:300-307`; T2-A |
| A8 | split vs delete → one family-atomic B2; verify all three outcomes | B1.2/B2.2; `docs/11:308-310,336-342`; T2-A |
| A9 | same concurrent cut → same IDs, zero conflict | B1.1/B1.2; `docs/11:288-290,311-312`; T2-A |
| A10 | different cuts → union into three pieces, then recursive atom compare | B1.2; `docs/11:311-318`; T2-A |
| A11 | nested parent-chained name + advisor collision counterexample → IDs unique. Exact regression: split `A` at root-local 40 → `A@40`; delete the left `A`; start-extend `A@40` from span `[40,100)` to `[30,100)`; split it again at root-local 40 → new right ID must be `A@40@40`, never collide with parent `A@40`. | B1.1 `docs/11:272-299`; T2-A. Existing tests cover nested names, but no exact collision-counterexample test is present at `06c182d`. |

### Group B — compose/conflict (8)

| # | Required answer key | Lock/source |
|---:|---|---|
| B1 | move ⊕ trim → conflict-free composition | B2.1 `docs/11:252-271`; T2-B `docs/12:37-39` |
| B2 | opposite-edge trims touch separate boundary atoms: positive remainder auto-composes; zero/negative remainder → same-clip B1 | B2.1/B2.3; T2-B 2026-08-04 amendment |
| B3 | different move destinations → B1 | B2.1/B2.2; T2-B |
| B4 | property same value converges; different values → B1 (table rows) | B2.1/B2.2; T2-B |
| B5 | slip ⊕ extension whose combined source window is invalid → same-clip B1 | B2.3 `docs/11:359-376`; T2-B |
| B6 | combined negative timeline start → same-clip B1 | B2.3; T2-B |
| B7 | combined duration ≤ 0 → same-clip B1 | B2.3; T2-B |
| B8 | add + move composition causing overlap → B3 | B2.2/B2.3; T2-B |

### Group C — merge machinery (7 M4 + 1 deferred)

| # | Required answer key | Lock/source |
|---:|---|---|
| C1 | spurious-B3 advisor regression: base has `A=[0,10)`, `C=[20,30)` on one track; ours moves A→`[10,20)`; theirs moves A→`[30,40)` and C→`[0,10)`. Start with only A's move-vs-move B1—do not create B3 from an unresolved base placeholder. Keep-ours/theirs stays overlap-free; Keep-original dynamically creates the real A-vs-C B3. | T2-C `docs/12:40-42`; unresolved participants outside draft `docs/11:416-447,619-624` |
| C2 | swapped click order + same choices → byte-identical result | B3.3 `docs/11:416-432`; T2-C |
| C3 | a resolution-created dynamic conflict appears immediately with honest counts | B3.4 `docs/11:433-447`; T2-C |
| C4 | cascade including Remove-both-induced conflict terminates; old answers remain permanent | N4 `docs/11:448-464`; T2-C |
| C5 | normal delete vs rippleDelete → auto-converged ripple net effect, no conflict | B2.4 `docs/11:377-391`; T2-C |
| C6 | delete on both sides → converged absence, no conflict | B2.2 `docs/11:336-356`; T2-C |
| C7 | no automatic resurrection; B2 Keep clip/original may explicitly restore | BC.2 `docs/11:479-485`; `docs/07:108-112`; T2-C |
| C8 | merge abort leaves timeline untouched and deletes draft row | **M7 deferred**: no eighth engine function; `docs/09:192-200`, `docs/11:619-625,727-728` |

### Group D — identity/equality (4 M4 + 1 deferred)

| # | Required answer key | Lock/source |
|---:|---|---|
| D1 | trim + untrim is net unchanged; merge treats that side as untouched | B3.1 `docs/11:392-408`; T2-D `docs/12:43-44` |
| D2 | delete + identical-looking recreate stays delete old ID + add new ID | B3.1; T2-D |
| D3 | omitted defaults == explicit defaults; no false conflict | B3.1; T2-D |
| D4 | identical merge repeats with identical conflict order/result | B3.2 `docs/11:409-415`; T2-D |
| D5 | OTIO structural round-trip | **M5 deferred**: `docs/09:272-279`, `docs/07:356-357` |

### Group E — Shift (4)

| # | Required answer key | Lock/source |
|---:|---|---|
| E1 | compare nearest left/right gaps; minimum distance wins | C2 `docs/11:564-576`; T2-E `docs/12:45` |
| E2 | exact-distance tie → left | C2; T2-E |
| E3 | left would cross frame 0 → right | C2; T2-E |
| E4 | no interior fit → place at fitting end; right unbounded, never fail | C2; T2-E |

### Explicit later-test deferrals

- Group F adds no new M4 behavior: semantic diff rows are M3; A3.8 errors are
  M2; import warnings and missing-media/export-warning are M5/M7/UI
  (`docs/12-test-benchmark-plan.md:46-54`).
- All five Group-G tests are M7 server/state integration tests. G4 is
  merge-related but proves DB head CAS and transactional no-half-commit, not pure
  merge composition (`docs/12-test-benchmark-plan.md:55-68`).

## 9. T3 fuzz contract

### Generator

- 1–3 tracks, 0–30 clips, valid-by-construction and overlap-free; include empty
  timelines sometimes.
- From the same base, generate two sequences of 5–50 public verbs.
- Most choices are verb-aware/valid so code paths execute; a smaller portion is
  blind input to exercise typed rejection paths.
- IDs and any choice-selection policy must be seed-deterministic.

Source: `docs/12-test-benchmark-plan.md:69-80`.

### Required properties

| Property | Exact assertion | Source |
|---|---|---|
| T3-P1 | After every accepted edit, the single invariant list is clean. | `docs/12:73-76`; B2.3 `docs/11:371-375` |
| T3-P2 | `diff(A,A)` is empty. | `docs/12:74-75`; `docs/07:108-109` |
| T3-P3 | Private lossless `applyDelta(A, makeDelta(A,B))` byte-equals `B`; public semantic `computeDiff` is unchanged. | `docs/12:74-76`; T3 2026-08-04 amendment |
| T3-P4 | Same base/branches merged twice → byte-identical output. | `docs/12:75-76`; `docs/07:109-110` |
| T3-P5 | Every completed/resolved merge is invariant-clean. | `docs/12:75-76`; `docs/07:110` |
| T3-P6 | No silent resurrection; explicit B2 restoration is allowed and distinguishable. | `docs/12:76`; BC.2 `docs/11:479-485` |
| T3-P7 | All clip IDs remain unique. | `docs/12:76-77`; B1.1 `docs/11:272-299` |
| T3-P8 | Every conflict maps to Bucket 1/2/3; none is unbucketed. | B2.2 `docs/11:351-356` |
| T3-P9 | Choices resolve to completion within the finite conflict universe; print failing seed. | N4 `docs/11:448-464` |
| I1-P10 | Directly traverse every surviving clip after composition/replay and assert `lineage.span.duration.value > 0`; do not rely only on the current checker. | I1 `docs/15:116-158` |

Every run uses a numeric seed; failure prints it; the same seed reproduces the
same timeline, edits, choices, and failure. Run 500 local cases and at least
10,000 in CI (`docs/12-test-benchmark-plan.md:77-80`).

## 10. I1 reachable-scenario closure matrix

I1's original manually zeroed lineage fixture is unsupported and is **not** a
valid reason to add a check. Every row below must start from a valid base and
create both branches only through public `applyCommand` operations
(`docs/15-codex-code-review-m2-m3.md:36-51,116-158`).

| Reachable scenario | Expected locked result | I1 break-test witness | Evidence |
|---|---|---|---|
| move + trim | Different atoms compose. | Exact merged placement/coverage; positive lineage; branch swap byte-identical. | B2.1 `docs/11:252-267`; T2-B |
| move + valid start-extension that jointly crosses frame 0 | Same-clip B1, never silent fix/final. | All ours/theirs/base choices nonnegative with positive lineage. | B2.3 `docs/11:359-376` |
| opposite-edge trims leave ≥1 frame | Auto-compose. | Timeline/source/lineage boundaries exact and positive. | B2.1; BC.3 `docs/11:486-495` |
| opposite-edge trims collapse to exactly 0 | Same-clip B1. | Branch-derived combined candidate reaches zero; no hand mutation; all choices valid. | B2.3; two-phase `docs/07:171-179`; I1 gate `docs/15:120-129` |
| opposite-edge trims cross below 0 | Same-clip B1. | No clamp/delete/auto-fix; all choices valid. | Same as previous row. |
| same-edge trims | Same final value converges; different values → B1. | Exact positive ours/theirs/base spans. | B2.1/B2.2 `docs/11:252-267,336-356` |
| slip + extension | Valid source window composes; joint out-of-file → B1. | Positive lineage in valid row; invalid row cannot finalize before choice. | B2.3; T2-B |
| split + move/slip/property | Project across family. | No zero piece; non-trim family coverage unchanged. | B1.2 `docs/11:300-307` |
| split + trim shrink | Refine/map trim across pieces. | Exact surviving coverage; no gap/overlap/zero placeholder. | B1.2 `docs/11:300-315` |
| trim exactly erases a split piece | Unedited → auto-erase; edited → B2. | No zero tombstone; all B2 outcomes family-atomic and positive. | B1.2 `docs/11:308-315`; no tombstones `:291-295` |
| split + trim extension | Extend the edge piece. | Source/timeline partition exact; all piece spans positive. | B1.2; BC.3 |
| concurrent same cut | Auto-converge. | Two same-ID positive pieces; branch-order independent. | B1.1/B1.2 `docs/11:288-290,311-312` |
| concurrent different/adjacent cuts | Union/refine to three pieces. | Adjacent integer cuts yield a 1-frame, never zero, middle piece; IDs unique. | B1.2 `docs/11:311-318`; split proof `:319-330` |
| nested split from a valid merged base | Parent-chained rules continue. | Positive descendants, unique IDs, deterministic repeat. | B1.1 edge matrix `docs/11:291-298` |
| split family + delete | Family-atomic B2. | Keep-family/base outcomes contain positive spans; delete contains none. | B1.2/B2.2 |
| delete vs rippleDelete | Auto-converged delete+ripple. | Deleted victim absent; downstream lineage unchanged/positive. | B2.4 `docs/11:377-390` |
| add/move creates overlap | B3. | Shift changes placement only; base-revert removes base-absent add; positive lineage throughout. | B2.2/C2 `docs/11:336-350,564-576` |
| choice replay creates dynamic conflict | Immediate conflict + honest counts + eventual termination. | Inspect materialized clips at every recompute; positive lineage; click-order independence. | B3.3/B3.4 `docs/11:416-464` |
| lawful two-branch fuzz | Resolve to deterministic valid merge or typed conflicts. | Direct positive-lineage traversal, two-run equality, seed replay. | T3 `docs/12:69-80`; I1 `docs/15:131-150` |

### I1 exclusions

Do not use direct field mutation, forged `A@5` root IDs, caller-supplied IDs,
forced UUID collisions, corrupted snapshot rate/hash/ranges, cross-track moves,
speed changes, transitions, track mutations, M5 import behavior, M7 DB states, or
V2 workflows as proof (`docs/15:39-78`; `docs/11:280-290`; scope at
`docs/07:75-103`).

### I1 closure rule

1. Run the deterministic matrix and T3 fuzz with direct lineage assertions.
2. If a lawful merge produces zero/negative lineage in any transient or result
   state, or the join boundary demonstrably needs the safeguard, add
   `lineage.span` to the existing nonpositive-duration violation, reuse
   `E_INVALID_RANGE`, and keep the regression branch-command-derived.
3. If proof-by-construction keeps lineage positive across every supported path,
   add no redundant runtime check; formally reconcile the old “every TimeRange”
   wording and close I1 with evidence.

Do not invent a new universal `lineage.duration === timeline.duration` invariant.
Scenario tests may assert the exact add/trim/split lockstep outcome, but I1 only
asks whether positive lineage duration is a necessary runtime invariant.

## 11. Decision closure and one evidence-gated item

There are **no remaining pre-implementation owner decisions**.

- **U1 resolved 2026-08-04:** section 6.2 and the canonical C7 amendment lock
  exact functions/results, exported boundary types, choices, participant refs,
  counts, retry behavior, stable conflict identity, and the narrow
  `E_MERGE_PRECONDITION` boundary.
- **U2 resolved 2026-08-04:** T3 uses a private lossless `MergeDelta` (or
  equivalent private machinery). Public semantic `computeDiff` is unchanged;
  there is no public `applyDiff` or eighth function. Canonical record: docs/12 T3
  amendment.

### U3 — I1 runtime check is deliberately evidence-gated (not a pre-code blocker)

Whether to add lineage-span nonpositive-duration checking remains open until the
section-10 matrix and fuzz run. This is the exact owner gate in
`docs/15-codex-code-review-m2-m3.md:120-129` and
`docs/07-session-progress.md:419-423`.

No other live M4 scope contradiction survived amendment precedence. In
particular, forged split IDs (I2) and directly corrupted JSON/rates/media (I3)
remain unsupported non-bugs (`docs/15-codex-code-review-m2-m3.md:53-78`).

## 12. Validation commands

Focused development convenience:

```bash
pnpm --filter @framebranch/engine test -- merge.test.ts
```

Required final sequence:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @framebranch/engine fuzz
```

Acceptance evidence for the `fuzz` command must state the numeric seed and prove
that CI mode executed at least 10,000 cases. Local quick mode must execute 500.
The exact CLI/env spelling for quick mode and seed replay is a trivial harness
choice to record in `IMPLEMENTATION-NOTES.md`; T5 already fixes the CI command
shown above (`.github/workflows/ci.yml:41-45`). Benchmarks, M7 coverage/gap, M5
round-trip, and M7 Group-G tests are not part of this gate.

## 13. Completion checklist

- [x] U1-U2 are discussed and locked before implementation starts.
- [ ] Only M4 files/scope are changed; no M5/M7/M8/V2 implementation appears.
- [ ] `merge.ts` remains pure: no DB/network/UI imports and no mutation of inputs.
- [ ] `startMerge`, `applyChoice`, `finalizeCheck` match the newly locked exact
      public contract and are exported only through `index.ts`.
- [ ] Five-row three-way atom rule is complete and deterministic.
- [ ] Split same-cut/different-cut/refinement/projection/family-delete rules pass.
- [ ] Every conflict is B1/B2/B3, with exact fixed choices and no fourth door.
- [ ] Conflict order and IDs are stable across repeated recomputation.
- [ ] Parchi replay is click-order independent and dynamic counts are honest.
- [ ] Remove-both uses base-revert; already-materialized clips never return pending.
- [ ] Finite-universe termination passes deterministic cascade tests and fuzz.
- [ ] Shift passes nearest/tie/zero-bound/end-placement tests and never fails.
- [ ] All 34 M4-applicable T2 answer keys are accounted for by an exact new or
      proven-existing test; deferred rows remain deferred.
- [ ] T3 properties P1-P9 and I1-P10 pass with seed replay.
- [ ] I1 is closed exactly by section 10's evidence rule.
- [ ] 500 local fuzz cases and at least 10,000 CI cases pass.
- [ ] T5 CI step 4 is active; M7 step 5 remains deferred.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and fuzz are green.
- [ ] Focused M4 implementation commit is created only after green validation.
- [ ] Fresh final review is a separate read-only phase against the committed diff
      and canonical docs; findings are recorded before any fix pass.
- [ ] No PR is created by Codex. Push only after the milestone is actually green
      and the owner wants the focused commit posted.
