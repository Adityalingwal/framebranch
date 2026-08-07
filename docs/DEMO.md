# FrameBranch — Demo Script

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
