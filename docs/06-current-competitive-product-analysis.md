# AI Video Editing Landscape: Palmier Pro, Mosaic Canvas, Motion, and Cardboard

> ⚠️ **Superseded where conflicting:** `docs/07-session-progress.md` is the canonical record of locked decisions. Competitive facts here are a 2026-07-27 snapshot; Cardboard changelog was re-verified 2026-08-01 (see docs/07).

## Purpose

Yeh document purane `palmier_pro_analysis.md` ka corrected aur expanded canonical replacement hai.

Iska goal chaar related products ko clearly separate karna hai:

1. Palmier Pro
2. Mosaic Canvas
3. Motion by Mosaic
4. Cardboard

Purani report mainly Fusion launch-video workflow ke liye likhi gayi thi. FrameBranch project ke context mein humein ek zyada precise reference chahiye: kaunsa product kis problem ko solve karta hai, overlap kahan hai, public evidence kya confirm karta hai, aur kaunsi baat inference hai.

Research audit date: **2026-07-27**

Pricing, credits, promotions, feature availability, and licensing time-sensitive hain. Purchase ya implementation se pehle linked official page dobara verify karna chahiye.

---

## Executive answer

Yeh products same broad AI-video market mein hain, lekin same product nahi hain.

| Product | Simplest mental model | Primary job |
|---|---|---|
| Palmier Pro | Local-first macOS NLE with AI and MCP | Existing footage ko manually aur agent ke through edit karna; generated media bhi add karna |
| Mosaic Canvas | Browser-based visual workflow canvas | Repeatable video pipelines, automation, variants, and mixed editing/generation |
| Motion | Prompt-to-motion-design specialist | Brand-aware launch videos, product demos, explainers, and social motion assets generate karna |
| Cardboard | Browser-based agentic NLE | Raw footage ko understand karke AI first cut banana, phir real timeline mein refine karna |

Short conclusion:

- Palmier Pro aur Cardboard sabse directly comparable hain because dono real editing timeline plus agentic operations dete hain.
- Mosaic Canvas editor se zyada workflow/orchestration system hai, although uske paas inline editing aur generation dono hain.
- Motion Mosaic ka focused child product hai; woh traditional raw-footage NLE ke badle polished motion-design output ko optimize karta hai.
- Motion aur Mosaic Canvas competitors bhi hain aur complementary products bhi: Motion final experience ko simple banata hai, Canvas reusable pipeline control ko expose karta hai.

---

## Important corrections to the previous report

### 1. “Palmier agents cannot see video” was too categorical

Old statement:

> Palmier agents are text/code only and cannot see frames.

Correct current position:

- Palmier publicly advertises local transcription, smart footage search, AI chat that can reference visual assets, and an MCP agent with full project context.
- Public documentation confirms that external agents can inspect project context and perform timeline operations.
- Public documentation does **not** clearly specify that an external MCP client receives rendered-frame pixels after every edit or has a Cardboard-style visual self-verification loop.

Therefore the defensible statement is:

> Palmier has footage-understanding and structured project context. Whether every external MCP agent receives rendered-frame visual feedback is not publicly confirmed.

This distinction matters. “Not publicly confirmed” is different from “technically impossible” or “product definitely does not do it.”

### 2. “Mosaic cannot generate video from text” was incorrect

Mosaic’s official AI content-generation documentation says a workflow can generate a complete video from prompts without requiring camera footage. Canvas also combines generated assets with editing and workflow tiles.

Updated classification: **text/prompt-to-video supported**.

### 3. “Mosaic has no agent integration” was outdated/incomplete

Mosaic currently presents public APIs and agent skills. That does not automatically prove a remote MCP surface equivalent to Motion’s documented MCP endpoint.

Updated classification:

- Public API: confirmed.
- Agent skills: confirmed in current product positioning.
- Canvas-specific remote MCP: not confirmed by the public sources reviewed.

### 4. “Motion cannot use raw footage” was too absolute

Motion accepts reference material and public attachments, including video, audio, and images. Its product examples include adding motion graphics around interview footage.

The accurate boundary is:

> Motion can use uploaded media, but it is not positioned as a general-purpose multi-track raw-footage NLE.

### 5. “A polished launch video costs $5” was not a safe promise

Motion’s $5 Flex top-up is a real entry option. Official error/credit guidance describes 200 credits as roughly one to two videos, but actual consumption varies by model and operations. Iteration, regeneration, premium models, voice, and asset generation can increase cost.

Updated conclusion: **$5 is a reasonable experiment budget, not a guaranteed polished-production budget.**

### 6. Mosaic’s company name changed in current public branding

The old report used `Artificial Intelligence Labs, Inc.` Current Mosaic and Motion public footers use **Mosaic AI Labs, Inc.** Historical legal records may retain older names, so legal paperwork should always be checked at the source.

### 7. Exact source-tree and MCP-tool details were a point-in-time snapshot

The previous Palmier report documented individual files, classes, and tool names from a specific repository checkout. That is useful historical evidence, but it should not be treated as a stable public API contract.

This updated report keeps product-level architecture that is supported by current official sources. The untouched original report is archived separately for code-history investigation.

### 8. Third-party free-tier numbers were too volatile

Old credit figures for ElevenLabs, Kling, Pika, Suno, and similar services have not been carried forward as current facts. Free tiers and region/model limits change frequently.

Rule for future planning: verify the official pricing page on the day we choose a provider.

---

# Part I: Palmier Pro

## What it is

Palmier Pro is an open-source, native video editor for Apple Silicon Macs. It combines:

- A professional non-linear editing timeline
- Local-first media/project handling
- Local transcription and smart footage search
- Inline image, video, and audio generation
- Built-in AI chat
- An MCP server for external agents such as Codex, Claude Desktop, and Cursor
- Standard video export plus XML handoff to established editors

It is not merely an AI generator. The base product remains an editable NLE.

## Platform and architecture boundary

Current public requirements:

- macOS 26 Tahoe or later
- Apple Silicon
- Palmier Pro desktop app
- Local MCP endpoint at `http://127.0.0.1:19789/mcp`

The repository is GPLv3. Palmier states that the editor and MCP integration are open source, while generative-AI processing is closed source and tied to its subscription/login layer.

Palmier’s terms describe a local-first model: projects and media stay on the user’s device unless the user invokes optional AI processing that requires external services.

## Editing capabilities

Current official material supports:

- Timeline editing and rearrangement
- Trim, split, reorder, and adjustment operations
- Multiple tracks and clip-level control
- Transcription and footage search
- Generated images, video, and audio
- First-frame and last-frame controls for generation
- Reference images
- AI chat that can reference assets and place results in the project
- MP4 export using H.264, H.265, or ProRes
- NLE XML export for Premiere Pro and DaVinci Resolve workflows

## Agent and MCP model

Palmier’s agent surface is important because it allows an external coding agent to operate a video timeline rather than only write a render script.

Confirmed:

- The editor exposes MCP locally.
- Codex, Claude Desktop, and Cursor are documented clients.
- Agents can work with full project context and perform editing operations.
- Generated clips can be rerun or tweaked.

Not publicly confirmed:

- Exact stability/versioning guarantees for every MCP tool name.
- Whether external MCP clients receive decoded or rendered frame pixels automatically.
- Whether the agent runs a post-edit visual QA loop comparable to Cardboard Agent Eyes.

This makes Palmier highly relevant to agentic editing, but we should not claim parity with Cardboard’s visual verification without a live test.

## Current pricing snapshot

| Tier | Current listed price | Included |
|---|---:|---|
| Editor + MCP | Free | Editor, MCP, local transcription model, smart footage search; no account required |
| Pro | $29/month promotional price, shown against $49 | 5,000 credits, image/video/audio generation, improved cloud transcription |
| Max | $69/month promotional price, shown against $99 | 12,000 credits, priority support |

Palmier’s own rough guide says 5,000 credits can represent approximately 333 images or around 3–7 minutes of generated video. This is a guide, not a fixed conversion.

The key economic boundary:

- Editing and MCP usage: free.
- Palmier-managed generative AI: paid credits/subscription.

## Best fit

Palmier is strongest when someone wants:

- Native macOS editing
- Media that stays local by default
- A normal timeline plus AI assistance
- Codex/Claude/Cursor controlling real editor state
- Optional AI generation without making generation the whole product

## Limitations relevant to us

- macOS 26 plus Apple Silicon is a hard platform constraint.
- Generated-media backend is not fully open source.
- Public docs do not establish a robust semantic branch/diff/merge system.
- External-agent visual verification needs an actual product test before making strong claims.

Official sources:

- [Palmier Pro product](https://www.palmier.io/)
- [Palmier Pro pricing](https://www.palmier.io/pricing)
- [Palmier Pro documentation](https://www.palmier.io/docs)
- [Palmier Pro GitHub repository](https://github.com/palmier-io/palmier-pro)
- [Palmier terms](https://www.palmier.io/terms)

---

# Part II: Mosaic Canvas

## What Mosaic actually is

Mosaic is the umbrella AI-video company/platform. Canvas is its visual workflow product. Motion is a separate focused product made by Mosaic.

This naming matters:

```text
Mosaic AI Labs, Inc.
├── Mosaic Canvas: reusable visual video workflows
├── API and agent skills: programmatic/agent access
└── Motion: prompt-to-motion-design product
```

## What Canvas is

Canvas is a browser-based node or “Tile” workspace. Instead of thinking only in tracks and clips, the user builds a graph:

```text
Input footage or prompt
        ↓
Transcribe / understand / generate
        ↓
Edit / transform / add assets
        ↓
Create parallel variants
        ↓
Review in inline timeline
        ↓
Export or trigger downstream work
```

The graph can be saved and reused, which makes Canvas closer to a programmable video-production workflow than a traditional editor alone.

## Current capabilities

Official materials support:

- Node/Tile-based visual workflow construction
- Reusable workflows
- Automated triggers
- Parallel branches and A/B outputs
- Inline timeline refinement
- Existing-footage editing
- AI generation of images, audio, and video
- Complete prompt-driven video generation without required camera footage
- Media understanding across visual and audio content
- NLE export/handoff
- Public API access
- Agent-oriented skills in current positioning

This corrects the earlier report: Mosaic is not limited to editing uploaded footage.

## Where Canvas differs from a conventional NLE

A conventional NLE prioritizes direct manipulation of one timeline. Canvas prioritizes repeatability and composition of steps.

Example:

- Traditional editor: create one 30-second cut manually.
- Canvas: define a reusable graph that creates 16:9, 1:1, and 9:16 variants, swaps hooks, applies captions, and exports every version.

Canvas still exposes an inline timeline, but workflow orchestration is the differentiator.

## Current pricing snapshot

| Plan | Monthly | Annual total/effective | Credits | Public upload limits |
|---|---:|---:|---:|---|
| Creator | $50/month | $480/year, effectively $40/month | 2,500 | Up to 120 min / 10 GB per upload |
| Pro | $150/month | $1,500/year, effectively $125/month | 10,000 | Up to 300 min / 20 GB per upload |

Official pages also listed:

- Unlimited storage on these plans
- Creator top-ups around $2 per 100 credits
- Pro top-ups around $1.60 per 100 credits

These are audit-date snapshots, not permanent guarantees.

## API and agent boundary

Confirmed:

- Mosaic has public API documentation.
- Current positioning includes API and agent skills.

Not confirmed by the reviewed public sources:

- A Canvas MCP endpoint with the same explicit protocol documentation as Motion.

Therefore “MCP: No” and “MCP: Yes” are both too confident without a direct current Canvas MCP source. The correct status is **API/agent access confirmed; Canvas MCP unconfirmed**.

## Best fit

Mosaic Canvas is strongest for:

- Repeatable content operations
- High-volume variants
- Marketing pipelines
- Triggered automation
- Combining editing and generation in a reusable graph
- Teams that want a visual system rather than only a timeline

## Company snapshot

- Y Combinator batch: W25
- Seed funding announcement: $3.8 million on 2026-04-07
- Current public branding/footer: Mosaic AI Labs, Inc.

Official sources:

- [Mosaic Canvas](https://mosaic.so/product/canvas)
- [Mosaic pricing](https://mosaic.so/pricing)
- [Canvas quickstart](https://docs.mosaic.so/quickstart/video-canvas)
- [AI content generation](https://docs.mosaic.so/tiles/ai-content-generation)
- [Mosaic API plan documentation](https://docs.mosaic.so/api/plan/get-plan-list)
- [Mosaic features](https://mosaic.so/features)
- [Mosaic seed announcement](https://mosaic.so/blog/mosaic-seed-round-announcement)
- [Mosaic on Y Combinator](https://www.ycombinator.com/companies/mosaic-2)

---

# Part III: Motion by Mosaic

## What it is

Motion is Mosaic’s focused prompt-to-motion-design product. A user describes an output such as:

- Product launch video
- Animated product demo
- Logo animation
- Explainer
- Social media creative
- Brand story

Motion then performs a more opinionated production process than a blank editor.

## Beginner-friendly workflow

```text
Prompt + website/brand + optional references
        ↓
Research and brand understanding
        ↓
Storyboard / scene plan
        ↓
Visuals + motion graphics + copy
        ↓
Voiceover + music + captions
        ↓
Chat edits or element-level manual adjustments
        ↓
Export
```

## Current capabilities

Official materials support:

- Brand/website research
- Storyboard generation
- Visual and motion design
- Voiceover, music, captions, and generated assets
- Element-level resize, drag, and reposition controls
- Chat-based iteration
- Style references, including YouTube references and `DESIGN.md`
- Public API
- Remote MCP endpoint with OAuth 2.1
- Session creation, status polling, and source/audit information
- Up to ten public attachments including images, audio, and video

Documented MCP endpoint: `https://mcp.motion.so/mcp`

Documented API base path: `https://api.motion.so/api/motion`

## What it is not

Motion should not be described as incapable of ingesting footage. It can accept video references/attachments and its examples can combine footage with motion graphics.

But it is also not marketed as a full traditional NLE for hours of raw footage, detailed dialogue editing, multi-camera sync, and arbitrary multi-track finishing.

Accurate positioning:

> Motion is a generated motion-design studio with editable elements, not a general-purpose raw-footage editor.

## Current pricing snapshot

| Tier | Price | Credits |
|---|---:|---:|
| Flex top-up | $5 one-time | 200 |
| Pro | $29/month | 1,250/month |
| Max | $99/month | 5,000/month |

Annual pricing observed at the audit date showed effective values around $23/month for Pro and $80/month for Max. A first-purchase bonus was also visible, but promotions should not be treated as permanent.

Motion documentation describes $5/200 credits as roughly one to two videos. Real usage varies by model, generation choice, failed/repeated iterations, and asset complexity.

Planning rule:

- $5: useful experiment budget.
- Production budget: unknown until storyboard complexity and iteration count are tested.

## Best fit

Motion is strongest when:

- The desired result is a short, polished, brand-aware piece.
- The user has a website, design system, screenshots, or reference videos.
- Motion graphics and storytelling matter more than deep raw-footage editing.
- A coding agent should create/monitor a video session through MCP or API.

Official sources:

- [Motion](https://motion.so/)
- [Motion documentation](https://docs.motion.so/)
- [Motion MCP guide](https://docs.motion.so/)
- [Motion errors and credits guide](https://docs.motion.so/guides/errors)

---

# Part IV: Cardboard

## Why Cardboard belongs in this comparison

Cardboard is the company connected to the Fullstack Engineer application and to FrameBranch. It is the reference product whose public hard-problem document led us to choose semantic video version control.

## What it is

Cardboard is a browser-based agentic NLE. The user uploads raw media and describes the intended result. Cardboard understands the footage, produces a first cut, and keeps the result editable in a real multi-track browser timeline.

Its center of gravity is:

```text
Raw footage understanding
        +
AI-directed timeline edits
        +
Manual browser NLE control
```

## Current public capabilities

- Semantic footage search
- Speech, object, scene, and context understanding
- AI-generated first cuts, montages, and social variants
- Multi-track video/audio/text timeline
- Trimming, splitting, snapping, ripple delete, reordering, and reframing
- Captions, transcription, silence/filler cleanup, translation, and dubbing
- Voiceover, voice cloning, music, cleanup, ducking, and audio leveling
- Keyframes, transitions, text motion, filters, blur, and color controls
- Cloud projects and background media processing
- Premiere/DaVinci XML handoff
- Share links and timecode comments

## Important current product signals

### Agent Eyes

Cardboard’s changelog says the agent can inspect actual frames after an edit and correct visible mistakes. This is stronger evidence of a rendered-output feedback loop than we currently have for Palmier’s external MCP agent.

### Chat checkpoints

AI chat messages can act as save points and restore earlier timeline state. This is an early history mechanism.

### Share versions

A published cut can remain available while newer edits continue. This supports review/version workflow, but it is not full semantic branch/diff/merge.

## Current pricing snapshot

| Plan | Annual effective | Regular monthly | Public limits shown |
|---|---:|---:|---|
| Creator | $32/month, billed $384/year | $40/month | Base usage, 2 GB/file, 50 GB cloud storage |
| Pro | $120/month, billed $1,440/year | $150/month | 6x usage, 10 GB/file, 250 GB cloud storage |
| Teams | Custom | Custom | Shared workspace, centralized billing, collaboration |

Additional credits publicly started at $10 during the audit. The pricing page contained inconsistent promotional/trial copy, so checkout is the purchase authority.

## Best fit

Cardboard is strongest for users who:

- Already have significant raw footage.
- Want AI to understand and edit that footage.
- Still need a real editable timeline.
- Want browser/cloud collaboration rather than macOS-only local operation.

Official sources:

- [Cardboard](https://www.usecardboard.com/)
- [Cardboard pricing](https://www.usecardboard.com/pricing)
- [Cardboard changelog](https://www.usecardboard.com/changelog)
- [Cardboard learning center](https://learn.usecardboard.com/)
- [Cardboard Fullstack Engineer role](https://www.usecardboard.com/careers/fullstack-engineer)
- [Cardboard on Y Combinator](https://www.ycombinator.com/companies/cardboard)

---

# Part V: Direct comparison

## Capability matrix

Legend:

- Yes: supported by reviewed official public material.
- Partial: capability exists, but product is not centered on it or important scope is unclear.
- Unconfirmed: reviewed public sources do not establish it.

| Capability | Palmier Pro | Mosaic Canvas | Motion | Cardboard |
|---|---|---|---|---|
| Main interface | Native macOS timeline | Browser node/Tile canvas + inline timeline | Prompt-led generated scenes + element editing | Browser multi-track timeline + chat |
| Existing-footage editing | Yes | Yes | Partial | Yes |
| Prompt-to-complete-video | Yes, through generation/editing tools | Yes | Yes, core workflow | Partial; core focus is editing supplied footage |
| Manual NLE depth | Yes | Partial | Limited/partial | Yes |
| Reusable workflow graphs | No public equivalent | Yes, core workflow | No public equivalent | No public equivalent |
| Parallel variants | Manual/agent-driven | Yes, core workflow | Generate/iterate | AI variants and repeated edits |
| Local-first media | Yes | No, cloud/browser service | No, cloud service | No, cloud/browser service |
| Open-source editor | Yes | No | No | No |
| Public API | MCP/local app surface; broader cloud API not the main pitch | Yes | Yes | No general public API confirmed |
| MCP | Yes, local | Unconfirmed for Canvas | Yes, remote OAuth | No public MCP confirmed |
| External coding-agent integration | Yes | API/agent skills | Yes | No public external-agent endpoint confirmed |
| Rendered-frame agent QA | Unconfirmed for external MCP | Unconfirmed | Source/audit support, rendered QA loop unconfirmed | Yes, Agent Eyes public claim |
| Semantic branch/diff/merge | No public full system | Workflow branches are not timeline VCS | No public full system | Identified hard problem; checkpoints are partial foundation |

## Product-axis comparison

| Axis | Palmier Pro | Mosaic Canvas | Motion | Cardboard |
|---|---|---|---|---|
| Primary environment | Local desktop | Cloud browser | Cloud browser/API/MCP | Cloud browser |
| User starts with | Footage/project, optionally generated media | Footage, prompts, or workflow | Prompt, brand, references, optional assets | Raw footage plus editing goal |
| Product optimizes for | Direct editing plus agent control | Repeatability and automation | Fast polished motion design | AI-directed raw-footage editing |
| User control model | Timeline + chat/MCP | Workflow graph + timeline | Chat + scene/element adjustments | Timeline + chat |
| Strongest differentiator | Open-source local agentic NLE | Reusable video workflow graph | Brand-aware motion-design generation | Multimodal AI first cut inside browser NLE |

## Are Palmier, Mosaic, and Motion “on the same page”?

At category level: **yes**. All reduce the effort needed to create and edit video with AI.

At product/job level: **no**.

- Palmier answers: “How can an editor and an external agent control a native local timeline?”
- Mosaic Canvas answers: “How can a team encode a repeatable video-production process?”
- Motion answers: “How can a prompt and brand context become a polished motion-design video?”
- Cardboard answers: “How can AI understand a pile of raw footage and turn it into an editable first cut in the browser?”

The overlap is real, but the primary workflows are different enough that calling them identical would create bad product decisions.

---

# Part VI: Revised recommendations

## If the goal is a Fusion launch video

The right route depends on input material, desired style, and budget.

### Route A: Motion-first

Use when:

- We want a short cinematic/product launch piece.
- Brand page, UI screenshots, product copy, and style references are ready.
- We want AI to propose the storyboard and motion language.

Risk:

- Credit cost is variable.
- Generated product details may need careful verification.
- A $5 top-up is a test, not a guaranteed final-production budget.

### Route B: Palmier/Remotion deterministic build

Use when:

- We want maximum control and reproducibility.
- We can create UI recordings/screenshots ourselves.
- We do not want generation credits to control the whole workflow.

Palmier is useful for timeline editing and agent control. Remotion is useful when the video should be represented as versioned React/code and rendered deterministically.

### Route C: Mosaic Canvas pipeline

Use when:

- We expect many versions, formats, hooks, or recurring videos.
- The reusable pipeline itself has future value.
- We can justify the higher subscription cost.

### Practical recommendation

For a single portfolio launch video with little or no AI-credit budget:

1. Build the narrative and storyboard without paid generation.
2. Capture authentic UI footage and screenshots.
3. Use Remotion or a free editor for deterministic assembly.
4. Treat Motion’s $5 tier as an optional creative experiment, not a dependency.
5. Use Palmier only if the macOS 26 requirement is satisfied and its local editing/MCP workflow adds real value.

## Remotion licensing correction

Remotion is not simply “free for every small project.” Current official licensing distinguishes usage type.

- Individuals and companies with up to three people can use the Free License, including commercial work.
- For organizations with four or more people, current options distinguish video creators from automated rendering use cases.
- Creator licensing is listed per seat.
- Automator licensing uses render-based pricing with a monthly minimum.

Before production, verify the current official license against team size and whether video rendering is an internal creative workflow or a product feature offered to users.

Official source: [Remotion licensing](https://www.remotion.dev/)

## Volatile provider credits

No current recommendation in this report depends on remembered free tiers from:

- ElevenLabs
- Kling
- Pika
- Suno
- Other generative providers

If one becomes necessary, we will record:

- Official pricing URL
- Date checked
- Region availability
- Model used
- Credit conversion
- Commercial-use terms
- Estimated retry/iteration budget

---

# Part VII: Implication for FrameBranch

## Why this market review reinforces Version Control

All four product directions increase the number of edits and variants:

- An agent makes multiple timeline changes.
- A workflow produces parallel formats.
- A generator creates several candidate scenes.
- A human refines the result manually.

But existing public product surfaces mostly emphasize:

- Undo/restore
- Chat checkpoints
- Workflow branches
- Duplicate variants
- Published versus unpublished cuts

Those are useful, but they are not the same as semantic video version control.

FrameBranch focuses on the missing layer:

- Branch an edit direction without duplicating media.
- Describe differences using video-editing concepts.
- Merge non-conflicting changes automatically.
- Surface true conflicts, such as incompatible trims or overlapping clip moves.
- Preserve whether an edit came from a human, agent, automation, or imported timeline.
- Restore history with deterministic, testable behavior.

## Competitive honesty boundary

FrameBranch should not claim to replace Palmier, Mosaic, Motion, or Cardboard. It is a focused infrastructure/interaction prototype for a capability that could sit beneath or beside an NLE.

It also must not claim integration with any product until a supported public interchange/API exists. Initial compatibility should be demonstrated through our own normalized model and an industry interchange boundary such as OpenTimelineIO.

## Useful integration hypotheses for later, not V1 promises

- Palmier: export/import adapter if current XML or another supported project boundary is sufficient.
- Mosaic: version workflow outputs or imported timelines, subject to public API capabilities.
- Motion: store generation session/source provenance alongside an imported output timeline.
- Cardboard: conceptual fit only unless Cardboard exposes a supported integration surface.

---

# Final conclusions

1. Palmier Pro is a local, open-source, agent-controllable NLE; calling its AI completely blind is unsupported.
2. Mosaic Canvas is a reusable workflow canvas that supports both editing and AI generation; it is not merely an editor for existing footage.
3. Motion is a focused Mosaic product for prompt-driven motion design; it can use uploaded assets but is not a full raw-footage NLE.
4. Cardboard is the closest browser-based agentic-NLE comparison to Palmier, with stronger public evidence for rendered-frame self-verification.
5. The products overlap at the AI-video layer but optimize different primary jobs.
6. Pricing and credit figures are snapshots, and no polished-output guarantee should be inferred from the cheapest tier.
7. The comparison strengthens the FrameBranch choice because none of the reviewed public products establishes a complete semantic branch/diff/merge model for video timelines.

---

## Source and confidence policy

This report prioritizes first-party product pages, documentation, official repositories, company posts, and Y Combinator profiles.

Interpretation labels used implicitly throughout:

- **Confirmed:** directly supported by reviewed official material.
- **Not publicly confirmed:** absence of sufficient public evidence; not proof that an internal capability does not exist.
- **Inference:** a reasoned product interpretation, not a vendor promise.

The archived original report remains useful for historical source-code observations. This file is the canonical product-level reference for future FrameBranch discussion.
