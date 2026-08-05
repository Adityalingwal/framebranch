# LLD Checklist — FrameBranch (Part 7)

> Rule wahi jo HLD (docs/09) mein tha: har item ya **DESIGNED** (discuss → lock)
> ya **OUT (documented)**. Ek baar mein ek item. Status yahan update hota rahega.
> Kathin items pehle **/fusion** se (anchoring-free independent plans), phir
> discuss → Aditya lock kare. Last updated: 2026-08-02.
> **🏁 PART 7 LLD POORA COMPLETE (2026-08-03): PHASE A ✅ + PHASE B ✅ +
> PHASE C ✅ (C1-C8). NEXT: Part 8 — test/benchmark plan, phir CODE.**

## Phase A — Foundations (pehle, direct discussion)

| # | Item | Codex ref | Status |
|---|------|-----------|--------|
| A1 | Rational time contract — project rate policy, internal representation, rounding rules | #13 | ✅ DESIGNED (A1.1–A1.3) |
| A2 | Domain model types — Timeline/Track/Clip/TextClip/MediaRef/TimeRange (TS shapes) | — | ✅ DESIGNED (A2.1–A2.3) |
| A3 | Operation contracts — har 8 verbs: typed command, preconditions, exact transition, inverse, errors | #5 | ✅ 8/8 COMPLETE (A3.8 split → Phase B mein locked) |
| A4 | Degenerate/edge ops — har invalid/boundary case ka typed outcome (error/no-op/normalize matrix) | #14 | ✅ DESIGNED — **PHASE A COMPLETE** |

## Phase B — Fusion trio (interlinked hard core — /fusion PEHLE, phir discuss)

| # | Item | Codex ref | Status |
|---|------|-----------|--------|
| B1 | Split lineage — parent/child IDs, tombstones, split-vs-edit/split-vs-split merge | #2 | ✅ DESIGNED (B1.1 + B1.2 + A3.8) |
| B2 | Internal conflict taxonomy — formal classification, 3 UI buckets ki mapping | #6/#7 | ✅ DESIGNED (B2.1–B2.4) |
| B3 | Canonical ordering / semantic equivalence + exact three-way merge algorithm | #22 | ✅ DESIGNED (B3.1–B3.4) |

> Fusion run COMPLETE (2026-08-02): 2/2 council (Claude + Codex legs, blind) +
> blind advisor pass. Synthesized plan finalized; ab chunk-by-chunk discussion
> se har sub-decision Aditya lock kar raha hai — locked outcomes niche.

> Fusion brief mein: sirf problem + locked constraints (PRD/HLD), hamari koi
> leaning NAHI — anchoring se bachna. Output: 2 independent plans → chunk-by-
> chunk discussion → Aditya lock.

## Phase C — Baaki blueprint (Phase B ke baad, direct discussion)

| # | Item | Codex ref | Status |
|---|------|-----------|--------|
| C1 | Diff engine — match rules, ~15 classify rules exact, render templates (editor-language) | — | ✅ DESIGNED (15 rules + catch-all) |
| C2 | Conflict resolution semantics — B1/B2/B3 buttons ka exact deterministic outcome (incl. "shift to nearest free slot" rules) | — | ✅ DESIGNED (nearest-fit rule; baaki Phase B mein) |
| C3 | DB schemas — 8 tables ke exact columns/types/indexes/unique constraints | — | ✅ DESIGNED (8/8 tables) |
| C4 | API contracts — har endpoint ka request/response shape, Zod schemas, error codes | — | ✅ DESIGNED (envelope + shapes + error list) |
| C5 | Apna schemaVersion + migration policy (snapshots/ops serialization) | Item 8 note | ✅ OUT documented (poora CUT — Aditya) |
| C6 | Idempotency/retry exact — ticket format, auto-retry counts/backoff, TTL | Item 14 note | ✅ DESIGNED (UUID · 2 retries 1s/3s · banner · 24h) |
| C7 | Engine module structure — packages/engine ka folder/file layout, public API surface | — | ✅ DESIGNED (7 files + 7-func API) |
| C8 | Simulated agent scripts — 9-step demo story ke exact scripted edits + fixtures list | — | ✅ DESIGNED — **PHASE C COMPLETE** |

## Locked outcomes

- **A1.1 (2026-08-02) LOCKED — Time representation = RationalTime {value, rate}:**
  har time value = do integers ki jodi — value (kitne ticks) + rate (ticks per
  second = fps). Decimal/float KAHIN NAHI store/compute hota — divide sirf UI
  display pe ("1.5s" label, cosmetic). Sources: rate file/OTIO metadata se
  (kabhi invent nahi), value user-action se (drag = frames ginti, split =
  nearest frame boundary integer — aadha frame exist nahi karta). Kyun: float
  drift (0.0333... truncation jama hoke clips khiskati) + diff/merge ko EXACT
  equality chahiye (2.9999998 ≠ 3.0000001 = jhootha diff — deadly). OTIO ka
  RationalTime format same hai (value+rate) → import/export lossless.
  TS type: `{ value: number (int), rate: number (int) }` — engine mein ek hi
  time type, har jagah yahi.

  Use-sites (implementation map): clip source/timeline ranges, har verb ka
  arithmetic (trim/move/split — integer +/-), split boundaries (gap/overlap
  impossible by construction), diff compare (exact ==), merge same-value
  detection, OTIO adapter (direct passthrough), UI display (sirf yahan /).
- **A1.2 (2026-08-02) LOCKED — Single project rate ("dukaan ki unit"):** har
  timeline ka EK rate (project rate — import pe declared; fixtures 24fps).
  Alag-rate clips import ke DARWAZE pe ek baar convert hoti hain; engine ke
  andar har jagah single-rate (har verb/diff/compare simple + galti-proof).
  Per-clip mixed rates rejected (do-rate math har jagah failti = complexity
  everywhere vs boundary pe ek jagah). Conversion rounding rule = A1.3.
- **A1.3 (2026-08-02) LOCKED — Rounding = round-to-nearest, ties floor:**
  cross-rate conversion sirf import darwaze pe, EK helper (`convertRate()`)
  mein — sabse paas wala frame lo, exact x.5 pe neeche wala (deterministic tie
  rule). Max error 0.5 frame (invisible). Iske unit tests = PRD 5.5 time-
  arithmetic tests ka hissa. Engine ke andar rounding KABHI nahi (A1.1 integer
  world). Mixed-rate source: ek project mein kai files (camera 24 / phone 30 /
  screen 60) — har file ka apna fps, project rate mein converge. A1 COMPLETE.
  CLARIFICATIONS (Aditya ke sawaal se): (a) 24fps engine ka rule NAHI — project
  rate imported OTIO timeline se aata hai (30 aayi to 30); 24 sirf hamari demo
  fixtures ka choice (film standard + chhote test numbers). Engine rate-agnostic.
  (b) Conversion VIDEO FILE ka fps kabhi nahi badalta (file untouched — pointer
  non-goal); sirf timeline ke TIME-COORDINATES ek common unit mein likhe jaate
  hain (inch→cm naap badla, kapda nahi). Playback: player file apne native fps
  pe chalata hai, timeline sirf kahan-se-kahan-tak batati hai.
- **A2.1 (2026-08-02) LOCKED — Building-block types:**
  `TimeRange = { start: RationalTime, duration: RationalTime }`.
  `MediaRef = { id, kind: "video"|"audio"|"image", url, hash, sourceRate,
  durationInSource }` — file ki parchi
  (ek file → kai clips, isliye alag type, ek baar). url = "file kahan" pointer,
  storage-agnostic (V1 Vercel static, integration S3 — field same, value alag).
  hash = fingerprint field (#12/#13 — integration-ready, V1 flows nahi).
  durationInSource = poori file ki lambai — "source range file ke andar"
  invariant ka precondition-check isi se (trim/slip har baar). NOTE: source/
  timeline ranges MediaRef pe NAHI — Clip pe hain (A2.2). [AMENDED
  2026-08-03, Codex final review F3: `kind` field ADD — addClip ka locked
  track-kind-match check (E_TRACK_KIND_MISMATCH) bina media-type ke chal
  nahi sakta tha; image bhi valid kind hai (PRD whitelist: opacity =
  video/image/text).]
  [AMENDED 2026-08-04, M5 lock O1 — `durationInSource` ab NULLABLE:
  `durationInSource: RationalTime | null`. `null` ka EXACTLY EK matlab hai:
  **"is media ki koi lambai hai hi nahi — aseem"**, aur wo sirf
  `kind === "image"` par lagta hai. Kaaran: image ki natural duration hoti
  hi nahi (logo.png 5s dikhao ya 5min — dono valid), par "source range file
  ke andar" invariant har clip se ye number maangta tha. Do vikalp
  REJECTED: (a) jhootha bada sentinel (24h) — wo export mein bhi likha
  jaata, yaani hum interchange format mein jhooth likhte; (b)
  durationInSource = jitna use ho raha hai — tab image kabhi extend hi
  nahi hoti (E_SOURCE_OUT_OF_BOUNDS), ek bilkul normal editing action band.
  `null` ka doosra matlab ("video hai par lambai pata nahi") JAAN-BOOJH KE
  nahi banaya — wo ek value ke do matlab ban jaate aur har call-site ko
  "ye kaunsa null hai" poochhna padta (bug-farm). Video/audio ke liye
  `durationInSource` ab bhi REQUIRED non-null hai; import par lambai na
  mile to clip banti hi nahi (O2). Invariant asar: A2.3 ki
  source-range-in-file check `null` par SKIP (ek `if`), baaki sab waisa hi.
  Dekho M5 section O1/O2.]
  [AMENDED 2026-08-05, M5 review F2 — naya optional field
  `sourceStartInFile?: RationalTime`: file ka apna maal kis frame-number se
  shuru hota hai. OTIO ka `available_range` ek KHIDKI hai (`start` +
  `duration`), aur uska `start` hamesha 0 nahi hota — embedded timecode wali
  media 90, 3600 kuch bhi ho sakti hai; clip ke source coordinates USI khidki
  mein likhe hote hain. Purana code sirf `duration` uthata tha aur `start`
  phenk deta tha, jisse DO ulti galtiyan ek saath hoti thi: (a) SAHI file
  reject — khidki [90,290) mein clip 250→270 bilkul valid hai, par humne file
  ko "0 se 200" samajh ke `E_INVALID_OTIO` de diya; (b) GALAT file chup-chaap
  accept — usi khidki mein clip 5→25 (frame 5 file mein hai hi nahi) bina
  warning import ho gayi, aur invariant numerically pass karta raha jabki
  matlab jhootha tha. Ab OTIO ka darwaza NORMALIZE karta hai: import par har
  source coordinate se `available_range.start` ghata do (engine ki duniya
  hamesha 0 se shuru), aur us start ko `sourceStartInFile` mein yaad rakh lo;
  export par wapas jod do (round-trip lossless). Koi hardcoded number nahi —
  jo file khud kehti hai wahi ghatta/judta hai. ENGINE ko haath NAHI lagta:
  invariants/verbs/diff/merge sab waise ke waise, ye field sirf OTIO ke
  darwaze par padha jaata hai. Absent = 0 (lagbhag har file).]
- **A2.2 (2026-08-02) LOCKED — Clip + TextClip types:**
  `Clip = { id (stable — diff/merge ki jaan), mediaRefId, sourceRange (KYA
  dikhana), timelineRange (KAB dikhana), properties: { volume? 0-100,
  opacity? 0-100, scale? (zoom: 1=normal), position? {x,y} (screen placement —
  PiP use-case) } }` — properties EXACTLY #15 whitelist, sab optional with
  defaults. `TextClip = { id, timelineRange, textContent, textStyle {font,
  size, color} }` — media/sourceRange NAHI (#16: normal clip minus media plus
  text). Scale/position diff-merge ecosystem mein volume jaise hi: propertyChange
  verb → classify rule → Bucket-1 conflicts — zero naya machinery.
- **A2.3 (2026-08-02) LOCKED — Track + Timeline:**
  `Track = { id, kind: "video"|"audio"|"text", clips: Clip[]|TextClip[] }`,
  `Timeline = { projectRate, tracks: Track[], mediaRefs: MediaRef[] }`
  [AMENDED 2026-08-03, Codex final review F3: mediaRefs ADD — parchiyon ka
  koi ghar nahi tha (na Timeline mein na kisi DB table mein), jisse
  E_MEDIA_NOT_FOUND check, preview/export ka URL-lookup sab impossible tha.
  Clips apne stable id se hi match hoti hain — mediaRefId sirf "content
  kis file se" batata hai, identity nahi. Storage free mein solved:
  snapshots ka timeline-JSON ab mediaRefs samet save hota hai. Field order
  cosmetic. Koi naya type/table nahi.]. Invariants inhi types par:
  no-overlap-same-track (Track.clips), source-range-in-file (Clip vs
  MediaRef.durationInSource) [AMENDED 2026-08-04, M5 O1: ye check tab hi
  chalta hai jab `durationInSource !== null`; image (null = aseem) par skip],
  duration>0 (har TimeRange). A2 COMPLETE —
  domain model = 6-type parivaar. Style note: `type` (not `interface`)
  project-wide — union types chahiye (Track.kind, command discriminated
  union) + interface ka declaration-merging (silent reopen) nahi chahiye;
  ek keyword = consistency.
  [M4 I1 RECONCILIATION 2026-08-04: `duration>0 (har TimeRange)` domain rule
  unchanged hai. Existing runtime invariant sweep materialized timeline/source
  ranges check karta hai; lineage positivity public add/trim/split transitions
  aur M4 common-refinement ki construction se maintained hai. Lawful
  opposite-edge collapse/crossing M4 mein nonpositive lineage `TimeRange`
  banne se PEHLE same-clip B1 hota hai. 34 M4 T2 goldens + seed 1295277908 ke
  500 local/10,000 CI-mode T3 cases ne har accepted edit, draft replay, aur
  final merge par direct `lineage.span.duration.value > 0` traverse kiya.
  Koi reachable counterexample ya necessary merge-boundary safeguard nahi
  mila; isliye redundant runtime lineage check add nahi hua aur docs/15 I1
  proof-by-construction se VERIFIED-CLOSED hai.]
- **A3 contract format (2026-08-02) LOCKED — har verb = 5 sawaal:** command
  shape / preconditions (typed errors ke saath) / exact transition / inverse
  (undo) / error cases. Preconditions = invariants ka darwaza — invariant
  kabhi toot nahi sakta kyunki har verb pehle poochhta hai.
- **A3.1 addClip (2026-08-02) LOCKED:**
  Command: `{ op:"addClip", trackId, mediaRefId, sourceRange, timelineRange }`
  (sourceRange = file ka KYA hissa; timelineRange = KAHAN — start+duration,
  e.g. 0:30 + 1min = 0:30→1:30 occupied).
  Preconditions (8): track exists (E_TRACK_NOT_FOUND) / media exists
  (E_MEDIA_NOT_FOUND) / source file ke andar (E_SOURCE_OUT_OF_BOUNDS) /
  no overlap (E_OVERLAP) / durations>0 (E_INVALID_RANGE) / start>=0
  (E_NEGATIVE_TIME) / track-kind match — video clip text lane pe nahi
  (E_TRACK_KIND_MISMATCH) / rate==projectRate (E_RATE_MISMATCH — defense
  in depth apne UI/agent bugs ke khilaf; gate-conversion sirf imports cover
  karta hai). [Aakhri 3 checks Aditya ke final-check sawaal se mile.]
  Transition: track mein naya Clip, id engine mint karta hai. Aur kuch nahi.
  Inverse: deleteClip(id). Errors: upar ke 8 typed codes.
  [AMENDED 2026-08-03, Codex final review F4 — verb EK hi, par teen roop:
  (a) media-clip payload (upar wala — jaisa tha);
  (b) text-clip payload `{ op:"addClip", trackId, textContent, textStyle?,
  timelineRange }` — media/sourceRange fields NAHI (PRD #16: TextClip =
  minus media plus text); server fields dekh ke roop pehchanta hai
  (discriminated union). [N2 fix 2026-08-03: textContent REQUIRED +
  non-empty — pehle galti se optional likha tha, jo TextClip ke apne
  required-field + khaali-content-invalid rules todta; wahi A3.6 wali
  validation (max 500, ""=E_INVALID_VALUE) creation par bhi.] Text-roop
  ke preconditions: track exists / track.kind=="text"
  (E_TRACK_KIND_MISMATCH) / no overlap / duration>0 / start>=0 /
  textContent valid non-empty (E_INVALID_VALUE) / rate==projectRate
  (E_RATE_MISMATCH) [M2 open-Q1 resolved 2026-08-03: rate-check yahan
  likhna reh gaya tha — caption ke paas bhi timelineRange hai, wahi
  galat-rate bug lagta; M2 agent ne consistency se include kiya, Aditya
  ne KEEP lock kiya] — media-wale checks (media exists / source bounds)
  N/A.
  textStyle optional — defaults BC.5 se materialize (Arial/48/#ffffff).
  (c) INTERNAL restore-roop (sirf engine ke andar — API/user se KABHI
  accept nahi): poora captured clip-object id SAMET wapas rakhna; yahan id
  mint NAHI hota. deleteClip ka inverse ab isi roop se sahi hai (delete se
  pehle engine poora preimage capture karta hai) — warna undo naye id ke
  saath clip lautata aur diff use add+delete dikhata (identity toot-ti).
  Undo LIFO order mein hi chalta hai, isliye inverse hamesha fit; V1 API
  mein alag undo endpoint NAHI (engine-level contract + V2 foundation).]
- **A3.2 deleteClip (2026-08-02) LOCKED:**
  Command: `{ op:"deleteClip", clipId }`. Precondition (1): clip exists
  (E_CLIP_NOT_FOUND — already-deleted bhi isi mein: deleted = exist nahi).
  Transition: clip track se gayab, GAP wahin rehta hai — aas-paas ki clips
  NAHI khisaktin (khisakna = rippleDelete ka kaam, alag verb — surgical vs
  ripple distinction). Inverse: addClip (puraani saari values). TextClip pe
  bhi same (#16 — wahi verbs).
- **A3.3 move (2026-08-02) LOCKED — SAME-TRACK ONLY (Codex #5 decision):**
  Command: `{ op:"move", clipId, newStart }`. Preconditions (4): clip exists /
  newStart>=0 / destination overlap check (khud ko exclude karke) / rate match.
  Transition: SIRF timelineRange.start badalta hai — duration/source/track/
  properties untouched. Inverse: move purane start pe. Cross-track move V1
  OUT (Aditya lock): demo story ko chahiye nahi + diff/merge/conflict mein
  naye case-family khulte — V2 mein optional newTrackId field se aayega.
- **A3.4 trim (2026-08-02) LOCKED — source + timeline DONO sync mein badalte
  hain (Codex #5 ka jawab):** Command: `{ op:"trim", clipId, edge:
  "start"|"end", delta }` (minus=kaato, plus=badhao). Preconditions (6):
  clip exists / resulting duration>0 (poora kaatna = delete, trim nahi) /
  extend pe source material available DONO dishaon mein
  (E_SOURCE_OUT_OF_BOUNDS) / extend pe neighbor overlap (E_OVERLAP) /
  start-extend pe timeline start>=0 (E_NEGATIVE_TIME — sanity-check se mila) /
  rate match. Transition: edge ke hisaab se sourceRange + timelineRange sync.
  Inverse: same edge, ulta delta. TextClip: sirf timelineRange (#16).
  delta=0 → A4 degenerate list mein (noted). VERB-FAMILY partition note:
  trim=dono saath / slip=sirf source / move=sirf position / speed-change
  (timeline bina source)=V1 OUT (#15).
- **A3.5 slip (2026-08-02) LOCKED:** Command: `{ op:"slip", clipId, delta }`.
  Preconditions (3): clip exists (timeline pe wo ID hai? — stale-ID/deleted
  case) / nayi source-khidki POORI file ke andar dono kinare
  (durationInSource se — E_SOURCE_OUT_OF_BOUNDS) / rate match.
  [AMENDED 2026-08-04, M5 lock O3 — IMAGE par slip = `E_NOT_APPLICABLE`,
  bilkul TextClip wali line ke saath (`isTextClip` check ke padoas mein
  `media.kind === "image"`). Kaaran: slip ka kaam hai file ke ANDAR khidki
  khiskana; image mein khidki hai hi nahi — jo bhi khiskao, screen par
  wahi tasveer. Allow karte to data badalta par dikhta kuch nahi, aur wo
  jhooth aage tak jaata: diff "clip badli" bolta, aur do branches alag-alag
  slip karein to Bucket-1 conflict banta — ek aisi cheez par jiska koi
  visual asar hi nahi (jhoothi conflict). Naya error code NAHI (locked
  C4/F8 list se `E_NOT_APPLICABLE` reuse), naya pattern NAHI.] Overlap/
  negative-time/duration checks CHAHIYE HI NAHI (timeline untouched — slip
  ki khoobsurti). Transition: sirf sourceRange.start += delta. Inverse:
  slip(-delta) — khidki wapas. TextClip → E_NOT_APPLICABLE (#16). delta=0 →
  A4. GENERAL NOTE (sab verbs): integer/NaN/type validation API darwaze pe
  Zod se (Item 12) — engine tak galat type pahunchta hi nahi. Seconds→frames
  conversion UI/agent layer pe hota hai (project rate se) — engine hamesha
  frames (integers) receive karta hai.
- **A3.6 propertyChange (2026-08-02) LOCKED:** Command: `{ op:"propertyChange",
  clipId, property, value }`. Preconditions (3): clip exists / applicability
  matrix (E_PROPERTY_NOT_APPLICABLE) / value range (E_INVALID_VALUE).
  Transition: SIRF wo property — jagah/lambai/source untouched. Inverse:
  purani value. FULL 6×3 APPLICABILITY MATRIX: volume(video✅ audio✅ text❌),
  opacity(video✅ audio❌ text✅ — caption fade), scale(sirf video — text ka
  size textStyle mein), position(video✅ audio❌ text✅ — subtitle placement),
  textContent/textStyle(sirf text).
  [AMENDED 2026-08-03, Codex verification N1 — matrix ab 6×4, IMAGE column
  add + label-semantics clarified: media clips ke liye column = MEDIA KIND
  (MediaRef.kind), text clips ke liye = text (unka media hota hi nahi).
  IMAGE: volume❌ (photo ki awaaz nahi — E_PROPERTY_NOT_APPLICABLE),
  opacity✅, scale✅, position✅, textContent/textStyle❌. PRD whitelist
  pehle se yahi bolta tha ("opacity: video/image/text"; volume-list mein
  image nahi) — sirf matrix mein utaarna reh gaya tha. TRACK MAPPING (N1
  ka doosra hissa): image media VIDEO track par baithti hai (track-kind
  match rule: image→video allowed; audio track par ❌, text par ❌ —
  track.kind batata hai screen-pe-dikhna vs sunna, image visual hai).
  Koi naya track type / property nahi.] RANGES: volume/opacity int 0-100; scale
  0.1-10; position {x,y} numbers (screen-bounds check nahi — offscreen framing
  valid); textContent string max 500, empty "" = E_INVALID_VALUE (khaali
  caption = delete karo); textStyle font fixed-list, size int 8-200, color
  hex. value==current → A4 degenerate. Time-checks (rate/overlap/negative)
  is verb pe hain hi nahi (time chhuta hi nahi).
- **A3.7 rippleDelete (2026-08-02) LOCKED — single-track (Bucket A #3), exact
  shift semantics:** Command: `{ op:"rippleDelete", clipId }`. Precondition
  (1): clip exists. Transition: clip delete + USI track pe baad wali SAARI
  clips start -= deletedDuration (purane beech-ke gaps preserved — sirf
  overall sarakna). Inverse: composite (clips wapas right + addClip).
  Overlap check NAHI chahiye — PROVEN SAFE BY CONSTRUCTION (same-amount
  shift = relative spacing intact; freed space = exactly deleted duration) —
  proof docs mein (interview gold). Delete-vs-ripple = user ka explicit
  intent (do buttons — space rakhna hai to delete, band karna hai to
  ripple; system kabhi guess nahi karta — standard NLE pair).
- **A4 (2026-08-02) LOCKED — Degenerate outcomes (Codex #14 complete):**
  zyadatar cases verb-contracts ke typed errors mein already covered. Naye 3
  rules: (1) NO-CHANGE commands (delta=0, value==current, same-position move)
  → SUCCESS + noChange flag, pending/op-log mein ENTRY NAHI (na error — user
  ne galat kuch nahi kiya; na record — hua hi kuch nahi, log noise-free).
  (2) EMPTY TIMELINE (0 tracks / 0 clips) = valid normal state; track
  add/delete verbs EXIST NAHI karte V1 mein — tracks import se aate hain,
  fixed rehte hain (ab likhit deliberate). (3) Import mein zero/negative-
  duration clip → us clip ko SKIP + itemized warning ("Skipped: 1
  zero-duration clip") — #17 ka wahi import-warning pattern.
  **PHASE A COMPLETE (A1-A4). NEXT: Phase B Fusion trio.**

## Phase B locked outcomes

- **B2.1 (2026-08-02) LOCKED — Compare granularity = "khaane" (normalized
  atoms), verbs nahi:** merge/diff engine kabhi verbs nahi dekhta (net-state
  authority, HLD Item 5) — do states compare karte waqt har clip in UNITS mein
  tootti hai: (1) **jagah** (timeline par kahan — timelineOffset), (2) **lambai/
  daayra** (kahan se kahan tak — coverage), (3) **file-ki-khidki** (source ka
  kaunsa hissa — sourceOffset; text clips par nahi), (4) **6 properties har ek
  alag unit** (volume/opacity/scale/position/textContent/textStyle — position
  aur textStyle whole-atom), (5) **existence** (clip hai ya nahi). Rule (Part 3
  ke locked 4-rule merge ka "field" blank ab bhara): same unit dono branches ne
  alag values par badla = conflict; alag units = dono changes compose. Kyun:
  raw-field compare move-vs-trim jaise genuinely composable cases par jhoothe
  conflicts banata (verified worked example: move +3s ⊕ trim-start 2s =
  content-anchored sahi result); kam false conflicts = Cardboard ka "friction-
  free" ask. Compose ke baad invariant toote (overlap etc.) to wo alag se
  Bucket-3 pipeline pakadti hai (Lock 8). Note: gap banna invariant violation
  NAHI hai (gap valid — Part 1); merge ke baad fine-tuning normal editing se
  (locked — conflict screen editor nahi). Fallback documented: agar user-testing
  mein auto-compose surprising lage to conservative mode (compose→B1) ek
  policy-switch hai. [Fusion: Codex-leg pick, Claude-leg raw-field rejected;
  Aditya lock 2026-08-02.]
- **B1.1 (2026-08-02) LOCKED — Split identity = left-survives + parent-chained
  formula-naam + khandaan-record:** clip A ko kaata to (1) pehla tukda A hi
  rehta hai (same ID — shuruaat wahi, sirf end kata), (2) doosre tukde ka ID
  FORMULA se banta hai: parent ka POORA ID + cut position (root-local
  coordinate mein, timeline number nahi — isliye move se naam kharab nahi
  hota). Nested split = chained naam (A@5 ka tukda = A@5@8) — kitne bhi level
  unique. (3) Har tukda lineage/khandaan-record STATE mein carry karta hai
  (rootId + apna span) — op-log merge input nahi ho sakta (locked). **ID-
  namespace clarification (2026-08-04, M2/M3 review I2 owner resolution):**
  root-clip IDs system-minted aur `@`-free hain; `@<root-local-cut>` suffix
  SIRF split operation ke liye reserved hai. Isliye full parent-ID se trailing
  split suffix hatana direct ancestry decoding hai, shakal/heuristic guessing
  nahi; `lineage.rootId/span` state mein family-root + coverage authority rehta
  hai. Public add caller se ID leta hi nahi. Future import bhi external clip ID
  ko internal root ID ki tarah preserve nahi karega — fresh `@`-free internal
  root ID mint karega. Is namespace ke bahar manually formula-shaped unrelated
  root ID invalid input hai, diff bug nahi. Kyun ye jeeta: same-cut
  concurrent splits ka naam dono branches mein SAME banta → merge par auto-
  converge, zero conflict (random IDs hote to unification rule chahiye hota).
  Advisor-caught bug fixed: naive segmentId(rootId, cut) total nahi tha
  (split→delete→extend→re-split same number = collision) — parent-chained
  naam se mathematically impossible; ab named regression test.
  [AMENDED 2026-08-04, M4 fix-pass N5: parent-chained formula bhi ek narrow
  case mein total nahi — trims ek healed cut ko wapas kholte hain jab
  original descendant shifted span par zinda ho (4-command witness: split@1
  → sibling start-shrink → parent end-extend → re-split@1 → formula `A@1`
  already live). Fix locked: split verb formula-ID ko deterministically
  extend karta hai jab tak live-clip set mein unique na ho (`A@1` taken →
  `A@1@1`) — same state dono branches par same naam mint karta hai, isliye
  same-cut merge auto-converge intact. Naya verbs.test.ts regression. Baaki
  B1.1 (left-survives, root-local coordinates, reserved namespace)
  unchanged.] Tombstone
  rejected ("deleted = ID absent" locked semantics A3.2). Naam ki lambai split-
  depth ke saath badhti hai — demo scale non-issue, documented. Edge-case
  matrix (18 cases: split-vs-har-verb, nested, collision, reuse, moved-clip
  cut, text, ripple, boundary, post-merge-base) discussion mein verify hua —
  koi phasne wala case nahi. [Fusion: Codex-leg pick + advisor fix; Aditya
  lock 2026-08-02.]
- **B1.2 (2026-08-02) LOCKED — Split-vs-X merge bartaav (family rules):**
  merge mein jab ek branch ne split kiya aur doosri ne usi clip par kuch aur:
  (1) property/move/slip/trim → AUTO — doosri side ka change poore parivaar
  par project hota hai: property har us tukde par jiska value abhi bhi base
  wala hai (tumne tukde ki wahi property alag di ho to sirf us tukde par B1);
  move = poora parivaar saath sarakta hai (cuts intact); slip = khidki sab
  tukdon ke andar sarakti; trim = kata/badha hissa tukdon par map (extension
  kinare wale tukde ko badhati hai — advisor-fixed case, named test).
  (2) delete → B2 conflict POORE parivaar par ek saath ([Keep delete] = sab
  tukde gone / [Keep clip] = poori family / [Keep original] = base clip
  wapas) — aadha parivaar kabhi resolve nahi hota, zombie-tukda impossible.
  (3) same-cut dono taraf → auto-converge (B1.1 ke formula-naam se same ID),
  zero conflict. (4) alag-cut → dono cuts lagte hain (union) → 3 tukde;
  refined tukdon par field-compare recurse. (5) trim se tukda POORA mit raha
  ho + doosri side ne use edit kiya ho → us tukde par B2; edit nahi → auto-
  erase. (6) rippleDelete: victim = yahi clip → rule (2); victim koi aur,
  ye sirf downstream sarki → rule move jaisa (parivaar par offset). Sab
  deterministic, zero AI. [Fusion: dono legs converged + advisor extension-
  fix; Aditya lock 2026-08-02.]
- **A3.8 split (2026-08-02) LOCKED — A3 ab 8/8 COMPLETE:**
  Command: `{ op:"split", clipId, at: RationalTime }` (`at` = absolute timeline
  frame boundary). Preconditions (4): clip exists (E_CLIP_NOT_FOUND) / `at`
  STRICTLY clip ke andar — dono kinare exclusive, warna 0-duration tukda banta;
  1-frame clip isliye kaat hi nahi sakti (E_SPLIT_AT_BOUNDARY) / cut clip ke
  bahar → E_SPLIT_OUT_OF_RANGE / rate match (E_RATE_MISMATCH). Aadha-frame cut
  by-design impossible (A1 integer time). Transition: left tukda = same ID
  [start, at), right = formula-naam B1.1 [at, end); source window usi anupaat
  mein partition; properties/textContent/textStyle DONO par exact copy; track
  unchanged. PROOF-BY-CONSTRUCTION: na gap, na overlap, na 0-duration, source
  partition exact — runtime invariant checks zaroori nahi (A3.7 rippleDelete
  jaisa proof). TextClip par valid (source fields nahi — timeline partition
  only). Inverse: atomic composite — right tukda remove + left ko captured
  preimage se restore; koi public "unsplit" verb NAHI (sirf undo-internal).
  Errors: upar ke 4 typed codes. 12-case edge matrix discussion mein verified
  (boundaries, bahar-cut, missing clip, 1-frame, half-frame, text, undo,
  nested, moved-clip, gap/overlap-proof). [Aditya lock 2026-08-02.]
- **B2.2 (2026-08-02) LOCKED — Conflict ke sirf 3 darwaze + total mapping:**
  conflict paida hone ke raaste exactly teen: (1) SAME UNIT dono ne alag
  values par badla (B2.1 ke khaane: jagah/lambai/khidki/6 properties) →
  Bucket 1 [Keep yours][Keep agent's][Keep original]; (2) DELETE-vs-kuch-bhi
  (ek side absent, doosri ne usi base lineage par kuch kiya) → Bucket 2
  [Keep delete][Keep clip][Keep original] — split families par family-atomic
  (B1.2); (3) JOD KE BAAD invariant toota (dono akele valid, saath invalid —
  overlap etc.) → Bucket 3 [Shift A][Shift B][Remove both]. [Q3
  clarification 2026-08-03 (Codex final review): "Remove both" = poora
  naam "Remove both — back to original" (docs/07 wala) — dono conflicting
  CHANGES undo, clips delete NAHI. Exact rule: har participant apni BASE
  halat mein wapas — jo base mein tha wahin/waisa wapas (e.g. move undo),
  jo base mein exist nahi karta tha (naya add) wo hat jaata hai. Yahi
  outcomes-set ka "base" outcome hai. Sirf label-shortening ki ambiguity
  thi, design change zero.] Detection sab
  pure state-math (exact integer equality), zero AI. EXHAUSTIVENESS PROOF
  (4tha darwaza impossible): compare ke paas sirf 3 sawaal hain — clip hai-
  ya-nahi (→2), values kya hain (→1), jod valid hai-ya-nahi (→3); state mein
  in units ke alawa kuch exist hi nahi karta (finite-fields argument, Part 3
  diff catch-all wala hi). Fuzz guarantee: koi conflict kabhi bucket ke bina
  nahi bach sakta. Ye PRD 5.3 ka engine-side completion hai — UI unchanged.
  Internal class-names (VALUE_*/DELETE_*/JOIN_* — implementation/test naming)
  fusion plan mein enumerated. [Council converged; Aditya lock 2026-08-02.]
- **B2.3 (2026-08-02) LOCKED — Lock-takkar resolved (Bucket A #8 NARROWED,
  Aditya ka Option-1 faisla):** jod-ke-baad invariant violations do tarah ki:
  (a) OVERLAP (do clips ek-doosre par) → Bucket 3 [Shift A][Shift B][Remove
  both] — sarkana wahan genuine solution hai; (b) SAME-CLIP joint violations
  (khidki file ke bahar / start < 0 / duration ≤ 0 — dono edits akele valid,
  jod invalid) → **Bucket 1** us clip par: [Keep yours][Keep agent's][Keep
  original] — teeno buttons live, existing B1 screen reuse, koi naya UI
  variant nahi. Reason: B3 ke Shift-buttons in cases mein DEAD hote (sarkane
  se file-content nahi badhta) — 3 mein se 2 bekaar buttons = kharab UX.
  AMENDMENT: docs/07 Bucket A #8 ki wording "har post-merge invariant
  violation = B3" ab narrow — overlap→B3, same-clip joint→B1 (Option 2 —
  B3 ke andar dusra button-set — rejected: naya UI variant banta). WHY ye
  cases edit-time preconditions se nahi pakde ja sakte: har branch ka check
  sirf apni branch ki state dekhta hai — combined state (jo kisi ne kabhi
  nahi banayi) pehli baar merge par janm leti hai; wahi EK invariant list do
  darwazon par chalti hai (edit precondition + join sweep) — koi naya check
  nahi, over-engineering nahi. [Advisor ne lock-takkar surface ki; Aditya
  lock 2026-08-02.]
- **B2.4 (2026-08-02) LOCKED — delete-vs-rippleDelete = AUTO (Option 1), gap
  band ho jaata hai + DOCUMENTED LIMITATION:** same clip ek branch mein
  delete (gap rakha), doosri mein rippleDelete (gap band) → merge mein KOI
  conflict nahi: clip-removal dono taraf converged; baad-wali clips ki jagah
  sirf ripple-side ne badli = one-sided → locked rule se auto-apply → ripple
  ka net effect lagta hai (gap band). Kyun: rule-consistency ("one-sided =
  auto", koi exception nahi) > rare case ki nafasat; special gap-policy
  detection = locked rule ka exception + complexity (Codex-leg option,
  rejected V1 mein). Gap wapas chahiye → merge ke baad normal edit.
  📌 DOCUMENTATION REQUIRED (Aditya): README/docs mein explicitly likhna —
  ye known case hai; V2 improvement: is pattern par user se poochhna "gap
  rakhein ya band karein?" (deterministic state-signature detection se
  conflict dikhana) zyada sensible UX hai — deferred design ready, one-way
  door nahi. No-tricks philosophy: limitation openly documented. [Aditya
  lock 2026-08-02, V2-note ke saath.] **B2 COMPLETE (B2.1–B2.4).**
- **B3.1 (2026-08-02) LOCKED — "Barabar" ki definition (Codex #22 ka jawab) =
  2 rules:** (1) **Defaults materialize karke compare:** property field nahi
  likha = default value maana jayega (volume/opacity 100, scale 1, position
  {0,0}) — "likha 100" vs "nahi likha" = BARABAR, jhootha diff impossible.
  Data-representation ka rule hai, edits ka nahi. (2) **Matching sirf ID se,
  shakal se KABHI nahi:** do versions compare karte waqt "kaunsi clip kaunsi
  hai" ka jawab sirf ID deta hai. Delete karke bilkul waisi clip dobara
  banayi = naya ID = diff sach bolega ("delete + add"), aur doosri branch ke
  purani-clip-par edits naye clone par chupchaap nahi lagenge (delete-vs-edit
  conflict banega — sach). Shakal-matching = guessing = rejected (wahi
  philosophy jo import #10 mein thi). Clip ki pehchaan uska janm hai, shakal
  nahi. Baaki equivalence properties (raasta irrelevant — sirf aakhri shakal;
  trim+untrim = no changes) purane locks se free (net-state authority, HLD
  Item 5). Round-trip test ki structural equality (IDs ignored, HLD #11)
  ALAG definition alag kaam — kabhi mix nahi hogi. Fixed sort order compare
  ke liye: (timeline start, end, rootId, span start, clipId) — pure
  determinism detail. [Aditya lock 2026-08-02.]
- **B3.2 (2026-08-02) LOCKED — Conflict list ka order FIXED (kitab-order):**
  conflicts hamesha track order (upar wala pehle: video → audio → text,
  import ki track-stacking ke hisaab se) + track ke andar left-se-right
  (timeline start), tie par stable tiebreak (rootId, clipId). User ek-ek
  karke isi order mein resolve karta hai. Same merge = same list same order,
  HAMESHA — predictable UX + testable (random order = untestable). [Aditya
  lock 2026-08-02.]
- **B3.3 (2026-08-02) LOCKED — Resolution = parchi (choices-map) + fresh
  recompute:** har conflict-button click ka decision turant merge-draft (DB,
  HLD #1 wala row) ki PARCHI mein save hota hai ("#1 → Agent ka"); engine
  har click ke baad poora merge result SHURU se recompute karta hai — parchi
  ke sab choices laga ke. Draft ko seedha kaat-peet karna REJECTED (click ka
  order result badal sakta tha + crash par adhoora draft). Guarantees isse:
  (a) click-order irrelevant — same choices = same result hamesha; (b) crash/
  net-loss par kuch nahi khota — parchi server DB mein, browser mein nahi;
  wapas aane par "Resume merge?" → jahan chhoda wahin se, pehle ke jawab
  yaad; (c) saare conflicts resolve hote hi final version ek transaction
  mein commit (2 parents + snapshot + CAS — sab pehle se locked, HLD #8/#9)
  + draft-parchi delete. Cost documented: har click par recompute — demo
  scale par negligible, 10k benchmark mein measured hoga. Conflict IDs
  content-addressed (class + clips + khaana ka hash) — recompute ke across
  stable, isliye parchi ke jawab kabhi galat conflict se nahi jud sakte.
  [Advisor-driven fix (precompute/mutate models rejected); Aditya lock
  2026-08-02.]
- **B3.4 (2026-08-02) LOCKED — Naya conflict beech-resolution mein: turant +
  honest + terminating:** resolution se koi rukki clip pehli baar timeline
  par utre aur takkar bane → NAYA conflict USI click ke fresh-recompute mein
  pakda jaata hai aur list mein turant judta hai (koi refresh/dobara-merge
  nahi). UI ginti sach bolti hai ("2 resolved · 1 baaki · 1 naya mila") —
  fixed-total ka jhootha wada REJECTED (naye conflicts end mein chhupa ke
  dikhana user-dhokha). TERMINATION GUARANTEE: naya conflict SIRF rukki clip
  ke pehli baar utarne se ban sakta hai; utri clip dobara nahi utarti; rukki
  clips ki ginti strictly ghat-ti hai → 0 par naya impossible → list pakka
  khatam (fuzz-verified hoga). List khaali hone par hi final commit (B3.3).
  [Aditya lock 2026-08-02.]
  [Q2 clarification 2026-08-03 (Codex final review): utri (materialized)
  clip KABHI wapas pending nahi hoti. Dynamic conflict mein already-utri
  clip sirf PARTICIPANT banti hai — draft mein hi rehti hai; resolution
  buttons use draft ke andar hi handle karte hain.]
  [N4 AMENDED 2026-08-03, Codex verification — TERMINATION PROOF
  CORRECTED: pehla argument ("Shift free-slot hai isliye chain
  impossible") ADHOORA tha — [Remove both] base-revert karta hai aur base
  jagah khaali hone ki guarantee nahi (Codex ka sahi catch): revert kisi
  teesri utri clip se takra ke NAYA dynamic conflict bana sakta hai.
  Behavior/buttons unchanged; naya CORRECT measure (exam-paper argument):
  (1) parchi (choices-map) har click par EK naya permanent jawab —
  content-addressed conflict-ID se juda, kabhi mit-ta nahi, recompute
  har baar wapas laga deta hai → resolved KABHI wapas unresolved nahi;
  (2) conflict-universe FINITE: koi button nayi clip nahi banata, har
  clip ki possible positions finite deterministic set (ours/theirs/base/
  nearest-free-shift), buckets 3 → distinct conflict-IDs bounded;
  (3) har click ek naye distinct conflict ka jawab → clicks ≤ finite
  universe → list PAKKA khatam. Unresolved-count beech mein badh sakta
  hai (honest ginti B3.4 already dikhati hai), par total-ever-seen
  bounded. Fuzz (T3) cascade-termination isi ko verify karta hai.
  Purana "rukki ginti strictly ghat-ti" measure SUPERSEDED.] **B3 COMPLETE (B3.1–B3.4) — PHASE B CORE DESIGN
  COMPLETE.**

### Phase B cleanup locks (purane docs ke fixes/amendments)

- **BC.1 (2026-08-02) LOCKED — A2.2 AMENDED, TextClip mein properties field:**
  confirmed contradiction fix — A2.2 TextClip type mein `properties` khaana
  nahi tha, par A3.6 locked matrix text par opacity (caption fade) + position
  (subtitle placement) allow karti hai — store karne ki jagah hi nahi thi.
  Fix: `TextClip = { id, timelineRange, textContent, textStyle, properties?:
  { opacity?, position? } }` — SIRF wahi 2 jo matrix allow karti hai;
  volume/scale text par ab bhi E_PROPERTY_NOT_APPLICABLE. Sath hi A2.2 par
  B1.1 ka lineage amendment bhi lagta hai: Clip + TextClip dono mein
  `lineage { rootId, span }` (split-identity ke liye — B1.1 mein locked).
  [Codex-leg catch, docs se verified; Aditya lock 2026-08-02.]
- **BC.2 (2026-08-02) LOCKED — PRD 5.5 wording fix ("silently"):** "deleted
  clip resurrect nahi hoti" → "deleted clip kabhi SILENTLY resurrect nahi
  hoti — sirf user ke explicit resolution-click (B2 [Keep clip]/[Keep
  original]) se". Literal purani wording B2 buttons se rozana tooth-ti —
  test likhna impossible tha. Ab testable: auto-resurrect = fail, user-click
  = pass (B2 restorations alag se audited). [Codex-leg catch; Aditya lock
  2026-08-02.]
- **BC.3 (2026-08-02) LOCKED — A3.4 trim ke 4 exact equations:** contract ki
  "minus=kaato, plus=badhao" wording ab numbers ke saath pakki. Example
  (clip timeline 10–20, video/audio file ka dikhne wala hissa 5–15):
  trim(end,+3) → tl 10–23, file-hissa 5–18; trim(end,−3) → tl 10–17,
  file-hissa 5–12; trim(start,−3) → tl 13–20, file-hissa 8–15;
  trim(start,+3) → tl 7–20, file-hissa 2–15. General rule: timeline aur
  file-ka-hissa HAMESHA saath, barabar, usi taraf se badalte hain (A3.4 ka
  "dono sync" ab arithmetic ke saath). Normalized-model mein: trim = sirf
  coverage boundary ka move (B2.1). [Codex-leg catch (ambiguity); Aditya
  lock 2026-08-02.]
- **BC.4 (2026-08-02) LOCKED — Naya invariant: sourceRange.duration ===
  timelineRange.duration (media clips):** clip timeline par jitne second,
  file ka utna hi hissa — 1:1 hamesha. Guaranteed kyunki speed-change verb
  V1 mein exist nahi karta (#15 OUT). Ab tak bin-likhi assumption thi jis
  par trim-sync/split-partition/merge-math khada hai — ab official invariant
  list mein (edit-darwaza preconditions + jod-darwaza sweep dono jagah,
  wahi ek list) + test. [M2 open-Q3 resolved 2026-08-03: BC.4 violation
  ka error code = E_INVALID_RANGE (dedicated naya code NAHI — F8 ki
  final-list discipline; poori detail error MESSAGE mein, e.g. "BC.4
  violated: source 10s ≠ timeline 7s"). Aditya-locked.] V2 speed feature aaye to ye rule deliberately
  revisit hoga, silently nahi tootega. [Codex-leg catch; Aditya lock
  2026-08-02.]
- **BC.5 (2026-08-02) LOCKED — Text defaults + color format:** textStyle
  defaults: size 48, color #ffffff (white — subtitle standard), font = fixed
  list ka PEHLA (font list khud Phase C mein UI ke saath finalize — abhi
  lock karna premature). [AMENDED 2026-08-03, Codex final review F10 —
  Phase C complete hua par list naam karna reh gaya tha; ab LOCKED: V1
  font whitelist = EXACTLY ["Arial", "Georgia", "Courier New"], default =
  "Arial" (list ka pehla). Reasoning: teeno har OS/browser mein built-in
  (koi font-loading kaam nahi) + teeno visually ekdum alag (font-change
  diff/conflict demo mein saaf dikhega). Webfonts (Inter etc.) REJECTED —
  extra loading setup, demo-value same. Koi aur text-style expansion
  nahi.] Storage rule: color hamesha lowercase 6-digit
  #rrggbb; chhote forms (#FFF) API darwaze par expand — "#fff vs #ffffff"
  jhootha diff impossible. (B3.1 ke defaults-materialize rule ka text-side
  completion; volume/opacity/scale/position defaults B3.1 mein already.)
  [Advisor catch (defaults unspecified the); Aditya lock 2026-08-02.]
- **BC.6 (2026-08-02) LOCKED — docs/07 5.3 outcomes-line scope-fix:** purani
  line "outcomes sirf {ours,theirs,base,both-adjusted}" ambiguous thi —
  "poore merge ke outcomes" padhi ja sakti thi (galat: merge auto-compose se
  mila-jula result banata hai jo list ke bahar hai). Fix: "HAR EK CONFLICT ke
  resolution ke outcomes sirf..." — 5 shabd ka scope-tag; numbers/design/UI
  unchanged (screen par buttons 3, outcome-types 4 — both-adjusted sirf B3
  shift se aata hai). docs/07 mein amendment laga diya. No-unproven-claims
  rule khud par lagoo. [Dono legs ka catch; Aditya lock 2026-08-02.]
  **CLEANUP COMPLETE (BC.1–BC.6) — PHASE B POORA COMPLETE. ✅** Phase C
  note: C2 ka bada hissa Phase B ne cover kar diya (B2.3 buttons, B3.3
  parchi-replay, B3.4 dynamic conflicts) — C2 ab sirf "nearest-free-slot
  exact tie-rules + UI copy polish" rahega.

## Phase C locked outcomes

- **C1 (2026-08-02) LOCKED — Diff engine = match ✅(Phase B se) + classify
  15 rules + render templates + catch-all:** 3-step pipeline (Part 3 locked
  concept ab exact): MATCH = ID-only + split-khandaan (B3.1/B1.1 — naya
  kuch nahi). CLASSIFY+RENDER = 15 rules, har ek deterministic if-else +
  English sentence-template (UI English locked), zero AI: #1 moved / #2-#5
  trim-shortened/extended per edge / #6 slipped / #7-#12 property changes
  (volume/opacity/scale/position/textContent/textStyle, old → new values
  ke saath) / #13 added / #14 removed / #15 split (khandaan-record se
  detect, "split into two at X"). Multi-change clip = multiple sentences
  (har khaana apna rule). RippleDelete diff mein = #14 + N×#1 (net-state
  sach; "Ripple delete" naam History/op-log screen ka hai — alag, locked).
  **#16 CATCH-ALL (diff-relevant state ka jaal):** valid internal snapshots
  mein jo clip/track/timeline change semantic rules mein fit na ho → raw
  before→after values sach-sach ("Clip A changed: sourceRange 5–15 → 5–12")
  — kabhi crash nahi, kabhi silent-skip nahi, kabhi AI-guess nahi. COVERAGE
  PROOF matrix-checked: B2.1 ke finite editable khaane → har khaana ka rule
  (jagah#1, lambai#2-5, khidki#6, properties#7-12, existence#13-14,
  partition#15) + enumerated structural fallback. **Scope clarification
  (2026-08-04, M2/M3 review I3 owner resolution):** #16 arbitrary/corrupted
  JSON ka universal deep-diff validator NAHI. `mediaRefs` V1 mein immutable
  deployment fixtures hain (upload/replace flow nahi), isliye unke metadata ko
  commit-diff atom nahi maana jayega. Har stored `RationalTime.rate` seed/import/
  command boundary par `projectRate` hota hai; rate-only mismatch invalid input
  hai, version edit nahi. Future import ko bhi dono boundaries enforce karni
  hongi. In explicitly scoped valid-state fields ke andar escape impossible.
  [Aditya lock 2026-08-02; scope narrowed by owner 2026-08-04.]
- **C2 (2026-08-02) LOCKED — [Shift] ka nearest-free-slot rule:** Bucket-3
  mein [Shift A/B] dabane par engine clip ko rakhta hai: (1) dono taraf
  dekho — jo khaali jagah SABSE PAAS hai jisme clip POORI fit ho, wahi
  jeetti hai (doori jeetti hai, side nahi — left paas = left; right paas =
  right, chahe left mein bhi door wali jagah ho); (2) exactly barabar doori
  par tie → LEFT (earlier) wali; (3) left se clip start 0 ke pehle nikle →
  right; (4) right side timeline unbounded → fitting jagah HAMESHA milti
  hai, ye button kabhi fail nahi ho sakta. Same takkar + same track = same
  jawab hamesha (deterministic, no randomness). Shift ke turant baad nayi
  takkar impossible (khaali jagah mein hi rakhte hain); baad ke resolutions
  se bane to B3.4 dynamic-conflict flow handle karta hai. Edge matrix
  discussion mein verified (5 cases: paas/tie/zero-bound/full-track/
  post-shift). UI copy: buttons ke English labels Bucket A #1 se unchanged.
  C2 ka baaki sab Phase B mein already locked tha (B2.3 buttons, B3.3
  parchi, B3.4 dynamic). [Aditya lock 2026-08-02.]
- **C3 (2026-08-03) LOCKED — 8 tables ke exact columns (ginti 8 HLD #16 se
  locked thi; har column purane locks ka ghar, naya concept zero):**
  (1) **projects**: id (UUID), owner_token (demo-isolation cookie check,
  HLD #14), project_rate (imported OTIO se — A1.2; default/hardcode NAHI),
  created_at (100-cap chowkidaar — HLD #15).
  (2) **branches**: id, project_id, name (branch ka naam — "main"/user-diya/
  system-template "agent/<script>-N"), head_commit_id (sticky note abhi kis
  commit par — CAS isi par, HLD 7a).
  (3) **commits**: id (hash), project_id, parent_id (chain), parent2_id
  (SIRF merge — 2 baap; warna NULL), name (template/user label — AI kabhi
  nahi, HLD 6a), actor (user|agent — 👤/🤖 badges), snapshot_distance
  (restore ≤10 guarantee, HLD #9; merge par 0), created_at,
  import_warnings (JSON, NULLABLE — sirf import-commits par bhara: #17 ki
  itemized skipped-list ka permanent ghar, e.g. "2 transitions, 1 blur";
  baaki sab commits par NULL. Maqsad restore NAHI — provenance/
  transparency: refresh ke baad bhi history mein saboot ki kya skip hua
  tha. [ADDED 2026-08-03, Codex final review F7 — PRD #17 ka "skipped
  record commit mein save" locked promise tha, column likhna reh gaya
  tha.]).
  (4) **ops**: id, project_id, commit_id, seq (EK commit ke ANDAR edits ka order —
  replay isi order mein; commits ka aapsi order parent_id se), command
  (JSON — Phase A contract shapes), actor (per-edit provenance).
  (5) [Q1 clarification 2026-08-03: import-commit, restore-commit aur
  merge-commit teeno HAMESHA full snapshot, snapshot_distance = 0. Choice
  nahi, forced: import ka parent nahi (ops "pichle se badla" likh hi nahi
  sakte) aur restore ka "become commit X" koi verb nahi — dono ka ekmatra
  representation poora snapshot hai. Merge pehle se locked tha. Normal
  edit-commits = op-list + har 10th snapshot (HLD #9 unchanged).]
  **snapshots**: commit_id, project_id, timeline (JSON — poora plan; format = A1/A2
  types, jaisa draft_timeline example mein dikhaya). [AMENDED by C5: pehle
  yahan schema_version column tha — C5 mein poora schemaVersion concept CUT
  hua, column hata. Table-structure migrations alag cheez hain — standard
  SQL migrations, unka isse lena-dena nahi.]
  (6) **working_state**: branch_id (per-branch ek row), project_id, base_commit_id,
  pending_ops (JSON list — bina-save edits; "N changes" chip = lambai),
  working_rev (MONOTONIC counter — har manzoor edit par +1; manzoor =
  server ne checks pass karke edit LAGAYA, save nahi; KABHI reset nahi
  hota — reset se stale-tab number collision ka risk; pending-count se
  alag cheez hai, sync mein NAHI). Commit par: pending → ops rows (seq ke
  saath), row reset base=naya commit, pending=[].
  (7) **merge_attempts**: id, project_id, branch_into, branch_from,
  head_into + head_from (shuru ke heads — finalize CAS double-check, HLD
  #8), draft_timeline (JSON — auto-merged + resolved content; unresolved
  conflict-participants JSON se BAHAR — B3.3 design), conflicts (JSON,
  kitab-order B3.2, dynamic-append B3.4), choices (parchi — B3.3),
  status. Finalize/abort par YE ROW delete (usi transaction mein), table
  nahi.
  (8) **tickets**: ticket (browser-generated UUID; UNIQUE index — do baar
  entry DB-level impossible), project_id, endpoint (kaunsa KAAM tha —
  ops/commit/merge/merge-resolve/import/export/agent-run/branch-create/
  branch-switch [F5 propagation 2026-08-03]/demo-reset/
  restore; same ticket + alag endpoint = explicit error, HLD #16 — galat
  jawab wapas jaane se bachaav), result (stored jawab — retry par yahi
  wapas, kaam dobara kabhi nahi), created_at (per-row 24h TTL cleanup —
  poori table kabhi khaali nahi hoti). SAB mutating endpoints ka shared
  register; GET/read requests ticket nahi laati (side-effect-free).
  Standard indexes: har table par project_id; branches(project_id, name)
  unique; ops(commit_id, seq) unique; snapshots(commit_id) unique;
  working_state(branch_id) unique; tickets(project_id, endpoint, ticket)
  unique. [Aditya lock 2026-08-03 — har table kahani + bhari-hui-row
  style mein discuss hua.] [AMENDED 2026-08-03, Codex final review F1:
  ops/snapshots/working_state teeno mein project_id column ADD — HLD #14
  ka locked rule ("har table row project_id carry karti hai") C3 ke exact
  columns likhte waqt in 3 tables mein utaarna reh gaya tha; index-line
  pehle se "har table par project_id" maangti thi (contradiction ab
  resolved). Table count 8 hi, koi naya concept nahi.]
- **C4 (2026-08-03) LOCKED — API contracts (envelope + shapes + error list):**
  (1) **ENVELOPE (har response ka same outer dhancha):** success =
  `{ ok: true, data: {...} }`; galti = `{ ok: false, error: { code, message } }`
  — code machine ke liye (UI switch karti), message insaan ke liye.
  Per-endpoint custom shapes REJECTED (UI ko ek hi reader chahiye).
  (2) **READ darwaze (ticket nahi — kuch badalte nahi):** GET timeline
  (req: branch + cookie-token; resp: timeline JSON + workingRev +
  pendingCount — chip isi se), GET history (commits list: name/actor/
  created_at/parents/import_warnings [F7 propagation 2026-08-03 —
  refresh-proof skipped-list history mein isi field se dikhti hai] —
  👤/🤖 badges actor se), GET diff (do commits ke
  beech C1 ke 15-rule sentences ki list). Pehli visit flow: token nahi →
  project row + fixture seed + cookie set (HLD #14) — phir READ normally.
  (3) **POST ops (edit darwaza — teen system ek saath) ka locked form:**
  req = `{ branch, workingRev, ticket, command }` (command = Phase A
  discriminated union); success resp = `{ workingRev: +1, pendingCount }`;
  reject = E_STALE_REV (tab UI chupchaap refresh — HLD #6 flow) ya Phase A
  ke verb-specific codes (E_OVERLAP etc.).
  [AMENDED 2026-08-03, Codex final review F9 — success response ke DO
  roop: (a) asli edit lagi → `{ workingRev: +1, pendingCount }` (upar
  wala); (b) no-change command (A4 — e.g. move wahi jagah, volume 80→80)
  → `{ noChange: true, workingRev: UNCHANGED, pendingCount: UNCHANGED }`
  — counter NAHI badhta (C3 ka rule: +1 sirf edit LAGNE par; pehle likha
  unconditional "+1" response client-server counter desync karke faltu
  E_STALE_REV deta). DB/logic zero change — sirf response-shape ko A4+C3
  ke sach ke barabar kiya.]
  (4) **Baaki mutating darwaze same pattern** (sab: ticket + envelope):
  POST commit {name?}, POST branch {name}, POST merge {from,into}, POST
  merge/resolve {attemptId, conflictId, choice}, POST merge/abort
  {attemptId}, POST restore {commitId}, POST agent/simulate {script},
  POST import {otioJson}, POST export {} (resp: otioJson + commit info —
  HLD #4 POST-export), POST demo/reset. Shapes purane locks se seedhe
  derive; coding ke waqt Zod schemas inhi se banenge, naya decision nahi.
  (5) **Error-code list = collection, decision nahi:** Phase A verb codes
  (E_CLIP_NOT_FOUND, E_TRACK_NOT_FOUND, E_MEDIA_NOT_FOUND, E_OVERLAP,
  E_SOURCE_OUT_OF_BOUNDS, E_INVALID_RANGE,
  E_NEGATIVE_TIME, E_TRACK_KIND_MISMATCH, E_RATE_MISMATCH,
  E_PROPERTY_NOT_APPLICABLE, E_INVALID_VALUE, E_NOT_APPLICABLE,
  E_SPLIT_AT_BOUNDARY, E_SPLIT_OUT_OF_RANGE) + system
  codes (E_STALE_REV, E_STALE_HEAD, E_TICKET_REUSED, E_BRANCH_NOT_FOUND,
  E_PROJECT_NOT_FOUND, E_MERGE_PRECONDITION, E_UNSUPPORTED_OTIO_VERSION,
  E_INVALID_OTIO, E_PAYLOAD_TOO_LARGE) — official list ek jagah, tests
  isi ko reference karenge. [Aditya lock 2026-08-03.]
  [AMENDED 2026-08-03, Codex final review F8: E_TRACK_NOT_FOUND +
  E_MEDIA_NOT_FOUND list mein ADD (A3.1 addClip inhe use karta tha, list
  mein likhna reh gaye the); E_ID_COLLISION REMOVE — hamare locked design
  mein unreachable hai (B1.1 formula-IDs + engine-minted addClip IDs =
  collision impossible; A3.8 apni error-list ko complete bolta hai).
  Zero behavior change — list ko verbs ke sach ke barabar kiya.]
  [AMENDED 2026-08-05, M7a owner triage — TEEN transport codes ADD:
  **E_BAD_REQUEST**, **E_BRANCH_EXISTS**, **E_INTERNAL**. Wajah: original
  list do parivaaron ki thi — verb ki galtiyan aur socha-hua system
  failure — par M7a implement karte waqt teen aisi asli situation aayi
  jinka koi ghar tha hi nahi, aur code ne kuch invent NAHI kiya (spec-gap
  report kiya, jo sahi tha).
  (a) **E_BAD_REQUEST** — request khud parse hi na ho: kharab JSON, Phase A
  union se bahar ka `command`, missing field, missing query param. Pehle ye
  `E_INVALID_VALUE` udhaar leta tha, jo ek VERB code hai jiska matlab hai
  "is clip par ye value gair-kanooni hai" — do bilkul alag failure ek hi
  code ke peeche, aur UI unhe alag nahi kar sakti thi. **Batwara ab saaf
  hai: darwaze par (Zod schema) reject = `E_BAD_REQUEST`; engine ne reject
  ki = us verb ka apna code.** Iska ek seedha nateeja: whitelist range ki
  galti (jaise volume 150) Item 12 ke mutabik darwaze par hi ruk jaati hai,
  isliye wo ab `E_BAD_REQUEST` hai, `E_INVALID_VALUE` nahi. Ye jaan-boojh ke
  hai — do parivaaron ke beech ki lakeer "kisne reject kiya" hai, "kaisi
  galti thi" nahi. UI par asar zero (slider 0-100 hi bhejta hai).
  (b) **E_BRANCH_EXISTS** — C3 ka locked `branches(project_id, name)` unique
  index is halat ko asli aur pakadne-layak banata hai, par C4 ne uska code
  kabhi naam nahi diya. Behaviour bilkul unchanged (duplicate branch pehle
  bhi nahi banti thi, ab bhi nahi banti) — ye sirf UI ko "ye naam already
  le liya gaya hai" kehne deta hai, "invalid value" ki jagah.
  (c) **E_INTERNAL** — anjaan exception. Iske bina crash poore envelope se
  hi bahar nikal jaata tha aur UI ka ek-hi-reader (jo C4 (1) ka poora
  maqsad hai) seedhe platform ke 500 se takraata tha. Andar ka message
  client ko kabhi nahi jaata (server par log hota hai) — stack trace ya
  connection string leak na ho.
  Ginti: 14 verb + 9 system + 3 transport. Naya CONCEPT zero — teenon
  sirf un darwaazon ko naam dete hain jo pehle se maujood the.
  [Aditya lock 2026-08-05.]]
  [AMENDED 2026-08-03, Codex final review F5 — branch-selection contract:
  (a) HAR branch-scoped request mein explicit `branch` field — POST commit
  {branch, name?}, POST restore {branch, commitId}, POST agent/simulate
  {branch, script}, POST export {branch} (POST ops + GET timeline mein
  pehle se tha; wahi pattern sab par). Server current-branch YAAD NAHI
  rakhta — stateless selection, do-tabs-alag-branches safe.
  (b) NAYA darwaza: POST branch/switch {from, to} — EK transaction mein:
  `from` dirty ho to auto-seal commit (ye HLD ke 6 boundary auto-seals
  wala PEHLE SE locked rule hai — endpoint sirf uski ghanti hai; naam
  usi locked template-naming se), phir `to` ka timeline + workingRev +
  pendingCount wapas (UI seedha switch render kare).
  (c) POST branch {name, from} = create+switch clarify: nayi branch `from`
  branch ke current head par banti hai; `from` dirty ho to pehle wahi
  auto-seal. DB schema ZERO change (per-branch working_state + commits/ops
  tables pehle se sab cover karte hain; current-branch column REJECTED —
  hidden state + multi-tab clash).]
  [AMENDED 2026-08-03, Codex final review F6 — HAR mutating darwaze ka
  exact success-`data` shape (sab purane locks se derive, zero naya
  concept; envelope wahi `{ ok:true, data }`):
  - POST ops → `{ workingRev, pendingCount }` (pehle se locked; F9 no-op
    case alag amendment mein).
  - POST commit → `{ commitId, name }`.
  - POST branch → `{ branchId, name, headCommitId }` (+ agar source
    dirty-seal hua to `sealedCommitId`).
  - POST branch/switch → `{ timeline, workingRev, pendingCount }` (+ agar
    seal hua to `sealedCommitId`) — F5 mein locked.
  - POST merge → conflicts nikle: `{ attemptId, conflicts, counts }`;
    zero conflicts: `{ done:true, mergeCommitId }` (two-phase ka phase-2
    khaali → turant finalize, alag button nahi).
  - POST merge/resolve → `{ counts, conflicts }` (fresh recompute — B3.3;
    counts mein naye dynamic bhi — B3.4 honest count); AAKHRI conflict
    resolve → `{ done:true, mergeCommitId }` ("sab sulajhne ke BAAD hi
    commit" lock ka seedha matlab — finalize automatic).
  - POST merge/abort → `{ aborted:true }` (draft row delete, timeline
    untouched — PRD).
  - POST restore → `{ commitId, name }` (naya restore-commit purane
    content ke saath — HLD).
  - POST agent/simulate → `{ commitId, name, actor:"agent", opsApplied }`.
  - POST import → `{ commitId, skippedItems }` (itemized — #17 lock).
  - POST export → `{ otioJson, commitId, name, mediaWarnings? }` —
    commitId/name = export hua head commit (export = boundary auto-seal,
    pehle se locked); mediaWarnings sirf unresolved refs par (HLD #12/#13
    "export hamesha succeed + warning" lock). [F6-completion 2026-08-03,
    Codex verification: export shape list se chhoot gaya tha.]
  - POST demo/reset → `{ done:true }` (UI fresh GET kare).
  Conflict object (merge + merge/resolve dono mein same shape):
  `{ conflictId, bucket: 1|2|3, participants (clip/khaana refs), 
  explanation (ek-line editor-language — 5.3 lock), choices (us bucket ke
  fixed buttons — B2/B3 locks) }`. Counts shape:
  `{ total, resolved, remaining }` — UI ginti seedhe isi se (B3.4 "sach
  bolti ginti").]
- **C5 (2026-08-03) LOCKED — schemaVersion POORA CUT (OUT, documented):**
  hamare internal JSON (snapshot timeline, ops command, pending_ops, merge
  draft) par KOI version tag/check NAHI. Reasoning chain (Aditya ke do
  challenges): (1) converters/lazy-upgrade/multi-table policy — V2 kabhi
  banega nahi (demo ka maqsad application), kaalpanik future ke liye code =
  waste → CUT; (2) aur jab converter hai hi nahi, to tag+check ka bhi koi
  kaam nahi → wo bhi CUT. "Hum feature bana rahe hain, app nahi."
  Consequence: C3 ke snapshots table se schema_version column HATA (ab
  snapshots = commit_id + timeline JSON, bas). NOTE: OTIO version whitelist
  (HLD Item 8 — import par user ki OTIO file ka version check) ALAG cheez
  hai, wo INTACT hai. Reversible: integration-team ko kabhi chahiye to
  ek-line addition hai — README integration-notes mein ek line jayegi.
  [Aditya lock 2026-08-03.]
- **C6 (2026-08-03) LOCKED — Idempotency/retry ke exact numbers:**
  (1) ticket format = browser `crypto.randomUUID()` (HLD #16 confirm);
  (2) silent auto-retries = 2 — pehli 1s baad, doosri 3s baad (light
  backoff: turant-turant = server bauchhaar, zyada gap = atka-hua feel);
  (3) 2 fail ke baad = banner "Connection lost — your saved work is safe"
  + [Retry] button + editing paused (HLD Item 10 flow) — user jitni baar
  chahe dabaye, har koshish SAME ticket = duplicate impossible (tickets
  register, C3); (4) tickets row TTL = 24h per-row cleanup. Kyun sirf 2
  silent: 4 sec mein net wapas nahi = micro-jhatka nahi, asli outage —
  aage chupchaap koshish = user andhere mein (honest-UX rule). [Aditya
  lock 2026-08-03.]
- **C7 (2026-08-03) LOCKED — Engine folder structure + public API:**
  `packages/engine/src/`: time.ts (A1 — RationalTime + convertRate),
  types.ts (A2 + B1.1 lineage + command union), invariants.ts (EK list —
  dono darwaze isi ko call karte hain, B2.3 DRY), verbs.ts (A3 — 8 verbs),
  diff.ts (C1 — 15 rules + catch-all), merge.ts (B2/B3/C2 — 3-way,
  refinement, conflicts, parchi-replay, buttons, nearest-slot), otio.ts
  (import/export + whitelist + skip-warnings), index.ts (public darwaza);
  + tests/ (unit + golden + 10k fuzz) + benchmarks/ (1k/10k report).
  PUBLIC API = sirf 7 functions [F13 fix 2026-08-03: pehle "6" likha tha
  par importOtio/exportOtio do alag functions hain — ginti sach ki]:
  applyCommand, computeDiff, startMerge,
  applyChoice, finalizeCheck, importOtio/exportOtio — apps/web sirf index
  se import karega (chhota darwaza = andar free refactoring). Pure-core
  rule intact (na DB/network/UI import — headless tests/benchmarks +
  integration-ready slice). Ek file = ek zimmedari; "max N lines" jaisa
  hard rule NAHI (heuristic hai, fact nahi — no-unproven-claims); merge.ts
  code-time par sach mein badi ho to merge/ folder mein todna = code-time
  call, LLD lock nahi. Quality/DRY/simplicity design mein baked (ek
  invariant list, 7-func API, catch-all) + standing principal-engineer
  standard code par lagega. [Aditya lock 2026-08-03.]
  [AMENDED 2026-08-04, M4 pre-implementation contract closure — C7 ke
  teen merge functions ka exact pure-core boundary ab locked hai. Yeh HTTP/
  DB merge-attempt contract nahi; M7 usse alag wrap karega.

  Public boundary types (ye `index.ts` se export honge):

  ```ts
  type ValueChoice = "ours" | "theirs" | "base";
  type DeleteChoice = "delete" | "clip" | "base";
  type OverlapChoice = "shift-a" | "shift-b" | "base";
  type MergeChoice = ValueChoice | DeleteChoice | OverlapChoice;
  type MergeChoices = Readonly<Record<string, MergeChoice>>;

  type MergeField =
    | "timeline-offset"
    | "coverage-start"
    | "coverage-end"
    | "source-offset"
    | "volume"
    | "opacity"
    | "scale"
    | "position"
    | "text-content"
    | "text-style"
    | "source-bounds"
    | "negative-start"
    | "nonpositive-duration";

  type ValueParticipants = {
    kind: "value";
    trackId: string;
    rootId: string;
    clipIds: readonly string[];
    field: MergeField;
  };
  type DeleteParticipants = {
    kind: "delete";
    trackId: string;
    rootId: string;
    clipIds: readonly string[];
  };
  type OverlapParticipants = {
    kind: "overlap";
    trackId: string;
    clipIds: readonly [string, string];
  };
  type MergeParticipants =
    | ValueParticipants
    | DeleteParticipants
    | OverlapParticipants;

  type MergeConflict = {
    conflictId: string;
    bucket: 1 | 2 | 3;
    participants: MergeParticipants;
    explanation: string;
    choices: readonly MergeChoice[];
  };
  type MergeCounts = {
    total: number;
    resolved: number;
    remaining: number;
  };
  type MergeSuccess = {
    ok: true;
    status: "ready" | "needs-resolution";
    timeline: Timeline;
    conflicts: readonly MergeConflict[];
    choices: MergeChoices;
    counts: MergeCounts;
  };
  type MergeFailure = {
    ok: false;
    error: { code: "E_MERGE_PRECONDITION"; message: string };
  };
  type MergeResult = MergeSuccess | MergeFailure;
  type FinalizeResult =
    | { ok: true; timeline: Timeline }
    | MergeFailure;
  ```

  Exact functions:

  ```ts
  startMerge(input: {
    base: Timeline;
    ours: Timeline;
    theirs: Timeline;
  }): MergeResult;

  applyChoice(input: {
    base: Timeline;
    ours: Timeline;
    theirs: Timeline;
    choices: MergeChoices;
    conflictId: string;
    choice: MergeChoice;
  }): MergeResult;

  finalizeCheck(input: {
    base: Timeline;
    ours: Timeline;
    theirs: Timeline;
    choices: MergeChoices;
  }): FinalizeResult;
  ```

  `startMerge` aur `applyChoice` SAME success packet dete hain. `timeline`
  current safe materialized draft hai; unanswered conflict ke participants
  usmein nahi. `conflicts` sirf current unanswered list; `choices` permanent
  saved answers. `resolved = choices` ki entry-count, `remaining = conflicts`
  ki count, `total = resolved + remaining`. `status:"ready"` sirf tab jab
  remaining zero aur invariant sweep clean; warna `needs-resolution`.

  Choice mapping fixed: B1 `ours/theirs/base`; B2 `delete/clip/base`; B3
  `shift-a/shift-b/base`, jahan B3 `base` = “Remove both — back to
  original”. `applyChoice` har call par base/ours/theirs se fresh recompute +
  saved-choice replay karega. Same conflict par same saved choice retry normal
  success/no-change hai; different replacement permanent-answer rule todta hai
  aur `E_MERGE_PRECONDITION` hai.

  `E_MERGE_PRECONDITION` sirf real boundary misuse par: conflictId current
  unanswered conflict nahi (same-choice retry exception); bucket ke liye choice
  invalid; permanent saved answer ko different choice se replace karna; ya
  `finalizeCheck` jab conflicts remain/invariant-clean final state available
  nahi. Koi throw/crash nahi. Pure M4 input valid committed timelines maana
  jayega; manually corrupted JSON, impossible/future IDs, ya unsupported future
  state ke extra checks M4 mein invent nahi honge. `finalizeCheck` fresh
  recompute karta hai aur sirf clean timeline deta hai; DB commit M7 ka kaam.

  Conflict participants full clip copies nahi, upar ke lightweight refs hain.
  `conflictId` hash payload = participant kind/class + trackId + stable involved
  clip/family IDs + B1 field; B3 pair ki deterministic A/B ordering fixed hogi.
  Whole timeline, explanation text, counts, ya resolution state hash mein nahi.
  Exact hash primitive private implementation detail hai. Coverage ke start aur
  end ALAG atoms hain: opposite-edge trims positive remainder par compose;
  combined duration <= 0 ho to B2.3 ke amended rule se B1.]
- **C8 (2026-08-03) LOCKED — Demo choreography (9-step exact + fixtures):**
  FIXTURES (Vercel static): demo.otio (24fps, 3 tracks video/audio/text,
  5 clips: A interview / B b-roll / C logo / music / caption "Welcome") +
  3 chhoti videos (10-20s) + 1 audio.
  [AMENDED 2026-08-05, M7a owner triage — **C = `logo.png`, ek IMAGE hai,
  video nahi.** Upar wali line "3 chhoti videos + 1 audio" kehti hai, par
  usi doc ka A2.1/O1 wala hissa isi cheez ke liye khud likhta hai "logo.png
  5s dikhao ya 5min — dono valid" — yani C8 ki fixture-line apne aap se
  ulti thi. Asli edit mein logo image hi hoti hai, aur image bana dene se
  demo un rules ko sach mein chalata hai jo humne mehnat se lock kiye:
  O1 (`durationInSource: null` — aseem, isliye fixture mein
  `available_range: null`) aur O3 (image par slip = `E_NOT_APPLICABLE`).
  Media ki ginti unchanged (2 video + 1 image + 1 audio); sirf is ek clip ka
  URL aur uska available_range badla. 9-step choreography, scripted edits,
  teeno conflict buckets — sab bilkul unchanged (C par sirf move hota hai,
  step 3c). Aditya lock 2026-08-05.] SCRIPTED EDITS (har bucket pakka
  bane — accident nahi, guarantee): user main par: A.volume=80, caption
  text edit, C→0:20 move; agent branch "tighten-intro" par: A.volume=40
  (→B1), caption DELETE (→B2), D add (→B3 overlap — POORI command neeche),
  B end-trim (→auto-merge, friction-free hissa bhi dikhe).
  [AMENDED 2026-08-03, Codex final review F12 — do fixes:
  (1) D ki POORI addClip command (pehle sirf "D add @0:20" tha — A3.1 ke
  4 khaane khaali, B3-guarantee coder-guess par tik jaati):
  `{ op:"addClip", trackId: <video track — WAHI jahan user ne C move ki>,
  mediaRefId: <b-roll media, fixture mein already>, sourceRange:
  { start: 0s, duration: 5s }, timelineRange: { start: 0:20, duration:
  5s } }` — user ki C 0:20 par, agent ki D usi track par 0:20 se → same
  start same track → overlap GUARANTEED → B3 pakka (BC.4: source 5s ==
  timeline 5s ✓).
  (2) Ginti sach: pehle wali line 10 actions ko "9 steps" bolti thi (PRD
  5.1 ka step-3 "dono taraf edits" do jagah toot gaya tha). Canonical
  EXACTLY-9 list ab ye (har step + expected result — #20 measurable lock):
  1. Import demo.otio → timeline 5 clips; koi skip-warning nahi (fixture
     clean).
  2. Branch "tighten-intro" create+switch → UI nayi branch par.
  3. DONO taraf edits (PRD grouping) [N3 fix 2026-08-03 — exact
     executable order]: (a) switch BACK to main (POST branch/switch —
     step-2 ke create+switch ne UI tighten-intro par chhoda tha);
     (b) user ki 3 edits main par (A.volume=80, caption text, C→0:20) →
     "3 changes" chip; (c) POST commit → user edits commit mein band
     (diff commits compare karta hai — pending diff mein nahi aata);
     (d) agent button → request explicit `branch:"tighten-intro"` (F5
     rule, switch zaroori nahi), script ke 4 edits + 1 auto-commit →
     history mein 🤖. Ab step-5 diff = main-head vs tighten-intro-head,
     dono committed, sab changes dikhte.
  4. Single-clip preview (Level A) → clip click → HTML5 playback chalta.
  5. Diff (main vs agent) → C1 sentences: volume/text/move/add/trim sab
     alag-alag dikhte.
  6. Merge start → EXACTLY 3 conflicts kitab-order mein: B1 (volume 80vs40),
     B2 (caption edit-vs-delete), B3 (C-vs-D overlap); B ka end-trim
     auto-compose ho chuka (friction-free proof).
  7. Teeno resolve (har bucket ke apne buttons live) → ginti sach bolti;
     aakhri resolve → merge commit ban gaya.
  8. History (👤/🤖 badges) + purane commit par restore → naya
     restore-commit.
  9. Export OTIO → otioJson milta hai; re-import → structural round-trip
     pass.] [Aditya lock 2026-08-03; F12 amendment lock 2026-08-03.]
  **🏁 PHASE C COMPLETE (C1-C8) — PART 7 LLD POORA COMPLETE! 🏁**

## M5 — OTIO import/export locks (O1-O10, 2026-08-04)

> Ye section M5 (`otio.ts`, public API 6-7/7) ka canonical spec hai. Saare
> locks Aditya ke saath ek-ek discuss karke tay hue (2026-08-04). Jo OTIO
> facts yahan likhe hain wo ANUMAAN nahi — AcademySoftwareFoundation ke
> `tests/sample_data/multitrack.otio` se seedhe verify kiye gaye hain
> (schema strings, `available_range: null`, `Gap.1`, `kind: "Video"`,
> `global_start_time` ka gair-maujood hona).

### Model ka farak (kyun M5 mein itne locks lage)

| Cheez | OTIO | Hamara model |
|---|---|---|
| clip ki jagah | IMPLICIT — pehle wali cheezon ki lambai ka jod | EXPLICIT `timelineRange` |
| khaali jagah | ek CHEEZ (`Gap.1`) | koi cheez nahi — bas khaali |
| rate | har time-value apni rate leke chalta hai | EK `projectRate` poori timeline ki |
| media ki lambai | `available_range` — OPTIONAL, `null` ho sakta hai | `durationInSource` |
| text clip | hota hi nahi (track kind sirf Video/Audio) | `TextClip` + `text` track |
| media type | koi field nahi | `MediaRef.kind` |

- **O1 LOCKED — image ka `durationInSource` = `null`.** Detail + rejected
  alternatives A2.1 ke 2026-08-04 amendment mein. Saar: `null` = "aseem",
  sirf `kind === "image"`; bounds-invariant us par skip.
- **O2 LOCKED — video/audio jiski lambai OTIO mein nahi hai → clip SKIP +
  warning.** "Lambai missing" ≠ "media missing" (media missing ka jawab
  alag aur pehle se locked hai: "Media unavailable" placeholder, kaam
  rukta nahi). Yahan file bilkul theek hai, bas exporting tool ne
  `available_range` likha hi nahi. Engine media kholta hi nahi (URL-only
  pointer model, HLD #12/#13), to lambai khud naap bhi nahi sakta.
  REJECTED (a): clip le lo par uspe trim-extend/slip block kar do — isse
  `null` ke DO matlab ban jaate (image=aseem vs video=anjaan) aur har
  call-site ko kind poochhna padta; ek value ke do matlab = bug-farm, aur
  naye preconditions = naya test-family. REJECTED (b): clip le lo bina
  kisi rok ke — tab us clip par "file ke andar raho" check chup-chaap
  hatta, yaani chhupi hui kamzori (philosophy lock: chhupao mat).
  Ab skip ka poora kharch = `otio.ts` mein 1 branch, aur warning-machinery
  (#17) pehle se maujood — engine mein ZERO naya code.
- **O3 LOCKED — image par `slip` = `E_NOT_APPLICABLE`.** Detail A3.5 ke
  2026-08-04 amendment mein.
- **O4 LOCKED — Gaps = naap, cheez nahi.**
  IMPORT: track ke children par chalo aur ek cursor rakho —
  `Clip` → hamari clip, `timelineRange.start` = cursor, phir cursor +=
  duration; `Gap` → KOI object mat banao, sirf cursor += duration;
  `Transition` → skip + warning aur **cursor mat badhao** (OTIO mein
  transition track ka time khaata nahi, wo padosi clips ke upar baithta
  hai — cursor badhaya to poori timeline khisak jayegi).
  [AMENDED 2026-08-05, M5 implementation review — cursor ka POORA niyam:
  **"skip ki hui cheez ka apna `source_range` ho to cursor utna aage
  badhao."** Transition ke paas `source_range` hota hi nahi, isliye wo
  pehle jaisa hi chhoot jaata hai (upar wala lock unchanged). Par nested
  `Stack` (compound clip) timeline par jagah GHERTA hai — purani wording
  sirf transition ki baat karti thi, jiske chalte implementation nested
  Stack par cursor nahi badhata tha aur uske baad ki saari clips utni hi
  jaldi baith jaati thi (asli data-corruption). Skip ki hui CLIP par cursor
  pehle se hi badhta tha (O2/O7b) — ab teeno case ek hi vaakya se cover.]
  EXPORT: clips ko `timelineRange.start` se sort karo aur har khaali jagah
  par `Gap.1` likho — `gap.duration = agli clip ka start − pichhli clip ka
  end`; agar pehli clip 0 se shuru nahi hoti to shuruaat mein bhi gap.
  Ye "content bharna" NAHI hai — OTIO mein clip ki jagah likhi hi nahi
  jaati, wo jod se nikalti hai; Gap na likhein to har baad wali clip
  chup-chaap aage khisak jayegi (asli data-corruption). Hisaab mein koi
  andaaza nahi, sirf ghatana — isliye hamesha exact.
  WARNING NAHI: gap "skip" nahi ho raha, wo poori tarah bacha hai (bas
  hamari bhasha mein). Uspe warning likhna jhoothi chinta hogi; warnings
  sirf un cheezon ke liye jo sach mein kho rahi hain.
- **O5 LOCKED — TextClip OTIO metadata mein.** OTIO mein text clip ka koi
  concept nahi (Track.kind sirf `"Video"`/`"Audio"`), aur `metadata: {}`
  hi unka official extension darwaza hai. EXPORT: text clip →
  `Clip.1` + `media_reference: MissingReference.1` +
  `metadata.framebranch = { kind: "text", textContent, textStyle }`;
  text track → OTIO Track `kind: "Video"` + `metadata.framebranch =
  { kind: "text" }`. IMPORT: `metadata.framebranch.kind === "text"` mila →
  TextClip/text-track banao; nahi mila aur media bhi nahi (koi aur tool ka
  `MissingReference`) → skip + warning.
  Kyun likhte hain jab dusre tools ise samjhenge hi nahi: kyunki ye unke
  liye nahi, HAMARE locked round-trip test ke liye hai — demo fixture mein
  3 tracks hain (video/audio/text, C8), aur bina metadata ke export→
  re-import se text track gayab ho jata = round-trip RED (PRD 5.5 A).
  Dusre tools ko isse nuksaan nahi (unknown metadata ignore hota hai), aur
  README mein khulke likha jayega ki wo khaali clip dekhenge.
  [AMENDED 2026-08-05, M5 implementation review — clip ki `properties`
  (volume/opacity/scale/position) BHI isi darwaze se jaati hain:
  `metadata.framebranch.properties = { ... }`, media clips par bhi aur text
  clips par bhi. Kyun: O10 "properties compare karo" bolta hai, par purani
  export-shape mein properties ka koi ghar hi nahi tha, jisse
  export→re-import har property ko default par le aata (volume 80 → 100).
  Ye asli data-loss thi aur demo mein hi dikhti (C8 step 3 "A.volume=80",
  step 9 "Export OTIO"). Wahi tark jo text clips ke liye tha: OTIO core
  mein in fields ka koi ghar hai hi nahi, to dusre tools ko waise bhi nahi
  milta — ye HAMARE round-trip ke liye hai. Values ke range-checks
  verbs.ts ke propertyChange jaise hi (volume/opacity int 0-100, scale
  0.1-10, position finite {x,y}); GALAT payload REPAIR nahi hoti — clip
  skip + `skipped-unknown-clip` (assumption 11 wali soch). Jis clip ki
  properties defaults par hain wo kuch likhta hi nahi — saaf files saaf
  rehti hain. H10 fixture mein ab non-default properties hain, warna test
  jhootha green de sakta tha (mutation-check se verify kiya gaya).
  [AMENDED 2026-08-05, M5 review F3 — "propertyChange jaise hi" mein
  APPLICABILITY bhi shaamil hai, sirf value-range nahi: allowed keys ab media
  ke kind se aate hain (N1 6x4 matrix, A3.6) — image par `volume` ❌ (photo ki
  awaaz nahi), audio par sirf `volume`, text par `opacity`/`position`.
  Warna import aisi clip bana deta jo koi verb bana hi nahi sakta
  (`applyCommand` wahi property `E_PROPERTY_NOT_APPLICABLE` se mana karta),
  aur wo jhoothi value diff/merge mein asli field ki tarah compare hoti
  rehti. Galat key mile → clip skip + `skipped-unknown-clip` (repair nahi).]
- **O6 LOCKED — projectRate 3 seedhi seedhi.** (1) `global_start_time`
  maujood → uski `rate` (uski VALUE use nahi hoti — hamari timeline hamesha
  0 se shuru hoti hai; broadcast ka 01:00:00:00 rivaj hamare model mein
  hai hi nahi); (2) warna → document order mein PEHLI clip ki rate;
  (3) baaki sab values A1.2 ke formula se convert (round-nearest-ties-floor,
  max error aadha frame). Deterministic — wahi file, wahi rate, hamesha.
  REJECTED "hamesha 24 par le aao": A1.2 mein 24 pehle se REJECTED hai
  ("24fps engine ka rule NAHI"), aur nuksaan asli hai — 30fps file ki HAR
  value convert hoti (7@30 = 0.2333s → 6@24 = 0.2500s, har cut 0.0167s
  khisak jaata) jabki uski apni rate rakhne par ZERO conversion hoti hai.
  Conversion sirf tab lagti hai jab EK file ke andar kai rates hon.
  [AMENDED 2026-08-05, M5 review F6 — rule (2) ki "pehli clip" sirf un clips
  mein se hai jo SACH MEIN import hongi: seedhe `Track` ke andar wali. Nested
  `Stack` ke andar ki clip (jo O7b se skip ho jaayegi) rate decide nahi
  karti — warna phenki hui clip ke hisaab se rate tay hoti aur rakhi hui har
  value bekaar mein convert hoti.]
  EDGE — khaali file (koi clip nahi + `global_start_time` bhi nahi):
  rate 24 + warning (`rate-fallback-empty-timeline`), import FAIL NAHI
  (khaali timeline PRD mein valid hai, aur jab koi clip hi nahi to rate se
  kisi ka kuch bigadta nahi).
- **O7 LOCKED — version whitelist ka bartav.** Har OTIO object apne upar
  `"OTIO_SCHEMA": "<naam>.<version>"` label lagata hai. Whitelist = wahi
  labels jo humne khud fixture se test kiye:
  `Timeline.1, Stack.1, Track.1, Clip.1, Gap.1, TimeRange.1,
  RationalTime.1, ExternalReference.1, MissingReference.1`.
  (a) BUNIYADI cheez ka anjaan version (`Clip.2`, `Track.5`) → POORA import
  ruke, `E_UNSUPPORTED_OTIO_VERSION`, message mein wo label naam se ho.
  Kyun: ye timeline ki reedh hai; naye version mein fields khisak sakte
  hain, andaaza lagakar padha to CHUP-CHAAP galat timeline banegi.
  (b) Jo cheez hum support karte hi nahi (`Transition.1`, effects, kisi
  track ke andar nested `Stack`, `ImageSequenceReference`) → skip +
  warning, import chalta rahe (#17 lock).
  Ek line: reedh samajh na aaye to ruk jao; extra saaman samajh na aaye to
  chhod ke bata do.
- **O8 LOCKED — warnings structured, plain angrezi jumle NAHI.**
  `ImportWarning = { code, detail, count }`; `code` chhota union:
  `"skipped-unsupported" | "skipped-media-length-missing" |
  "skipped-unknown-clip" | "rate-fallback-empty-timeline"`.
  Kyun structured: (1) tests `code` par assert karenge, angrezi shabdon par
  nahi — warna "Skipped"→"Dropped" likhne se test bina kisi asli bug ke red
  ho jaata (bhurbhure tests); (2) ginti/grouping ("2 transitions") UI ka
  kaam hai, engine ka nahi. F7 ka `commits.import_warnings` bhi yahi
  structured shape store karega.
- **O9 LOCKED — image ki pehchan = file extension.** OTIO mein media-type
  ka koi field hai hi nahi, sirf `target_url`. Rule: `.png .jpg .jpeg
  .webp` (case-insensitive) → `kind: "image"`; warna track ke hisaab se
  `"video"`/`"audio"`. Jo pehchan mein na aaye (extension-less URL) → VIDEO
  maano — safe taraf, kyunki tab bounds-check LAGTA hai (hatta nahi), aur
  lambai na hone par O2 ka skip+warning saaf dikh jayega.
  REJECTED "lambai nahi hai to image hogi": video ki lambai bhi missing ho
  sakti hai (O2 ka poora case), to wo video ko chup-chaap image maan leta.
  Ye ek documented ASSUMPTION hai (README/limitations mein jayegi).
  [AMENDED 2026-08-05, M5 review F4 — kind tay hone ke BAAD track-mapping
  check bhi lagta hai (N1, A3.6): image sirf VIDEO lane par; audio ya text
  lane par mile to clip skip + `skipped-unknown-clip`, coerce kabhi nahi.
  `addClip` ye placement `E_TRACK_KIND_MISMATCH` se mana karta hai aur
  invariant sweep track-kind cover nahi karti, isliye bina is check ke import
  aisi timeline bana sakta tha jo verbs se banti hi nahi (aur `.png` maan
  lene ki wajah se O2 ka lambai-check bhi bypass ho jaata). Saaf rakhne ke
  liye: ye "image aur music ek saath nahi" NAHI kehta — image video lane par
  aur music audio lane par ek hi waqt bilkul chalte hain; ye sirf lane tay
  karta hai.]
- **O10 LOCKED — round-trip ka exact matlab.** Test =
  `hamari timeline → exportOtio → importOtio → wahi timeline`
  (docs/09 #10/#11: structural equality, IDs ignore, sirf CI test — koi
  runtime check nahi).
  IGNORE: clip ids, mediaRef ids, naam/metadata jaisi cosmetic cheezein.
  COMPARE: track kram + har track ki kind; har clip ka `timelineRange` aur
  `sourceRange`; clip kis media par baithi hai — **ID se nahi, URL se**
  (import hamesha naye IDs banata hai, to ID dono taraf alag hoga hi);
  properties defaults-materialize karke (B3.1); text clips ka content +
  style; `projectRate`.
  FIXTURE SHART: round-trip golden ka fixture mein **gap + text clip +
  image teeno** honi chahiye — warna O4/O5/O1 mein se koi bhi test hi nahi
  hoga aur test jhootha green dega.

### Public API shapes (C7 ka pure-core boundary — DB/HTTP se alag)

```ts
type OtioJson = Record<string, unknown>;
type ImportWarning = { code: ImportWarningCode; detail: string; count: number };
type ImportResult =
  | { ok: true; timeline: Timeline; warnings: ImportWarning[] }
  | { ok: false; error: EngineError };       // E_INVALID_OTIO / E_UNSUPPORTED_OTIO_VERSION

function importOtio(otioJson: unknown): ImportResult;   // unknown = kachra bhi aa sakta hai
function exportOtio(timeline: Timeline): OtioJson;
```

NOTE — error codes: `E_INVALID_OTIO` aur `E_UNSUPPORTED_OTIO_VERSION` C4 ki
official list mein PEHLE SE hain (docs/11 C4 point 5); M2 ka `ErrorCode`
union sirf "engine subset" tha, isliye inhe us union mein add karna NAYA
error code banana NAHI hai — locked list ka hi hissa engine tak lana hai.

Import HAMESHA fresh start deta hai — IDs samet sab naya (docs/09 #10).
Export V1 internal IDs likhta hi nahi (docs/09 #11) — sirf O5 wala
`metadata.framebranch` likha jaata hai. `exportOtio` kabhi fail nahi karta
(OTIO = pointers; bytes kabhi nahi jaate — HLD #12/#13).
