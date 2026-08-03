# FrameBranch — Discussion Progress Log

> Purpose: is file se koi bhi agent (Claude Code, Codex, ya koi aur) ya Aditya khud
> conversation resume kar sakta hai. Ye canonical running state hai — har session ke
> baad update karo. Last updated: 2026-08-01.

## How to resume

**PEHLE docs/00-INDEX.md padho** — kaunse docs canonical hain, kaunse
superseded, aur conflict par kaun jeet-ta hai (precedence rules) sab wahan.
Naya session shuru karte waqt agent ko bolo: "FrameBranch folder ke saare docs padho,
especially docs/07-session-progress.md, aur wahi se continue karo." Agent ko ye bhi
batao: Aditya se Hinglish mein, chhote chunks mein, beginner-friendly baat karni hai
(heavy jargon break down karke), aur har decision par discussion karke hi lock karna hai.

## Verified facts (2026-08-01, live browser check)

- Cardboard ne version control AB TAK SHIP NAHI kiya. Changelog v0.1 (Nov 2025) se
  v0.35 (Jul 27, 2026) tak poora padha. Sirf: Chat Checkpoints (linear restore,
  v0.14) + Share Links (published vs draft, v0.32). Branch/diff/merge/conflict — kuch nahi.
- Jul 27, 2026 release "References" = Style References problem ka early wedge unhone
  khud ship kar diya → Version Control choose karna aur validate hua.
- Cardboard tech stack (live site se sniff kiya): Next.js 16.2.6 (App Router +
  Turbopack), React, Vercel hosting, Clerk auth, Sentry, PostHog (proxy:
  edits.usecardboard.com), GA4/FB/Twitter pixels. Editor: WebCodecs/WebGPU family,
  local browser export. Backend language/DB bahar se unknown (login ke peeche).
- Isliye locked: FrameBranch TypeScript + Next.js/React + Node ecosystem mein banega
  (unke stack se align).

## Teaching progress (Aditya ke saath parts)

- Part 1 DONE — video basics: timeline (plan, video nahi), track (=lane; kitni cheezein
  EK SAATH chalani hain usse tracks decide, files se nahi), clip (file ka tukda ek lane
  mein), media reference (pointer; file store immutable; hash=fingerprint FILE ka,
  stable ID CLIP ka — do alag cheezein), source range (kya dikhana) vs timeline range
  (kab dikhana), move/trim/slip in ranges se distinguish hote hain, gap, transition
  (do clips ke beech boundary pe), frame rate, rational time (fraction, drift se bachne
  ke liye). Invariants seekhe: no overlap same track, no negative/zero duration, source
  range file ke andar, split ke baad stable identity.
- Part 2 DONE — Cardboard gap: checkpoints = time machine (sirf peeche), FrameBranch =
  parallel universes + jodna. Unke hard-problems doc ke 3 sawaal (diff kaisa dikhe,
  conflict friction-free kaise, git samjhe bina) = UX-heavy brief. Version control
  akele user + AI agent ke liye bhi valuable (agent = doosra editor).
- Part 3 DONE — VCS fundamentals: commit = snapshot + parent pointer + metadata
  (kisne/kab/kyun; human vs agent provenance). Chain = history. Commit ID = hash,
  isliye distributed/parallel commits kabhi clash nahi karte, koi counter coordination
  nahi. Hybrid storage = bank passbook analogy (roz transactions/op-log + beech-beech
  poora balance/snapshot; lookup cost bounded). Branch = sticky note (naam + commit
  ID), copy kuch nahi hota, sirf explicit action par hilti hai — main kabhi auto-shift
  nahi hota. HEAD = kahan khade ho. Diff = 3 deterministic steps: match (stable IDs) →
  classify (~15 if-else rules: move/trim/slip/property...) → render (templates,
  editor-language). AI core diff mein NAHI (determinism, testability, no silent lies);
  catch-all rule = truthful raw fallback, kuch escape nahi kar sakta (finite fields
  argument — Git 3 rules se saara code handle karta hai). Operation log (kadam-kadam,
  provenance) + compare engine (net result) dono rakhenge. Three-way merge: base =
  common ancestor, diff(base→ours) + diff(base→theirs), 4 rules (koi nahi chhua/ek ne/
  dono alag fields/dono same field=conflict), merge ke BAAD invariants dubara chalao
  (overlap-after-merge case — Git ke paas ye step nahi, video-specific), merge commit
  ke 2 parents, sab deterministic.
- Part 4 DONE — CodeX ke 9 locked decisions review kiye, sab LOCKED with 2 amendments:
  (a) OTIO = import/export boundary only (JSON format, reader/writer khud likhenge TS
  mein — official lib Python/C++ hai), internal normalized model apna. (b) Design-first
  LOCKED but THIN + timeboxed docs (analysis paralysis se bachna). Live collab/CRDT V1
  se OUT — VC foundation hai, collab uske upar ki manzil; interview answer ready.
- Part 5 IN PROGRESS — PRD as 5 micro-decisions:
  - 5.1 LOCKED: 1 user + 1 agent (multi-user/login OUT). Agent = "Simulate agent edits"
    button (scripted edits, actor:agent provenance; asli AI optional baad mein — Aditya
    ke paas credits hain). Demo kahani 9 steps: import OTIO → branch → dono taraf edits
    (user+agent) → single-clip preview (Level A) → diff → merge → conflict resolve →
    history (👤/🤖 badges) + restore → export OTIO. Playback: Level A ONLY (single-clip
    preview via HTML5 video); full timeline playback (Level B) hard OUT. Thumbnails
    clips par honge. PRD-level edge cases captured: invalid OTIO import → clean error;
    empty diff → "no changes" state; merge abort/cancel (timeline untouched); branch
    lifecycle = create+switch only (rename/delete OUT); empty timeline valid.
  - 5.2 LOCKED — operations = system ke official "verbs". 8 IN: add clip, delete
    clip, move, trim (start/end), slip, split, generic property change, ripple
    delete (composite). 5 OUT (V2/discussion-points): transitions (boundary merge
    semantics gande), named effects (property change covers), track reorder (demo
    mein zaroorat nahi), separate caption ops (captions = TEXT CLIPS on text track —
    zero naye verbs), direct timeline-range change (move+trim se covered, duplicate
    verb = diff confusion). Har op ka bill: edit code + inverse + diff rule +
    template + merge rules + conflict rules + tests (~6 jagah kaam). Split = risky
    IN (identity problem) but interview gold — exact design LLD mein (Fusion wahan).
  - 5.3 LOCKED — Conflict UX = Level 2: visual side-by-side bars (base/ours/theirs
    strips) + ek-line editor-language explanation + [Ours][Theirs][Manual] buttons.
    Level 1 (text-only) rejected: Cardboard ka ask "editor bina git samjhe resolve
    kare" pura nahi hota. Level 3 (live preview + drag) rejected: half-baked trap.
    Conflict TYPES = 3 buckets (verbs 8 hain, par har pair-takkar inhi mein girti
    hai): (1) same cheez do values (trim vs trim, volume vs volume...), (2) delete
    vs kuch-bhi, (3) jod ke invariant toota (overlap after merge). Sirf 3 UI
    patterns banane hain. Demo mein teeno dikhane hain.
  - 5.4 LOCKED — Non-goals (10): live collab/CRDT, multi-user/login/permissions,
    media BYTES versioning (sirf pointer/fingerprint level — "dabbe ka hisaab,
    dabbe ke andar ki jaanch nahi"), asli AI (simulation button kaafi), Cardboard
    direct integration (OTIO hi darwaza), full timeline playback Level B (sirf
    Level A single-clip preview), transitions/effects/track-reorder, full NLE,
    video rendering/mp4 export (sirf OTIO export), UI optimization beyond
    demo-size ("engine ka dum number se saabit — 10k-clip benchmarks; UI polish
    demo-size 10-30 clips tak; virtualization = talking point").
    NOTE "V2" ki definition: V2 koi planned release NAHI hai — ye label hai
    "jaan-boojh ke bahar, par raasta socha hua" ke liye. Iski value: scope
    discipline + interview talking points + application ka future-work vision.
    Hire hua to team ke saath banega, nahi to kabhi nahi — dono mein V2 ka
    purpose serve ho chuka hai.
  - 5.5 LOCKED — Success criteria = "done" checklist, 4 sections + stop-rule:
    (A) Functional: 9-step demo kahani end-to-end bina atke; teeno conflict
    buckets demo mein dikhte + resolve hote; OTIO export → re-import round-trip
    proof. (B) Tests: diff invariants (diff(A,A)=empty; apply(diff(A,B),A)=B;
    empty patch = identity), merge invariants (independent changes kabhi conflict
    nahi; same input = same result; merge ke baad koi invariant toota nahi;
    deleted clip kabhi SILENTLY resurrect nahi hoti — sirf explicit user
    resolution se [2026-08-02 LLD BC.2 wording fix]; retry idempotent),
    property/fuzz tests
    (hazaaron random timelines + random op sequences pe sab invariants pass),
    har discussed edge case ka test (ulti/zero clip, source range file ke bahar,
    overlap same track, missing media, kharab/invalid OTIO, empty timeline,
    empty diff, merge abort). (C) Benchmarks: 1k + 10k clips pe diff + merge
    time, machine/runtime/fixture-shape/repetitions documented, honest numbers;
    email-ready line: "10,000-clip timeline ka semantic diff X ms mein, Y tests
    ke saath". (D) Shipping: Vercel live link, 2-3 min demo video, public GitHub
    repo with clean README + PRD/HLD/LLD/decision log. STOP-RULE: checklist
    poori = ruk jao, koi naya feature nahi, sirf application bhejni hai.

  PRD (PART 5) COMPLETE — 5.1 se 5.5 sab LOCKED. ✅

## Codex PRD review — DONE (2026-08-01) + triage

Codex (non-interactive, read-only) ne PRD review kiya → docs/08-codex-prd-review.md
(22 findings: 8 Critical, 12 Important, 2 Minor + 22 decision points). Aditya ke
saath triage hua, TEEN buckets:

- BUCKET A (8 findings — genuine PRD-level holes, ABHI ek-ek karke discuss + decide
  + PRD update): #1 Manual button ka exact interaction undefined; #3 ripple delete
  single-track ya all-tracks; #8 post-merge invariant failure ka policy (reject vs
  conflict-bucket-3); #15 property-change WHITELIST (warna cut features ka backdoor);
  #16 caption/text-clip minimum schema; #17 OTIO unsupported constructs ka import
  policy (reject vs warn+drop); #20 success checklist ko measurable banana; #21
  docs/03-06 ko "superseded by docs/07" mark karna.
- BUCKET B (12 findings — sahi sawaal, GALAT time: ye HLD/LLD material hai jo
  already Part 6/7 ke liye scheduled tha; Part 6/7 ki agenda mein add karo, abhi
  decide NAHI): #2 split lineage (LLD + Fusion), #5 operation contracts (typed
  commands, preconditions, inverse), #6/#7 internal conflict taxonomy formal
  (buckets = UI grouping, andar richer classification), #9 diff source of truth
  (op-log vs net-state), #10 branch/HEAD/dirty-state state machine, #11 storage
  cadence/compaction/atomicity, #12 optimistic concurrency stale-head behavior,
  #13 rational-time contract (rates, rounding), #14 degenerate ops ke typed
  outcomes, #18 OTIO schema-version policy, #19 asset hash validation, #22
  semantic equivalence / canonical ordering.
- BUCKET C (minor/quick): #21 ka doc-cleanup part (5 min), #22 already B mein.

STATUS: Bucket A discussion IN PROGRESS. Har finding par: Codex ki shikayat samjho
→ options → Aditya decide → PRD/docs update.

Bucket A resolutions (LOCKED):
- #1 RESOLVED: "Manual" typed-input UI HATA diya (force-fit tha). Conflict screen
  editor nahi hai — fine-tuning merge ke BAAD normal editing (8 verbs) se hoti
  hai. Har bucket sirf one-click deterministic buttons (UI English mein):
  B1: [Keep yours][Keep agent's][Keep original]; B2: [Keep delete][Keep clip]
  [Keep original]; B3: [Shift A][Shift B][Remove both — back to original]
  ("shift" = rules se nearest free slot, deterministic). Coverage mathematically
  poora: HAR EK CONFLICT ke resolution ke outcomes sirf {ours, theirs, base,
  both-adjusted} [2026-08-02 LLD BC.6 scope-fix: ye claim sirf per-conflict
  buttons ki hai — poore merge ka result auto-compose se mila-jula hota hai];
  both-adjusted B1/B2 mein logically impossible, B3 mein = shift. Whole-merge cancel alag se already
  hai. V2 talking point: AI content dekh ke suggest kare (fuzzy problem = AI ka
  sahi ghar), decision phir bhi user ka.
- #3 RESOLVED: Ripple delete = SINGLE-TRACK (track-local) V1 mein. All-track
  sync ripple V2 (linked-clip groups approach) — openly documented limitation,
  README/docs/demo mein transparent. NO demo-tricks (fixture aisa banana jisse
  limitation chhupe = REJECTED by Aditya).
- #8 RESOLVED [2026-08-02 AMENDED by LLD B2.3: overlap→B3; same-clip joint
  violations (source-bounds/negative-start/zero-duration)→B1 — B3 ke Shift-
  buttons wahan dead hote; dekho docs/11]: Post-merge invariant violation =
  automatic Bucket-3 conflict.
  TWO-PHASE merge: Phase 1 draft (memory-only, kabhi commit nahi) mein changes
  jodo + invariants check; Phase 2 user resolve kare, sab conflicts sulajhne ke
  BAAD hi merge commit banta hai. Invariant committed timelines pe lagta hai —
  invalid state history mein KABHI enter nahi karti ("pehle poochho, phir save").
  Poora merge reject / silent auto-fix / invalid save — teeno REJECTED.
- #15 RESOLVED: Property whitelist V1 = EXACTLY 6: volume (0-100, video/audio),
  opacity (0-100, video/image/text), scale (number), position (x,y), text content
  (string, text-clip only), text style (font/size/color fixed set, text-clip
  only). Iske bahar sab explicitly OUT (rotation, blur, speed, transitions —
  V2 list). Unknown property import pe behavior #17 ke saath decide hoga.
  Whitelist ke bina generic verb = cut-features ka backdoor (Codex ka sharp catch).
- #16 RESOLVED: Text clip = normal clip MINUS media reference/source range, PLUS
  text content + text style (#15 whitelist). Sirf timeline range hai. Wahi 8
  verbs chalte hain (slip exclude — source range nahi hai), wahi overlap
  invariant (same text lane pe overlap mana — do simultaneous captions = do
  text lanes), wahi conflict buckets. Koi naya rulebook nahi.
- #17 RESOLVED: OTIO import = Option 3 "import + saaf warning": supported cheezein
  import, unsupported (transitions/effects/nested...) SKIP with visible itemized
  list ("Skipped: 2 transitions, 1 blur — export mein wapas nahi aayenge").
  Skipped record commit mein save (V2 opaque-preserve ka raasta khula). Reject-all
  aur silent-drop dono REJECTED. Bilkul kharab file (invalid JSON) → clean error
  (already PRD mein).
- #20 RESOLVED: Checklist measurable: "bina atke" → 9-step scripted demo list with
  expected results, sab pass = done; fuzz → MINIMUM 10,000 random cases (CI);
  "valid OTIO" → round-trip definition (export → apne importer se re-import →
  identical timeline); benchmarks → median of 10 runs + machine/Node version
  fixed report format; invariants → numbered list LLD mein, tests us list ko
  reference karenge.
- #21 RESOLVED + DONE: docs/03, 04, 06 pe superseded-banner laga diya; docs/05
  pe "read docs/07 FIRST" banner + reading order mein docs/07 = step 0.

BUCKET A COMPLETE (8/8) — PRD review-proof. ✅ Bucket B (12 items) Part 6/7 ki
agenda mein hai (upar list). NEXT: Part 6 HLD.

NEW PHILOSOPHY RULE (Aditya): No tricks/jugaad kabhi bhi — demo bypass, limitation
chhupana sab mana. Har limitation openly documented + deferred design ke saath.
Goal: engineers/founders code padhenge to sab catch karenge — transparency hi
impress karti hai. "Chhupaya gap = red flag; documented gap + design = maturity."

## Part 6 HLD — COMPLETE (2026-08-01) ✅

Poora HLD checklist-driven hua — **docs/09-hld-checklist.md** = HLD ka canonical
record (16/16 items, har item ya DESIGNED ya documented-OUT, saare locked outcomes
wahin detail mein). Highlights: 7-block architecture (pure core: Domain Engine /
VC Engine / OTIO Adapter), command-pattern single ops endpoint, net-state = diff/
merge authority + op-log = provenance, state machine (auto-save + agent auto-commit
+ 6 boundary auto-seals + template naming, no AI naming V1), hybrid storage (N=10
snapshots, transactions, Postgres/Neon), optimistic concurrency + side-branch on
stale-head, URL-fixture media model (no upload/local files — Codex #12/#13
scope-cut), idempotency tickets, structured logs,
monorepo packages/engine + apps/web, Vercel + GitHub Actions CI. Bucket B ke
HLD-items (#9,#10,#11,#12,#18,#19) sab resolved. NAYA STANDING RULE (docs/09 mein):
first-principles only, no unproven industry claims, principal-engineer standard.

Part 6 ke Bucket B carry-forwards Part 7 LLD mein: #2 split lineage, #5 op
contracts, #6/#7 conflict taxonomy, #13 rational time, #14 degenerate ops, #22
canonical ordering + hamara apna schemaVersion design + Zod finalization +
retry counts/ID formats.

### Codex HLD review + triage (2026-08-01/02) — IN PROGRESS

HLD complete hone ke baad Aditya ke bolne par Codex se HLD ka fresh-eyes
anti-anchoring review karwaya (background agent, Sonnet; codex exec read-only)
→ **docs/10-codex-hld-review.md** (18 findings: 8 Critical, 10 Important).
Triage chal raha hai — har finding discuss→decide→docs/09 mein resolution.

- **#1–#9 RESOLVED** (docs/09 ke "Codex HLD review — triage resolutions"
  section mein full detail): merge draft = DB table (history se bahar),
  working state = per-branch {base+pending ops} record, agent run atomic
  (1 request 1 transaction), export GET→POST, 5-category endpoint
  classification (+DISCARD, +demo/reset), workingRev CAS edits pe,
  side-branch mechanics ek-transaction, merge finalize dono-parents CAS,
  DAG-proof snapshots (merge commit = hamesha snapshot).
- **#10 + #11 RESOLVED (2026-08-02):** Import = hamesha fresh start, IDs
  samet sab naya (ID-reuse rejected); export V1 internal IDs likhta hi nahi
  (YAGNI); external continuity V2 docs se bhi OUT (Aditya ka call).
  Round-trip = structural equality (IDs ignore) — sirf CI test, koi runtime
  check nahi. Detail docs/09.
- **#12 + #13 RESOLVED (2026-08-02, BADA SCOPE-CUT):** V1 media = URL-only
  (Vercel-deployed fixtures), NO upload feature, NO local-file attach/tiered-
  check (HLD Item 9 SUPERSEDED) — "hum feature bana rahe hain, app nahi";
  unresolvable media ref → "Media unavailable" placeholder, kaam kabhi nahi
  rukta; export = pointers, hamesha succeed. Hash = model field only
  (integration-ready). Detail docs/09.
- **#14–#18 RESOLVED (2026-08-02):** capability-token demo isolation (#14),
  100-project cap + chowkidaar delete (#15), whole-composite idempotency
  ticket + 8-table final count (#16), workflowId log correlation (#17),
  scalability claims honest 3-column reframe (#18).

**🏁 TRIAGE COMPLETE — 18/18 (2026-08-02). HLD ab review-proof. Saare
resolutions docs/09 ke triage section mein. NEXT: Part 7 LLD.**

## Part 7 LLD — IN PROGRESS (2026-08-02)

Checklist = **docs/11-lld-checklist.md** (canonical LLD record; 3 phases).
**PHASE A COMPLETE:** A1 rational time (RationalTime {value,rate}, single
project rate, round-nearest-ties-floor), A2 domain types (6-type parivaar,
`type` not `interface`), A3 operation contracts — ab 8/8 (A3.8 split Phase B
mein locked), A4 degenerate outcomes (no-change = silent success no
record; empty timeline valid, no track verbs; import kachra clip = skip +
warning).

**PHASE B COMPLETE (2026-08-02) ✅** — Fusion run hua (2/2 council: Claude +
Codex blind legs + blind advisor; advisor ne 7 blockers pakde, sab folded —
2 counterexamples ab named regression tests). Phir chunk-by-chunk discussion
mein Aditya ne sab lock kiya — **saare locked outcomes docs/11 ke "Phase B
locked outcomes" + "cleanup locks" sections mein** (canonical). Ek line
summary: B2.1 compare = khaane/atoms (verbs nahi; same-khaana = conflict,
alag = compose); B1.1 split identity (left-survives + parent-chained
formula-ID + lineage state mein); B1.2 split-vs-X family rules; A3.8 split
contract (A3 8/8); B2.2 conflict ke 3 darwaze + exhaustiveness proof; B2.3
Bucket-A-#8 narrowed (overlap→B3, same-clip joint→B1 — dead-button fix);
B2.4 delete-vs-ripple auto + V2 gap-question documented; B3.1 "barabar" =
defaults-materialize + ID-only matching; B3.2 conflict order fixed
(kitab-order); B3.3 parchi (choices-map) + fresh recompute (click-order
irrelevant, crash-safe); B3.4 dynamic conflicts turant + honest count +
termination proof; BC.1–BC.6 cleanup (TextClip properties field, PRD
"silently" fix, trim 4 equations, source==timeline duration invariant,
text defaults + color format, outcomes-line scope-fix). Workflow note:
Aditya ka naya standing rule — har lock se pehle edge-case MATRIX
(scenarios × handling), fusion sirf bade faisle par.

**🏁 PHASE C COMPLETE (2026-08-03) — PART 7 LLD POORA COMPLETE! 🏁**
Saare C1-C8 locks docs/11 mein: C1 diff 15-rules+catch-all; C2 nearest-fit
shift rule; C3 saare 8 tables ke exact columns (kahani + bhari-hui-row
style mein discuss); C4 API envelope + shapes + error-list; C5 schemaVersion
POORA CUT (Aditya ka scope-challenge — converter nahi to tag bhi nahi;
docs/09 Item 8 note amended; OTIO whitelist intact); C6 retry numbers
(UUID ticket, 2 silent retries 1s/3s, banner+Retry, 24h TTL); C7 engine 7
files + 7-function public API [F13 fix]; C8 demo choreography (scripted edits jo
teeno buckets guarantee karte hain + fixtures). **NEXT: Part 8 —
test/benchmark plan (chhota — zyadatar tests design mein likhe ja chuke),
phir CODE, phir Part 9 demo/application.**

## Part 8 — COMPLETE (2026-08-03) ✅

**docs/12-test-benchmark-plan.md** = canonical (T1-T5 sab locked): T1 unit/
golden approach (C7-mirror files, table-driven, lock-ID naming + 3 missing-
test pehredaar: gap-script/coverage/fuzz); T2 = 44 golden tests 6 groups
+ G-group 5 server/state tests [F11 amendment]
(har ek discussion ki hal-ho-chuki kahani); T3 fuzz recipe (valid-by-
construction generator, verb-aware edits, invariant asserts, SEED rule,
10k CI + 500 local); T4 benchmarks (diff/merge/apply/restore @1k/10k +
split-heavy, median-of-10 + warmup, benchmarks/REPORT.md, machine
documented); T5 CI (typecheck→lint→tests→fuzz→coverage+gap-script, fail =
block; benchmarks CI se bahar). E2E tests OUT (manual 9-step demo).
PLANNED (Part 9 ka task, abhi nahi): docs-consolidation — public repo ke
liye compact set (README/PRD/DESIGN/DECISIONS) + purani 12 files →
docs/archive/ (Aditya ka call: 12-file dher GitHub par nahi jayega).

**🚀 NEXT: CODE. Uske baad Part 9: demo video + Vercel deploy +
docs-consolidation + application (Ashby + email).**

### ⭐ Codex FINAL pre-code review — TRIAGE COMPLETE ✅ (2026-08-03)

Aditya ne Codex app se poore design ka final cross-document review karwaya
→ **docs/13-codex-final-review.md** (6 Critical + 6 Important + 2 Minor +
3 Questions). **Triage 2026-08-03 COMPLETE — 14/14 findings + 3/3 questions,
har ek Aditya ke saath ek-ek discuss hua; saare resolutions docs/13 ke TOP
ke "Triage resolutions" section mein (Codex ko wapas dikhane layak jawab
ke roop mein).** Ek-line summary: F1 project_id 3 tables mein add; F2 payload-
fingerprint ki jagah promise simplify (over-eng cut); F3 Timeline.mediaRefs
+ MediaRef.kind; F4 addClip 3 roop (media/text/internal-restore); F5
explicit branch everywhere + POST branch/switch; F6 sab response shapes;
F7 commits.import_warnings; F8 error-list sync (E_ID_COLLISION out); F9
noChange response; F10 font list [Arial, Georgia, Courier New]; F11 goldens
42→44 + G-group server tests; F12 demo exactly-9 steps + D full command;
F13 7-function; F14 stale roadmap; Q1 import/restore/merge = snapshot d=0;
Q2 utri clip wapas pending nahi; termination = permanent choices-map over
finite content-addressed conflict universe (purana free-slot-only proof
N4 mein SUPERSEDED — [Remove both]-induced dynamic conflicts covered);
Q3 Remove-both = base-revert. Sab amendments docs/09/11/12 mein lock-tagged.

### CODE phase ka PROPOSED build order (2026-08-03 — Aditya ne abhi approve
NAHI kiya; docs/13 triage ke BAAD isi se baatcheet hogi)

| # | Milestone | Kya | Verify |
|---|-----------|-----|--------|
| 1 | Skeleton | monorepo + khaali engine + CI (green day-1) | CI chale |
| 2 | Engine core | time + types + invariants + 8 verbs + tests | unit green |
| 3 | Diff | 15 rules + catch-all + goldens | goldens green |
| 4 | Merge | 3-way + refinement + conflicts + parchi + fuzz | 10k fuzz green |
| 5 | OTIO | import/export + round-trip | round-trip green |
| 6 | Benchmarks | 1k/10k REPORT.md | numbers committed |
| 7 | Server | 8 tables + API darwaze | API tests green |
| 8 | UI | timeline/diff/conflict/history screens | 9-step manual demo |
| 9 | Demo polish | agent script + fixtures + Vercel deploy | live link |

Har milestone = tests ke saath complete, phir agla (incremental shipping).
Engine (2-6) pehle — pure hai, bina UI/DB ke proven ho jaata hai.
Workflow (Aditya ke standing rules): implementation background agent ko,
complete self-sufficient brief + verification protocol + "fail ho to bina
commit kiye report karo" clause; har milestone ke baad summary temp-MD file
mein; agent ka MODEL har handoff se pehle Aditya se poochhna (Sonnet/Opus/
Fable). Design ka har detail: docs/11 (LLD) + docs/12 (tests) + docs/09
(HLD) — canonical, sab locked.

## Uske baad ka roadmap [F14 fix 2026-08-03: stale "sab pending" block
replaced — Parts 6/7/8 kab ke complete the]

Parts 1-8 SAB COMPLETE (PRD + HLD + LLD + test/benchmark plan). docs/13
final-review triage: F1-F14 + Q1-Q3 SAB RESOLVED/ANSWERED (running log
docs/13 ke top par); closure-verification docs/14 ke 10 items bhi closed +
**Codex formal GO (docs/14 Final gate)**.

## CODE PHASE — progress (2026-08-03 se)

Workflow: code Claude background-agents (FABLE 5 only) se, Codex =
reviewer checkpoints par (M2-3 / M4-5 / M7-8 ke baad, merge se pehle).
Git: agent kabhi git nahi chalata — sab commit/push Aditya khud;
conventional commits (chore/feat/test/fix); branches = main + feat/engine
(M2-3) + feat/merge-otio (M4-6) + feat/app (M7-9). Har agent-assumption
repo-root IMPLEMENTATION-NOTES.md mein dated; briefs `briefs/` (gitignored,
local-only). Agents ka reading-map: docs/00-INDEX.md.

- **M1 Skeleton ✅ DONE (2026-08-03):** pnpm monorepo + packages/engine
  (khaali + sanity test) + strict TS + eslint/prettier + vitest + ci.yml
  (T5 order; fuzz/coverage TODO-marked) + IMPLEMENTATION-NOTES.md (8
  trivial tooling assumptions dated). Local typecheck/lint/test green.
  Aditya ne first commit + push kiya (main), phir feat/engine branch.
  NOTE: purana research-README M1-stub se replace hua (backup scratchpad
  mein tha — content docs/01-06 mein waise bhi covered).
- **M2 Engine core ✅ DONE (2026-08-03):** time.ts + types.ts +
  invariants.ts (EK list) + verbs.ts (8 verbs full contracts) + index
  (sirf applyCommand). 145 tests green (BC.3 4-equations, split
  formula-ID, N1 6×4 matrix, har error-code, har inverse round-trip).
  13 trivial assumptions NOTES mein. M2 ke 3 open questions ka triage
  (2026-08-03): **(1) RESOLVED — text-addClip rate-check KEEP** (F4 list
  ka oversight tha, docs/11 amend ho gaya); **(2) PARKED FOR M5 —
  image ka durationInSource semantics: M5 (OTIO import) brief banate
  waqt PEHLA discuss-item — import hi ye value likhta hai, wahin OTIO
  ki reality ke saath decide hoga** (abhi engine-level kuch atka nahi);
  **(3) RESOLVED — BC.4 violation → E_INVALID_RANGE KEEP** (naya code
  nahi, detail message mein; docs/11 BC.4 note). Teeno M2-questions
  CLOSED 2026-08-03. Aditya ne commit kiya (feat/engine).
- **M3 Diff engine ✅ DONE (2026-08-03):** diff.ts — MATCH (ID +
  khandaan-walk) → CLASSIFY (15 rules, content-anchored atoms) → RENDER
  (1:1 entries↔sentences) + #16 catch-all (escape-proof net). index mein
  computeDiff (API 2/7). Original 38 + review-follow-up ke 2 split-family
  goldens = 40 M3 tests — 16/16 rules, diff(A,A)=∅, ripple #14+N×#1,
  khandaan goldens, double-run deterministic. `TextFont` exact literal-union
  bhi review follow-up mein lock ke barabar hua; production diff behavior
  change nahi hua. Total 185/185 green; typecheck + lint green. Codex checkpoint
  #1 `docs/15` = MERGE-READY; follow-up commit `c3b001b`; PR #1 merge commit
  `6582232` se `main` par merged (2026-08-04). **NEXT: M4 merge engine on fresh
  `feat/merge-otio` branch.** M4 implementation ke baad, final M4 commit se
  pehle docs/15 I1 ka targeted merge edge-case/break-test matrix chalega;
  reachable proof par hi lineage-duration check add hoga. M5 start se pehle
  parked image `durationInSource` semantics discuss/lock hogi.
- **M4 pre-implementation brief ✅ DONE (2026-08-04):** `docs/16` mein exact
  M4 scope, 34 applicable goldens, fuzz properties, public pure-core boundary,
  implementation order, aur I1 reachable-scenario closure matrix ek jagah.
  Owner discussion se U1 pure merge API aur U2 private lossless `MergeDelta`
  interpretation lock ho gaye; canonical details docs/11 C7 aur docs/12 T2/T3
  amendments mein hain. **NEXT: M4 implementation.** I1 runtime lineage check
  abhi decision nahi: implementation break-tests/fuzz evidence ke baad hi add
  ya proof-by-construction se close hoga. Is prep phase mein M4 code nahi likha.
- **M4 merge engine — implementation + validation ✅ DONE (2026-08-04):** pure
  `startMerge`/`applyChoice`/`finalizeCheck` (API 3–5/7), lineage-family common
  refinement, B1/B2/B3, permanent parchi replay, dynamic conflicts, base-revert,
  aur deterministic nearest-free Shift implemented. Exact 34 T2 merge goldens
  + 6 C7 API/error tests green; T3 direct P1–P9/I1-P10 harness mein seed
  `1295277908` ke 500 local + 10,000 CI-mode generated cases green. Fuzz ne
  reachable recurring-B3 replay regression pakdi; state-aware fixed-point
  replay fix aur permanent case-617 regression dono green. I1 lawful matrix ne
  nonpositive lineage ka koi reachable path nahi dikhaya, isliye docs/11 A2.3
  reconciliation ke saath proof-by-construction se VERIFIED-CLOSED; redundant
  runtime invariant add nahi hua. CI T5 step 4 active, M7 step 5 abhi TODO.
  Final implementation checks: typecheck green, lint green, normal suite
  226/226 green.
  **NEXT:** focused commit, phir committed diff par separate fresh read-only M4
  review; uske baad hi push. PR Codex create nahi karega.

## Build philosophy (Aditya ne explicitly lock ki — har decision ispe test karo)

- "Narrow enough rather than half-baked" — chhota scope, POORA aur polished.
- Production-shaped: aisa banao ki hire hone par Cardboard ki team DIRECTLY apne
  system mein integrate kar paye — demo-toy nahi, integration-ready slice.
- Incremental shipping: halke-halke ship karo, chhote scope se bade scope tak.
  Ek saath badi cheez kabhi ship nahi karni. (Jaise: 1 user + 1 agent se start.)
- Kuch cheezein JAAN-BOOJH ke interview/team discussion ke liye chhodi hain
  (transitions, live collab, multi-user...) — "baad mein team ke saath banayenge"
  ye feature-gap nahi, talking point hai.
- Time kam hai — important cheezon pe focus, baaki V2 list mein.

## Standing workflow rules (Aditya ke global CLAUDE.md se)

- Hinglish always, chhote digestible chunks, ek concept ek baar mein, confirm karke aage.
- Har explanation: concept → example → edge cases → invariant/1-line summary pattern
  achha chal raha hai. "Ek line mein" closing summary rakho.
- Koi bhi decision DISCUSS karke hi lock hota hai; blindly CodeX follow nahi karna.
- Plan finalize → implement se pehle confirm-gate + background sub-agent handoff
  (model pehle poochhna: Sonnet/Opus/Fable) + findings temp MD file mein.
- Robust engineering over tricks — AI sirf jahan fuzzy problem ho, core deterministic.

## Deployment plan (agreed)

- Browser app (Next.js), Vercel free tier deploy + live link, 2-3 min demo video
  (LinkedIn/Twitter post ke liye), public GitHub repo. DB agar chahiye: Supabase/Neon
  free tier. Application: Ashby form + hiring@usecardboard.com / founders@usecardboard.com
  (docs/01 mein links). Abhi tak koi application nahi bheji gayi.
