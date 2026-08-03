# FrameBranch Agent Handoff

> ⚠️ **Read `docs/07-session-progress.md` FIRST.** It is the canonical, most current record: locked PRD (5.1–5.5), Codex review resolutions, build philosophy, and roadmap. This handoff and docs/01–06 are background; where they conflict with docs/07, docs/07 wins.

## Use this document when

Paste or attach this file when asking Claude Code, Codex, or another engineer/research agent to continue FrameBranch. The complete source material remains in the other documents in this folder.

## Project summary

FrameBranch is a proposed semantic version-control system for video timelines.

It should let an editor or editing agent:

- Branch from an existing timeline
- Commit timeline-aware operations
- Compare two versions using editorial language
- Merge independent edits automatically
- Surface genuine video-domain conflicts
- Resolve conflicts and restore history
- Import/export an industry-grounded timeline representation

It versions timeline metadata and edit intent, not raw media bytes.

## Why this problem was selected

The project is being developed as a high-quality engineering artifact connected to Cardboard's published "Version Control" hard problem and Fullstack Engineer role.

Constraints:

- No proprietary dataset
- Avoid paid AI credits
- Must be deterministic and deeply testable
- Must support credible HLD/LLD and scalability discussion
- Must exercise frontend, backend, persistence, concurrency, and UX
- Must remain narrow enough to finish at high quality

Style References remains a fallback. Motion Graphics was removed due to high build/taste risk.

## Locked decisions

- Project name: FrameBranch
- Primary problem: semantic version control for video timelines
- Preferred interchange boundary: OpenTimelineIO
- Internal domain model: custom normalized model, not raw OTIO coupling
- Version media references, not duplicate binaries per commit
- V1 merge: deterministic three-way semantic merge
- V1 concurrency: optimistic concurrency/idempotency where needed
- V1 does not require CRDT/live collaboration
- V1 preserves provenance for future Memory work
- No implementation begins before PRD, invariants, HLD, LLD, failure model, and tests are agreed

## Required reading order

0. `docs/07-session-progress.md` (canonical — read first)
1. `README.md`
2. `docs/01-cardboard-company-and-product.md`
3. `docs/02-cardboard-hard-problems-map.md`
4. `docs/03-version-control-decision.md`
5. `docs/04-framebranch-working-brief.md`
6. `docs/06-current-competitive-product-analysis.md`

## Current state

- Research completed
- Problem selected
- Initial scope and quality bar documented
- No tech stack selected
- No code scaffolded
- No repository initialized
- No email/application sent
- Palmier Pro, Mosaic Canvas, Motion, and Cardboard comparison re-audited on 2026-07-27

## Do not assume

- Do not assume access to Cardboard source code, schemas, APIs, or private data.
- Do not claim compatibility with Cardboard without an official integration surface.
- Do not claim that the full "Git for video" problem is solved.
- Do not jump directly to CRDTs; first define semantic operations and merge rules.
- Do not begin by building a video renderer or full NLE.
- Do not add AI APIs unless separately justified and approved.
- Do not choose a stack merely because it is familiar; tie choices to requirements.
- Do not silently broaden V1 scope.

## Desired engineering standard

- Clear separation of domain engine, adapters, persistence, workers, API, and UI
- Stable typed contracts
- Schema/version migration strategy
- Explicit invariants and errors
- Idempotent retry behavior
- Deterministic diff and merge
- Golden fixtures and property-based tests
- Failure injection for persistence/worker paths
- Reproducible performance benchmarks
- Structured logs and useful observability
- Architecture decision records for important tradeoffs

## Immediate next task

Do not implement yet. Begin with one beginner-friendly domain session covering:

- Timeline
- Track
- Clip
- Media reference
- Source range
- Timeline range
- Gap
- Transition
- Frame rate and rational time

Then propose the V1 user workflow and supported-operation matrix for review.

## Suggested continuation prompt

```text
Read every Markdown file in this FrameBranch folder completely before acting.

We are designing FrameBranch, a semantic version-control system for video
timelines, as a production-shaped engineering project connected to Cardboard's
published Version Control hard problem.

Do not scaffold or write code yet. First explain the video-timeline domain in
beginner-friendly Hinglish: timeline, track, clip, media reference, source
range, timeline range, gap, transition, frame rate, and rational time. Use one
concrete editing example throughout. Then propose a narrow V1 user workflow and
supported-operation matrix. Clearly separate confirmed decisions, proposals,
open questions, and non-goals.
```
