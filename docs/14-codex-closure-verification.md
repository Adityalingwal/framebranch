# Codex Closure Verification — 2026-08-03

## Purpose

This document records the targeted verification of the triage resolutions at
the top of `docs/13-codex-final-review.md`. It is the final closure checklist
before implementation begins.

The verification checked every original item (F1-F14 and Q1-Q3) for:

1. whether the recorded resolution genuinely addressed the issue;
2. whether the promised amendment actually landed;
3. whether the amendment remained consistent with other locked decisions; and
4. whether any cross-reference or master list was left stale.

No canonical design document was modified during that verification pass.

## Summary

| Verdict | Count |
|---|---:|
| VERIFIED-CLOSED | 7 |
| PARTIALLY-CLOSED | 8 |
| CLOSED-BUT-NEW-ISSUE | 2 |
| NOT-CLOSED | 0 |

**Final gate: NO-GO for code.** Five semantic/behavior issues and five
propagation cleanups remain. These are targeted closure items, not a request to
reopen the architecture or redesign locked V1 scope.

## Item-by-item verdict

| Item | Verdict | Verification evidence |
|---|---|---|
| F1 | VERIFIED-CLOSED | `ops`, `snapshots`, and `working_state` now carry `project_id`; the eight-table count is unchanged (`docs/11-lld-checklist.md:547-592`). |
| F2 | VERIFIED-CLOSED | The chosen simplification is fully recorded: payload comparison is cut; same ticket + same endpoint returns the stored result; same ticket + different endpoint remains an error (`docs/09-hld-checklist.md:310-324`). No request-fingerprint column is required. |
| F3 | PARTIALLY-CLOSED | `Timeline.mediaRefs` and `MediaRef.kind` landed (`docs/11-lld-checklist.md:86-118`). Missing: `MediaRef.kind="image"` has no exact mapping to `Track.kind="video"|"audio"|"text"`, and the property applicability matrix still defines only video/audio/text (`docs/11-lld-checklist.md:133-139`, `docs/11-lld-checklist.md:194-205`). |
| F4 | PARTIALLY-CLOSED | Media, text, and internal restore forms landed (`docs/11-lld-checklist.md:142-156`). Missing: text payload declares `textContent?`, while `TextClip` requires `textContent`, BC.5 supplies no content default, and empty content is invalid (`docs/11-lld-checklist.md:105-106`, `docs/11-lld-checklist.md:203-204`, `docs/11-lld-checklist.md:465-475`). |
| F5 | PARTIALLY-CLOSED | Explicit branch fields and `POST branch/switch` landed (`docs/11-lld-checklist.md:640-655`). Missing propagation: the tickets endpoint register still lists `branch-create` but not `branch-switch`, despite saying it covers every mutating endpoint (`docs/11-lld-checklist.md:575-582`). |
| F6 | PARTIALLY-CLOSED | Exact success shapes were added for most mutations (`docs/11-lld-checklist.md:656-685`). Missing: `POST export` is absent from that supposedly exhaustive response list; the older line only says “otioJson + commit info” and is not an exact shape (`docs/11-lld-checklist.md:617-623`). |
| F7 | PARTIALLY-CLOSED | `commits.import_warnings` now persists skipped items (`docs/11-lld-checklist.md:536-546`). Missing propagation: the amendment promises refresh-proof history evidence, but exact `GET history` fields omit `import_warnings` (`docs/11-lld-checklist.md:598-603`). |
| F8 | VERIFIED-CLOSED | `E_TRACK_NOT_FOUND` and `E_MEDIA_NOT_FOUND` were added; `E_ID_COLLISION` was deliberately removed as unreachable (`docs/11-lld-checklist.md:624-639`). Do not re-add it. |
| F9 | VERIFIED-CLOSED | Real edits increment `workingRev`; no-change returns `noChange:true` with unchanged revision/count (`docs/11-lld-checklist.md:604-616`). |
| F10 | VERIFIED-CLOSED | Font whitelist is exactly `["Arial", "Georgia", "Courier New"]`, default `"Arial"` (`docs/11-lld-checklist.md:465-475`). |
| F11 | PARTIALLY-CLOSED | Two missing goldens and five named server/state integration tests landed (`docs/12-test-benchmark-plan.md:48-66`). Stale masters remain: T2 status/title still says “42 tests, 6 groups”, and docs/07 repeats that old total (`docs/12-test-benchmark-plan.md:7-13`, `docs/12-test-benchmark-plan.md:30-47`, `docs/07-session-progress.md:307-317`). |
| F12 | CLOSED-BUT-NEW-ISSUE | The nine numbered steps and D command landed (`docs/11-lld-checklist.md:738-768`). New contradiction: Step 2 create+switch leaves the UI on `tighten-intro`, but Step 3 silently performs edits on main without switching back. Those main edits remain pending (“3 changes”), while GET diff compares two commits only (`docs/11-lld-checklist.md:598-602`, `docs/11-lld-checklist.md:750-759`). |
| F13 | PARTIALLY-CLOSED | Main C7 declaration says seven functions (`docs/11-lld-checklist.md:718-722`), but C7’s status table and quality summary still say “6-func API” (`docs/11-lld-checklist.md:35-46`, `docs/11-lld-checklist.md:727-729`). |
| F14 | PARTIALLY-CLOSED | The obsolete Parts-6/7/8-pending roadmap was replaced (`docs/07-session-progress.md:367-374`). The new block still says Q1-Q3 discussion is current, contradicting the preceding “3/3 questions” triage-complete status (`docs/07-session-progress.md:325-341`). |
| Q1 | VERIFIED-CLOSED | Import, restore, and merge commits are explicitly full snapshots with `snapshot_distance=0`; normal edit cadence is unchanged (`docs/11-lld-checklist.md:550-555`). |
| Q2 | CLOSED-BUT-NEW-ISSUE | The answer says an already-materialized clip remains in the draft and claims chains are impossible because Shift targets a free slot (`docs/11-lld-checklist.md:405-424`). Q3’s base-revert rule can remove or reposition that participant, so Shift alone does not prove termination (`docs/11-lld-checklist.md:315-322`). |
| Q3 | VERIFIED-CLOSED | `[Remove both — back to original]` now exactly means reverting both conflicting changes to base; a base-absent addition is removed (`docs/11-lld-checklist.md:308-322`). This matches docs/07 (`docs/07-session-progress.md:152-163`). |

## New cross-contract issues introduced or exposed by the amendments

### N1 — Image kind has no executable track/property mapping

Exact locked statements:

- `MediaRef = { id, kind: "video"|"audio"|"image", ... }`
  (`docs/11-lld-checklist.md:86-99`).
- `Track = { id, kind: "video"|"audio"|"text", ... }`
  (`docs/11-lld-checklist.md:109-110`).
- `addClip` requires “track-kind match”
  (`docs/11-lld-checklist.md:133-139`).
- The applicability matrix still contains only video/audio/text
  (`docs/11-lld-checklist.md:194-205`).

An image-to-video-track rule is not stated. It is also unclear whether matrix
labels refer to media kind or track kind; interpreting them as track kind would
make an image on a video track volume-capable, conflicting with the PRD’s
separate image applicability (`docs/07-session-progress.md:178-182`).

**Closure needed:** state the exact image→track mapping and image applicability
within the existing six-property whitelist. Do not add a new track type or
property.

### N2 — Text `addClip` permits an undefined TextClip

The new payload is:

> `{ op:"addClip", trackId, textContent?, textStyle?, timelineRange }`

(`docs/11-lld-checklist.md:142-149`)

But `TextClip` requires `textContent`, empty content is rejected, and BC.5 only
defines text-style defaults (`docs/11-lld-checklist.md:105-106`,
`docs/11-lld-checklist.md:203-204`, `docs/11-lld-checklist.md:465-475`).

**Closure needed:** make `textContent` required or lock a valid non-empty
default, and apply the already-locked content/style validation to text creation.
No new verb or endpoint is needed.

### N3 — The amended branch semantics do not execute the amended demo

The new API says branch creation is create+switch
(`docs/11-lld-checklist.md:646-655`). Demo Step 2 therefore leaves the UI on
`tighten-intro` (`docs/11-lld-checklist.md:750-752`), but Step 3 immediately
performs user edits on main without a switch-back (`docs/11-lld-checklist.md:753-756`).

The same step leaves those edits pending as “3 changes”, while GET diff is
defined between two commits (`docs/11-lld-checklist.md:598-602`). Therefore the
promised main-vs-agent diff is not guaranteed to include the user changes.

**Closure needed:** make branch selection, switch-back, and the commit boundary
explicit inside the existing nine-step grouping so both sides are committed
before the commit-to-commit diff. Do not add a tenth top-level demo step.

### N4 — Q2’s termination proof does not cover Q3’s button

Q2 says an already-materialized clip remains in the draft, and argues chains
are impossible because Shift uses a nearest free slot
(`docs/11-lld-checklist.md:405-424`). Q3 says `[Remove both]` base-reverts every
participant and removes base-absent additions (`docs/11-lld-checklist.md:308-322`).

In a dynamic Bucket-3 conflict, `[Remove both]` can therefore remove a
materialized new clip or return an existing participant to a base position that
overlaps a third materialized clip. The free-slot Shift proof does not cover
that outcome.

**Closure needed:** define how dynamic `[Remove both]` interacts with prior
choices and give a monotonic termination measure that covers every Bucket-3
button, not only Shift. Preserve the existing three buttons and base-revert
meaning.

## Remaining closure checklist for Claude Code

### Semantic/behavior blockers

- [x] F3/N1 — CLOSED 2026-08-03: docs/11 A3.6 matrix ab 6×4 (IMAGE column:
      volume❌ opacity✅ scale✅ position✅ text-props❌) + label semantics
      (columns = media kind for media clips) + image→VIDEO-track mapping
      (audio/text track ❌). Aditya-locked. Dekho docs/11 A3.6 ka
      "[AMENDED 2026-08-03, Codex verification N1]" block.
- [x] F4/N2 — CLOSED 2026-08-03: docs/11 A3.1 F4-amendment fixed —
      textContent ab REQUIRED + non-empty (A3.6 validation creation par
      bhi: max 500, "" = E_INVALID_VALUE); textStyle optional with BC.5
      defaults. Aditya-locked.
- [x] F6 — CLOSED 2026-08-03: POST export → `{ otioJson, commitId, name,
      mediaWarnings? }` docs/11 C4 F6-response-list mein add. Aditya-locked.
- [x] F12/N3 — CLOSED 2026-08-03: docs/11 C8 step-3 rewritten as
      executable sub-order: switch-back-to-main → 3 user edits →
      POST commit → agent button with explicit branch (no switch).
      Diff ab do committed heads compare karta hai. Still exactly 9
      steps. Aditya-locked.
- [x] Q2/N4 — CLOSED 2026-08-03 (after targeted re-check): docs/11 B3.4
      parchi-based proof landed (re-check confirmed) + docs/07 ki stale
      "free-slot" summary bhi ab replaced with corrected proof summary
      (the one remaining propagation flagged by the re-check).

### Mechanical propagation cleanups

- [x] F5 — DONE 2026-08-03: tickets endpoint register mein branch-switch
      + demo-reset add (docs/11 C3 tickets row).
- [x] F7 — DONE 2026-08-03: GET history fields mein import_warnings add
      (docs/11 C4 READ section) — refresh-proof promise ab end-to-end.
- [x] F11 — DONE 2026-08-03: teeno stale refs updated — docs/12 T2 status
      table + T2 heading + docs/07 Part 8 section → "44 goldens 6 groups
      + G-group 5 server tests".
- [x] F13 — DONE 2026-08-03: dono bache "6-func API" refs → 7 (docs/11
      C7 status table line + quality summary line).
- [x] F14 — DONE 2026-08-03: docs/07 roadmap "Q1-Q3 discussion current" →
      sab resolved/answered + docs/14 closure bhi noted.

## Instructions for the closure pass

- Do not write code yet.
- Do not reopen any VERIFIED-CLOSED item.
- Do not reintroduce F2’s payload fingerprint/payload-mismatch promise.
- Do not reintroduce `E_ID_COLLISION` for F8.
- Do not add features, tables, endpoints, conflict buttons, or V2 scope.
- Discuss and lock the five semantic items with the project owner one at a time.
- Apply the five mechanical corrections after the semantic locks are final.
- Update this checklist with exact amended file:line references.
- Stop after all ten remaining items are closed. The next review should be a
  targeted verification of this checklist only, not another broad design review.

## Final gate

**Targeted Codex re-check result (2026-08-03): 9/10 CONFIRMED. Q2/N4 is
NOT-CONFIRMED only because `docs/07-session-progress.md:343-344` still carries
the superseded free-slot-only proof. The canonical semantic amendment in
`docs/11-lld-checklist.md:436-452` has landed.**

### One remaining action for Claude Code

Replace the stale Q2 summary at `docs/07-session-progress.md:343-344` with a
summary of the already-locked corrected result, for example:

> Q2 dynamic-conflict termination = permanent choices-map over a finite
> content-addressed conflict universe; the old free-slot-only proof is
> superseded, and `[Remove both]`-induced conflicts are covered.

Do not reopen Q2, change buttons, or redesign merge behavior. This is a
two-line cross-document propagation fix only.

**Current verdict: NO-GO pending that one propagation fix.** After it lands,
one targeted line check is sufficient for GO; no further broad review is
required.

**✅ FINAL VERDICT (2026-08-03, post propagation-fix): GO.** docs/07 ki
stale Q2 summary corrected proof se replace hui, phir Aditya ne Codex se
targeted line-check karwaya (Codex app) — **Codex ne formal GO signal de
diya.** Saare 10 closure items closed + 17/17 original items closed.
Implementation gate OPEN — agla step: 9-milestone build-order confirm
(docs/07), phir code.

**Original verdict (pre-closure): NO-GO for implementation.**

**GO condition:** every checkbox above is closed, all master summaries agree,
and a targeted Codex re-check returns no PARTIALLY-CLOSED,
CLOSED-BUT-NEW-ISSUE, or NOT-CLOSED verdict.
