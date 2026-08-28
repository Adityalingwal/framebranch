# FrameBranch — Algorithms

## The Diff Algorithm

Comparing two versions of a timeline works in three steps.

1. **Match** — find the same clip in both versions, using its stable ID, not its position. A clip keeps its identity even after being moved or split.
2. **Classify** — for each matched clip, figure out what kind of change happened: moved, trimmed, its source window shifted, a property changed (volume, opacity, scale, position, text), added, removed, or split into two. Each kind of change has its own fixed rule — there's no guessing involved.
3. **Render** — turn that classification into a plain-English sentence an editor can read, like "Clip A trimmed by 2s at the end" or "Volume changed from 50 to 80."

```mermaid
flowchart LR
    A[Two timeline versions] --> M[Match: pair clips by stable ID]
    M --> C[Classify: what kind of change?]
    C --> R[Render: plain-English sentence]
```

**Example.** A clip named "A" runs from 5s to 15s in one version. In the other, it's been trimmed to end at 12s. Match finds it's the same clip (same ID). Classify sees only its length changed, from the end. Render produces: "Clip A trimmed by 3s at the end."

A clip can have more than one kind of change at once — each gets its own sentence.

**Nothing gets missed.** The classify rules cover every field a clip can have: its position, its length, which part of the source file it shows, its properties, whether it exists at all, and whether it split. If a change ever doesn't fit one of these rules, the diff still describes it honestly — the raw before-and-after values — instead of crashing, staying silent, or guessing. There's always a truthful answer, never a missing one.

**Why there's no AI in this step.** A diff has to be exactly right every time, not just usually right — that's why this whole process is deterministic: fixed rules, fixed sentences, nothing that could produce a wrong or misleading description.

## Split Identity

When a clip is split into two, each piece needs an identity that stays stable for future edits and merges to refer to.

**The rule.** The left piece keeps the original clip's ID exactly as it was — only its length is now shorter, but it's still "the same clip." The right piece gets a new ID built from a formula: the original clip's ID plus the cut position measured in the clip's **lineage coordinate** — not its current timeline position. These are the same number only if the clip has never been trimmed or split before; after a trim, the lineage coordinate stays anchored to where the clip's content originally started, so the same logical cut always produces the same ID even if the clip has since moved. Splitting clip "A" at the 5-second mark (with no prior edits) produces "A" (left) and "A@5" (right). If "A@5" gets split again later, its right piece becomes "A@5@8" — the formula just extends, no matter how many times a clip gets split. If that computed ID is already in use by another live clip, it's extended further (`A@5@5`) until it's unique.

**Three coordinates, not one.** It's worth keeping these distinct:

- **Timeline coordinate** — where the clip sits on the timeline right now. Changes on every move.
- **Current-clip offset** — how far into *this piece* (as it exists now) the cut is. Used to compute the new source/timeline ranges for both pieces.
- **Root-local lineage coordinate** — the cut's position measured against the original, never-edited clip. This is the one used for identity, because it's the only one two independently-edited branches can compute identically.

```mermaid
flowchart LR
    A["Clip A (0s-15s)"] -->|split at 5s| L["Clip A (0s-5s), same ID"]
    A -->|split at 5s| R["Clip A@5 (5s-15s), new ID"]
```

**Why a formula instead of a random ID.** Suppose a person and the agent each split the exact same clip at the exact same position, on two separate branches, without knowing about each other's edit. Because the new ID is always computed the same way from the same inputs, both branches independently produce the exact same ID for the new piece. When the branches are merged, the system recognizes this immediately — same ID means same piece — and there's no conflict at all. If IDs were assigned randomly instead, the system would need extra logic just to notice two differently-named pieces are actually the same content.

**When a split meets another kind of edit.** If one branch splits a clip and, separately, another branch moves, trims, or changes a property on that same original clip, the second branch's single edit applies to every piece that came from the split — moving the clip moves both new pieces together, keeping the cut between them exactly where it was. If the other branch deleted the clip instead, that becomes one conflict covering every piece from the split, resolved together — so it's never possible to end up with half the split resolved and half of it hanging.

## The Merge Algorithm

**Comparing at the attribute level, not the clip level.** When two branches are merged, each clip is broken down into its individual attributes: where it sits on the timeline, how long it is, which part of the source file it uses, each of its six properties, and whether it exists at all. Two edits only conflict if they changed the exact same attribute of the exact same clip. If they changed different attributes — one side moved a clip, the other side trimmed it — both changes apply provisionally. The combined result is then checked against the timeline's rules (no overlaps, positive duration, source range within bounds, and so on) — if it still holds, there's nothing to resolve; if combining two otherwise-fine changes breaks a rule, that becomes a conflict (bucket 3, below).

**Example.** On one branch, a clip is moved 3 seconds later. On another branch, the same clip's start is trimmed by 2 seconds. These touch different attributes (position vs. length), so the merge applies both — the result is the moved, trimmed clip.

```mermaid
flowchart TD
    A[Two branches edited the same clip] --> B{Same attribute changed on both sides?}
    B -->|No| C[Both changes apply automatically]
    B -->|Yes, to different values| D[Conflict]
```

**Only three kinds of conflict can ever happen.** Comparing two clips only ever asks three questions: does the clip exist on both sides? did the two sides set the same attribute to different values? and does combining two individually-fine changes break a rule, like causing an overlap? Nothing else is possible — those three questions cover every field a clip can have, so a conflict can never fall outside the three buckets the interface shows.

**Resolving conflicts.** Every time a person clicks a resolution button, that choice is saved permanently, and the entire merge result is recalculated from the beginning using every saved choice so far, rather than editing a half-finished draft directly. Clicking conflicts in a different order never changes the outcome, and nothing is lost if the connection drops mid-resolution — reopening the merge picks up exactly where it left off.

**Why it always finishes.** Resolving one conflict can sometimes reveal a new one — moving a clip out of one overlap's way might create a different overlap somewhere else. The implementation always terminates — it runs in a bounded loop (a fixed cap on passes, sized to the number of clips and conflicts), so it can never loop forever. Whether it terminates *successfully* is a separate question: if a clean, conflict-free result isn't reached within that bound, the merge fails with `E_MERGE_PRECONDITION` rather than committing something broken — nothing is lost, the merge simply doesn't finalize.

**The "shift" rule.** When a conflict is resolved by shifting a clip out of the way, it always moves to the nearest empty gap it fits into — whichever side is closer wins, and an exact tie goes to the earlier side. There's always room somewhere further along the timeline, so this option can never fail.

**One case needs no conflict check at all.** Ripple-delete — the operation that removes a clip and shifts everything after it left to close the gap — never needs to check for overlaps afterward. Since every clip after the deleted one shifts by exactly the same amount, the spacing between them never changes; this operation cannot create a new overlap.

## Complexity & Contracts

**Diff output order is fixed, not incidental.** Entries are sorted by track, then timeline position (start, then end), then split lineage, then clip ID. Running the same diff twice always produces byte-identical output — this is enforced by a determinism test, not just an accident of implementation.

**Merge inputs are read-only.** `startMerge` takes `base`, `ours`, and `theirs` as three separate timelines. None of the three is ever modified — the merge works on internal copies, so the caller's original timelines are always safe to keep using.

**Complexity.** `computeDiff` is O(n log n) in the number of clips (matching and classifying are linear; the final sort dominates). Overlap detection inside merge is a pairwise scan per track — O(n²) in clips on that track — repeated once per conflict-resolution pass, so a merge with many conflicts costs more than one with few.

**What `rawChanged` means.** Most changes are classified semantically (moved, trimmed, property changed, and so on). A small set of changes don't fit any of those categories — for example a clip's kind flipping between text and media, or a cross-track move. These fall back to `rawChanged`: the diff reports the literal before/after values instead of a semantic description, so nothing is ever silently dropped, even for a change type the classifier doesn't have a name for.

**Conflict vs. failure.** These are two different outcomes and shouldn't be confused. A **conflict** is an expected, normal part of a merge — two branches genuinely diverged, and a person needs to pick an outcome; the merge is still "working." A **failure** (`E_MERGE_PRECONDITION`) means the merge itself can't proceed — an invalid resolution choice was submitted, or the merge state can't reach a valid result. A failure never leaves the timeline half-changed; nothing commits until the merge finalizes cleanly.

**Determinism is tested, not assumed.** The engine's test suite checks this directly: running the same diff twice produces identical output; resolving the same merge conflicts in a different click order produces the same final timeline; retrying an already-applied choice is a no-op that returns the same result.
