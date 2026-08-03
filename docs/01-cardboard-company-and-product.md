# Cardboard: Company and Product Reference

## Purpose

Yeh document Cardboard ko FrameBranch project ke context mein explain karta hai. Iska aim company ko broadly summarize karna nahi, balki yeh preserve karna hai ki Cardboard kya build kar raha hai, Fullstack Engineer role kis capability ko value karta hai, aur Video Version Control unke product ke saath kaise align hota hai.

Research snapshot: **2026-07-27**

## Company snapshot

- Company: Cardboard Inc.
- Product: browser-based agentic video editor
- YC batch: Winter 2026
- Founded: 2025
- YC-listed team size at research time: 4
- YC-listed company location: San Francisco
- Fullstack role location: Bengaluru, India
- Founders: Saksham Aggarwal and Ishan Sharma

Official reference: [Cardboard on Y Combinator](https://www.ycombinator.com/companies/cardboard)

## Product in one sentence

Cardboard lets a user upload raw footage, describe the desired outcome in plain English, receive an AI-created first cut, and continue refining it in a real browser-based multi-track video editor.

## Beginner-friendly mental model

```text
Raw footage + editing goal
        ↓
Cardboard analyzes what is said and shown
        ↓
AI director creates a first cut
        ↓
User refines through prompts or the timeline
        ↓
Export, share, collect feedback, and iterate
```

It is not only a text-to-video generator and not only a chat wrapper. Its core product surface is an editable non-linear editor (NLE) running in the browser.

## Target users and use cases

Primary public positioning:

- Growth and marketing teams
- Founders and startup teams
- Serious creators
- Podcast/interview editors
- Teams producing launch videos, ads, recaps, testimonials, and repeated social content

Typical input assets:

- Talking-head recordings
- Screen recordings
- Product demos
- Customer footage
- B-roll
- Images and screenshots
- Voiceovers, music, and other audio

## Product capabilities observed publicly

### Footage understanding

- Detect scenes, objects, speech, and on-screen context
- Search footage using meaning rather than filenames
- Find quotes, reactions, people, emotions, and scenes
- Produce media insights and highlight candidates

### Agentic editing

- Create a first cut from a natural-language goal
- Build montages and social cutdowns
- Trim, split, rearrange, and reframe clips
- Add captions, music, voiceovers, and effects
- Use current timeline state before applying edits
- Inspect actual frames after edits and correct some visible mistakes

### Manual NLE capabilities

- Multi-track video/audio/text timeline
- Scrubbing, snapping, splitting, trimming, and ripple delete
- Position, scale, rotation, opacity, blend mode, and audio controls
- Keyframes and text-motion presets
- Transitions, blur, backgrounds, filters, and color controls
- Multiple aspect ratios

### Audio and language

- Automatic transcription and animated captions
- Silence/filler cleanup
- Voiceovers and voice cloning
- Caption translation and dubbing
- Audio sync, cleanup, ducking, and volume leveling
- Beat-aware editing

### Cloud, export, and feedback

- Background media preparation and cloud processing
- Cloud-backed projects
- Premiere/DaVinci XML handoff
- Share links and timecode-specific comments
- Team/shared-workspace positioning

Official references:

- [Cardboard product page](https://www.usecardboard.com/)
- [Cardboard changelog](https://www.usecardboard.com/changelog)
- [Cardboard learning center](https://learn.usecardboard.com/)

## Current pricing snapshot

The live website showed annual effective prices and separate regular monthly prices:

| Plan | Annual effective price | Regular monthly price | Public limits shown |
|---|---:|---:|---|
| Creator | $32/month, billed $384/year | $40/month | Base usage, 2GB/file, 50GB cloud storage |
| Pro | $120/month, billed $1,440/year | $150/month | 6x usage, 10GB/file, 250GB cloud storage |
| Teams | Custom | Custom | Shared workspace, centralized billing, collaboration |

Additional credits publicly start at $10.

The pricing UI contained inconsistent promotional/trial copy during research: a monthly toggle displayed promotional values and five-day messaging while another part of the page said three days. Checkout should therefore be treated as the final pricing authority.

Official reference: [Cardboard pricing](https://www.usecardboard.com/pricing)

## Latest product signals relevant to FrameBranch

### Chat checkpoints

Every AI chat message can act as a save point, and the timeline can be restored to an earlier state. This is an early history/restore primitive, not full branch/diff/merge.

### Synced chat history

AI conversations follow the user across refreshes and devices. This is relevant to provenance and future memory but does not by itself create semantic video history.

### Share versions and comments

Published share links distinguish between a published cut and newer unpublished edits. Viewers can leave timecode-specific comments. This is a review workflow, not full collaborative version control.

### Agent Eyes / verification

The agent can inspect actual frames after editing and correct some visible problems. This shows Cardboard is building feedback loops between agent actions and rendered output.

## Fullstack Engineer role

The public role asks for an engineer who can:

- Own a feature from the UI pixel through the backend/render service
- Work on real-time browser editing and smooth playback
- Handle large media on the client
- Shape an AI editing experience that makes real timeline edits
- Keep large projects fast and reliable
- Move across frontend, backend, and infrastructure
- Demonstrate strong fundamentals, product taste, and end-to-end ownership

Official role: [Fullstack Engineer at Cardboard](https://www.usecardboard.com/careers/fullstack-engineer)

Public application/contact surfaces observed:

- [Official Ashby application](https://jobs.ashbyhq.com/cardboard/744b9881-cf83-4b20-b6dd-5ef8e8082e62)
- `hiring@usecardboard.com`
- `founders@usecardboard.com`

No application or email has been sent as part of this project.

## Competitive context

### Palmier Pro

- Native macOS 26 Apple Silicon editor
- Local-first editing
- Inline AI media generation
- MCP lets Claude, Codex, or Cursor work with the timeline
- Editor and MCP are free; paid credits cover AI generation

References:

- [Palmier Pro](https://www.palmier.io/)
- [Palmier Pro open-source repository](https://github.com/palmier-io/palmier-pro)

### Mosaic Canvas

- Browser-based node/Tile workflow system
- Reusable editing pipelines and automation
- Parallel variants and triggers
- Inline timeline refinement
- Can edit existing footage and generate new media through creation tiles

References:

- [Mosaic Canvas](https://mosaic.so/product/canvas)
- [Mosaic documentation](https://docs.mosaic.so/)

### Motion by Mosaic

- Prompt-to-motion-design product
- Researches a brand, plans scenes, and creates launch videos/demos/animations
- Adjacent to Cardboard but not the selected project direction

Reference: [Motion](https://motion.so/)

## Why FrameBranch fits Cardboard

Cardboard already has a timeline, agent edits, checkpoints, cloud projects, and review links. The missing hard layer described in its own document is semantic version control:

- Branching alternative edits
- Understanding what changed in editor language
- Merging independent changes
- Surfacing genuine timeline conflicts
- Keeping human and agent provenance
- Restoring history without duplicating media

FrameBranch is designed to explore this exact layer without claiming access to Cardboard's private schema or codebase.

