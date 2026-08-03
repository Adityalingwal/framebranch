# Decision Record: Build Version Control for Video

> ⚠️ **Superseded where conflicting:** `docs/07-session-progress.md` is the canonical record of all locked decisions (PRD, V1 scope, operations, conflict UX). If anything below conflicts with it, docs/07 wins. In particular, the demo scope and medium-advanced lists below are broader than the locked V1.

## Decision

Tumhare constraints consider karne ke baad recommendation change ho rahi hai:

> **Primary problem: Version Control for Video**

Style References ko second choice rakhenge. Motion Graphics completely remove.

Version Control comparatively zyada finishable, deterministic, testable aur interview-defensible hai—without paid AI credits, proprietary datasets, ya deep video-editing knowledge.

## Style References vs Version Control

| Constraint | Style References | Version Control |
|---|---|---|
| Paid AI credits avoid | Possible, but difficult | Fully possible |
| Proprietary dataset | Evaluation ke liye helpful | Required nahi |
| Video knowledge | Color, pacing, fonts, transitions samajhne padenge | Basic timeline concepts enough |
| Deterministic testing | Difficult—“style match acha hai?” subjective hai | Strong—exact expected results test ho sakte hain |
| HLD/LLD depth | Good | Excellent |
| Backend/system-design depth | Medium | High |
| Frontend UX depth | High | High |
| Scalability discussion | Processing/model pipeline | Commit graph, storage, merge, concurrency, snapshots |
| Claude Code/Codex implementation reliability | Medium | High |
| Half-baked result ka risk | High | Manageable |
| Visual wow factor | Very high | Medium-high |
| Cardboard relevance | Very high | Very high |

## Final verdict

- Style References ka demo visually exciting hoga.
- Version Control ka project technically zyada mature aur defendable ban sakta hai.
- Fullstack Engineer interview ke liye Version Control mein frontend, backend, database, concurrency, distributed systems, video timeline modeling aur UX sab aa jayega.

Reply probability objectively guarantee nahi ki ja sakti, lekin available resources ke saath polished Version Control prototype ka expected quality level Style Reference prototype se higher hoga. Claude Code/Codex ke liye bhi deterministic system ko reliably build/test karna easier hoga.

## Style References abhi kyun second choice hai?

Paid AI use kiye bina hum kuch attributes extract kar sakte hain:

- Scene cuts aur average shot duration
- Dominant colors
- Motion intensity
- Audio energy/BPM
- Screen par text aur approximate placement
- Aspect ratio
- Fade/cut patterns

Scene-cut detection ke liye open-source PySceneDetect adjacent frames ke HSV/content differences use karta hai; text extraction ke liye local Tesseract possible hai.

References:

- [PySceneDetect algorithms](https://www.scenedetect.com/docs/api/detectors.html)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)

Lekin real hard problem yeh hai:

- Exact typography/font identify karna
- Animation behavior samajhna
- Camera movement vs subject movement separate karna
- Style ko doosre footage par tastefully reproduce karna
- Output objectively evaluate karna

Pipeline code ho jayegi, lekin interview mein question aayega:

> “Tum kaise prove karoge ki applied style reference ke close hai?”

Dataset aur human evaluation ke bina answer weak ho sakta hai. Code quality strong hone ke baad bhi product output mediocre lagne ka risk rahega.

## Version Control mein exactly kya banayenge?

Hum raw `.mp4` files ka Git nahi banayenge. Woh wrong abstraction hoga.

Hum version karenge:

- Timeline structure
- Clip order
- Source ranges
- Track placement
- Start/end time
- Text/captions
- Effects/properties
- Asset references
- User/agent changes
- Change intention/provenance

Media files immutable assets rahengi. Timeline unhe ID/hash se reference karegi.

```text
Media Store
├── asset-video-A.mp4
├── asset-audio-B.wav
└── asset-image-C.png

Version History
├── Commit A: Add video A
├── Commit B: Trim video A
├── Commit C: Add audio B
└── Commit D: Move caption to 00:08
```

Isse har version ke liye video duplicate nahi karna padega.

## Industry-standard foundation

Invented proprietary schema se start karne ke bajaye hum **OpenTimelineIO—OTIO** ko import/export boundary bana sakte hain.

OTIO Academy Software Foundation ka mature editorial timeline interchange format hai. Yeh clips ki order, duration aur external-media references represent karta hai; actual media container nahi hai. Premiere/Final Cut/AAF jaise formats ke liye adapters bhi available hain.

Reference: [Official OpenTimelineIO repository](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)

Iska benefit:

- Project toy JSON editor nahi lagega.
- Existing editing ecosystem se connection hoga.
- Interview mein schema choice defend kar sakte hain.
- Synthetic OTIO fixtures se tests bana sakte hain.
- Cardboard ke Premiere/DaVinci export workflow se conceptual alignment rahega.

Internally hum apna normalized domain model rakhenge; OTIO sirf adapter/boundary hoga.

## Demo version: minimum credible scope

Demo mein yeh sab end-to-end kaam karna chahiye:

1. Sample OTIO timeline import
2. Timeline visually render
3. Branch create karna
4. Clips add/move/trim/split/delete karna
5. Immutable commit create karna
6. Do versions ka semantic diff
7. Non-conflicting changes automatically merge
8. Conflicting change visually show
9. User “ours/theirs/manual” resolution choose kare
10. Historical version restore kare
11. Merged timeline OTIO mein export kare

### Example conflict

```text
Base:
Clip A = 0s–20s

Editor 1:
Clip A = 0s–12s

Editor 2:
Clip A = 5s–20s
```

System ko sirf “JSON field changed” nahi bolna. UX ko explain karna hoga:

> Both editors changed the source range of “Interview A”.  
> Editor 1 removed the ending. Editor 2 removed the beginning.

Yahi project ka real innovation hoga: machine diff ko editor-friendly language/visual form mein translate karna.

## Medium-advanced version

Demo stable hone ke baad production-shaped capabilities:

- Content-addressed asset references
- Commit DAG—directed acyclic graph
- Three-way semantic merge
- Optimistic concurrency control
- Idempotent APIs
- Background thumbnail/waveform workers
- Database snapshots and operation-log compaction
- Audit trail: human vs agent changes
- Large-timeline pagination/virtualization
- 10k–100k timeline-operation benchmarks
- Permission model
- Failed merge recovery
- Import/export validation
- Observability and structured logs

## Deliberately V1 mein nahi

- Actual cloud video rendering farm
- Google Docs-style live editing
- Full CRDT implementation
- AI-generated conflict resolution
- Hundreds of NLE effects
- Media upload at Cardboard scale

Yeh missing features nahi, intentional scope boundaries honge.

## CRDT abhi kyun nahi?

Hard-problem document Collaboration ke andar CRDT mention karta hai, lekin Version Control aur live collaboration same problem nahi hain.

Version Control:

```text
Branch → Commit → Diff → Merge
```

Live collaboration:

```text
Two users editing simultaneously
→ continuous state synchronization
→ offline reconnection
→ presence
→ conflict convergence
```

V1 ke liye immutable commits + optimistic concurrency + three-way merge clearer aur more testable hai.

Later real-time collaboration add karni ho toh Yjs shared arrays/maps, transactions, offline sync aur automatic convergence provide karta hai.

Reference: [Yjs official documentation](https://docs.yjs.dev/)

Interview mein “Why didn’t you immediately use CRDT?” ka strong answer hoga:

> Because the first problem is semantic branch-and-merge, not keystroke-level live synchronization. Introducing CRDTs before defining domain-level video operations would increase complexity without solving semantic conflicts such as concurrent trims.

## Testing strategy

Yeh project ka strongest part ban sakta hai.

### Unit tests

- Clip trim
- Split
- Move
- Ripple delete
- Track reorder
- Property changes
- Stable IDs
- Timecode conversion

### Diff invariants

```text
apply(diff(A, B), A) == B
diff(A, A) == empty
apply(empty, A) == A
```

### Merge invariants

- Independent changes never conflict
- Same operation retry idempotent ho
- Deleted clip accidentally resurrect na ho
- Merge ke baad invalid negative duration na ho
- Clip references valid assets ko point karein
- Same base + same branches always same result dein

### Property/fuzz testing

Random timelines aur random operations generate karke:

- Diff
- Patch
- Merge
- Serialize
- Deserialize

Thousands of combinations test kar sakte hain—kisi AI API ya dataset ki zaroorat nahi.

### Golden fixtures

Human-readable OTIO examples:

- Simple interview
- Multi-camera podcast
- Caption-heavy reel
- Music montage
- Conflicting trims
- Delete-vs-move conflict
- Effect-vs-delete conflict

### Performance tests

- 1,000 clips
- 10,000 clips
- 100,000 operations
- Deep branch history
- Large merge
- Snapshot recovery

Isse email mein measurable claim possible hoga:

> “Semantic diff for a 10,000-clip project completes in X ms, with deterministic three-way merges covered by Y tests.”

## Memory ko kaise connect kar sakte hain?

Memory ko completely ignore nahi karna chahiye.

Hum separate AI Memory problem solve nahi karenge, lekin architecture ko **memory-ready** banayenge.

Har commit/change ke saath provenance save hogi:

```text
actor: human | agent
action: trim | move | change-caption-style
reason: "remove dead air"
accepted: true
reverted: false
scope: personal | team
timestamp
project_type
```

Over time ye history future memory system ko signal de sakti hai:

- User kaunsa caption style repeatedly accepts karta hai?
- Agent ke kaunse edits user revert karta hai?
- Team usually kitni shot duration prefer karti hai?
- Personal preference aur team preference conflict hoti hai kya?
- Recent behavior older behavior se different hai kya?

Hum abhi prediction model nahi banayenge. Bas clean decision history capture karenge jisse future Memory feature build ho sake.

Yeh interview mein achha architectural extension point hoga:

> Version history is not only for restore and merge; it becomes the reliable provenance layer from which preference memory can later be learned.

## Recommended project framing

Project ka naam generic “Git for Video” rakhne ke bajaye:

> **FrameBranch — Semantic Version Control for Video Timelines**

One-line pitch:

> Branch, compare and merge video edits using timeline-aware operations instead of file-level diffs.

## Ab sahi next step

Abhi code start nahi karna chahiye. Proper order:

1. Problem boundaries aur user workflow freeze
2. Domain language samajhna: timeline, track, clip, source range, gap, transition
3. Product requirements aur non-goals
4. Core invariants
5. HLD
6. LLD: schema, operations, diff and merge rules
7. Failure model
8. Test and benchmark plan
9. Implementation milestones
10. Uske baad repository/code

## Final recommendation

Version Control par double down karo. Style References ko fallback idea rakho, ya future mein FrameBranch ke top par “style changes as semantic patches” ke form mein integrate kar sakte hain.

