# Codex PRD Review — FrameBranch

- **Review date:** 2026-08-01
- **Reviewer:** Codex CLI (`codex exec`, non-interactive, `--sandbox read-only`)
- **Scope:** PRD / plan review only (docs/07-session-progress.md sections 5.1–5.5, plus all other markdown files in this folder). No code exists yet; no code was reviewed or written.
- **Status:** Pending Aditya's review. These findings are **not auto-accepted** — each one needs to be individually judged for applicability, severity, and whether it actually applies to FrameBranch's V1 scope before any decision or doc change is made.

---

# Findings

## 1. Manual conflict resolution is not implementable as specified

Severity: Critical

PRD section: 5.3 Conflict UX; 5 supported conflict-resolution controls

Failure scenario: "If the user clicks `Manual` on a trim-vs-trim conflict, then the product has no defined interaction for choosing the resulting source range, because Level 2 rejects drag/live-preview editing while the plan never defines what Manual actually opens or edits."

Question for plan owner: Does `Manual` mean selecting individual fields, entering exact time values, choosing a third precomputed option, or opening a constrained editor? Which fields can be manually edited for each conflict bucket?

---

## 2. Split identity rules are contradictory and insufficient for merge

Severity: Critical

PRD section: 5.2 supported operations; stable-ID invariant; docs/04 stable identity risks

Failure scenario: "If one branch splits Clip A into A-left and A-right while another trims or moves Clip A, then merge cannot determine whether the second branch targeted the original whole clip, one child segment, or both, because the plan requires stable identity after split without defining parent/child lineage or matching rules."

Question for plan owner: After a split, does the original ID remain as one child, become a parent-only tombstone, or produce deterministic child IDs? How are split-vs-split, split-vs-trim, and split-vs-delete merged?

---

## 3. Ripple delete has no defined multi-track semantics

Severity: Critical

PRD section: 5.2 ripple delete; 5.1 9-step demo; multi-track timeline model

Failure scenario: "If the user ripple-deletes a video clip on Track 1 while audio, captions, or B-roll exist downstream on other tracks, then either those tracks drift out of sync or unrelated material moves unexpectedly, because the plan does not say whether ripple applies to one track, all tracks, linked tracks, or a selected time range."

Question for plan owner: Is ripple delete track-local, project-wide, or link-group-based? What exactly is removed: the clip duration, the selected timeline interval, or the clip plus its gap?

---

## 4. OTIO identity and round-trip behavior are underspecified

Severity: Critical

PRD section: OTIO import/export boundary; 5.5 OTIO round-trip success criterion

Failure scenario: "If a timeline is exported to OTIO and re-imported, then stable clip identity may be lost or regenerated, because OTIO interchange does not automatically guarantee FrameBranch's internal clip IDs across arbitrary adapters or external editing tools."

Question for plan owner: Which OTIO metadata field carries FrameBranch IDs and lineage? What happens when metadata is missing, duplicated, altered, or stripped by another tool? Is round-trip equality required only for FrameBranch-generated OTIO, or for externally edited OTIO too?

---

## 5. The eight operations do not have precise state-transition contracts

Severity: Critical

PRD section: 5.2 supported operations; docs/04 operation contract checklist

Failure scenario: "If an engineer implements `move`, `trim`, or `slip` from the current wording, then two reasonable implementations can produce different timelines, because the plan does not define which range changes, whether track changes are allowed, how collisions are handled, or whether time values snap to frames."

Specific gaps include:

- `move`: timeline position only, track movement too, or both?
- `trim`: does trimming start/end alter source range, timeline range, or both?
- `slip`: does duration remain fixed, and how are source bounds enforced?
- `add clip`: can it target only existing tracks?
- `property change`: which properties are allowed and what types/ranges do they have?
- `split`: what happens at the first frame, last frame, or an exact boundary?
- `ripple delete`: what is the operation's canonical input and inverse?

Question for plan owner: Can each operation be specified as a typed command with preconditions, exact state transition, inverse, canonical serialization, and failure result before HLD begins?

---

## 6. The conflict buckets are not exhaustive for operation interactions

Severity: Critical

PRD section: 5.3 Conflict UX; three conflict buckets

Failure scenario: "If one branch slips Clip A while the other trims its timeline end, then the system must decide whether these are compatible source/timeline edits or a same-value conflict, but none of the three buckets expresses the distinction clearly."

Additional counterexamples:

- Split-vs-trim on the same clip.
- Move-vs-ripple-delete where the move target is shifted by ripple.
- Two independent moves that become overlapping only after both are applied.
- Add-vs-add with colliding IDs or overlapping placement.
- Two ripple deletes whose affected ranges overlap partially.
- Property change versus delete followed by restore.
- Split-vs-split at different boundaries.

Question for plan owner: Are the three buckets only UI presentation patterns, with a richer internal conflict classification underneath? If yes, which internal conflict classes exist and how does each map to a bucket?

---

## 7. "Independent changes never conflict" is not defined well enough to test

Severity: Critical

PRD section: 5.5 merge invariants

Failure scenario: "If two branches move different clips into the same destination interval, then both edits may be independent by clip ID but still violate the no-overlap invariant, so the assertion 'independent changes never conflict' becomes false or requires an unstated definition of independence."

Question for plan owner: Is independence based on element identity, affected time interval, track, property path, or final invariant impact? Which rule wins when changes are independent syntactically but incompatible structurally?

---

## 8. The no-overlap invariant is not enforceable without a merge policy

Severity: Critical

PRD section: 5.5 merge invariants; timeline invariant

Failure scenario: "If two branches add or move clips onto the same track and their combined result overlaps, then post-merge validation detects an invalid timeline, but the plan does not specify whether to reject the merge, convert it into a conflict, shift one clip, or preserve the invalid intermediate state."

Question for plan owner: Is an invariant violation after merge always converted into conflict bucket 3? What data is shown to the user, and can the merge be partially accepted?

---

## 9. Diff source of truth is ambiguous: operation history versus net state

Severity: Important

PRD section: 5.2 operation log; docs/07 VCS fundamentals; semantic diff design

Failure scenario: "If a user trims Clip A and then trims it back to its original range before committing, then a snapshot diff says 'no changes' while the operation log contains two edits, because the plan stores both operation history and net-state comparison without defining which one the user sees."

The same issue appears when:

- A clip is moved twice.
- A property is changed and then reverted.
- A clip is split and later recombined through another sequence.
- An agent performs several low-level operations for one editorial intention.

Question for plan owner: Is semantic diff based on final state, operation intent, or both? If both are shown, which one is authoritative for merge and conflict detection?

---

## 10. Commit, working-tree, and branch semantics are incomplete

Severity: Important

PRD section: 5.1 demo story; immutable commits; branch lifecycle

Failure scenario: "If the user edits a branch and switches branches before committing, then the product must either preserve, discard, or block those changes, but the plan only defines branch create and switch."

Still unspecified:

- Can a branch contain uncommitted changes?
- Does every simulated-agent action auto-commit?
- Can a merge operate on uncommitted state?
- What happens when switching away from a dirty branch?
- Is restore a new commit or a destructive pointer move?
- Is a merge commit mandatory after resolution?

Question for plan owner: What is the exact state machine for `HEAD`, working timeline, branch pointer, commit, restore, and merge?

---

## 11. Storage model is too vague to support the stated guarantees

Severity: Important

PRD section: hybrid snapshots + operation log; medium-advanced storage capabilities; 5.5 benchmarks

Failure scenario: "If a project has a deep commit DAG and the snapshot cadence is not defined, then restoring or opening a branch can require unbounded replay, because neither snapshot frequency nor compaction rules are part of the locked design."

Other missing correctness decisions:

- Is the snapshot or operation log canonical?
- Are snapshots per commit, periodic, or branch-specific?
- How are merge commits replayed?
- How are operation IDs deduplicated during retries?
- Is commit creation atomic with branch-pointer movement?
- Can garbage collection remove unreachable commits?
- Does compaction preserve provenance and audit history?

Question for plan owner: What storage behavior must V1 actually demonstrate, and what bounded replay or snapshot guarantee is required?

---

## 12. Optimistic concurrency is named but not behaviorally specified

Severity: Important

PRD section: locked concurrency decision; 5.1 one user + one agent

Failure scenario: "If the user commits while the simulated agent is based on an older branch head, then the second commit must either fail, create a sibling commit, or automatically rebase, but the plan does not choose one."

Question for plan owner: What is the stale-head response? Return a conflict, require refresh, create a new branch, or allow commit against the old parent? What makes retry idempotent?

---

## 13. Rational-time and frame-rate rules are not frozen

Severity: Important

PRD section: domain glossary; 5.5 time arithmetic tests; OTIO boundary

Failure scenario: "If a 24 fps source is placed into a 29.97 drop-frame timeline and a trim lands between representable frames, then different rounding choices can change duration or source boundaries, because the plan does not define the project timebase, conversion direction, or rounding mode."

Missing decisions include:

- One project frame rate versus mixed frame rates.
- Whether all internal times are frame counts, rational seconds, or both.
- Rounding mode for non-integral frame boundaries.
- Time origin and negative-time policy.
- Drop-frame timecode parsing/export.
- Whether source and timeline rates can differ.
- Whether speed changes are supported as generic properties.
- Whether timecode display is informational or authoritative.

Question for plan owner: What exact time representation and rounding contract must every operation and OTIO adapter obey?

---

## 14. Empty and degenerate cases are listed but not behaviorally defined

Severity: Important

PRD section: 5.1 edge cases; 5.5 edge-case tests

Failure scenario: "If a split is requested at the first frame, a delete targets an already-deleted clip, or ripple delete removes the final clip, then the system needs a deterministic no-op/error result, but the plan only says these cases should have tests."

Cases requiring explicit outcomes:

- Empty timeline with no tracks.
- Empty timeline with tracks.
- Add clip to a missing track.
- Zero-duration clip import.
- Split at start/end boundary.
- Trim beyond source bounds.
- Slip beyond source bounds.
- Move onto an occupied track.
- Delete already-deleted element.
- Edit an element deleted on the current branch.
- Merge where one side deletes everything.
- Missing media reference during preview/export.

Question for plan owner: For each invalid or degenerate command, is the result a typed error, no-op, conflict, or normalization?

---

## 15. Generic property change secretly reintroduces cut scope

Severity: Important

PRD section: 5.2 generic property change; 5.4 transitions/effects/track-reorder non-goals

Failure scenario: "If `property change` accepts arbitrary OTIO effect, transform, speed, opacity, audio, caption, or transition-like fields, then V1 becomes an unbounded effects compatibility project, because the generic verb has no whitelist."

The cut operations are mostly defensible:

- Separate caption verbs are unnecessary if text clips are fully supported.
- Direct timeline-range change is algebraically covered by move plus trim.
- Track reorder is not required for the stated demo.
- Transitions and named effects have difficult merge semantics.

But the generic property operation must not become an escape hatch for all of them.

Question for plan owner: What exact property schema is supported in V1? Are properties limited to a small explicit set such as text content, volume, opacity, and transform?

---

## 16. Text clips are treated as captions, but their lifecycle is underspecified

Severity: Important

PRD section: 5.2 caption cut; text clips on text track

Failure scenario: "If captions are represented as text clips, then adding, deleting, moving, splitting, and changing caption content must all work through the eight verbs, but the plan does not define caption timing, text identity, styling, or whether caption clips may overlap."

Question for plan owner: What is the minimum text-clip schema and which text properties are demo-supported? Are captions ordinary clips in every operation and conflict rule?

---

## 17. Unsupported OTIO constructs have no import policy

Severity: Important

PRD section: OTIO import/export boundary; 5.5 invalid OTIO test

Failure scenario: "If an input OTIO contains transitions, effects, nested compositions, markers, external references, mixed rates, or unsupported schema features, then the importer may silently drop editorial meaning unless the plan explicitly says to reject or preserve them."

Question for plan owner: Is import fail-closed, partially lossy with warnings, or normalization-based? What qualifies as a clean error versus a successful import with warnings?

---

## 18. OTIO schema/version compatibility is missing

Severity: Important

PRD section: OTIO boundary; serialization/versioning requirement

Failure scenario: "If OTIO changes schema version or an external producer emits a newer/older JSON representation, then the hand-written TypeScript reader may accept an apparently valid document with changed semantics, because no supported OTIO schema-version range or compatibility policy is specified."

Question for plan owner: Which OTIO schema versions are supported, how are versions detected, and what happens when the version is unknown?

---

## 19. Asset immutability is asserted but not enforceable from a pointer alone

Severity: Important

PRD section: media bytes non-goal; immutable asset references; missing-media tests

Failure scenario: "If a local media file at the same path is replaced after import, then the timeline still points to that path while the claimed asset identity remains ambiguous, because a path is not immutable and a fingerprint may not be revalidated."

Question for plan owner: Does V1 copy assets into managed storage, store a content hash, reject changed files, or allow missing/stale references with placeholders?

---

## 20. The success checklist contains unmeasurable claims

Severity: Important

PRD section: 5.5 success criteria

Failure scenario: "If the demo works but one reviewer considers it 'atke' due to an unclear error or an extra manual step, then the functional stop-rule becomes subjective, because 'end-to-end without getting stuck' has no acceptance definition."

Other unmeasured criteria:

- "Valid OTIO" lacks a validator and supported subset.
- "Thousands" of fuzz cases has no exact minimum.
- "Independent changes never conflict" lacks a formal fixture definition.
- "No invariant broken" lacks a complete invariant list.
- `X ms` benchmark output has no target, environment class, or pass/fail threshold.
- "Vercel live link" lacks uptime or reproducibility criteria.
- "2–3 minute demo video" measures artifact length, not product quality.

Question for plan owner: Which checklist items are binary acceptance tests, and what exact fixtures, thresholds, counts, and expected outputs define pass/fail?

---

## 21. Earlier documents and the canonical PRD are not fully reconciled

Severity: Minor

PRD section: docs/07 canonical status versus docs/04 and docs/05 background

Failure scenario: "If a future engineer follows docs/04's operation vocabulary or non-goals instead of docs/07's locked cuts, then they may implement transitions, separate caption operations, track reorder, or full effect support that the canonical PRD intentionally removed, because the documents do not clearly mark the earlier lists as superseded."

Examples:

- docs/04 lists transitions and effects among versioned state.
- docs/04 lists 11 non-goals, while docs/07 locks a different 10-item list.
- docs/05's required reading order omits docs/07 even though docs/07 is declared canonical.
- docs/03 still describes a broader medium-advanced scope containing capabilities now outside the locked V1.

Question for plan owner: Should docs/07 explicitly supersede conflicting sections in docs/03–06, and should the handoff reading order make docs/07 mandatory first or last?

---

## 22. No explicit policy exists for semantic equivalence and canonical operation ordering

Severity: Minor

PRD section: diff invariants; operation log; deterministic merge

Failure scenario: "If one branch performs `move → trim` and another performs `trim → move` to reach the same final state, then diff and merge may classify them differently, because the plan does not define canonical operation ordering or state-based equivalence."

Question for plan owner: Should merge compare normalized final state, canonical operation intent, or both? How are equivalent operation sequences represented in the diff?

---

# Decisions needed from Aditya

1. Define the exact `Manual` conflict-resolution interaction for each conflict bucket.
2. Lock split lineage semantics: parent/child IDs, child-ID generation, tombstones, split-vs-edit behavior, split-vs-split behavior.
3. Decide ripple-delete scope: one track, all tracks, linked tracks, or explicit selected range.
4. Define the V1 operation contracts for move, trim, slip, add, split, property change, delete, and ripple delete.
5. Decide whether movement across tracks is supported. If yes, decide how track targeting works without track-reorder or track-create operations.
6. Define the supported property whitelist and explicitly exclude unsupported effects, transitions, speed changes, or other hidden scope.
7. Decide whether captions/text clips are ordinary clips in all operations and define their minimum schema.
8. Define the three conflict buckets as UI groupings or as the complete internal conflict taxonomy.
9. Decide whether conflicts are detected from operation intent, final state, or both.
10. Define what "independent" means for the merge invariant.
11. Choose the merge behavior when post-merge invariants fail: automatic conflict, reject entire merge, partial merge, or deterministic normalization.
12. Define branch and working-tree behavior: uncommitted edits, branch switching with dirty state, automatic versus explicit commits, restore semantics, merge commit semantics.
13. Choose the canonical storage model: full snapshot per commit, operation log plus periodic snapshots, or another hybrid, and set a bounded replay requirement.
14. Define stale-head behavior under optimistic concurrency and retry/idempotency keys.
15. Lock the rational-time contract: project frame rate, mixed-rate policy, internal representation, rounding mode, drop-frame handling, source/timeline rate conversion.
16. Decide outcomes for invalid and degenerate operations: typed error, no-op, conflict, or normalization.
17. Define the OTIO supported subset and unsupported-input policy: fail, warn and drop, preserve as opaque data, or normalize.
18. Choose the supported OTIO schema-version range and unknown-version behavior.
19. Decide how FrameBranch IDs survive OTIO export/import and what happens when external tools strip metadata.
20. Decide the asset-reference guarantee: managed copy, content hash validation, path-only reference, or explicit stale/missing-media state.
21. Convert the success checklist into measurable acceptance tests with exact fixture names, fuzz-test counts, benchmark repetitions, performance thresholds, round-trip equality definition, and demo pass/fail steps.
22. Mark docs/03–06 sections that are superseded by docs/07, especially the broader operation list, non-goals, reading order, and medium-advanced scope.
