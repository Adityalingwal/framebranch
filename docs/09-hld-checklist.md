# HLD Checklist — FrameBranch (Part 6)

> Rule: har item ka end-status ya **DESIGNED** (discuss → lock) ya **OUT (documented)**
> (reason ke saath). Silent skip allowed nahi. Ek baar mein ek item discuss hota hai.
> Status yahan update hota rahega. Last updated: 2026-08-01.

| # | Item | Status |
|---|------|--------|
| 1 | Block map — components + zimmedariyan | ✅ DESIGNED |
| 2 | Data flow — edit se commit tak ka raasta | ✅ DESIGNED |
| 3 | API design (endpoints, contracts) | ✅ DESIGNED |
| 4 | Storage design + snapshot/op-log cadence, atomicity (Codex #11) | ✅ DESIGNED (4a–4d) |
| 5 | Diff source of truth — op-log vs net-state (Codex #9) | ✅ DESIGNED |
| 6 | Branch/HEAD/dirty-state state machine (Codex #10) | ✅ DESIGNED (6a–6e) |
| 7 | Concurrency — optimistic, stale-head (Codex #12) | ✅ DESIGNED (7a–7b) |
| 8 | OTIO boundary — schema-version policy (Codex #18) | ✅ DESIGNED |
| 9 | Asset references — hash validation (Codex #19) | ⚠ SUPERSEDED → URL-only media (Codex #12/#13) |
| 10 | Failure modes — kya toot sakta hai, toota to kya | ✅ DESIGNED |
| 11 | Scalability path — V1 scale + aage ka raasta | ✅ DOC-ONLY |
| 12 | Security/validation boundaries | ✅ DESIGNED |
| 13 | Caching / queues / background workers | ✅ DESIGNED (infra OUT) |
| 14 | Rate limiting + idempotency | ✅ DESIGNED |
| 15 | Observability — logs, errors, debugging | ✅ DESIGNED |
| 16 | Deployment shape (Next.js structure, DB, Vercel) | ✅ DESIGNED |

## Locked outcomes

- **Item 1 (2026-08-01):** 7 blocks — UI (browser), Simulated Agent, API Layer
  (Next.js routes on Node), PURE CORE [Domain Engine (timeline+8 verbs+invariants),
  VC Engine (commit/branch/diff/merge), OTIO Adapter], Storage (DB: commits/
  branches/snapshots/op-log), Media Store (files DB se BAHAR, DB mein sirf
  pointer+hash). Golden rule: core engines pure — no UI/DB/network — taaki
  benchmarks + fuzz tests headless chalein aur engine integration-ready slice rahe.

- **Item 2 (2026-08-01):** Data flow = UI command banaye (kabhi khud state na
  badle) → API validate → Domain Engine precondition-check + apply → Storage
  op-log + provenance → naya state UI render. Agent same raasta, actor:agent.
  NOTE for Item 6: working-state vs commit timing + branch-switch behavior +
  Aditya ke cross-doubts — Item 6 state machine discussion mein handle honge.

- **Item 3 (2026-08-01):** API = demo-story-driven endpoints (GET timeline/
  history/diff/export; POST import/ops/agent-simulate/commit/branch/merge/
  merge-resolve/merge-abort/restore). Edits ke liye EK `POST ops` endpoint —
  Command pattern: operation first-class data hai (op-log/diff/provenance sab
  isi se), naya verb = nayi command type (API surface unchanged), TS
  discriminated union se compile-time completeness. Trade-off documented:
  logs mein op-type explicitly jayega (Item 15).

- **Item 5 (2026-08-01):** Diff/merge/conflict detection ka authority = NET-STATE
  compare (do timeline states, stable-ID match → classify → render). Op-log =
  provenance/narrative (History screen, 👤/🤖, audit, future Memory ka raw
  material — reverted edits sirf log mein hote hain). Diff screen par log nahi
  thopna; History alag screen. Trim+untrim ⇒ diff "No changes", log 2 entries.
  Reasoning: farq states ki property hai (path-independent ⇒ determinism free,
  Codex #22 ka aadha jawab), PRD invariants state-based, Git precedent (snapshots
  store, diff on-demand — known fact). Pixel/frame analysis explicitly OUT (naksha
  version hota hai, pixels nahi; Agent Eyes = Cardboard ki alag layer).

- **Item 6a (2026-08-01) LOCKED — commit kab banta hai:**
  (1) Har edit → working state auto-save (invisible, server-side; browser band = safe).
  (2) Agent run = 1 auto-commit (script ka naam). Cardboard ka checkpoint model
  iska special case — integration superset story.
  (3) User: koi popup nahi; passive chip "N changes · [Save version]" — button
  optional, naam user ka.
  (4) SIX boundary endpoints pe dirty ho to chupchaap auto-seal: branch-switch,
  merge, restore, agent-run, export, import. GETs read-only (seal nahi). Naya
  endpoint bane to pehle classify karna zaroori: read/edit/boundary — completeness
  rule se guaranteed.
  (5) Naming: deterministic templates only ("Auto — before merge"); detail =
  op-log se ("2 trims, 1 move"). AI naming V1 mein NAHI (templates jhooth nahi
  bol sakte; AI summary silent-lie risk — wahi rule jisse diff se AI bahar hai).
  AI name-suggest = V2 talking point.
  (6) UI mein git words ban: "Save point/Version/History" — commit/HEAD kabhi nahi.
  📌 APPLICATION DOCS NOTE (Aditya): README/design docs mein explicitly likhna —
  naming AI se nahi, deterministic templates se hai, kyun (truthful history) —
  transparency dikhani hai.
  NOTE: isse 6b (dirty branch switch) aur 6e (agent commit) bhi resolve — auto-seal
  + agent auto-commit.
- **Item 6c (2026-08-01) LOCKED — Restore = NAYA commit** (content purane version
  ka; 2 parents nahi, normal 1 parent). History kabhi nahi mitti (commits
  immutable, Part 3) + restore ka bhi undo possible. History entry:
  "Restored version 'X'".
- **Item 6d (2026-08-01) LOCKED — aakhri conflict resolve hote hi merge commit
  (2 parents) AUTO banta hai; koi extra "Confirm merge?" screen nahi. Abort =
  timeline untouched (PRD). Item 6 COMPLETE — state machine poora.**

- **Item 4a (2026-08-01) LOCKED — Hybrid storage:** har commit mein ops (op-log)
  + har Nth commit pe full snapshot. N = config constant, default 10,
  benchmark-validated (Part 8) — guess nahi, naap ke. Guarantee: kisi bhi commit
  ka restore ≤ N replays (bounded — Codex #11 ka jawab). Part 3 passbook analogy
  ka formal lock.
- **Item 4b (2026-08-01) LOCKED — Atomicity:** har mutation (commit/merge/restore =
  commit row + ops + snapshot + branch pointer) EK DB transaction — sab ya kuch
  nahi; tooti state ban hi nahi sakti. Fail pe: working state safe (6a), error
  usi action/darwaze pe dikhta hai jahan se trigger hua (Save chip / agent
  notification / boundary action rukta hai), pehle 1-2 silent auto-retry phir
  user Retry. Retry-idempotency detail = Item 14 + LLD.
- **Item 4c (2026-08-01) LOCKED — DB = Postgres** (Neon/Supabase free tier,
  final pick Item 16). Reasons: transactions (4b), JSONB, free, server-side
  shared demo state. SQLite rejected (Vercel serverless = no persistent disk),
  browser-only rejected (shared demo + server benchmarks impossible).
- **Item 4d (2026-08-01) LOCKED — GC aur compaction dono V1 mein OUT (documented):**
  GC — unreachable commits bante hi nahi (immutable commits + branch delete OUT);
  compaction — demo-scale pe zaroorat nahi, snapshots (4a) already hain. Dono V2
  talking points (provenance-preserving design ke saath). Item 4 COMPLETE.

- **Item 7a (2026-08-01) LOCKED — Optimistic concurrency:** koi taala nahi; likhte
  waqt DB-level check "branch head ab bhi meri base wala hai?" (compare-and-swap,
  4b transaction ke andar). Pessimistic rejected: rare takkar ke liye sabko
  rokna galat trade + agent-run ke दौरान user freeze hota.
- **Item 7b (2026-08-01) LOCKED — Stale-head = SIDE BRANCH:** check fail hone par
  haarne wale ka kaam kabhi fenka nahi jaata — system use side branch pe rakhta
  hai, user ko "Review & Merge" — wahi existing branch/diff/merge/conflict
  machinery reuse, naya kuch nahi. Reject (kaam khona) aur silent auto-rebase
  dono rejected. Agent default apni branch pe kaam karega (demo flow), 7a/7b
  har do-writers-same-branch case ka safety net (2 tabs 👤vs👤 included).
  User concurrency se anjaan rehta hai — check system-internal. Item 7 COMPLETE.

- **Item 8 (2026-08-01) LOCKED — OTIO version policy = WHITELIST:** sirf fixture-tested
  OTIO schema versions accept; anjaan version → UI par clean error import ke waqt
  ("Timeline.2 supported nahi, hum Timeline.1 padhte hain"). Silent misread mana
  (#17 wale pattern ka extension). NOTE: hamare APNE snapshots/ops ka schemaVersion
  tag alag cheez hai — LLD mein design hoga. [2026-08-03 LLD C5 outcome: apna
  schemaVersion POORA CUT (V2 banega nahi; converter ke bina tag/check bekaar —
  Aditya ka call). YE OTIO whitelist INTACT hai — alag cheez. Dekho docs/11 C5.]

- **Item 9 — ⚠ SUPERSEDED (2026-08-02, Aditya ka scope-cut, dekho Codex #13
  resolution):** neeche ka tiered local-file design ab OUT hai — V1 mein
  local-file attach/re-attach flow hi nahi hai (media = Vercel URL fixtures,
  upload feature exist nahi karta). Hash = data model ka field rahega
  (pointer+fingerprint, integration-ready for S3/etags), par local validation
  flows cut. [Original for history: import pe size+mtime+hash parchi; re-attach
  pe tiered check; mismatch badge; one-click re-allow.]

- **Item 10 (2026-08-01) LOCKED — Failure modes:** zyadatar pehle se covered
  (OTIO error #8/#17, media #9, transaction 4b, takkar 7b, merge abort 6d,
  browser crash 6a, save-fail 4b). Naye: (1) koi bhi request fail (net YA server
  — user ke liye ek hi baat) → EK banner "Connection lost — your saved work is
  safe. Reconnecting…" + editing paused (jo save nahi ho raha uska natak nahi)
  + auto-retry → "Back online ✓". Net-vs-server ka alag detection NAHI (faltu
  complexity); offline-editing mode explicitly OUT (online tool, documented).
  (2) Agent run fail = all-or-nothing: commit nahi banta, timeline untouched,
  "Agent run failed — no changes were made. [Retry]" → poora run dobara.

- **Item 11 (2026-08-01) LOCKED — Scalability = DOC-ONLY deliverable:** V1 scale =
  1 user+agent (UI 10-30 clips, engine 10k benchmark). Documented path: API+Engine
  already scale-ready by design (stateless serverless + pure functions — Item 1
  ka payoff); Postgres → tier/replicas; media → object storage+CDN; naya lagega:
  rate limiter, auth/permissions, UI virtualization (sab named V2 items). V1 mein
  kuch nahi banana.

- **Item 12 (2026-08-01) LOCKED — Security:** (1) API pe har input schema-validated
  (Zod front-runner, final LLD) + import file-size limit; galat input engine tak
  nahi pahunchta. (2) Public demo isolation: har visitor ko demo project ki apni
  session-copy + "Reset demo" button (vandalism impossible, founders ko fresh
  demo). (3) Secrets sirf env vars (public repo!). Auth/login = V2 documented
  non-goal.

- **Item 13 (2026-08-01) LOCKED — Caching concept IN (parchi/snapshots/thumbnails —
  design mein built-in), extra infra OUT:** Redis-type cache server, job queues,
  background workers — V1 mein nahi (na repeat-traffic, na lambi jobs: thumbnails
  browser mein import pe, agent run seconds, benchmarks offline). V2 documented:
  uploads-scale pe thumbnails/waveforms → workers (docs/03 medium-advanced list).

- **Item 14 (2026-08-01) LOCKED:** (A) Rate limiting V1 OUT — serverless pe shared
  counter chahiye (Item 13 infra), demo-risk acceptable + documented; V2 = token
  bucket. (B) Idempotency V1 IN — har mutating request pe client-generated unique
  request-ID (ticket); server dedup via Postgres unique index; process-ho-chuka
  ticket → stored result wapas, kaam dobara nahi. Auto-retry (1-2 silent) + user
  Retry dono same ticket = duplicate impossible. Save feedback UX: chip states
  "✎ N changes" → "✓ Saved" (2s) → "✓ All changes saved" — koi popups nahi
  (Google Docs pattern). Exact counts/ID format = LLD.

- **Item 15 (2026-08-01) LOCKED — Observability = format-discipline IN, infra OUT:**
  structured JSON log lines ({requestId, actor, opType, branch, timeMs, result}),
  requestId end-to-end correlation, errors with context ("trim rejected: clip-42
  duration would be -2s"). Vercel built-in logs pe dikhenge (free). Sentry/
  dashboards/alerting/tracing — OUT (V2 documented). Primary value: khud ke
  debugging ke liye code likhte waqt; interview signal bonus. ~50-line helper.

- **Item 16 (2026-08-01) LOCKED — Deployment:** Vercel (hosting) + Neon (pure
  serverless Postgres; Supabase rejected — bundle jisme sirf Postgres use hota) +
  monorepo structure: packages/engine (PURE core — UI/DB/network imports banned,
  tests/fuzz/benchmarks direct ispe) + apps/web (Next.js UI+API) + docs/. CI =
  GitHub Actions: har push pe tests + 10k fuzz (PRD 5.5). Benchmarks = local
  script, committed report. Demo fixtures = Vercel static.

**🏁 PART 6 HLD COMPLETE — 16/16 items (2026-08-01). Agla: Part 7 LLD.**

## Codex HLD review (docs/10) — triage resolutions

- **#1 RESOLVED (2026-08-01): Merge draft = DB record, memory-only GALAT tha.**
  Naya `merge_attempts` table (Neon/Postgres): jodi-hui timeline + conflict list
  + ab-tak-ke resolutions + status. Commit history se HAMESHA bahar (Bucket A #8
  ka iraada intact — "history mein nahi" ≠ "kahin nahi"). Serverless/refresh/
  chai-break safe; adhoora merge → "Resume merge?" prompt. Resolutions merge
  commit ke provenance mein save hote hain; finalize/abort par draft delete —
  USI transaction mein jo commit banata/abort karta hai (4b) → galat-waqt-delete
  impossible. Soft-delete rejected (provenance mein duplicate hota). Render/
  second-host rejected (RAM kisi bhi host pe durable nahi; ek table < ek platform).
- **#2 RESOLVED (2026-08-01): Working state ka storage model = per-branch record:**
  {base_commit + pending_ops list}. Har edit = ek chhoti op-row append (full
  snapshot har edit pe NAHI — 10k clips pe bhaari hota). Working timeline = base
  + pending replay; chip count = pending.length; crash-safe. Commit = pending
  list seal ho ke commit ka op-log ban jaati hai (single source of truth — ek
  jaankari ek jagah), phir base=naya commit, pending=[]. Reasoning framing:
  Cardboard ka autosave "timeline ki shakal" bachata hai; ye record hamare VC
  feature ka APNA naya hisaab hai (base+pending concept unke paas exist nahi
  karta) — integration pe unke infra ke UPAR plug hota hai, replace nahi.
- **#3 RESOLVED (2026-08-01): Agent run atomic:** V1 scripted agent = poora run
  EK request (POST agent/simulate) — engine saare ops MEMORY mein chalata hai;
  koi fail → DB mein kuch nahi likha ("no changes" = timeline bilkul run-se-pehle
  jaisi — jo 6a boundary seal se pakki saved hai); sab pass → ek transaction mein
  ops + auto-commit. Agent per-op POST ops NAHI maarta (wo insaan ka path hai) —
  same verbs/parchi/provenance, alag batching. Ek task = kai operations (e.g.
  "remove silences" = 12 cuts) → 1 commit. Mid-run resume rejected V1 (fenka kaam
  seconds mein dobara banta hai; adhoori timeline = kachra; smart-resume = agent
  intelligence V2, VC layer ka contract: poora task = version, adhoora = kuch nahi).
  V2 real-AI extension documented: agent apni branch ki pending list mein stage
  kare, task-complete pe seal, fail pe pending discard.
- **#4 RESOLVED (2026-08-01): Export = POST (GET se hataya).** POST export:
  pending ho to commit ("Auto — before export") → USI commit se OTIO file →
  "Exported version 'X'". File hamesha ek exact version se judi (traceability +
  round-trip proof ka anchor). HTTP GET = safe/no-mutation (standard) — isliye
  GET-jo-commit-banaye impossible tha; classification galti hamari. TERMINOLOGY
  CLEANUP bhi locked: "seal"/"auto-seal"/"auto-commit" = sab EK hi cheez —
  COMMIT (UI: "version"); banne ke sirf 3 triggers: user button / agent run
  complete / boundary+pending (template naam). Ab se docs mein sirf "commit".
- **#5 RESOLVED (2026-08-01): Complete endpoint classification — 5 categories:**
  READ (GET timeline/history/diff), EDIT (POST ops; POST merge/resolve — draft
  mein likhta hai), COMMIT (POST commit), BOUNDARY ×7 (branch create+switch,
  merge, restore, agent, import, export — pending ho to pehle auto-commit),
  DISCARD ⭐nayi (merge/abort — draft delete; demo/reset — fresh project; commit
  NAHI banta kyunki iraada hi fenkna hai; suraksha = confirm dialog). demo/reset
  endpoint API list mein add hua (Item 12 se chhoota tha). Har naya endpoint =
  in 5 mein se ek, warna review fail.
- **#6 RESOLVED (2026-08-01): Working state ka apna revision number (CAS ek level
  neeche):** har accepted edit pe workingRev +1; har POST ops apni dekhi hui rev
  bhejta hai; stale rev → reject + client silent refresh ("Timeline updated") →
  user fresh picture pe dobara kare. Do-tab khichdi impossible, koi kaam khota
  nahi, user concurrency se anjaan. Ab ek philosophy teen jagah: head-check (7a,
  commit) + rev-check (#6, edit) + ticket (Item 14, retry) — sab check-at-write,
  taala kahin nahi. Realtime tab-sync (CRDT territory) rejected — non-goal.
- **#7 RESOLVED (2026-08-01): Side-branch mechanics — ek transaction mein:**
  (1) nayi branch template-naam se ("agent/<script>-N") loser ki base commit se,
  (2) loser ka commit us par, (3) user ki branch/HEAD/working state teeno
  UNTOUCHED (silent HEAD-switch = disorienting, rejected), (4) notification
  "[Review & Merge]". User-vs-user commit race #6 ke baad exist nahi karta
  (shared working record — doosre tab ka commit = "already saved" no-op).
- **#8 RESOLVED (2026-08-01): Merge finalize pe DONO parents ka CAS** — draft
  start pe dono head IDs record karta hai; finalize transaction mein revalidate:
  dono unchanged → merge commit; koi badla → commit NAHI, draft stale, user ko
  "[Restart merge]" fresh heads se. Silent ghost-loss rejected. Window asli hai
  (async agent + 2 tabs; multi-user integration mein aam), cost ~2 DB reads.
  Resolution-reuse on restart = LLD/V2 nicety (noted). Ab har write-darwaza
  guarded: 7a commit, #6 edit, #8 merge.
- **#9 RESOLVED (2026-08-02): Snapshot cadence DAG-proof:** (1) seedhi line par
  har Nth (N=10) commit = snapshot, (2) HAR merge commit = hamesha snapshot
  (ginti skip — do-parent ambiguity se bachaav), (3) har commit "distance from
  snapshot" counter rakhta hai (parent+1, snapshot pe 0). Replay path = seedha
  parent chain — ≤N kadam mein snapshot PAKKA (provable; merge points khud
  snapshots hain isliye do-raasta uljhan kabhi cross nahi hoti). Cost fine:
  merges ginti ke hote hain. Benchmark report mein guarantee confidently
  quotable.
- **#10 RESOLVED (2026-08-02, final after Aditya's fixes): Import = HAMESHA
  fresh start — project, clips, IDs SAB naye, exception zero** (ID-reuse
  rejected: stale-ID/scoping edge-case class janm leti, faayda sirf test
  convenience — bura sauda). **Export V1 mein internal IDs file mein likhta
  hi NAHI** (YAGNI — koi padhne wala nahi). External-edit continuity: V1 claim
  nahi, V2 docs mein bhi mention NAHI (Aditya ka call). Guess-matching kabhi
  nahi.
- **#11 RESOLVED (2026-08-02): Round-trip = STRUCTURAL equality, sharpened
  definition:** "hamara export → hamara re-import → supported content ka
  structural milaan (position/ranges/properties clip-by-clip; IDs compare mein
  hain hi nahi — sab naye bante hain)". Purpose: exporter+importer correctness
  ka CI proof (PRD 5.5 criterion) — test hai, koi runtime feature/check nahi;
  user flow ek-direction: import → kaam → export. Skipped-content records
  (Bucket A #17) export ka hissa nahi — import-time warning hi unka poora
  jeevan hai.
- **#12 + #13 RESOLVED EK SAATH (2026-08-02, Aditya ka scope-cut — "hum feature
  bana rahe hain, app nahi"): V1 media model = URL-only, NO local files, NO
  upload.** (a) Media = pre-deployed Vercel fixtures (sample OTIO + chhoti
  videos, immutable by deployment); (b) upload button/flow exist nahi karta;
  (c) local-file attach/re-attach/tiered-check/changed-badge — POORA cut
  (#12 ka sawaal isse moot — local files hain hi nahi); (d) bacha EK rule:
  resolve-na-hone-wali media ref (user ke OTIO ke local paths / URL fetch fail)
  → "Media unavailable" placeholder, editing/history/diff/merge SAB normal
  chalta hai (PRD ka missing-media edge case — yahi uska poora implementation);
  (e) export hamesha succeed (OTIO = pointers, bytes kabhi jaate hi nahi) +
  warning agar unresolved refs the; (f) hash field data model mein rahega
  (integration: S3 objects ke asli fingerprints yahan baithenge — field ready,
  flows Cardboard-side); (g) README mein explicit: "V1 media pipeline nahi —
  deliberate non-goal, integration mein storage layer Cardboard ki". PRD
  untouched (usne local-file import kabhi maanga hi nahi tha — wo HLD-detour
  thi jo ab cut hui).
- **#14 RESOLVED (2026-08-02): Demo isolation enforcement = capability token
  (login nahi):** pehli visit → naya project row + demo-fixture seed COPY +
  random unguessable owner_token → browser cookie. Har request pe token→project
  match check; mismatch = 404. Har table row project_id carry karti hai. Alag
  visitors = alag project rows = alag duniya. Cookie gayi → orphan project (Reset
  demo waise bhi fresh deta hai). Auth/login non-goal intact.
- **#15 RESOLVED (2026-08-02): Storage bounded by design — total projects cap
  = 100 (Aditya ka number):** naye project create pe inline check: count > 100
  → sabse purane orphan projects delete (ek COUNT + ek DELETE, ~5 lines,
  "chowkidaar code" — koi manual dashboard-watching nahi). Per-project limits
  (clips/commits caps) SKIP — documented unlikely (single user apna hi demo).
  Payload size limit Item 12 mein already. Traffic-level abuse ka poora ilaaj =
  rate limiter (V2, Item 14) — documented residual risk, demo ke liye
  acceptable (demo founders-review ke baad band ho jayega).
- **#16 RESOLVED (2026-08-02): Idempotency ticket = poore composite ka:**
  (1) boundary composite (auto-commit + kaam + ticket-result save) = EK
  transaction (4b); (2) retry same ticket → stored result wapas, kuch dobara
  nahi banta (response-lost Scene-B proof); (3) [AMENDED 2026-08-03, Codex
  final review F2 triage: payload-mismatch check CUT — same ticket + same
  endpoint par payload compare NAHI hota (original payload store hi nahi
  karte); ticket mila = stored result wapas. Reason: sahi client code mein
  har click par naya UUID banta hai, isliye same-ticket-alag-payload sirf
  client-bug/manual-API-hit se possible; us case mein bhi server naya kaam
  karta NAHI (DB corruption zero), sirf stale jawab lautta hai — harm
  chhota, isliye fingerprint column jodna over-engineering tha. Documented
  simplification.] Same ticket + ALAG endpoint → explicit error ye rehta
  hai (endpoint column pehle se stored hai, free check). Ticket scope =
  project + endpoint. Implementation: browser crypto.randomUUID() + tickets
  table (unique index) + server if-check — ~30 lines; rows 24h TTL cleanup.
  FINAL TABLE COUNT locked: 8 (projects, branches, commits, ops, snapshots,
  working_state, merge_attempts, tickets) — har table = alag lifecycle
  (normalization), aage koi naya table nahi.
- **#18 RESOLVED (2026-08-02): Scalability claims honest reframe (Item 11
  doc-only fix):** teen columns — MEASURED (engine benchmarks, Part 8 numbers);
  PATTERN-CORRECT-LOAD-UNTESTED (stateless API — concurrent load kabhi test
  nahi kiya, saaf likha; Neon connection pooling = noted integration point);
  DESIGNED-FOR-FUTURE-NOT-BUILT (pagination, virtualization, quotas, replicas).
  "Scale-ready" jaise blanket claims docs se out — no-unproven-claims rule
  khud par lagoo.

**🏁 CODEX HLD TRIAGE COMPLETE — 18/18 RESOLVED (2026-08-02).**

- **#17 RESOLVED (2026-08-02): Log lines mein optional `workflowId` field
  (Item 15 ke JSON mein add):** merge ke saare requests merge_attempt row ki
  ID carry karte hain ("merge_042" search = poori kahani); agent run V1 mein
  single-request (#3) — requestId hi poora run, commit ID se linked. Zero naya
  system/table — sirf log helper ka ek field.

## Standing rule (Aditya, 2026-08-01 — poore project pe lagoo, HLD + LLD + code)

First-principles thinking, principal-engineer standard. Koi bhi industry/company
claim ("X aise karta hai") sirf tab: (a) confident-known fact ho, ya (b) research
karke proof dikhaya jaye; warna use sirf "reasoning" bola jayega, fact nahi.
Best practices, code quality, simplicity, extensibility har decision pe explicitly
justify hongi. Speed ke liye quality/honesty compromise nahi hogi.

LLD (Part 7) ke liye reserved: Codex #2 split lineage, #5 op contracts,
#6/#7 conflict taxonomy, #13 rational time, #14 degenerate ops, #22 canonical
ordering — yahan discuss NAHI honge.
