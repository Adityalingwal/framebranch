# FrameBranch Docs — INDEX & Reading Rules

> For every agent (Claude Code, Codex, or human) working on this repo.
> Read THIS file first. It tells you what to read, what to skip, and which
> document wins when two seem to disagree. Last updated: 2026-08-06
> (M1-M8b implemented, reviewed, and merged — M8 (UI) is now fully done;
> current = M9, demo polish + Vercel deploy).

## The 10-second version

- Design is 100% LOCKED. M1 through M8b are ALL merged on `main` — the
  full engine + server + UI is built, tested, and working end-to-end
  (287 engine + 76 web = 363 tests).
- CANONICAL SET (read these, in this order): 07 → 11 → 12 → 09.
- Locked decisions are FINAL. If implementation seems to need something a
  doc doesn't answer, do NOT invent — report back (no improvised guesses).
- The earlier background/review/superseded docs (01-06, 08, 10, 13-18) were
  deleted 2026-08-06 once their content was confirmed fully absorbed into
  the four canonical docs below — do not look for them, they are gone on
  purpose, not missing by accident.

## Canonical documents (the only sources of truth)

| Doc | Role | Use when |
|---|---|---|
| 07-session-progress.md | Project state + PRD locks (5.1-5.5) + full build history, milestone by milestone | Resuming work; PRD-level scope questions ("is X in scope?"); "why was X built this way" |
| 09-hld-checklist.md | HLD: architecture, storage, state machine | System-level questions (tables' purpose, concurrency, isolation, retries) |
| 11-lld-checklist.md | LLD: THE implementation spec — types, 8 verb contracts, diff/merge rules, DB columns, API shapes, demo script | Writing any code. This is the main spec. |
| 12-test-benchmark-plan.md | Test plan: goldens + G-group server tests, fuzz recipe, benchmarks, CI | Writing any test; CI setup |

## Precedence rules (when texts seem to conflict)

1. A block tagged `[AMENDED ...]`, `[ADDED ...]`, or `[Qx clarification ...]`
   BEATS the older sentence it sits next to. Amendments are the fix; the
   old line is kept for history.
2. 11 (LLD) beats 09 (HLD) beats 07 (PRD) on implementation DETAIL;
   07 beats everything on SCOPE (what's in/out of V1).
3. If a real contradiction survives rules 1-2: STOP and report it.
   Do not pick a side silently.

## Current milestone (2026-08-06)

**M1 through M8b are ALL merged on `main`.** The product is feature-complete:
engine (diff/merge/OTIO), server (8-table Postgres schema, 8 verbs, merge/
conflict resolution, import/export, agent-simulate), and UI (shell, timeline,
editing, Changes/Merge panels, History/Restore, branch controls) all built,
reviewed (implement → independent review → owner triage, every milestone),
and verified live in the browser. Full milestone-by-milestone build history,
every review's findings, and every owner decision live in docs/07 — read it
top to bottom once, it is the single narrative of how this repo got built.

**Next = M9** (demo polish: final fixtures, thumbnails art, Vercel deploy,
README) **then Part 9** (demo video, docs consolidation into a compact public
set, job application). Neither has detailed locks yet — decide them when
that milestone starts, same as every prior milestone.

## Standing workflow rules (bind every coding agent)

- Every milestone: tests pass before the next milestone starts.
- On failure or ambiguity: report WITHOUT committing. Never improvise
  around a spec gap — the gap is the bug, report it.
- No new tables (8 locked), no new verbs (8 locked), no new endpoints
  beyond the locked list, no new error codes beyond the locked list.
- Naming/tests follow lock-ID prefixes (docs/12 T1).
- Implementation briefs live in `briefs/` (gitignored, local-only) — one per
  milestone, self-sufficient, with a verification protocol.
- Part 9 (not yet started): distill docs/07/09/11/12 into a compact public
  set (README/PRD/DESIGN/DECISIONS), then move these working docs to
  `docs/archive/`.
