# Test + Benchmark Plan — FrameBranch (Part 8)

> Rule wahi: har item discuss → Aditya lock. Zyadatar tests design-phase mein
> likhe ja chuke (har lock ke saath) — yahan organize + exact format.
> Last updated: 2026-08-03.

| # | Item | Status |
|---|------|--------|
| T1 | Unit + golden test approach (structure, naming, coverage-guards) | ✅ DESIGNED |
| T2 | Golden examples ki exact list | ✅ DESIGNED (44 goldens 6 groups + G-group 5 server tests — F11 amendment) |
| T3 | Fuzz recipe (random generator + invariant asserts) | ✅ DESIGNED |
| T4 | Benchmark format (fixtures, runs, report) | ✅ DESIGNED |
| T5 | CI pipeline (kya chale, kab chale) | ✅ DESIGNED — **PART 8 COMPLETE** 🏁 |

## Locked outcomes

- **T1 (2026-08-03) LOCKED — Unit/golden approach + "missing test" ke 3
  pehredaar:** Structure = C7 mirror (time.test.ts, verbs.test.ts,
  diff.test.ts, merge.test.ts, otio.test.ts — jis design ka lock jahan,
  test wahin). Table-driven pattern jahan same-shakal cases (BC.3 ke 4 trim
  equations = 1 test + 4 rows). Naam = plain sentences + LOCK-ID PREFIX
  ("B1.1: collision counterexample") — spec-checklist ban jaata hai.
  Andaza ~40-50 test functions / ~300-400 rows (demo-size healthy).
  Aditya tests PADHEGA nahi — system report karega: (1) lock-ID gap-script
  (docs/11 lock list vs test-name list cross-check, ~10-line script, M7 CI-
  closure mein jab implemented lock-universe complete ho) — "BC.4 ka test
  missing" jaisa output; (2) coverage report
  CI mein (kabhi-na-chali lines = bhoola kona detector); (3) fuzz = anjaan
  gaps ka jaal. E2E/browser-robot tests OUT (demo-size par overkill —
  9-step demo manual). [Aditya lock 2026-08-03.]
- **T2 (2026-08-03) LOCKED — 44 golden tests 6 groups + G-group (5 server/
  state tests) [F11 amendment — neeche] (har ek = discussion
  mein hal ho chuki kahani, answer-key ban jayegi):**
  A. Split parivaar (11): vs-untouched/property/move/slip/trim-shrink/
  segment-erase-B2/trim-EXTENSION(advisor-fix)/delete-3-buttons/same-cut-
  converge/diff-cut-refinement/nested-naam+collision-counterexample.
  B. Khaane compose-conflict (8): move⊕trim compose, opposite trims,
  move-vs-move B1, prop same/diff, slip⊕extend→B1-escalation,
  negative-start, duration≤0, add+move→B3.
  [AMENDED 2026-08-04, M4 contract closure — "opposite trims" ka exact
  answer-key: start-edge aur end-edge ALAG coverage atoms hain. Combined
  remainder positive ho to auto-compose; exactly zero ya negative ho to B2.3
  ka same-clip Bucket 1. Same edge par same final value converge, different
  final values Bucket 1.]
  C. Merge machinery (7): spurious-B3 counterexample (advisor), click-order
  swap, dynamic naya conflict, cascade termination, delete-vs-ripple auto,
  delete² converge, resurrect-only-explicit.
  D. Identity/barabar (5): trim+untrim no-changes, delete+recreate =
  delete+add, defaults-materialize, order stability, round-trip structural.
  E. Shift (4): nearest left/right, tie→left, 0-paar→right, full-track→end.
  F. Diff sentences (7): 15-rules table-driven, multi-sentence, ripple
  render, catch-all, A3.8 errors, empty diff, import skip-warnings.
  Goldens apne area ki test-file mein hi baithenge (C7 mirror — alag
  golden-folder nahi). [Aditya lock 2026-08-03.]
  [AMENDED 2026-08-03, Codex final review F11 — ginti 42 → 44 + naya G
  group. (a) 2 PRD-5.5-mandated goldens jo list mein naam se nahi the:
  C-group mein +1 "merge abort → timeline bilkul untouched (draft-row
  delete)" (ab C=8), F-group mein +1 "missing media → 'Media unavailable'
  placeholder + export warning, kaam kabhi nahi rukta" (ab F=8).
  (b) NAYA group G — server/state named integration tests (5), ab tak
  sirf "~100 integration functions" ke approximate mein chhupe the:
  G1 response-lost retry: same ticket dobara → stored result wapas,
  DOOSRA commit nahi banta (HLD #16 Scene-B);
  G2 same ticket + ALAG endpoint → explicit error (F2-simplified contract
  ka sahi roop — payload-compare test NAHI, wo promise cut ho chuka);
  G3 dirty branch-switch → auto-seal commit banta hai + pending saaf
  (F5 ka naya darwaza);
  G4 merge finalize par head hil chuka (CAS fail) → E_STALE_HEAD, koi
  aadha-merge commit nahi (HLD #8);
  G5 capability-token mismatch → 404, doosre project ka data kabhi nahi
  (HLD #14 + F1 ke project_id columns ka enforcement test).
  In 5 ke naam bhi lock-ID prefix pattern follow karenge — gap-script
  inhe bhi ginega.]
- **T3 (2026-08-03) LOCKED — Fuzz recipe (4 hisse):** (1) random timeline
  generator — 1-3 tracks, 0-30 clips, valid-by-construction (overlap-free;
  empty timeline bhi kabhi-kabhi — A4 case); (2) random edit sequences —
  5-50 verbs, verb-aware (existing clips/valid jagah par taaki edits andar
  tak pahunchen) + thoda blind input (error-paths ke liye); (3) asserts:
  har edit ke baad invariant list clean (B2.3 wali EK list) · diff(A,A)=∅ ·
  apply(diff(A,B),A)=B · do-branch random edits ka merge DO baar → byte-
  identical · post-merge invariants clean · no silent resurrect · saare
  IDs unique (B1.1) ; (4) SEED RULE — har run seed number se, fail par CI
  seed print karta hai → same seed = exactly same case reproduce (bina
  iske fuzz-fail undebuggable). Ginti: 10,000 CI par (PRD 5.5 locked) +
  500 quick-mode local. [Aditya lock 2026-08-03.]
  [AMENDED 2026-08-04, M4 contract closure — T3 ka
  `apply(diff(A,B),A)=B` public semantic `computeDiff` ko patch banane ka
  order NAHI. M4 ek private lossless internal `MergeDelta` (ya equivalent
  private representation) derive/apply karega aur fuzz exact property
  `applyDelta(A, makeDelta(A,B))` byte-equals `B` prove karega. `computeDiff`
  ka current public/UI contract unchanged; public `applyDiff` ya eighth
  function add nahi hoga. `makeDelta`/`applyDelta` naam aur helper split
  private implementation details hain; lossless round-trip property lock hai.]
- **T4 (2026-08-03) LOCKED — Benchmark format:** naapa jayega (4): diff
  @1k/10k · merge @1k/10k (conflict fixtures + SPLIT-HEAVY variant —
  refinement ka wazan) · single-verb apply · restore (snapshot+replay,
  ≤10-kadam guarantee ka naap). Method: har number = 10 runs ka MEDIAN
  (average nahi) + 3 warm-up runs (ginti ke bahar) + report mein machine/
  Node-version/fixture-shakal documented (koi bhi reproduce kar sake —
  honest numbers). Report: benchmarks/REPORT.md committed, fixed table;
  application email headline isi se ("semantic diff of a 10,000-clip
  timeline in X ms, backed by Y tests"). HLD #18 ka 3-column honest
  framing (MEASURED / PATTERN-CORRECT / DESIGNED-FOR) intact — report
  MEASURED column bharta hai. [Aditya lock 2026-08-03.]
- **T5 (2026-08-03) LOCKED — CI pipeline (GitHub Actions, har push/PR):**
  order: (1) typecheck → (2) lint → (3) unit+golden+integration (~100
  functions) → (4) fuzz 10k (seed-print) → (5) coverage + lock-ID
  gap-script. Koi step fail = merge block; sab pass = green badge (README
  par). Benchmarks CI mein NAHI — local script + committed report (HLD #16
  — CI hardware inconsistent, numbers unreliable). **Activation clarification
  (2026-08-04, M2/M3 review I4 owner resolution):** steps 1–3 abhi har push/PR;
  step 4 M4 fuzz harness ke saath; step 5 M7 CI-closure par, jab M2–M7 ke
  engine/OTIO/server tests aur lock-ID universe implemented hon. Uske baad
  poora 1–5 order har push/PR par merge-blocking. Future locks ko missing bolne
  wali milestone-aware machinery abhi banana required nahi. [Aditya lock
  2026-08-03; activation timing clarified by owner 2026-08-04.]

**🏁 PART 8 COMPLETE (T1-T5, 2026-08-03). NEXT: CODE (Part 8.5 build), phir
Part 9 (demo video + deploy + docs-consolidation + application).**
