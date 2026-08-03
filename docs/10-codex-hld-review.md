# Codex HLD Review — FrameBranch

- Review date: 2026-08-01
- Reviewer: Codex CLI (codex exec, non-interactive, --sandbox read-only)
- Scope: HLD review (docs/09-hld-checklist.md + docs/07 Part 6) before LLD begins. No code exists; no code was written.
- Status: Pending Aditya's triage. Findings are NOT auto-accepted — each will be individually judged (same process as docs/08).

---

# HLD Review Findings

## 1. Merge conflict drafts cannot be memory-only

Severity: Critical

HLD section/item: Item 3 API; Item 6d merge lifecycle; Item 16 Vercel/serverless deployment

Failure scenario: "If the user resolves the first conflict and the next `merge-resolve` request lands on another serverless instance, then the remaining merge draft disappears, because the HLD says the draft is memory-only while the API is stateless."

Question for plan owner: Where does a merge attempt live across requests, refreshes, retries, and serverless instances? Will it be persisted in Postgres or carried explicitly in every request?

## 2. Auto-saved working state has no storage model

Severity: Critical

HLD section/item: Item 6a working-state auto-save; Item 4 storage; Item 1 storage blocks

Failure scenario: "If the browser closes after an edit reports success but before the user creates a version, then the edit may disappear on reload, because commits, snapshots, and committed operation logs are defined but no working-tree record or revision is defined."

Question for plan owner: What exact database record is authoritative for dirty working state, and how is it reconstructed after browser failure?

## 3. All-or-nothing agent runs contradict per-edit auto-save

Severity: Critical

HLD section/item: Item 2 data flow; Item 6a auto-save; Item 10 agent failure

Failure scenario: "If a simulated agent applies five operations and operation four fails, then the first three may already be persisted as working-state changes, even though the UI promises that the timeline is untouched, because the HLD routes agent edits through the normal per-operation path."

Question for plan owner: Does an agent run execute inside one engine transaction/sandbox and persist only once, or does the HLD need to weaken the all-or-nothing guarantee?

## 4. Export has contradictory read-only and auto-seal semantics

Severity: Critical

HLD section/item: Item 3 `GET /export`; Item 6a boundary auto-seals

Failure scenario: "If the user exports while dirty, then either `GET /export` changes history by auto-sealing or it remains read-only and exports unversioned state, because the HLD simultaneously says export is a dirty-state boundary and that GETs never seal."

Question for plan owner: Which rule wins? If export seals, should it be a mutation endpoint or should export explicitly snapshot the working state without creating a version?

## 5. Boundary auto-seal coverage is incomplete

Severity: Important

HLD section/item: Item 6a six boundary endpoints; Item 3 endpoint list

Failure scenario: "If a dirty branch is duplicated, the demo is reset, or a merge-resolution request is retried, then the system has no declared dirty-state policy, because those mutating workflows are not included in the six boundary categories."

Question for plan owner: Can every mutating endpoint be classified explicitly as edit, commit, boundary, discard, or read-only, including branch creation, reset, merge resolution, and retry paths?

## 6. Optimistic concurrency protects commits but not working edits

Severity: Critical

HLD section/item: Item 7a CAS on branch head; Item 6a working-state auto-save

Failure scenario: "If two tabs edit the same branch before either creates a commit, then the second auto-save can overwrite the first tab's working state, because the branch head has not changed and the only CAS check happens during commit."

Question for plan owner: What revision or compare-and-swap protects the dirty working tree itself?

## 7. Stale-head side-branch behavior is not transactionally defined

Severity: Important

HLD section/item: Item 7b stale-head side branch

Failure scenario: "If a stale agent commit is moved to a side branch, then the system may leave the user viewing the wrong branch or attach the dirty working state to the wrong branch, because the HLD does not define which branch pointer moves, how the side branch is named, or what HEAD becomes."

Question for plan owner: What is the atomic result of stale-head handling: new branch, commit, session HEAD, working-state reassignment, and user notification?

## 8. Merge finalization can commit stale branch heads

Severity: Critical

HLD section/item: Item 6d automatic merge commit; Item 7 concurrency

Failure scenario: "If a merge starts from two heads, another edit lands on either source branch while conflicts are being resolved, then the final automatic merge can commit an obsolete result, because the HLD does not require a final CAS against both merge parents."

Question for plan owner: At final merge commit, are both source heads revalidated? If either changed, is the merge draft discarded, rebased, or moved to a side branch?

## 9. The N=10 replay guarantee does not hold for a commit DAG as specified

Severity: Critical

HLD section/item: Item 4a hybrid snapshots

Failure scenario: "If a merge commit is reached after independent branches each advance nine commits, then restoring it may require reconstructing two histories and applying a merge result, potentially exceeding ten replays, because 'every Nth commit' is undefined for multiple parents."

Question for plan owner: Is snapshot cadence counted per branch, globally, or by graph distance? Does every merge commit force a full snapshot, and what exact algorithm proves the ≤N replay guarantee?

## 10. OTIO identity loss can invalidate semantic history

Severity: Important

HLD section/item: Item 8 OTIO boundary; Item 5 stable-ID diff authority

Failure scenario: "If an external editor strips FrameBranch metadata and the timeline is re-imported, then unchanged clips may appear as delete-plus-add operations, because the HLD locks schema-version whitelisting but does not define identity recovery or loss behavior."

Question for plan owner: Is stable identity guaranteed only for FrameBranch-generated round trips, or also for externally edited OTIO? What is the explicit behavior when IDs are missing, duplicated, or altered?

## 11. Warning-and-skip imports undermine round-trip claims

Severity: Important

HLD section/item: Item 8 OTIO policy; PRD import/export success criterion

Failure scenario: "If an imported OTIO contains a transition or nested composition, then export followed by re-import can produce an internally identical but semantically incomplete timeline, because unsupported content is skipped and only a warning record remains."

Question for plan owner: Is "round-trip equality" defined over normalized supported timeline state only, or must skipped-content records also survive export and re-import?

## 12. Tiered asset validation can accept changed media

Severity: Important

HLD section/item: Item 9 tiered hash validation

Failure scenario: "If a media file changes while preserving both size and modification time, then re-attach reports it as unchanged without recomputing the hash, because the fast path treats size-plus-mtime as sufficient identity evidence."

Question for plan owner: Is size-plus-mtime an explicitly non-authoritative optimization, and when is a full hash mandatory before preview or export?

## 13. Asset mismatch does not define preview/export correctness

Severity: Important

HLD section/item: Item 9 asset mismatch behavior; Item 10 failure modes

Failure scenario: "If a referenced file is missing or hash-mismatched, then the user can still preview or export a timeline containing an unusable media reference, because the HLD says work never stops but does not define whether preview shows a placeholder, export succeeds with a warning, or export fails."

Question for plan owner: What are the exact outcomes for missing, stale, and unavailable assets at import, preview, restore, and OTIO export?

## 14. Public demo isolation lacks an enforceable authorization boundary

Severity: Critical

HLD section/item: Item 12 public demo isolation

Failure scenario: "If a visitor changes a project ID, session cookie, or request payload, then they may read or mutate another visitor's demo project, because authentication is out and the HLD does not define server-side ownership checks for every project-scoped query and mutation."

Question for plan owner: What server-side capability binds a visitor to exactly one demo project, and how are project IDs, reset operations, and branch IDs protected from cross-session access?

## 15. Shared Postgres has no abuse or quota boundary

Severity: Important

HLD section/item: Item 12 security; Item 14 rate limiting OUT; Item 16 Neon deployment

Failure scenario: "If a public visitor repeatedly creates projects or submits huge timelines, then the shared Neon database can be exhausted and the demo can fail for everyone, because rate limiting is explicitly out and no per-session quota, request-size ceiling, operation-count ceiling, or cleanup policy is defined."

Question for plan owner: Which bounded resource limits protect the shared demo while keeping formal rate limiting out of V1?

## 16. Idempotency scope is too weak for composite boundary operations

Severity: Important

HLD section/item: Item 4b atomicity; Item 6a auto-seal; Item 14 idempotency

Failure scenario: "If a network timeout occurs after an auto-seal succeeds but before export or merge responds, then retrying can create a second seal or replay the boundary action, because the HLD defines a request ticket but not whether the ticket covers the entire composite operation."

Question for plan owner: Is the idempotency ticket bound to the complete boundary transaction, session/project, endpoint, and request payload? What happens when the same ticket is reused with different input?

## 17. Agent and merge workflows lack cross-request correlation

Severity: Important

HLD section/item: Item 15 observability

Failure scenario: "If a multi-step merge or agent run fails after several requests, then logs cannot reconstruct the whole workflow, because the proposed fields include `requestId` but omit a stable merge-attempt or agent-run identifier."

Question for plan owner: Which correlation ID links all requests, retries, commits, conflicts, and final outcomes belonging to one agent run or merge attempt?

## 18. The stated scalability path is stronger than the HLD evidence

Severity: Important

HLD section/item: Item 11 scalability; Item 16 deployment

Failure scenario: "If the project is described as scale-ready because the engine is pure and the API is stateless, then a real multi-visitor workload still fails under large JSON timelines or concurrent Neon transactions, because UI virtualization, quotas, pagination, connection behavior, and query plans are not designed in V1."

Question for plan owner: Which scalability claims are actually proven by the HLD, and which should be explicitly reframed as future architecture rather than current readiness?

# Decisions needed from Aditya

1. Define persistent merge-attempt storage and lifecycle across requests, retries, refreshes, and serverless instances.
2. Define the working-tree schema, revision model, and crash-recovery behavior.
3. Choose the transaction boundary for all-or-nothing agent runs.
4. Resolve export's GET/read-only versus boundary-auto-seal contradiction.
5. Enumerate every mutating endpoint and assign its dirty-state policy.
6. Add CAS/versioning for dirty working-state writes, not only committed branch heads.
7. Define stale-head side-branch naming, pointer movement, session HEAD, and working-state reassignment.
8. Define final merge CAS behavior when either source branch changes during conflict resolution.
9. Formalize snapshot cadence and replay proof for merge commits and restore paths.
10. Lock OTIO identity preservation, metadata loss, and external-tool round-trip guarantees.
11. Define whether skipped OTIO constructs survive as durable exportable records.
12. Define authoritative asset validation and exact stale/missing-media outcomes.
13. Specify server-side per-session project authorization and reset isolation.
14. Add bounded quotas for public demo resources despite rate limiting remaining out.
15. Bind idempotency tickets to the complete composite operation and request payload.
16. Add workflow-level correlation IDs for agent runs and merge attempts.
17. Narrow or qualify the "scale-ready" claim until database, payload, and concurrency limits are measured.
