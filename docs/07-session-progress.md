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
  ki reality ke saath decide hoga** (abhi engine-level kuch atka nahi)
  [RESOLVED 2026-08-04 — docs/11 M5 section O1/O2: image →
  `durationInSource: null` (aseem); video/audio bina `available_range` →
  clip skip + warning];
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
- **M4 dual review + fix pass ✅ DONE (2026-08-04):** Codex review =
  `docs/17` (8 findings: C1 Critical + I1-I5 + M1-M2; har finding ke neeche
  owner-locked "Fix spec" block). Claude independent review = `docs/18`
  (N1 Critical refinement-ID bug + N2 piece-scoped B2 [Q2=Option A] + N3
  fuzz-extension gap + N4 NOTES overclaim; phir N5 split-verb healed-cut
  duplicate-ID bug + Q1 defensive-fallbacks resolution + N1 deviation
  sign-off). SAB 14 findings owner-locked FIX APPROVED aur fix commit
  `d9a9430` mein closed — har original witness re-run green. Evidence:
  typecheck/lint green, **245/245 tests**, 500 local + **10,000 CI fuzz**
  green (seed 1295277908, ab extension-paths + choice-aware resurrection +
  per-draft invariant checks ke saath sakht). docs/11 amendments: B1.1 N5
  (formula-ID deterministic extension), A2.3 I1 reconciliation. docs/15 I1
  ab poore evidence ke saath VERIFIED-CLOSED (I5 goldens); docs/15 I4 M7
  CI-closure par pending (bug nahi). Aditya ne commit+push kiya.
  **NEXT:** committed `d9a9430` par final fresh read-only merge-readiness
  review (background agent) → clean nikla to Aditya PR merge karega → M5
  (OTIO) — brief se PEHLE parked question: image ka `durationInSource`
  semantics (M2 open-Q2, PARKED FOR M5).
- **CI speed optimization ✅ DONE (2026-08-04):** `.github/workflows/ci.yml`
  rewrite + `packages/engine/tests/run-fuzz.mjs` parallelization, 7
  owner-locked decisions (docs/12 T5 amendment, same date): (1) 10,000 fuzz
  cases stay 10,000 on PR/`main` — speed via sharding, not cutting cases;
  (2) `gate` (typecheck+lint+245 tests) aur `fuzz` (matrix-sharded) parallel
  jobs, `fuzz` NOT `needs: gate`; (3) auto-cancel stale runs sirf feature
  branches par, `main` kabhi cancel nahi (har `main` commit ka poora 10k
  record chahiye); (4) docs-only commits `fuzz` skip karte hain but `gate`
  chalta rehta hai (empty check status branch-protection deadlock se bachne
  ke liye); (5) cache/install unchanged, sirf `timeout-minutes` add hua
  (safety); (6) local `run-fuzz.mjs` bhi ab parallel chunks (concurrency =
  `FRAMEBRANCH_FUZZ_CONCURRENCY` env, else CI par sab cores, local par
  `max(2, cores/2)`); (7) trigger ladder — feature-branch push bina open
  PR ke = 500-case smoke/1 shard; open PR ho to us push ka pura run skip
  (duplicate double-run fix); pull_request aur push-to-`main` = 10,000/5
  shards × 2,000. Measured before/after (owner's Mac, 8 cores): 1,000 cases
  sequential ≈ 35.9s vs parallel (default concurrency) ≈ 18.4s; full local
  10k run ≈ 2 min 2.7s (20/20 chunks green) vs sequential baseline ≈6 min
  estimate (not re-measured sequentially at 10k — 1,000-case sample above
  extrapolates consistently).
  Determinism proof RUN (not assumed): sequential vs parallel same-result,
  4-way shard-equivalence (offsets 0/250/500/750, union = exact 0-999, no
  gap/overlap), injected-failure test (scratch throw at case 550, reverted
  + `git diff` verified empty after) — both sequential and parallel runs
  reported the identical failing case index and identical
  `FRAMEBRANCH_FUZZ_CASE=550` replay hint. `FRAMEBRANCH_FUZZ_CASE=617`
  single-replay path unchanged. typecheck/lint/245-tests green;
  `packages/engine/src/**` untouched (tooling-only change). **Open item:**
  the 5-shard count is a starting estimate — GitHub runner core count
  could not be measured locally, so Aditya will tune shard count after the
  first real GitHub Actions run.
  **First-push fixes (2026-08-04, same day):** (a) `matrix.shard *
  cases_per_shard` ne poori workflow file invalid kar di — GitHub Actions
  expressions mein arithmetic operators hote hi nahi; ab `plan` job seedhe
  offsets emit karta hai (`[0,2000,4000,6000,8000]`, `matrix.offset`).
  (b) Phir saare 5 shards `[vitest-worker]: Timeout calling "onTaskUpdate"`
  par gire jabki har fuzz case PASS tha — ek chunk apne cases ek hi `it()`
  ke andar synchronously chalata hai, to chunk ka wall-clock hi wo waqt hai
  jab worker RPC ka jawab nahi de paata; 60s paar = Vitest use maar deta
  hai. 500 ka size Mac ke sequential run (18.5s) par naapa gaya tha; GitHub
  ke dheeme runner par concurrent chalte hue wo 66.01s nikla. Chunk size ab
  **250** (~33s) aur `FRAMEBRANCH_FUZZ_CHUNK` se tunable. Case/seed/coverage
  mein koi badlav nahi. **Open (owner ka call, Part 9 ke aas-paas):** CI se
  fuzz hata ke sirf local rakhne ka vichaar aaya tha — abhi ke liye REHNE
  DIYA (application/README ke "10,000 fuzz cases in CI" claim ka verifiable
  hona bhaari pada); aakhir mein dobara dekha jayega.
- **M5 (OTIO) pre-implementation locks ✅ DONE (2026-08-04):** brief se pehle
  ka parked sawaal (M2 open-Q2, image ka `durationInSource`) RESOLVED, aur
  uske saath M5 ki poori design-surface ek-ek karke discuss+lock hui —
  **docs/11 ka naya "M5 — OTIO import/export locks (O1-O10)" section
  canonical hai**, docs/12 mein naya **group H (11 OTIO goldens)**
  (named goldens 44 → 53). Ek line summary: O1 image `durationInSource =
  null` (aseem; sentinel-jhooth aur clamp dono rejected); O2 video/audio
  bina `available_range` → clip skip + warning (`null` ka doosra matlab
  jaan-boojh ke nahi banaya); O3 image par slip = `E_NOT_APPLICABLE`;
  O4 gaps = naap (import cursor, export wapas `Gap`, transition cursor nahi
  badhata); O5 TextClip `metadata.framebranch` mein (round-trip ke liye,
  dusre tools ke liye nahi); O6 projectRate = `global_start_time` → pehli
  clip → khaali file par 24+warning ("hamesha 24" rejected); O7 buniyadi
  schema ka anjaan version = import rok, unsupported cheez = skip+warning;
  O8 warnings structured `{code, detail, count}`; O9 image ki pehchan file
  extension se (documented assumption); O10 round-trip ka exact compare-rule
  + fixture shart (gap+text+image teeno). OTIO ke saare facts asli
  `multitrack.otio` sample se verify kiye gaye, anumaan se nahi.
  **NEXT:** M5 implementation brief → background agent (**Opus 5**) →
  summary file → phir review ek doosre background agent se (Codex ka quota
  khatam hai, isliye review bhi in-house Claude agent se hoga; roles ab bhi
  swap — jo implement kare wo review na kare). Git: na main-agent na
  sub-agent koi commit/push karega — Aditya ko sirf ek-line commit message
  milega.
- **M5 OTIO import/export ✅ DONE (2026-08-04):** naya `packages/engine/src/
  otio.ts` — `importOtio`/`exportOtio` (API 6-7/7, ab poora 7-function
  public darwaza band). Locked O1-O10 jaisa hai waisa utara: O1 image ka
  `durationInSource: RationalTime | null` (types.ts) + bounds-invariant us
  par skip (invariants.ts ek `if`); O2 video/audio bina `available_range` →
  clip skip + `skipped-media-length-missing` (cursor phir bhi aage badhta
  hai, warna baaki track khisak jaati); O3 image par slip =
  `E_NOT_APPLICABLE` (verbs.ts, TextClip wali line ke bilkul saath); O4
  import cursor + export par `Gap.1` (leading gap samet), Transition cursor
  NAHI badhata; O5 TextClip/text-track `metadata.framebranch` se; O6 rate =
  `global_start_time` → pehli clip → khaali file par 24 + warning; O7
  buniyadi schema ka anjaan version (`Clip.2`/`Track.5`) → poora import ruke
  (`E_UNSUPPORTED_OTIO_VERSION`), unsupported cheez → skip + warning; O8
  warnings `{code, detail, count}` (code) par grouped; O9 image ki pehchan
  extension se, extension-less = video (documented assumption); O10
  round-trip golden gap+text+image fixture par. `E_INVALID_OTIO` aur
  `E_UNSUPPORTED_OTIO_VERSION` ErrorCode union mein aa gaye (C4 ki official
  list mein pehle se the — naye code NAHI). `importOtio` kachra input par
  kabhi throw nahi karta, hamesha `{ok:false,error}`; `exportOtio` kabhi
  fail nahi karta aur internal ID kabhi nahi likhta. Evidence: typecheck +
  lint green; tests **245 → 279** (group H, 11 goldens = 34 `it()` cases,
  `otio.test.ts` + hand-written `otio-fixtures.ts`); 500-case fuzz green
  (10.1s) aur poora **10,000-case fuzz green** (2 min 15.5s, seed
  1295277908) regression-gate ke taur par (types/invariants/verbs chhue
  the); `diff.ts`/`merge.ts` bilkul untouched; export JSON haath se
  eyeball kiya gaya (Gap.1 "Filler", `metadata.framebranch`,
  `available_range: null` image par — asli sample jaisa). O3 ki wajah se do
  purane tests badle (image slip ab reject: `diff.test.ts` ka #6 sentence ab
  audio clip par; `fuzz.test.ts` mein nullable-narrowing helper). Do
  under-specified cheezein report mein flag ki gayi hain (media/text clip ki
  `properties` locked export shape mein jaati hi nahi, aur zero-duration
  skip ke liye O8 mein koi apna code nahi hai) — code kuch invent nahi
  karta, jaisa likha tha waisa hi hai.
- **M5 post-review triage + fixes ✅ DONE (2026-08-05):** report ki 6 flagged
  cheezein Aditya ke saath ek-ek discuss hui. CHAAR fix hui (inline, bina
  background agent): (1) clip `properties` ab `metadata.framebranch.properties`
  se round-trip karti hain — docs/11 O5 amendment; bina iske export→re-import
  har volume/opacity/scale/position ko default par le aata (C8 demo mein hi
  dikhta: step 3 `A.volume=80` → step 9 export); (2) H10 fixture mein ab
  non-default properties hain, aur mutation-check se saabit kiya ki test
  sach mein pakadta hai (export side todi → H10 red, wapas → green);
  (3) cursor ka niyam poora hua — docs/11 O4 amendment: skip ki hui cheez ka
  apna `source_range` ho to cursor utna badhega (Transition ke paas hota hi
  nahi, isliye wo pehle jaisa; nested `Stack` ke baad ki clips pehle jaldi
  baith rahi thi); (4) `otio.ts` se NUL byte hataya — warning-key
  `` `${code}\0${detail}` `` thi, aur git pehle 8000 bytes mein NUL dekh ke
  file ko BINARY maan leta hai (`Bin 0 -> 26498 bytes`, "0 insertions") →
  GitHub par poori 838-line file "Binary file not shown" dikhti, review
  namumkin; ab `JSON.stringify([code, detail])`. Plus `tests/fixtures.ts` ka
  image `durationInSource` ab `null` (O1 ke mutabik; koi test us purane 1000
  par nirbhar nahi tha). CHAAR "aise hi rehne do" owner-calls: NTSC
  (23.976/29.97) files import nahi hongi — README limitations mein likhenge;
  zero-duration skip `skipped-unsupported` + detail se hi chalega (paanchwa
  code nahi); fuzz ki slip-density thodi kam rahegi (image par slip
  applicable hi nahi, aur 10k case-universe badalne se M4 ka seed-evidence
  purana ho jaata); PRNG duplicate benchmark side par chhoda. Verification:
  typecheck/lint green, **279/279 tests**, 500 + 10,000 fuzz green (seed
  1295277908 unchanged). Branch `feat/otio`.
- **M5 independent review + fix pass ✅ DONE (2026-08-05):** review ek doosre
  model (Fable-5) se, read-only, har finding ka runtime witness — Codex ka
  quota khatam hone ke baad ka naya in-house review flow. 6 findings, ek-ek
  Aditya ke saath triage: **F1 (HIGH, meri hi 2026-08-05 cursor-fix ki
  regression)** — `source_range: null` (asli serializers ka default roop) par
  poora import abort ho raha tha jabki O7b skip kehta hai; **F2 (HIGH)** —
  `available_range.start` phenka ja raha tha, jisse sahi files reject aur
  galat source-windows chup-chaap accept (dono witness ke saath), fix =
  darwaze par normalize + naya `MediaRef.sourceStartInFile` (docs/11 A2.1
  amendment); **F3** — N1 applicability import par lagti hi nahi thi (image
  par `volume` aa jaata); **F4** — `.png` audio track par import ho jaati
  thi (N1 track-mapping); **F6** — projectRate skip-hone-wali nested Stack ki
  clip se aa sakti thi. **F5 (LOW) owner ne JAAN-BOOJH ke chhoda** — negative
  duration kisi asli exporter se aati hi nahi, clamp ka bojh nahi lena.
  docs/11 mein 4 amendments (A2.1 F2, O5 F3, O9 F4, O6 F6). Verification:
  typecheck/lint green, **287/287 tests** (245 → 279 → 287), 500 + 10,000
  fuzz green seed 1295277908. Har fix ke saath uska regression test, aur
  F1/F2 ke fixes mutation-check se load-bearing saabit kiye gaye.
- **M6 Benchmarks ✅ DONE (2026-08-05, follow-up round baad updated):** T4 ka
  locked benchmark format poora band hua — `computeDiff` @1k/10k, FOUR
  `startMerge` variants @1k/10k (neeche), single-verb `applyCommand`, restore
  snapshot+replay; method wahi: 3 warm-up + 10 measurement runs → MEDIAN.
  Owner locks (2026-08-05, do rounds): **Option A** — purane
  `startMerge @1k/@10k` (standard) rows ka fixture/seed/position kabhi nahi
  chhua (sirf label mein count add hua); **Option A1** — `startMerge
  conflict-heavy` ADDITIONAL worst-case row, 100% conflict density: dono
  sides SAME 5% clips ko SAME atom (property-change `volume`/`opacity`, ya
  trim-end shorten — `move` explicitly excluded, wo overlap bana sakta hai)
  par ALAG values se edit karte hain, taaki har edited clip guaranteed
  Bucket-1 value-conflict bane; **follow-up lock** — AB har merge row apna
  real `startMerge(...).conflicts.length` label mein dikhata hai (standard,
  split-heavy, conflict-heavy, independent-edits — sab), kyunki bina count
  ke merge timing interpret hi nahi ho sakti; report mein "clean merge" /
  "conflict-free" wording kahin nahi (standard fixture conflict-free nahi
  hai, measured proof neeche). **Naya independent-edits row** (follow-up,
  same `applyRandomEdits` par naya `{ excludeMove }` option — default
  `false` behaviour BYTE-IDENTICAL rakha gaya, verify kiya gaya ki purane
  standard/split-heavy conflict counts (19/251, 32/338) bilkul same rahe
  option add karne ke baad): standard timeline, dono sides independent
  random edits `move` ke bina — ye guaranteed conflict-free NAHI hai (do
  independent random pickers kabhi-kabhi same clip+atom pe coincide kar
  sakte hain), isiliye jo bhi real number aaya wahi likha — **0 @1k, 4
  @10k**.
  **Saare 8 conflict counts (measured, 1k/10k):** independent-edits 0/4,
  standard 19/251, split-heavy 32/338, conflict-heavy 50/500 (generator ka
  `expectedConflicts` aur real count exactly match — 50/50, 500/500).
  Standard/split-heavy ke total (19/251, 32/338) T4 lock ke ~8-conflict
  back-of-envelope se zyada lagte hain, lekin bucket-breakdown se pata chala
  (diagnostic probe, committed nahi): usmein zyada tar `move`-edit se aaye
  incidental **overlap conflicts (bucket-3)** hain — generator sirf 0–3
  frame ka gap chhodta hai jabki `move` 1–5 frame shift karta hai, isiliye
  aksar neighbour se takra jaata hai; genuine **value-conflicts (bucket-1)**
  sirf 0 @1k aur 5 @10k the, jo brief ke ~8 estimate se close match hai —
  isi wajah se conflict-heavy generator mein `move` explicitly bahar rakha.
  **Asli finding (numbers jitna support karte hain utna hi bola, force nahi
  kiya):** conflict count ka merge time par bahut kam asar hai — 10k par
  teen flat-timeline variants (independent-edits 4 conflicts = 698.75 ms,
  standard 251 conflicts = 724.75 ms, conflict-heavy 500 conflicts =
  687.81 ms) sirf ~5.4% ke andar hain, aur NON-MONOTONIC (500-conflict
  variant sabse FAST nikla, 4-conflict wale se bhi). Split-heavy (338
  conflicts, 791.62 ms) sabse slow hai, lekin uska extra time conflict count
  se correlate nahi karta (338, standard-conflict-heavy ke beech mein hi
  hai) — uski apni piece-family/refinement complexity (structurally alag
  fixture) zyada plausible wajah hai. Matlab: merge ki cost clip
  matching/diff se dominate hoti hai, conflict-resolution se nahi — jitna
  data support karta hai utna hi. Saath mein `vite-node` devDependency add
  ki (`packages/engine/package.json`, `^3.2.4` — vitest ke saath same
  release-line, lockfile mein `3.2.4` resolve hua) — bina iske committed
  REPORT.md reproducible hi nahi tha. Ek chhota bug pakda-aur-fix kiya
  isi round mein: labels mein count-suffix add hone ke baad headline ka
  exact-match `results.find` "startMerge @ 10k" se miss ho gaya tha (report
  mein "3-way merge in 0 µs" chhap raha tha) — prefix-match (`startsWith`)
  se fix kiya, re-run se confirm. Fresh run ka headline (committed
  `REPORT.md` se): **diff @10k = 3.20 ms, merge @10k = 724.75 ms (251
  conflicts)**, test count **287** (245 se update — M5 ke baad tests badh
  gaye the). Machine: Apple M3, Darwin 25.6.0 (arm64), 8 GB RAM, Node
  v20.19.6. Verification: typecheck/lint green, 287/287 tests,
  `packages/engine/src/**` untouched (engine frozen, benchmarks sirf
  consumer). Branch `feat/benchmarks`.
- **M7 (server) pre-implementation locks ✅ DONE (2026-08-05):** paanch
  decisions Aditya ke saath ek-ek discuss karke locked. **(A) DB layer =
  Drizzle** — raw SQL rejected (8 tables x ~14 endpoints ka row-mapping
  boilerplate = bug-farm), Prisma rejected (serverless par bhaari — apna
  engine binary + cold start). **(B) Server tests ASLI Postgres par** —
  local = Homebrew Postgres (Docker se halka), CI = GitHub Actions ka apna
  Postgres service container (koi secret nahi). Nakli/in-memory DB REJECTED:
  G-group ke paanchon tests hain hi wo cheezein jo DB khud karta hai (unique
  index, transaction, CAS) — fake par test karna kuch saabit nahi karta.
  **(C) Tables migration file se** — `drizzle-kit generate` → `.sql` repo mein
  committed. Direct schema-push rejected: SQL repo mein dikhna chahiye
  (reviewer ek nazar mein data-model samajh le) aur CI ko khaali DB har run
  par EK command se bharni hai. **(D) M7 do hisson mein** (incremental-
  shipping lock): **M7a** = DB connection + 8 tables + project bootstrap
  (capability-token cookie + `demo.otio` seed + 100-project cap) + tickets +
  GET timeline/history + POST ops/commit/branch (create+switch + boundary
  auto-seal) + workingRev CAS → tests G1, G2, G3, G5. **M7b** = merge
  (start/resolve/abort/finalize + CAS + side-branch) + restore + import/
  export endpoints + agent/simulate + demo/reset + GET diff → test G4; T5
  step 5 (coverage + lock-ID gap-script) M7b ke ant mein. **(E) Pehla
  project `demo.otio` se seed** hoga aur wo fixture file M7a ke saath hi
  banegi — C8 ki choreography baad mein badle to nuksan zero (ek fixture hi
  hai), faayda ye ki M5 ka importer asli file par test ho jaata hai.
  Do chhote technical locks: routes **Node runtime** par (transactions ke
  liye — docs/09 Item 4a se meil, Edge nahi), aur server tests **route
  handlers ko seedhe call karenge** (asli DB, koi network/port/running server
  nahi). Pehle se locked cheezein dobara nahi khuli (Neon, Vercel, Next.js
  API routes, C3 ke exact columns, C4 ke shapes/envelope/error-list, HLD ke
  ticket/CAS/auto-seal/snapshot niyam). M7a ka implementation brief ban chuka
  hai (`briefs/`, gitignored); implementation Opus 5 background agent par.
- **M8 (UI) pre-implementation locks ✅ DONE (2026-08-05):** UI ka BEHAVIOUR
  pehle se locked tha (kaunsi screens, conflict Level-2 bars, history 👤/🤖
  badges, 9-step demo) — ye chhe locks "kaise banega" ke hain, sab ek-ek
  discuss karke tay hue. **(1) Styling = Tailwind.** shadcn blanket add
  NAHI; jahan ek-do component (dialog/tabs) sach mein time bachaye wahin utna
  uthana. Nishaana: kam screens, har screen saaf aur polished (full-stack
  role hai — UI ki value ginti mein aayegi). **(2) Screens ka dhaancha = EK
  page + panels, panel ka naam URL mein** (`?view=diff` / `?view=merge`).
  Alag routes rejected — timeline hamesha saamne rehni chahiye, version
  control mein wahi asli context hai (diff/merge dekhte waqt clips saamne
  dikhein). URL isliye ki back-button, direct link aur demo-video recording
  mein kisi bhi step par seedha pahunchna — teenon kaam karein.
  **(3) Timeline rendering = DOM divs.** Canvas rejected: PRD 5.4 ka locked
  demo-size 10-30 clips hai, wahan canvas ka faayda ZERO hai; aur canvas mein
  hit-testing (click kis clip par pada), hover, tooltip, text-ellipsis,
  accessibility — sab khud likhna padta, jabki wahi cheezein (clip click,
  conflict ke 3-layer base/ours/theirs bars, diff highlight) is product ki
  jaan hain. Scale ka jawab canvas nahi, **virtualization** hai (sirf
  screen-par-dikhti clips render karo — `react-window` jaisa; PRD 5.4 mein
  pehle se "talking point"). README limitation likhni hai: engine 10,000
  clips (benchmark se saabit), UI 10-30 — jaan-boojh ka gap, agla step
  virtualization hai aur wo engine chhue bina aata hai. **(4) Data fetching =
  TanStack Query.** Next.js Server Components/Actions rejected — C4 mein ~14
  endpoints + envelope + error-list already locked hain, actions same kaam ka
  DOOSRA darwaza bana degi (duplicate). Plain fetch rejected: "is POST ke
  baad kaunsa data baasi ho gaya" haath se yaad rakhna sabse aam UI bug hai
  (har op ke baad timeline + pendingCount, commit ke baad history bhi) —
  `invalidateQueries` us poore bug-class ko khatam karta hai; loading/error/
  retry bhi built-in. **(5) Optimistic UI = HYBRID.** Chhote aur baar-baar
  wale kaam (8 edit verbs — move/trim/slip/split/property change) turant
  screen par; bade aur kabhi-kabhi wale (commit, branch create/switch, merge
  start/resolve/finalize, restore, import/export, agent-simulate) server ka
  jawab aane par (wahan spinner turant-chhalaang se BEHTAR lagta hai).
  Optimistic ka aam khatra — "client ne andaaza lagaya, server ne kuch aur
  kiya" — yahan hai hi nahi: docs/11 C7 se `apps/web` engine ko import karti
  hai, to client wahi `applyCommand` chalata hai jo server chalayega (same
  pure function, same nateeja — andaaza nahi, exact). `E_STALE_REV` par
  handling pehle se locked hai (docs/11 C4: "UI chupchaap refresh") —
  optimistic badlav hatao, taaza timeline lo. **Chaar robustness rules bhi
  LOCKED** (Aditya ki explicit chinta: ek galti poora bug-farm bana degi):
  (a) **default = server-first**, optimistic sirf ek **opt-in list** se aur wo
  list EK hi file mein — naya action list mein daalna bhool gaye to wo apne
  aap safe (server-first) taraf girta hai, khatarnak taraf nahi; bikhri hui
  `if` conditions kahin nahi; (b) optimistic ka nateeja **engine se hi**
  (`applyCommand`), koi hand-written shortcut nahi — shortcut hi pehla bug
  hoga; (c) saare mutations **EK hi wrapper** se guzrenge — rollback, refetch
  aur `E_STALE_REV` handling ek jagah, har action mein dobara nahi; (d)
  **server ka jawab hamesha aakhri sach** — jawab aate hi client wala
  timeline hata ke server wala rakho, chahe dono same hi kyun na hon (farak
  kabhi jama na ho sake). Plus ek test: same command par optimistic ka
  nateeja == server ka nateeja — ye rule (b) ka pehredaar hai, aur likhna
  aasan hai kyunki dono ek hi function chalate hain. **(6) Thumbnails =
  pehle se bani images** — har media fixture ke saath ek chhoti `.jpg`
  (media waise bhi URL-fixtures hain, HLD #12/#13). Browser mein runtime par
  video se frame nikalna rejected: teen jagah fail ho sakta (load/seek/
  draw) + pehle khaali dabba phir picture ka flicker, aur faayda chhota;
  "koi thumbnail nahi" PRD 5.1 ka lock todta. Known limitation (README mein
  likhni hai): ek media ka ek hi thumbnail, to split ke dono tukdon par wahi
  picture dikhegi.
  **NEXT:** M7a implementation (Opus 5 background agent, brief ready) → M7b
  → M8 → M9.
- **M7a server foundation ✅ DONE (2026-08-05):** naya `apps/web` (Next.js
  16.3.0, App Router, **sirf API routes — koi UI nahi**, wo M8 hai);
  `pnpm-workspace.yaml` mein ab `apps/*` bhi. **DB:** Drizzle schema mein
  C3 ke **8/8 tables** + F1 ke `project_id` columns, aur committed migration
  `apps/web/drizzle/0000_hesitant_vanisher.sql` — khaali DB EK command se
  bharti hai (`pnpm --filter @framebranch/web db:migrate`). Locked indexes
  saare maujood (verify kiya `pg_indexes` se): `branches(project_id,name)`,
  `ops(commit_id,seq)`, `snapshots(commit_id)`, `working_state(branch_id)`,
  `tickets(project_id,endpoint,ticket)` unique + har table par `project_id`.
  `snapshots` mein `schema_version` NAHI (C5). Har table `projects` se
  `ON DELETE CASCADE` — project delete par 7 tables mein orphan bachta hi
  nahi (test se verify). **Fixture:** naya `apps/web/fixtures/demo.otio`
  (24fps, 3 tracks video/audio/text, 5 clips A/B/C + music + caption
  "Welcome", saath mein agent ke clip-D wala b-roll media) — M5 ke asli
  `importOtio` se **zero warnings** par import hota hai (test, eyeball
  nahi). **Bootstrap:** cookie nahi → naya project + 256-bit owner_token
  (HttpOnly cookie) + demo seed + import-commit (Q1: hamesha full snapshot,
  `snapshot_distance = 0`) + `main` branch + working_state (`working_rev`
  0 se shuru, kabhi reset nahi); `project_rate` imported OTIO se (A1.2),
  hardcode kahin nahi; 100-project cap inline sweep (HLD #15). **Endpoints
  (C4 envelope `{ok,data}` / `{ok,error:{code,message}}`, error codes sirf
  C4 list se):** GET timeline (base + pending replay), GET history
  (`import_warnings` samet — F7), POST ops (workingRev CAS, F9 no-change
  counter nahi badhta), POST commit (pending → `ops` rows seq-order,
  snapshot cadence har 10th), POST branch (create+switch), POST
  branch/switch — dono boundary par dirty ho to auto-seal (Item 6a(4)),
  poora composite EK transaction (#16(1)). Tickets = shared register, same
  ticket+same endpoint → stored result, alag endpoint → `E_TICKET_REUSED`
  (F2: koi payload compare nahi), 24h TTL inline. Naam sirf deterministic
  templates (Item 6a(5)), AI kahin nahi. **Evidence:** typecheck + lint
  green; tests **287 (engine, waise ke waise) + 21 (server) = 308**; G1/G2/
  G3/G5 asli Postgres par (local Homebrew 14.17, CI par GitHub ka apna
  Postgres service container — `gate` job mein migration step add hua,
  `gate`/`fuzz` parallel structure bilkul unchanged, T5 step 5 abhi bhi
  TODO(M7b)). Teen mutation-checks se saabit kiya ki G-tests load-bearing
  hain: ticket-replay hataya → G1+G2 red; auto-seal hataya → G3 red;
  `loadBranch` se `project_id` predicate hataya → G5 red (teenon revert,
  phir 21/21 green). `packages/engine/src/**` bilkul untouched (`git diff
  --stat` khaali). G4 + merge/restore/import/export/agent/demo-reset/diff
  jaan-boojh ke NAHI banaye — wo M7b hain, stub bhi nahi. Do gaps report
  kiye gaye (invent nahi kiye): C4 list mein "malformed request body" aur
  "branch name pehle se hai" ka koi apna code nahi — dono ke liye
  `E_INVALID_VALUE` use hua, aur unexpected server exception ke liye koi
  generic code banaya hi nahi gaya. Branch: kaam uncommitted working tree
  mein, Aditya khud commit karega.

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
