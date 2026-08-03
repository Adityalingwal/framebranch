# FrameBranch Working Brief

> ⚠️ **Superseded where conflicting:** `docs/07-session-progress.md` is the canonical record of all locked decisions. The candidate operation vocabulary (13 ops) and non-goals below were narrowed there (8 ops locked, captions = text clips, transitions/effects/track-reorder cut). If anything conflicts, docs/07 wins.

## Project identity

**Name:** FrameBranch  
**Descriptor:** Semantic Version Control for Video Timelines  
**Pitch:** Branch, compare, and merge video edits using timeline-aware operations instead of file-level diffs.

## Current phase

We have selected the problem, but requirements and architecture are not frozen. No implementation should begin until the problem model, user flow, invariants, HLD, LLD, failure modes, and test strategy are reviewed.

## Problem statement

Video teams create copies such as `final_v3_actual (1).mp4` because traditional file/version-control abstractions do not understand editorial intent.

A video project is more than one binary file. It includes:

- External media assets
- Tracks and clips
- Source ranges and timeline ranges
- Captions, graphics, and effects
- Transitions and keyframes
- Human and agent edit operations
- Published cuts, experiments, and review feedback

File-level diff cannot explain that one editor shortened an interview answer while another replaced its B-roll. FrameBranch should operate on the editorial timeline and express changes in editor-friendly language.

## Proposed target user

Initial persona:

> A video editor or AI editing agent wants to explore an alternate cut without destroying the current timeline, compare it with another cut, and merge compatible work without manually reconstructing the project.

Secondary persona:

> A reviewer or technical lead wants to understand exactly what a human or agent changed and restore a known timeline state.

## Core user journey

```text
Import/open timeline
      ↓
Create branch from known base
      ↓
Perform timeline operations
      ↓
Commit a meaningful edit
      ↓
Compare branch with base/another branch
      ↓
Auto-merge independent operations
      ↓
Resolve semantic conflicts
      ↓
Export or restore resulting timeline
```

## Proposed domain boundary

FrameBranch versions editorial metadata and edit intent. It does not duplicate or Git-diff media bytes.

### Versioned state

- Projects and timelines
- Tracks
- Clips and stable clip identities
- Media references
- Source and timeline ranges
- Captions/text
- Supported properties/effects
- Transitions
- Edit operations
- Commits, parents, and branches
- Merge results and conflict resolutions
- Actor/reason/provenance metadata

### External/immutable state

- Original video/audio/image bytes
- Generated proxies and thumbnails
- Waveform data
- Rendered exports

These assets can be addressed by immutable IDs/content hashes while remaining outside the semantic diff itself.

## Candidate core entities

These are working candidates, not frozen LLD:

- `Project`
- `Timeline`
- `Track`
- `Clip`
- `MediaAssetRef`
- `RationalTime`
- `TimeRange`
- `TimelineOperation`
- `Commit`
- `Branch`
- `Snapshot`
- `SemanticDiff`
- `MergeAttempt`
- `MergeConflict`
- `ConflictResolution`
- `ActorProvenance`

## Candidate operation vocabulary

- Add clip
- Delete clip
- Move clip
- Trim clip start/end
- Split clip
- Change source range
- Change timeline range
- Reorder tracks
- Change clip property
- Add/update/delete caption
- Add/update/delete transition
- Add/update/delete supported effect
- Ripple delete

Before implementation, each operation needs:

- Preconditions
- State transition
- Stable identity behavior
- Inverse/restore behavior
- Diff representation
- Merge compatibility rules
- Conflict rules
- Serialization version

## Semantic diff examples

Poor output:

```text
/tracks/0/clips/2/sourceRange/duration: 600 -> 360
```

Desired output:

```text
Interview A was shortened by 10 seconds from the end.
Timeline duration decreased from 60s to 50s.
```

Additional desired diff categories:

- Added/removed editorial material
- Timing and pacing changes
- Track/layout changes
- Audio changes
- Caption/text changes
- Effect/property changes
- Asset replacement
- Agent-generated vs human-generated changes

## Three-way merge model

Given:

- Base `B`
- Ours `O`
- Theirs `T`

FrameBranch computes semantic changes `B → O` and `B → T`.

### Expected automatic merge

Examples:

- Ours trims Clip A; Theirs changes caption on Clip B
- Ours adds music; Theirs changes a video clip on a different track/time range
- Both add independent clips with stable unique IDs

### Expected conflict

Examples:

- Both change the same clip source range incompatibly
- One deletes a clip while the other moves or edits it
- Both assign incompatible values to the same property
- Both insert mutually exclusive transitions at the same boundary
- A ripple edit changes positions assumed by another operation

### UX principle

Conflict resolution should be described using video/editor concepts, not database fields or raw JSON paths.

## Proposed standards boundary

OpenTimelineIO is the current preferred import/export boundary because it models editorial timelines and references external media without acting as a media container.

FrameBranch should still use an internal normalized domain model so that:

- Domain invariants remain under our control
- Diff/merge rules are not coupled to one adapter format
- Format upgrades can be isolated
- Tests can target canonical internal behavior

Reference: [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)

## Functional success criteria for the credible demo

- Import a supported OTIO fixture
- Render its timeline in the browser
- Create and switch branches
- Apply supported timeline operations
- Create immutable commits
- View semantic diff between versions
- Automatically merge independent edits
- Surface incompatible edits as domain conflicts
- Resolve conflicts using ours/theirs/manual choices
- Restore a historical version
- Export a valid timeline
- Preserve actor and reason metadata

## Quality success criteria

- Domain rules are documented and enforced
- Invalid timelines fail with useful errors
- APIs are idempotent where retries are expected
- Same inputs always produce the same diff/merge result
- Golden fixtures cover representative projects
- Property/fuzz tests cover random operation sequences
- Performance is measured, not described with unverified adjectives
- Logs and errors expose enough information to debug failures
- Architecture decisions and rejected alternatives are recorded

## Proposed benchmark targets

Exact thresholds must be chosen after a baseline, but benchmark shapes should include:

- 1,000 clips
- 10,000 clips
- 100,000 operations
- Deep commit history
- Wide branch graph
- Large non-conflicting merge
- Conflict-heavy merge
- Snapshot reconstruction
- OTIO serialization/deserialization

Benchmark results must report hardware, runtime version, fixture shape, repetitions, and percentile/variance—not only a best-case number.

## Testing layers

### Unit

- Time arithmetic and timebase conversions
- Operation preconditions and state changes
- Serialization and schema versioning
- Stable identity rules
- Diff classification
- Conflict classification

### Property-based

- `apply(diff(A, B), A) == B`
- `diff(A, A)` is empty
- Empty patch is identity
- Repeated idempotent request does not duplicate effects
- Non-overlapping independent edits merge without data loss
- Serialization round trips preserve canonical state

### Integration

- Commit and branch persistence
- Optimistic concurrency failures
- Snapshot plus operation-log reconstruction
- Import/export adapters
- Worker retries for derived assets
- Authorization boundaries once permissions are added

### End-to-end

- Import → branch → edit → commit → diff → merge → resolve → export
- Restore an earlier version
- Recover from a failed merge attempt

### Performance

- Diff and merge latency
- Memory use
- Snapshot reconstruction time
- Timeline-render virtualization behavior
- Database query plans for deep history

## Memory-ready architecture

FrameBranch does not implement an AI preference model in V1. It preserves trustworthy inputs for one.

Candidate provenance fields:

```text
actor_type: human | agent
actor_id
operation_type
reason
accepted
reverted
scope: personal | team
project_type
created_at
source_commit
```

Future Memory systems could learn from accepted/reverted edits, personal/team scope, recency, and project type. This is an extension point, not a V1 claim.

## Explicit non-goals for V1

- Full NLE replacement
- Cloud-scale rendering farm
- Pixel-level video diff
- Media binary versioning
- Real-time simultaneous editing
- CRDT-based presence/offline collaboration
- AI-generated merge decisions
- Automatic style-reference extraction
- Preference-model training
- Complete Premiere/DaVinci/FCP effect compatibility
- Cardboard-specific private integration

## Risks to investigate before HLD freeze

1. Stable clip identity across import/export and split operations
2. Rational time and mixed frame-rate correctness
3. Ripple edits and cascading positional changes
4. Semantic equivalence: same result produced by different operation sequences
5. Delete-vs-modify and split-vs-trim merge semantics
6. Transition/effect representation across OTIO adapters
7. Snapshot frequency versus history reconstruction cost
8. Conflict UX complexity on large timelines
9. Licensing and adapter compatibility
10. Scope creep into collaboration or rendering

## Technology decisions intentionally open

No framework, database, language, queue, or deployment platform is locked yet. Those choices should follow:

- Required OTIO integration strategy
- Expected browser UI needs
- Benchmark goals
- Local developer experience
- Deployment budget
- Interview relevance
- Operational simplicity

## Next decision gate

Before any scaffold or code, produce and approve:

1. Domain glossary
2. Primary user workflow
3. V1 supported-operation matrix
4. Core invariants
5. Conflict taxonomy
6. PRD and non-goals
7. HLD with data flow and failure boundaries
8. LLD for canonical schema and diff/merge engine
9. Test/benchmark plan
10. Implementation milestones

