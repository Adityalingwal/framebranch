# FrameBranch Docs — INDEX & Reading Rules

> For every agent (Claude Code, Codex, or human) working on this repo.
> Read THIS file first. It tells you what to read, what to skip, and which
> document wins when two seem to disagree. Last updated: 2026-08-04
> (M1-M3 implemented, reviewed, and merged; next = M4).

## The 10-second version

- Design is 100% LOCKED. M1-M3 are merged on `main`; M4 is next.
- CANONICAL SET (read these): 07 → 11 → 12 → 09 → 13 → 15.
- Current M4 derived handoff: read 16 after that canonical set.
- Everything else is background or superseded — do NOT treat as authority.
- Locked decisions are FINAL. If implementation seems to need something a
  doc doesn't answer, do NOT invent — report back (no improvised guesses).

## Canonical documents (the only sources of truth)

| Doc | Role | Use when |
|---|---|---|
| 07-session-progress.md | Project state + PRD locks (5.1-5.5) + build order | Resuming work; PRD-level scope questions ("is X in scope?") |
| 09-hld-checklist.md | HLD: architecture, storage, state machine, 18 triage resolutions | System-level questions (tables' purpose, concurrency, isolation, retries) |
| 11-lld-checklist.md | LLD: THE implementation spec — types, 8 verb contracts, diff/merge rules, DB columns, API shapes, demo script | Writing any code. This is the main spec. |
| 12-test-benchmark-plan.md | Test plan: 44 goldens + G-group server tests, fuzz recipe, benchmarks, CI | Writing any test; CI setup |
| 13-codex-final-review.md | Final review: 14 findings + 3 questions, ALL RESOLVED (top section) | Understanding why an amendment exists |
| 15-codex-code-review-m2-m3.md | M2/M3 implementation review + owner triage; I1 deferred to M4 and I4 to M7 | Starting M4/M7 or auditing why M2/M3 code was accepted |

Current milestone handoff (derived, not higher authority):
`16-m4-implementation-brief.md` maps the locked M4 scope, API, tests, fuzz, and
I1 closure gate into implementation order. Read it after the canonical set; an
amended canonical lock always wins if wording ever drifts.

Current milestone (2026-08-04): **M4 merged; M5 = OTIO import/export.**
M5's locks live in canonical docs, not a separate brief file: docs/11's
"M5 — OTIO import/export locks (O1-O10)" section (semantics + public API
shapes) and docs/12's "M5 (OTIO) test additions" (group H, 11 goldens).

## Precedence rules (when texts seem to conflict)

1. A block tagged `[AMENDED ...]`, `[ADDED ...]`, or `[Qx clarification ...]`
   BEATS the older sentence it sits next to. Amendments are the fix; the
   old line is kept for history.
2. 11 (LLD) beats 09 (HLD) beats 07 (PRD) on implementation DETAIL;
   07 beats everything on SCOPE (what's in/out of V1).
3. docs/13 top section ("Triage resolutions") is the authoritative record
   of WHY each 2026-08-03 amendment was made.
4. If a real contradiction survives rules 1-3: STOP and report it.
   Do not pick a side silently.

## Background / historical (skim only if needed)

- 01-cardboard-company-and-product.md — who Cardboard is, application links
- 02-cardboard-hard-problems-map.md — why version control was chosen
- 08-codex-prd-review.md — PRD review (all 22 findings resolved; resolutions
  live in 07, "Bucket A resolutions")
- 10-codex-hld-review.md — HLD review (all 18 findings resolved; resolutions
  live in 09, triage section)

## Superseded — do NOT read as authority (banners on each file)

- 03-version-control-decision.md
- 04-framebranch-working-brief.md
- 05-agent-handoff.md (early handoff — replaced by 07)
- 06-current-competitive-product-analysis.md

## Standing workflow rules (bind every coding agent)

- Every milestone: tests pass before the next milestone starts.
- On failure or ambiguity: report WITHOUT committing. Never improvise
  around a spec gap — the gap is the bug, report it.
- No new tables (8 locked), no new verbs (8 locked), no new endpoints
  beyond C4+F5 list, no new error codes beyond C4+F8 list.
- Naming/tests follow lock-ID prefixes (docs/12 T1).
- Planned for AFTER code (Part 9): docs consolidation → compact public set
  (README/PRD/DESIGN/DECISIONS) + these files → docs/archive/.
