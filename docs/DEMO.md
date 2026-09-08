# FrameBranch — Demo Script

The exact edits behind the walkthrough in the PRD's Demo Story — precise enough to reproduce, not just describe.

**The fixture.** A 5-clip project: an interview clip, a b-roll clip, a logo image, a music track, and a caption reading "Welcome."

**The edits, scripted so every conflict type is guaranteed to appear:**

| Who | Edits |
|---|---|
| Person, on the main branch | Clip A's volume → 80; the caption's text is edited; the logo clip is moved to 0:20 |
| Agent, on its own cut `agent-tighten-intro` | Clip A's volume → 40; the caption is deleted; a new clip is added at 0:20 on the same track as the logo (guaranteeing an overlap); clip B is trimmed shorter at the end |

**The 9 steps:**

| Step | Action | Expected result |
|---|---|---|
| 1 | Open the app (or pick a starting point from New project) | 5 clips, no warnings |
| 2 | Make the person's edits on main and mark a version | Main has its own version |
| 3 | In the Agent panel, click Run on `Tighten intro` | One click: the agent makes the cut `agent-tighten-intro` off main, runs there, and leaves one 🤖 card. Nothing is created by hand |
| 4 | Preview a single clip | Plays back |
| 5 | Compare the two versions | Two lanes, before above and after below, with one row per change beside them |
| 6 | Open the bring-in preview | Exactly 3 conflict cards appear — a value conflict (volume), a delete conflict (caption), and an overlap conflict (logo vs. the new clip); clip B's trim merges automatically, no conflict |
| 7 | Decide all 3, then land it | One merge commit, with both branches as parents |
| 8 | View history, restore an older version | Every entry marked person or agent; restoring creates a new version |
| 9 | Export, then re-import the result | Comes back identical — nothing lost |

**The two-tab beat.** Open the app in a second tab and give it a different name at the gate — same project, two people. Priya, on her own cut, opens the Cut menu, picks `Ready for main…` and types one line about what is in it. Within about three seconds, and with no reload, Aditya's `Bring in ▾` on main grows a count badge and her cut jumps to the top of the list with a green dot, `Ready`, her name and the time, and her note underneath. Nothing on main has changed — the mark is an invitation, not a lock, and it clears itself the moment he brings the cut in. While that happens each tab shows where the other is: a chip `● Priya is on priya-music` when they are on different cuts, and a coloured playhead with her name when they are on the same one.
