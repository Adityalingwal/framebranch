# FrameBranch — Open Questions

These are genuinely unresolved questions — points where more than one reasonable answer exists, and the right call needs team discussion rather than a solo decision. Assumptions and design choices that were already made, with their reasoning, live in the High-Level Design and Low-Level Design documents instead.

## Which should be built first — version control or real-time collaboration — and does one depend on the other, or sit on top of it?

FrameBranch tackles the version-control problem — branches, diffs, merges, conflict resolution for video. Real-time collaboration (multiple people editing the same project live) is a separately hard problem for video, since syncing large media assets across clients in real time is a very different engineering challenge from syncing a text document.

The open question is sequencing: does a version-control system like FrameBranch make sense as the foundation, with real-time collaboration added later as a layer on top (so live edits still get committed and merged like any other change)? Or does real-time collaboration need its own foundational infrastructure first, with branching and merging built on top of that?

## When a real AI agent replaces the scripted demo button, should its edits commit automatically, or go through a review step first?

Right now, when the simulated agent's run finishes successfully, all of its edits commit as one unit, immediately and automatically — there's no approval step. (A person's individual edits work differently: each one is held as a pending change until it's explicitly saved, which is a separate mechanism, not a review step.) The person reviews what the agent did afterward, through the normal diff and merge screens.

A real AI model could behave differently: it might make many more edits in a single run, and not every edit it proposes would necessarily be good. Two approaches are possible. The first keeps today's design unchanged — the agent's edits commit directly, and the existing diff/merge screens are the review step, just after the edits already happened. The second adds a new review step before anything commits — the agent proposes its edits, the person approves or rejects the batch, and only then does it become a commit.

The first option needs no new system — it reuses everything already built. The second is safer against a model that makes more mistakes than the scripted demo does, but needs a new proposal-and-approval flow that doesn't exist yet.

## Should deleting a clip also shift its linked clips on other tracks, or stay limited to one track?

Ripple-delete removes a clip and shifts everything after it on the same track to the left, closing the gap. It currently only affects the track the deleted clip was on.

If a video clip and its matching audio clip sit on separate, linked tracks, ripple-deleting from one track leaves the other untouched — the two tracks fall out of sync from that point onward. Fixing this would mean introducing a concept of "linked clips" that don't exist in the system yet, and deciding how ripple-delete (and possibly other operations) should treat them.

Two approaches are possible: keep ripple-delete track-only, and leave cross-track syncing as something the person manages by hand; or add a linked-clip concept and have ripple-delete shift every linked track together.

## Could AI-generated naming ever safely replace or supplement the fixed templates?

Commit and branch names are currently built from fixed templates ("Auto — before merge") with detail pulled straight from the operation log ("2 trims, 1 move"). AI naming was deliberately left out of version 1 for the same reason AI was kept out of the diff engine: a template can never be wrong, but an AI-generated name can — and a misleading name in a version-control history is a trust problem, not a cosmetic one.

Adding AI naming later would also mean adding a network call to an AI model on the naming path — where naming today is instant and happens entirely on the machine, an AI-generated name would depend on an external request completing, with its own latency and cost, every time.

If AI naming is ever added, it would need to solve both problems at once: staying accurate enough not to mislead, and not slowing down or complicating an operation that currently has no dependency on anything external.
