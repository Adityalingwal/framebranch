# Cardboard Hard Problems: Product Status Map

## Important wording

"An early version has shipped" does **not** mean the hard problem is solved. It means public product evidence shows a narrow wedge or foundation. Production-grade versions remain open across reliability, scale, taste, collaboration, and UX.

## Count

The supplied Cardboard document contains **10 hard problems**.

- 4 have meaningful early product implementations
- 3 have partial/baby-step implementations
- 3 have no publicly visible core solution

Therefore, 7/10 show some public progress, but 0/10 should be casually described as completely solved.

```text
Meaningful early implementation  ████       4
Partial foundation               ███        3
No visible core solution         ███        3
                                 ──────────
Total                            10
```

## Problem-by-problem status

| # | Hard problem | Current public evidence | Status |
|---:|---|---|---|
| 1 | High-performance NLE in the browser | Multi-track browser timeline, large-media preparation, long-timeline fixes, local/cloud export, audio-sync and memory improvements | Meaningful early implementation |
| 2 | Collaboration | Share links, timecode comments, Team/shared-workspace positioning; simultaneous timeline co-editing is not publicly proven | Partial foundation |
| 3 | Multimodal Understanding | AI Vision, semantic search across speech/scenes/objects/on-screen text, highlights, media insights | Meaningful early implementation |
| 4 | Better Context | Agent checks current timeline, sees media/transcription state, supports referenced clips/music, retains chat context | Meaningful early implementation |
| 5 | Predicting Next Actions | Clickable suggested next steps appear during agent conversation | Very early/partial |
| 6 | Style References | No public feature found that decomposes a reference video into selective actionable style attributes and applies them | No visible core solution |
| 7 | Motion Graphics | Manual keyframes and text-motion presets exist; full Motion Graphics remained labeled "Coming soon" | Core solution not shipped |
| 8 | Memory | Chat history exists, but no public proof of evolving personal/team style preference learning and conflict handling | No visible core solution |
| 9 | Verification | Agent Eyes inspects rendered frames and can fix some placement/timing mistakes | Meaningful early implementation |
| 10 | Version Control | Chat checkpoints restore old timeline state; no semantic branching, diff, merge, or conflict resolution | Partial foundation |

Primary evidence: [Cardboard changelog](https://www.usecardboard.com/changelog)

## Why Version Control was selected

Selection constraints:

- No proprietary Cardboard dataset
- Avoid paid AI/model credits
- Limited initial video-domain expertise
- Must be implementable as a credible demo and medium-advanced build
- Must support strong HLD and LLD discussion
- Must be deterministically testable
- Must contain meaningful frontend, backend, database, and systems work
- Must be narrow enough to finish without becoming half-baked
- Must directly map to Cardboard's published hard-problem language

### Problems rejected or deferred

#### High-performance NLE

Highly relevant but Cardboard already operates far beyond a basic NLE demo. A weak WebCodecs timeline would not be differentiated. A meaningful breakthrough would require deep media-system benchmarks and considerable domain expertise.

#### Multimodal Understanding

Basic semantic footage search already exists. A competitive prototype would require stronger retrieval quality, evaluation data, and likely model/compute cost.

#### Better Context

Interesting but tightly coupled to Cardboard's private agent harness, product state, and internal tools. A standalone demo risks becoming synthetic.

#### Predicting Next Actions

Requires real editor telemetry, action sequences, acceptance/rejection data, latency measurement, and a feedback loop. Those are not currently available.

#### Motion Graphics

Clear product relevance but high taste and implementation risk. A visibly weak output could hurt the application. It has been removed from the shortlist.

#### Memory

Valuable, but learning implicit preferences requires longitudinal user/team behavior. FrameBranch will preserve provenance so a future Memory layer has trustworthy inputs, without pretending to solve the learning problem in V1.

#### Verification

Cardboard recently shipped a visible early version. A generic video linter would overlap with current work unless it introduced a compelling benchmark/evaluation layer.

### Final shortlist outcome

1. **Selected: Version Control for Video**
2. **Fallback: Style References**
3. Motion Graphics removed

## Application strategy implication

The application artifact should not say "I solved video version control." It should demonstrate a precise, defensible slice:

- Timeline-aware immutable history
- Human-readable semantic diff
- Deterministic three-way merge
- Explicit domain conflicts
- Editor-friendly conflict resolution
- Media deduplication through immutable asset references
- Strong invariants, property tests, fixtures, and performance benchmarks
- Provenance that distinguishes human and agent operations

The strongest email hook will be a working demo plus measurable evidence, not a large architecture document without an implementation.

