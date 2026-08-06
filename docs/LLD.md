# FrameBranch — Low-Level Design

## Data Model

**Time.** Every point in time is two whole numbers — a count and a rate (frames per second) — never a decimal, because decimals accumulate rounding errors that break the exact equality diff/merge depend on. A project has one rate for its whole timeline; files at a different rate are converted once, at import, rounding to the nearest frame (an exact tie rounds down).

**Core types.**

| Type | Fields | What it is |
|---|---|---|
| `RationalTime` | `value` (int), `rate` (int) | A single point in time. |
| `TimeRange` | `start`, `duration` (both `RationalTime`) | A span of time. |
| `MediaRef` | `id`, `kind` (video / audio / image), `url`, `hash`, `durationInSource` | A pointer to a media file — not the file itself. |
| `Clip` | `id`, `mediaRefId`, `sourceRange`, `timelineRange`, `properties` | A piece of media placed on the timeline. `sourceRange` is which part of the file to use; `timelineRange` is where it sits on the timeline. |
| `TextClip` | `id`, `timelineRange`, `textContent`, `textStyle` | A caption or text element — a clip without a media file. |
| `Track` | `id`, `kind`, `clips` | A lane holding a sequence of clips. |
| `Timeline` | `projectRate`, `tracks`, `mediaRefs` | The whole project. |

A clip's `id` never changes for as long as that clip exists — it's how diff and merge recognize "this is the same clip" across two versions.

**Images have no natural length** — unlike video or audio, an image could be shown for 2 seconds or 2 minutes, both valid. So `durationInSource` is empty ("unlimited") only for images; it's always a real number for video and audio.

**Rules that always hold, for every timeline:**

- No two clips on the same track overlap.
- A clip's source range never points outside the length of its source file (skipped for images, which have no fixed length).
- Every span of time has a duration greater than zero — nothing is zero-length or backwards.

## Operations

Every operation is checked before it runs — if a check fails, nothing changes and a specific error comes back. (Split has its own entry in Algorithms — its identity rules are covered there, not repeated here.)

| Operation | You send | Checked first | What happens | Undo |
|---|---|---|---|---|
| Add clip | track, media, which part of the file, where on the timeline | Track and media exist; the piece fits inside the file; no overlap; times are valid; media type matches the track; rate matches the project | A new clip appears on the track | Delete it |
| Delete clip | clip ID | Clip exists | Clip disappears; the gap stays — neighbors don't shift | Add it back exactly as it was |
| Move | clip ID, new start time | Clip exists; new position doesn't overlap another clip; rate matches | Only the clip's position changes | Move it back |
| Trim | clip ID, which edge, how much | Resulting length stays positive; extending has enough source material and doesn't overlap a neighbor | Both the source window and the timeline position shift together at that edge | Trim the same edge back |
| Slip | clip ID, how much | The new source window stays fully inside the file | Only which part of the file is shown changes — timeline position is untouched | Slip back the same amount |
| Change a property | clip ID, property, value | The property applies to this kind of clip; the value is in range | Only that one property changes | Set it back to the old value |
| Ripple delete | clip ID | Clip exists | Clip disappears, and everything after it on the same track shifts left to close the gap | Shift everything back right, then add the clip back |

**Move is same-track only.** Moving a clip to a different track isn't supported in this version — it isn't needed for the demo, and it would open up a new family of diff and merge cases that don't otherwise exist.

**Text clips use the same operations**, minus anything about a source file — there's no `sourceRange` to trim or slip, since a text clip has no underlying media. Slip doesn't apply to images either, for the same reason: there's no file window to shift.

**A no-op is still a success, not an error.** Trimming by zero, or setting a property to the value it already has, succeeds and changes nothing — it isn't recorded as an edit, so history stays free of noise from actions that didn't actually change anything.

## Database Schema

Eight tables, each with one clear job.

| Table | Stores | Key columns |
|---|---|---|
| `projects` | One row per project | project rate, owner token (keeps each demo visitor's copy separate) |
| `branches` | Each branch's name and current position | name, head commit |
| `commits` | Every saved version | parent commit (two, only for a merge), who made it, name, import warnings if it came from an import |
| `ops` | The individual edits inside a commit, in order | the edit itself, who made it |
| `snapshots` | A full copy of the timeline — saved every 10th commit, and always for import, restore, and merge commits | the whole timeline, as JSON |
| `working_state` | One row per branch — edits made but not yet committed | pending edits, a counter that increases with every edit |
| `merge_attempts` | An in-progress merge — deleted once it's finished or cancelled | the draft result, the conflict list, saved resolution choices |
| `tickets` | One row per request, so a retried request is never applied twice | which action it was, the stored result |

```mermaid
flowchart TD
    P[projects] --> B[branches]
    B --> C[commits]
    C --> O[ops]
    C --> S[snapshots]
    B --> W[working_state]
    P --> M[merge_attempts]
    P --> T[tickets]
```

## API Reference

**Every response has the same shape.** Success: `{ ok: true, data: {...} }`. Failure: `{ ok: false, error: { code, message } }` — `code` is for the interface to act on, `message` is for a person to read. Every endpoint uses this same envelope.

**Reading data** doesn't need a ticket, since nothing changes: getting the current timeline, the history, or a diff between two versions.

**Every edit goes through one endpoint** (`POST ops`, described in Operations). Every other action — save a version, create a branch, switch branches, merge, resolve a conflict, cancel a merge, restore a version, run the agent, import, export, reset the demo — has its own endpoint, but all follow the same pattern: state which branch, include a ticket, get back the same envelope shape.

**Which branch, every time.** Every request scoped to a branch says which one explicitly — the server never remembers "the branch you were just on." This keeps two browser tabs on different branches from interfering with each other.

**Retries are safe.** Every request that changes something carries a ticket — a unique ID generated by the interface. If the same ticket is sent twice (a retry after a dropped connection, or a double-click), the server returns the exact same result it returned the first time, instead of applying the change again.

**Errors fall into three groups.**

| Group | Meaning | Examples |
|---|---|---|
| Operation errors | This specific edit isn't allowed right now | clip not found, would overlap another clip, value out of range |
| System errors | Something about the request's context is stale or missing | branch not found, someone else already changed this branch |
| Request errors | The request itself couldn't be understood, or something unexpected happened on the server | malformed request, branch name already taken, unexpected failure |

Each error's `code` is one specific, fixed string (like `E_OVERLAP` or `E_STALE_REV`) — the interface reacts to the code, not the message.

## OTIO Adapter Details

OTIO's model differs from FrameBranch's in a few ways the import/export code has to bridge.

| | OTIO | FrameBranch |
|---|---|---|
| A clip's position | Worked out from what comes before it | Stored directly |
| Empty space | A real object (a "Gap") | Not stored — just an absence |
| Time rate | Each value can carry its own rate | One rate for the whole project |
| Media length | Optional — can be missing | Required, except for images |
| Text / captions | No native concept | A real clip type |

**How gaps are handled.** On import, empty space between clips isn't turned into anything — it's just skipped over while placing each clip at the right position. On export, gaps are reconstructed exactly, calculated from the space between where one clip ends and the next begins, since OTIO needs that empty space written out explicitly, or every following clip would silently shift.

**Missing media length.** A video or audio file with no length information in the OTIO file is skipped on import, with a warning — the media itself isn't missing, just that one piece of information, and the engine has no way to independently discover a file's length (it never opens media files, only references them). Images don't have this problem, since they have no natural length to begin with.

**Text clips.** OTIO has no concept of a caption or text clip. To keep FrameBranch's own export-then-import round trip lossless, a text clip is written into OTIO's generic metadata field on export, and read back from there on import. Other tools opening the same file won't understand this — it exists purely so FrameBranch doesn't lose information when it exports and re-imports its own projects.

## Code Organization

```
packages/engine/src/
  time.ts        — time representation and rate conversion
  types.ts        — the data model (Data Model section)
  invariants.ts   — the one shared list of rules every command must satisfy
  verbs/          — the 8 operations
  diff/           — the diff algorithm
  merge.ts        — the merge algorithm (kept as one file — its logic is
                     too interconnected to split cleanly)
  otio/           — import/export
  index.ts        — the only entry point other code is allowed to use
```

**One narrow door in.** Everything outside the engine — the interface, the API layer — only ever imports from `index.ts`, never reaches into the internal files directly. `index.ts` exposes exactly seven functions: apply a command, compute a diff, start a merge, apply a conflict choice, check if a merge can finalize, import OTIO, export OTIO. As long as those seven keep working the same way, anything inside the engine can be reorganized freely without breaking anything outside it.

**No database, no network, no interface code anywhere in the engine.** Every function here takes a timeline in and returns a timeline (or a diff, or a merge result) out — which is what makes it possible to test and benchmark the engine directly, without running a server or a browser.

## Demo Script

The exact edits behind the walkthrough in the PRD's Demo Story — precise enough to reproduce, not just describe.

**The fixture.** A 5-clip project: an interview clip, a b-roll clip, a logo image, a music track, and a caption reading "Welcome."

**The edits, scripted so every conflict type is guaranteed to appear:**

| Who | Edits |
|---|---|
| Person, on the main branch | Clip A's volume → 80; the caption's text is edited; the logo clip is moved to 0:20 |
| Agent, on a new branch | Clip A's volume → 40; the caption is deleted; a new clip is added at 0:20 on the same track as the logo (guaranteeing an overlap); clip B is trimmed shorter at the end |

**The 9 steps:**

| Step | Action | Expected result |
|---|---|---|
| 1 | Import the project | 5 clips, no warnings |
| 2 | Create a branch and switch to it | Now on the new branch |
| 3 | Make the person's edits on main, commit; make the agent's edits on the new branch | Both branches have their own committed changes |
| 4 | Preview a single clip | Plays back |
| 5 | View the diff between the two branches | One sentence per change, all of them |
| 6 | Start a merge | Exactly 3 conflicts appear — a value conflict (volume), a delete conflict (caption), and an overlap conflict (logo vs. the new clip); clip B's trim merges automatically, no conflict |
| 7 | Resolve all 3 conflicts | Merge commit is created automatically after the last one |
| 8 | View history, restore an older version | Every entry marked person or agent; restoring creates a new version |
| 9 | Export, then re-import the result | Comes back identical — nothing lost |
