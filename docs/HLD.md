# FrameBranch — High-Level Design

## System Overview

FrameBranch has seven pieces:

- **Interface** — what a person sees and uses in the browser.
- **Agent** — produces the simulated edits (see PRD Scope).
- **API layer** — receives and validates every request, from either source.
- **Domain engine** — the rules of a video timeline: clips, the eight operations, what states are valid.
- **Version-control engine** — compares, finds conflicts, and combines two versions.
- **OTIO adapter** — reads and writes the OTIO file format for import/export.
- **Storage** — commits, branches, and history.

```mermaid
flowchart LR
    UI["Interface (browser UI)"] --> API[API layer]
    Agent[Agent] --> API
    API -->|edit operations| DE[Domain engine]
    API -->|diff / merge| VC[Version-control engine]
    API -->|import / export| OTIO[OTIO adapter]
    DE --> Storage[(Storage)]
    VC --> Storage
    OTIO --> Storage
    Storage -.pointer + fingerprint.-> Media[(Media files, external)]
```

The domain engine, version-control engine, and OTIO adapter don't touch the interface, database, or network — they're plain functions, timeline in, timeline out. This keeps them independently testable and reusable.

FrameBranch doesn't store video or audio files itself — a media reference is just a URL pointing to wherever the file already lives, plus a fingerprint used to detect if that file changes. There's no upload or file-storage system in this version; the database only holds the URL and fingerprint, never the file.

## Data Flow

Most edits (7 of 8 operations) work like this:

1. You make an edit — it shows up on screen immediately (checked locally first).
2. At the same time, the edit is sent to the server.
3. The server checks it and saves it.
4. If the server says OK — nothing changes, what you already saw was correct.
5. If the server rejects it — the screen undoes that edit and reloads the real, correct timeline.

The agent's edits go through the same steps, tagged as coming from the agent.

```mermaid
sequenceDiagram
    participant UI as Interface
    participant API as API layer
    participant Storage
    UI->>UI: Local validation + optimistic paint
    UI->>API: Edit request
    API->>Storage: Validate + persist
    Storage-->>API: Result
    alt Success
        API-->>UI: Confirmed
    else Rejected
        API-->>UI: Error
        UI->>UI: Rollback preview + refetch
    end
```

## Storage & Data Model

**When does an edit become a real, saved version?**

Not right away. While a person is editing, their changes are held as a draft — saved automatically in the background, but not yet a permanent entry in the project's history.

That draft becomes a real, permanent version (a "commit") at one of three moments:

1. The person clicks save.
2. The agent finishes running — its whole set of edits becomes one version.
3. A few specific actions need a clean starting point, so they save the draft automatically before running: switching branches, merging, restoring an old version, exporting, or importing.

```mermaid
flowchart TD
    A[Edits happen] --> B[Saved as a draft]
    B -->|person clicks save| C[Real version]
    B -->|agent finishes running| C
    B -->|branch-switch / merge / restore / export / import| C
```

**What happens to old versions?**

Nothing is ever deleted or rewritten. Restoring an old version doesn't erase what came after it — it creates a brand-new version with the old content, so even a restore can be undone.

**How much does storing all this history cost?**

Each version remembers only what changed since the version before it. If the system only ever stored changes, going back to an old version could mean replaying hundreds of small changes one by one. To avoid that, a full copy of the whole timeline is also saved periodically, so going back to any version never takes many replays (exact interval and table layout: LLD's Database Schema).

**One more rule:** every save (a version, a merge, a restore) either fully succeeds or doesn't happen at all — there's no in-between broken state.

## API & Concurrency

**One endpoint for every edit.** Every edit — move, trim, delete, and so on — goes through one endpoint, described as data rather than a separate URL per operation. A new kind of edit later just needs a new description, not a new endpoint.

Other actions have their own endpoints: reading a timeline, history, or diff; branching; running the agent; merging; resolving conflicts; restoring; import/export.

**Handling collisions.** Nothing is locked while editing. Each save checks: is the branch still where I started? If yes, it saves normally. If not, the save is rejected — nothing is lost or silently overwritten. The interface rolls back its preview, refetches the latest timeline, and shows "Timeline updated." The edit has to be redone on the fresh state.

```mermaid
flowchart TD
    A[Person saves an edit] --> B{Branch unchanged since I started?}
    B -->|Yes| C[Saved normally]
    B -->|No| D[Rejected → rollback + refetch latest timeline]
```

**Safe retries.** Every mutating request carries a unique ticket, so retrying it never applies the edit twice (exact mechanism and per-endpoint behavior: LLD's API Reference).

## OTIO Interoperability

FrameBranch reads and writes projects using OTIO (OpenTimelineIO), a file format other video tools also support — so a project can move in and out of FrameBranch without a custom converter for each tool.

Only OTIO versions that have actually been tested against real files are accepted on import. An unrecognized version is never guessed at or silently misread — it shows a clear error naming which version is supported instead.

```mermaid
flowchart LR
    F[OTIO file] --> V{Known, tested version?}
    V -->|Yes| I[Imported]
    V -->|No| E[Clear error — version not supported]
```

## Reliability

- **Request failures are not all handled the same way:**

  | Failure type | What happens |
  |---|---|
  | Server rejects the edit (e.g. invalid, stale branch/head) | Shown as an error immediately. Not retried — the edit itself was invalid or out of date. |
  | Network/transport failure (connection drops, bad response) | Retried automatically, twice, silently. |
  | Retries exhausted | Banner shows: "Connection lost — your saved work is safe. Reconnecting…" Editing pauses; a manual Retry is offered. No offline mode. |
  | Unexpected server failure | Surfaced as an error with context, not silently retried. |
- **Agent runs are all-or-nothing** — a failed run saves nothing; the timeline stays untouched, with a retry option.
- **Security** — every request is schema-validated before reaching the engine; each public demo visitor gets an isolated copy with a reset button; no login system; secrets live only in environment variables.
- **Observability** — every request logs a structured line (actor, operation, branch, time, result) with a shared ID for tracing; errors include context, not just a code. No dashboards or alerts in this version.

## Scale & Deployment

**Benchmarks.** The core engine — diff, merge, the eight operations — is pure computation with no database or network involved, so it's been tested directly at scale: a 10,000-clip timeline computes a diff in **5.23 ms** and a full three-way merge in **550.01 ms** (median), measured and reproducible, not estimated. `packages/engine/benchmarks/REPORT.md` is the single source for these numbers — refer to it directly rather than copying figures, since they change whenever the benchmark is re-run.

**What would need to be added for a real product.** This version runs for one person and one agent on one project — there's no rate limiting and no user accounts, and the interface itself is only built and polished for a small, demo-sized timeline (10-30 clips), even though the engine underneath is proven at 10,000. Turning this into a multi-user product would mean adding: a way to limit how fast requests can come in, login and permissions, and an interface that stays fast with far more clips on screen. The underlying architecture doesn't need to change for any of this — the API and engine are already stateless, so they scale by running more copies, not by being rewritten.

**Where it runs.** The interface and API run on Vercel; the database is Postgres, hosted on Neon. The code is organized as two main pieces: the engine (which never imports anything related to the interface, database, or network) and the web app (interface + API). Automated tests, including 10,000 randomized test cases, run on every change before it ships.
