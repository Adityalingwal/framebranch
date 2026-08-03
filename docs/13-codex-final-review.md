# Codex Final Pre-Code Review — 2026-08-03

## Triage resolutions (running log — Aditya ke saath ek-ek discuss)

- **F1 RESOLVED (2026-08-03): ACCEPTED — fix applied.** ops/snapshots/
  working_state mein `project_id` add (docs/11 C3 amended). Genuine gap tha:
  HLD #14 ka locked rule C3 columns mein 3 jagah utaarna reh gaya; C3 ki
  apni index-line se bhi contradiction tha. Tenant-ID-per-table pattern
  first principles se bhi justified (uniform WHERE-check, chowkidaar
  cleanup, cost ~zero). Table count 8 unchanged.

- **F2 RESOLVED (2026-08-03): ACCEPTED as contradiction, fixed the OTHER
  way — promise simplified, no new column.** Codex ka observation sahi tha
  (locked error enforce nahi ho sakta tha), par fix mein humne fingerprint
  column ADD karne ki jagah payload-mismatch promise ko hi CUT kiya
  (docs/09 HLD #16 amended). Reasoning: har click par naya UUID banta hai,
  to same-ticket-different-payload sirf client-bug ya manual API-hit se
  possible; us case mein bhi server dobara kaam nahi karta (corruption
  zero), sirf stored jawab lautta hai — low harm, isliye uske liye
  fingerprint storage over-engineering. Jo enforce ho sakta hai wahi
  promise raha: ticket-hit → stored result; same ticket + alag endpoint →
  explicit error (endpoint column already stored). Core idempotency
  (double-work prevention) fully intact.

- **F3 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik).** docs/11 A2.3: Timeline mein `mediaRefs: MediaRef[]`
  ADD (parchiyon ka aggregate ghar; snapshots ke timeline-JSON ke saath
  free persistence). docs/11 A2.1: MediaRef mein `kind:
  "video"|"audio"|"image"` ADD (track-kind-match check + image property
  applicability ke liye). Koi naya domain type ya DB table nahi. Clip
  identity clip ke apne stable id se hi hai — shared mediaRefId se koi
  ambiguity nahi (discussed + confirmed).

- **F4 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik).** docs/11 A3.1 amended: addClip verb EK hi, teen roop —
  media-clip payload + text-clip payload (fields se discriminate; text-roop
  ke apne preconditions) + engine-INTERNAL restore-roop (poora preimage id
  samet, API se kabhi accept nahi) jo deleteClip ke inverse ko identity-
  preserving banata hai. Verb count 8 unchanged, koi naya endpoint nahi.

- **F5 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  direction ke mutabik: explicit branch everywhere + switch defined).**
  docs/11 C4 amended: (a) commit/restore/agent-simulate/export sab mein
  explicit `branch` field (stateless selection, multi-tab safe; server-side
  current-branch column REJECTED), (b) naya POST branch/switch {from,to} —
  ek transaction mein dirty-branch auto-seal (HLD ke pehle-se-locked 6
  boundary auto-seals + template naming ka hi trigger; koi naya rule/
  template nahi) + target branch ka state response, (c) POST branch
  {name, from} create+switch semantics clarified. DB schema zero change.

- **F6 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik: har mutating endpoint ka exact success-data shape
  enumerate).** docs/11 C4 amended: sab ~10 mutating darwazon ke response
  shapes + shared conflict-object shape + counts shape likhe — sab purane
  B2/B3/PRD locks se derive, zero naya design decision. Do derivations
  explicitly note kiye: (1) zero-conflict merge turant finalize (phase-2
  khaali), (2) aakhri resolve par finalize automatic ("sab sulajhne ke
  BAAD hi commit" lock ka seedha consequence) — koi alag finalize
  endpoint/button nahi.

- **F7 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik).** commits table mein `import_warnings` (JSON, nullable)
  column ADD (docs/11 C3 amended) — sirf import-commits par bhara, baaki
  NULL. Maqsad discuss hua: restore nahi (skipped content wapas nahi aata),
  provenance/transparency — refresh-proof saboot ki import mein kya skip
  hua (no-tricks philosophy + PRD #17 ka pehle se locked promise). Koi
  naya table nahi, normal commits par zero asar.

- **F8 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke dono
  suggested options mein se "remove" chuna).** docs/11 C4 error-list
  amended: E_TRACK_NOT_FOUND + E_MEDIA_NOT_FOUND ADD (A3.1 use karta tha),
  E_ID_COLLISION REMOVE (B1.1 formula-IDs + engine-minted IDs se V1 mein
  unreachable — jo case ho hi nahi sakta uska code list mein confusion
  hai). Official list ab true exhaustive union; zero behavior change.

- **F9 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik).** docs/11 C4 POST-ops response ke do roop lock kiye:
  asli edit → `{ workingRev:+1, pendingCount }`; no-change → `{ noChange:
  true, workingRev/pendingCount UNCHANGED }`. Counter-rule (C3) aur A4
  no-change lock pehle se sahi the — sirf C4 ka unconditional "+1"
  response format jhooth bolta tha (client-server desync → faltu
  E_STALE_REV). DB/logic zero change.

- **F10 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik: list naam kar di, koi aur expansion nahi).** docs/11
  BC.5 amended: V1 font whitelist = ["Arial", "Georgia", "Courier New"],
  default "Arial". System-fonts-only reasoning (zero loading setup,
  visually distinct for diff demo); webfonts rejected.

- **F11 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik: named additions + count update, approximate mein nahi
  chhupaya).** docs/12 T2 amended: goldens 42 → 44 (merge-abort-untouched
  + missing-media-placeholder — dono PRD 5.5 mandated the) + naya G group
  = 5 named server/state integration tests (response-lost idempotency,
  wrong-endpoint ticket error [F2-simplified contract ke mutabik —
  different-payload test ab exist nahi karta kyunki wo promise F2 mein
  cut hua], branch-switch auto-seal [F5], merge-finalize CAS E_STALE_HEAD,
  capability-token 404 isolation [F1 enforcement]). Lock-ID naming +
  gap-script coverage in par bhi lagoo.

- **F12 RESOLVED (2026-08-03): ACCEPTED — fix applied (Codex ke suggested
  fix ke mutabik).** docs/11 C8 amended: (1) canonical EXACTLY-9 numbered
  steps with expected results — PRD 5.1 ka "dono taraf edits" grouping
  wapas (pehle 10 actions "9" kehlati thin); (2) D ki poori addClip
  command values ke saath (b-roll media, video track, source 0-5s,
  timeline 0:20-0:25) — user ki C-move ke saath same-track same-start →
  B3 overlap ab command se guaranteed, coder-guess se nahi.

- **F13 RESOLVED (2026-08-03): ACCEPTED — count fix.** docs/11 C7 + docs/07
  dono jagah "6-function" → "7-function" (importOtio/exportOtio do alag
  functions — Codex sahi tha). Zero behavior change.

- **F14 RESOLVED (2026-08-03): ACCEPTED — stale block replaced.** docs/07
  ke end ka purana "Part 6/7/8 sab pending" roadmap current state se
  replace (Parts 1-8 complete → build-order confirm → CODE → Part 9).

- **Q1 ANSWERED (2026-08-03): YES — import/restore/merge commits hamesha
  full snapshot, snapshot_distance = 0.** Naya decision nahi, logically
  forced: import ka koi parent nahi (op-delta impossible) aur restore ka
  "become commit X" koi verb nahi — dono sirf snapshot se represent ho
  sakte hain. docs/11 C3 mein clarification likh di.

- **Q2 ANSWERED (2026-08-03): NO — utri clip kabhi draft se wapas nahi
  nikalti.** Dynamic conflict mein already-materialized clip sirf
  participant hoti hai (draft mein rehti hai); resolution use draft ke
  andar handle karta hai. Chain/cycle impossible: C2 ka Shift rule
  "nearest FREE slot" hi target karta hai → shift se naya overlap ban hi
  nahi sakta. Isliye B3.4 ka monotonic proof intact — koi naya proof/fix
  nahi chahiye. docs/11 B3.4 mein clarification likh di.

- **Q3 ANSWERED (2026-08-03): former — "back to original", literal
  removal NAHI.** [Remove both] = dono conflicting changes ka base-revert:
  har participant apni base halat mein wapas; jo participant base mein
  exist nahi karta tha (naya add) uska base-revert = removal. docs/07 ka
  poora label sahi tha, B2.2 ka chhota label ambiguous — docs/11 B2.2
  mein exact rule likh diya. Design change zero.

**🏁 TRIAGE COMPLETE — 14/14 findings resolved + 3/3 questions answered
(2026-08-03). Design ab final-review-proof; agla gate: build-order
confirm → CODE.**

## Summary
- Critical: 6 | Important: 6 | Minor: 2 | Questions: 3
- Overall verdict: the semantic engine design is unusually thorough, but code should not start until the closed DB/API contracts are reconciled with tenant isolation, media ownership, text-clip creation, and the executable demo workflow.

## Findings

### F1 [CRITICAL] The exact DB schema violates the locked per-project isolation rule
- Where: docs/09-hld-checklist.md:296-301; docs/11-lld-checklist.md:490-523
- What: HLD requires every table row to carry `project_id`, but C3 omits it from `ops`, `snapshots`, and `working_state`; C3 then simultaneously requires a `project_id` index on every table.
- Evidence: “Har table row project_id carry karti hai.” / “(4) **ops**: id, commit_id, seq ...” / “(5) **snapshots**: commit_id, timeline ...” / “(6) **working_state**: branch_id ...” / “Standard indexes: har table par project_id”.
- Why it matters: The capability-token boundary cannot be enforced directly on those rows as locked, and the stated index set cannot even be created from the stated columns. This is a lock conflict in the public-demo isolation boundary.
- Suggested fix: Add `project_id` to those three existing tables and lock their project-scoped foreign-key/uniqueness rules. This preserves the eight-table lock.

### F2 [CRITICAL] The tickets table cannot enforce the locked same-ticket/different-payload error
- Where: docs/09-hld-checklist.md:310-319; docs/11-lld-checklist.md:512-523
- What: HLD locks an explicit error when one ticket is reused with a different payload, but the exact C3 row stores only ticket, project, endpoint, result, and time—nothing that identifies the original payload.
- Evidence: “same ticket + alag payload → explicit error (\"ticket already used with different request\")” / “**tickets**: ticket ... project_id, endpoint ... result ... created_at”.
- Why it matters: A retry using the same ticket and endpoint but different input is indistinguishable from a valid retry, so the server can return the stored result for the wrong operation. That contradicts the locked idempotency contract.
- Suggested fix: Add a canonical request fingerprint to the existing `tickets` row and define equality/error behavior against it; keep the table count and ticket scope unchanged.

### F3 [CRITICAL] Media references have neither an aggregate home nor enough type data
- Where: docs/07-session-progress.md:178-182; docs/11-lld-checklist.md:86-108; docs/11-lld-checklist.md:117-129; docs/11-lld-checklist.md:478-524
- What: `MediaRef` is defined, but `Timeline` contains only rate and tracks and no C3 table owns media refs. `MediaRef` also has no media kind, although `addClip` must validate track-kind compatibility and the PRD separately supports image applicability.
- Evidence: “`MediaRef = { id, url, hash, sourceRate, durationInSource }`” / “`Timeline = { projectRate, tracks: Track[] }`” / “media exists (E_MEDIA_NOT_FOUND) ... track-kind match” / “opacity (0-100, video/image/text)”.
- Why it matters: Imported pointers cannot be durably looked up, preview/export cannot obtain their URLs from a timeline state, and `E_MEDIA_NOT_FOUND` / `E_TRACK_KIND_MISMATCH` cannot be evaluated from the designed model. This blocks the import-preview-export demo path.
- Suggested fix: Add `mediaRefs: MediaRef[]` to the existing Timeline aggregate and add an explicit media kind to `MediaRef`, including the locked mapping and property applicability for images. No new domain type or DB table is required.

### F4 [CRITICAL] The locked `addClip` contract cannot create a TextClip or realize `deleteClip`'s inverse
- Where: docs/07-session-progress.md:184-188; docs/11-lld-checklist.md:117-136
- What: The PRD says TextClip uses the same verbs except slip, but `addClip` always requires media/source ranges and only creates `Clip`. The promised delete inverse also needs the old ID and all old values, which the add command cannot accept.
- Evidence: “Wahi 8 verbs chalte hain (slip exclude — source range nahi hai)” / “Command: `{ op:\"addClip\", trackId, mediaRefId, sourceRange, timelineRange }`” / “Transition: track mein naya Clip, id engine mint karta hai.” / “Inverse: addClip (puraani saari values).”
- Why it matters: One locked verb family and one of the required five contract questions are impossible as written. Caption creation and identity-preserving undo/replay would require code-time invention.
- Suggested fix: Keep one `addClip` verb but lock media-clip and text-clip payload variants, plus the internal captured-preimage form that restores the original ID and values.

### F5 [CRITICAL] Branch-scoped mutations have no complete branch-selection contract
- Where: docs/07-session-progress.md:64-72; docs/09-hld-checklist.md:65-68; docs/11-lld-checklist.md:480-485; docs/11-lld-checklist.md:530-546
- What: Branch create+switch and switch-time commit are locked, yet C4 defines no switch operation. Only `GET timeline` and `POST ops` carry a branch; commit, restore, agent, and export do not, while C3 stores no current branch on the project.
- Evidence: “branch lifecycle = create+switch only” / “branch-switch ... dirty ho to ... auto-seal” / “POST commit {name?} ... POST restore {commitId} ... POST agent/simulate {script} ... POST export {}”.
- Why it matters: The server cannot unambiguously know which branch to commit, restore into, preview/export, or hand to the agent. The main-versus-agent branch choreography can therefore not be implemented from the API and persistence contracts as written.
- Suggested fix: Make selected branch explicit on every branch-scoped request and define create-versus-switch behavior on `POST branch` while preserving the existing single ops endpoint and create+switch-only scope.

### F6 [CRITICAL] C4 omits the response data required to run the conflict UI
- Where: docs/07-session-progress.md:189-193; docs/11-lld-checklist.md:371-380; docs/11-lld-checklist.md:525-547
- What: C4 gives request shorthand for the mutating endpoints but no success payloads for merge, resolve, import, abort, restore, branch, agent, or reset. In particular, no response is defined to deliver `attemptId`, ordered conflicts/choices, dynamic counts, final commit, or itemized import warnings.
- Evidence: “UI ginti sach bolti hai (\"2 resolved · 1 baaki · 1 naya mila\")” / “SKIP with visible itemized list” / “Baaki mutating darwaze same pattern ... Shapes purane locks se seedhe derive”.
- Why it matters: After `POST merge`, the UI has no specified way to learn the merge-attempt ID or render the first conflict, and after a resolution it has no specified way to render dynamic conflicts. That breaks the conflict-resolution steps of the demo as designed.
- Suggested fix: Enumerate the exact success `data` shape for every mutating endpoint, especially merge/start, merge/resolve, import, and finalization; reuse the locked envelope.

### F7 [IMPORTANT] The durable skipped-import record has no persistence field
- Where: docs/07-session-progress.md:189-193; docs/09-hld-checklist.md:272-279; docs/11-lld-checklist.md:478-524
- What: The PRD locks saving the itemized skipped-content record in the import commit, but C3's closed eight-table schema has no commit metadata, import-warning field, or Timeline field for it.
- Evidence: “Skipped record commit mein save” / “Skipped-content records ... export ka hissa nahi — import-time warning hi unka poora jeevan hai.” / “**commits**: id ... name ... actor ... snapshot_distance ... created_at.”
- Why it matters: Refresh/history cannot retain the promised provenance of lossy import, so the implementation must either silently drop a locked record or invent an undocumented storage location.
- Suggested fix: Add a nullable itemized import-warning/skipped-items field to the existing commit row (or explicitly lock an equivalent existing-aggregate location); do not add a table or preserve unsupported OTIO content.

### F8 [IMPORTANT] The official error-code list is not the verb-contract master set
- Where: docs/11-lld-checklist.md:117-129; docs/11-lld-checklist.md:224-244; docs/11-lld-checklist.md:264-280; docs/11-lld-checklist.md:548-556
- What: `addClip` requires `E_TRACK_NOT_FOUND` and `E_MEDIA_NOT_FOUND`, but C4 omits both from the official list. Conversely, C4 includes `E_ID_COLLISION` although A3.8 says its four listed errors are complete and B1.1 makes the named collision impossible.
- Evidence: “track exists (E_TRACK_NOT_FOUND) / media exists (E_MEDIA_NOT_FOUND)” / “Errors: upar ke 4 typed codes.” / “Phase A verb codes (... E_ID_COLLISION) ... official list ek jagah”.
- Why it matters: API schemas, UI switches, and the promised error-reference tests will disagree on the closed union.
- Suggested fix: Make C4 a true exhaustive union: add the two used codes and either define the exact reachable contract for `E_ID_COLLISION` or remove it from V1.

### F9 [IMPORTANT] No-change behavior contradicts the working-revision API
- Where: docs/11-lld-checklist.md:190-199; docs/11-lld-checklist.md:498-504; docs/11-lld-checklist.md:536-540
- What: A4 promises a `noChange` flag and no pending/op-log entry, but C4 omits the flag and unconditionally returns `workingRev: +1`; C3 says the revision advances only when an edit is applied.
- Evidence: “SUCCESS + noChange flag, pending/op-log mein ENTRY NAHI” / “har manzoor edit par +1; manzoor = ... edit LAGAYA” / “success resp = `{ workingRev: +1, pendingCount }`”.
- Why it matters: Client CAS state and save feedback can diverge on a normal degenerate command, and the locked flag is not representable in the response.
- Suggested fix: Lock a no-op response containing `noChange: true`, unchanged `workingRev`, and unchanged `pendingCount`; document the changed-command response separately.

### F10 [IMPORTANT] The fixed font whitelist was deferred past the completed phase
- Where: docs/11-lld-checklist.md:167-178; docs/11-lld-checklist.md:422-429; docs/11-lld-checklist.md:443-477
- What: `textStyle` validation requires a fixed font list and defaults to its first entry, but BC.5 defers that list to Phase C; Phase C is complete without naming it.
- Evidence: “textStyle font fixed-list” / “font = fixed list ka PEHLA (font list khud Phase C mein UI ke saath finalize — abhi lock karna premature)” / “## Phase C locked outcomes”.
- Why it matters: The Zod schema, canonical default materialization, property equality, fixtures, and tests cannot agree on valid/default font values.
- Suggested fix: Name the small exact V1 font list and its first/default entry in BC.5 or C4; make no other text-style expansion.

### F11 [IMPORTANT] The test plan omits explicitly promised edge and server-state tests
- Where: docs/07-session-progress.md:103-120; docs/12-test-benchmark-plan.md:17-59; docs/12-test-benchmark-plan.md:71-76
- What: The exhaustive 42-golden list does not name missing-media placeholder/export-warning or merge-abort-untouched tests, despite PRD 5.5 explicitly requiring both. It also names no storage/API scenarios for response-lost idempotency, different-payload ticket reuse, branch-switch commit, merge-head CAS, or capability-token isolation.
- Evidence: “har discussed edge case ka test ... missing media ... merge abort” and “retry idempotent” / “Structure = C7 mirror (time.test.ts, verbs.test.ts, diff.test.ts, merge.test.ts, otio.test.ts)” / “unit+golden+integration (~100 functions)”.
- Why it matters: Engine coverage can be green while the stateful guarantees that protect the demo and database remain unverified; the lock-ID gap script does not supply missing test scenarios by itself.
- Suggested fix: Add named API/storage integration cases for those locks and add the two PRD-mandated edges to the explicit inventory; update the 42 count rather than hiding them under the approximate integration total.

### F12 [IMPORTANT] C8's “exact 9 steps” are ten actions and its B3-producing add is underspecified
- Where: docs/07-session-progress.md:64-72; docs/07-session-progress.md:195-200; docs/11-lld-checklist.md:117-129; docs/11-lld-checklist.md:599-610
- What: PRD groups both sides' edits before preview, while C8 lists user edits, preview, and agent edits as separate arrows—ten actions while calling them nine. `D add @0:20` also omits the track, media ref, source range, and duration required by A3.1.
- Evidence: “branch → dono taraf edits ... → single-clip preview” / “9-step scripted demo list with expected results” / “user ke 3 edits → single-clip preview → agent button ...” / “D add @0:20”.
- Why it matters: The measurable done-checklist has no single canonical sequence, and the allegedly guaranteed Bucket-3 overlap still requires code-time fixture/command decisions.
- Suggested fix: Rewrite C8 as exactly nine numbered rows with expected results, grouping user+agent edits as PRD 5.1 does, and provide the complete locked `addClip` command/fixture values for D.

### F13 [MINOR] The public API count disagrees with its own export list
- Where: docs/07-session-progress.md:295-303; docs/11-lld-checklist.md:541-546; docs/11-lld-checklist.md:581-591
- What: Both summaries call the surface “6 functions”, but C7 names seven callable functions because `importOtio` and `exportOtio` are distinct operations.
- Evidence: “6-function public API” / “applyCommand, computeDiff, startMerge, applyChoice, finalizeCheck, importOtio/exportOtio”.
- Why it matters: This is zero architectural risk, but it will make the index export and lock-ID checklist disagree immediately.
- Suggested fix: Change the count to seven, or explicitly define one adapter object/function if six is truly intended; do not alter behavior.

### F14 [MINOR] The canonical progress log still ends with a superseded pending roadmap
- Where: docs/07-session-progress.md:307-323; docs/07-session-progress.md:349-356
- What: Part 8 is marked complete and “NEXT: CODE”, but the later roadmap still says Parts 6, 7, and 8 are pending.
- Evidence: “Part 8 — COMPLETE” / “NEXT: CODE” / “Part 6 HLD, Part 7 LLD ... Part 8 test/benchmark plan ... sab pending.”
- Why it matters: Zero runtime risk, but a new implementer following the canonical narrative can misread the actual gate state.
- Suggested fix: Replace the obsolete roadmap block with the current code→Part 9 sequence already stated at lines 322-323.

## Questions (not findings)
Q1: Are restore commits and the initial import commit always full snapshots with `snapshot_distance = 0`? Restore must create a new commit with old content (docs/09-hld-checklist.md:79-82), but the later cadence only explicitly guarantees every Nth commit and every merge as snapshots (docs/09-hld-checklist.md:257-264), and C3 does not settle restore/import behavior (docs/11-lld-checklist.md:486-504).

Q2: In a dynamic conflict involving a clip that was already materialized by an earlier resolution, is that earlier clip removed from the draft again? If yes, the stated measure “utri clip dobara nahi utarti; rukki clips ki ginti strictly ghat-ti hai” needs a different monotonic proof; the participant-removal and recompute rules do not make this clear (docs/11-lld-checklist.md:354-380; docs/11-lld-checklist.md:505-510).

Q3: For Bucket 3, does `[Remove both — back to original]` revert both conflicting changes to their base values, or literally remove both clips? docs/07 names the former outcome (docs/07-session-progress.md:152-163), while B2.2 shortens the label to `[Remove both]` and C2 only defines Shift semantics (docs/11-lld-checklist.md:281-289; docs/11-lld-checklist.md:463-477).

## Checked-clean categories
- Cross-document coherence: not clean — see F1-F6, F12-F13.
- Dangling references / undecided leftovers: not clean — see F10 and F14. The `schemaVersion` cut itself was checked and no active C3/C4/C7 dependency remains (docs/09-hld-checklist.md:119-125; docs/11-lld-checklist.md:493-497; docs/11-lld-checklist.md:557-568); the BC.2 and BC.6 amendments claimed by docs/11 are present in docs/07 (docs/07-session-progress.md:103-110; docs/07-session-progress.md:152-163; docs/11-lld-checklist.md:396-402; docs/11-lld-checklist.md:430-437).
- Contract completeness: not clean — see F2-F9 and F13.
- Test coverage: not clean — see F11.
- Demo feasibility: not clean — see F3-F6 and F12.
- Genuinely missed edge cases: checked, none found as a definite additional finding after the A4, split-family, three-door conflict, dynamic-conflict, catch-all, and nearest-slot rules were applied. The two ambiguous merge cases are Questions Q2-Q3 rather than asserted findings.
