# COLABERRY LIVE — BASECAMP PROJECT BOOTSTRAP + CURRENT-TAB MIGRATION PROMPT

> **Run this prompt inside the CURRENT Claude Code session that is already building the Colaberry Live / live-broadcast / studio work in**  
> `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
>
> **Do not start a fresh planning session. Do not throw away the work already done in this tab.**  
> This prompt's first responsibility is to absorb the current tab's work, the current working tree, the active plan, the session logs, and the already-built broadcast system into a new Basecamp project named **Colaberry Live**, then continue execution from the next highest-priority unfinished item.
>
> **Hard launch target: production live by October 31, 2026.**

---

# 0. Mission

Create and operate a new Basecamp project named:

# **Colaberry Live**

This project becomes the complete operational home for:

- the Colaberry Live broadcast platform;
- the existing broadcast-occurrence work already in motion;
- Zoom -> Cloudflare Stream Live -> Colaberry in-app playback;
- the persistent in-app live player;
- live-session setup from Accelerator Sessions;
- Session Timeline-driven show control;
- desktop interactive viewing;
- phone companion participation via QR;
- Prompt Drops;
- polls, Builder Room, questions, building/stuck/finished pulse;
- Claude and Claude Code participation;
- replay creation and replay discovery;
- YouTube distribution;
- studio hardware and physical setup;
- OBS setup and production scenes;
- Ali's camera/audio/lighting setup;
- HeyGen / AI Avatar training;
- voice-clone / voice-AI training and validation;
- the videographer operating workflow;
- marketing launch;
- testing, rehearsal, runbooks, failure drills, and production go-live;
- complete system documentation for Ali, Piyush, Ram, future videographers, and future Claude Code sessions;
- architecture diagrams, data-flow diagrams, sequence diagrams, operator diagrams, and lifecycle diagrams;
- a durable case study showing how Colaberry Live was designed, built, tested, launched, and operationalized.

When this project is complete, Ali must be able to create a live session through a workflow similar to the existing Accelerator Session setup, customize the show through the Timeline, generate the viewer/companion experience automatically, rehearse it, go backstage, go live through the app, stream Zoom through Cloudflare Stream Live, distribute to YouTube, interact with the audience, end the show, process a replay, and hand the recording into the long-form / Shorts production workflow.

This is not a greenfield rewrite.

**The current repository and current session are the source of the work. Basecamp becomes the project-management and AI-handoff layer around it.**

---

# 1. Non-negotiable operating rules

## 1.1 Merge with the CURRENT tab before doing anything else

You are already in a Claude Code tab actively building this system.

Before creating or changing anything in Basecamp:

1. Read the current conversation/tab context that is already loaded.
2. Read `CLAUDE.md` fully and obey the repository's session rules.
3. Identify the current Session ID.
4. Inspect:
   - current branch;
   - `git status`;
   - staged diff;
   - unstaged diff;
   - commits made by this tab;
   - open PR, if one exists;
   - current `.claude/plans/` plan used by this tab, if one exists;
   - the current session log under `docs/sessions/`;
   - the 5 most recent relevant session logs;
   - recent commits touching Zoom, broadcast, live sessions, recording, player, session timeline, QR, class kit, or Cloudflare;
   - current code/files for the broadcast subsystem.
5. Produce an internal **Current Tab Migration Ledger** before creating tickets.

Do NOT assume that a requirement is unfinished simply because it appears in an old plan.

Do NOT assume that code is done simply because a file exists.

Status must be evidence-based.

Use these status values:

- `VERIFIED_DONE`
- `DONE_NEEDS_DEPLOY`
- `IN_PROGRESS`
- `NOT_STARTED`
- `BLOCKED_EXTERNAL`
- `BLOCKED_DECISION`
- `DEFERRED`
- `SUPERSEDED`

Each migrated item must include the evidence supporting the status.

---

# 2. Basecamp project creation

Use the existing Basecamp project-building capability / skill in this repository.

Read and reuse the proven conventions in:

- `.claude/skills/story-build/SKILL.md`
- `.claude/skills/story-build/MYDAY_SYNC.md`
- `.claude/skills/story-build/scripts/`
- the repository's Basecamp identity and token rules.

Do not invent a new Basecamp integration if the existing skill already supports the needed action.

## 2.1 Project name

**Colaberry Live**

## 2.2 Basecamp access

Grant project access initially to:

- **Ali Muwwakkil**
  - Basecamp person ID: `17454835`
  - ali@colaberry.com
  - Executive Sponsor / final approval / technical owner

- **Piyush Prajapati**
  - piyush@colaberry.com
  - Basecamp person ID must be resolved live using `/people.json`
  - Do not guess the ID
  - Videography / studio production / AI avatar / recording-quality lead

- **Sohail Syed**
  - Basecamp person ID: `47335940`
  - sohail@colaberry.com
  - Marketing / distribution / campaign / audience-growth lead

- **Mohammed Abdul Aleem**
  - Basecamp person ID: `47335967`
  - aleem@colaberry.com
  - Creative / UI/UX / broadcast-graphics / visual review lead

Do not grant broad company access.

If the existing project-creation skill automatically includes another service identity required for deterministic AI execution, document it explicitly. Do not silently invite unrelated employees.

## 2.3 Technical repository

This work remains in:

`ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`

Do **not** create a new Colaberry Live code repository.

The Story-Build "repo + deploy" rule is satisfied by the existing Enterprise repo and the existing production deployment. Create a Basecamp task that explicitly documents this instead of creating a duplicate repository.

---

# 3. Basecamp must be usable as a complete AI handoff

A future Claude Code session must be able to point at the **Colaberry Live** Basecamp project and understand the project without needing this chat.

Therefore the Basecamp project must not contain only terse todo titles.

It must contain the source material, architectural truth, requirements, current state, task prompts, evidence, operating rules, diagrams, test evidence, production procedures, and executive explanations required to continue safely.

The documentation is not secondary work. **Documentation, diagrams, and proof artifacts are part of the product.** Ali and Piyush must be able to understand exactly how the system works without reconstructing it from code, and Ram must be able to understand the business and operating model without needing a developer-led walkthrough every time.

## 3.1 Required Basecamp Docs & Files documents

Create these as **AI-readable Basecamp documents**. Markdown/plain text is preferred for the canonical content. Source attachments may also be uploaded, but the project cannot depend on a model opening DOCX files to understand core requirements.

### DOC 00 — `READ FIRST — Colaberry Live AI Operating Brief`

Must contain:

- mission;
- launch deadline;
- repository;
- Basecamp members;
- current architecture;
- source-of-truth hierarchy;
- how Claude Code should start a session;
- how to choose the next ticket;
- how to update/close tickets;
- how to write evidence;
- external prerequisites;
- production safety rules;
- current known blockers;
- link/index to every other project document.

Every AI-executable todo must link to this document.

### DOC 01 — `Colaberry Live — Requirements & Product Vision`

Must consolidate the full product vision:

- session setup similar to Accelerator Sessions;
- timeline-generated live experience;
- automatic broadcast occurrence creation;
- live viewer experience;
- desktop and mobile behavior;
- QR/phone companion;
- Prompt Drops;
- Claude + Claude Code workflow;
- community/Builder Room;
- account conversion;
- YouTube;
- replay;
- media repurposing;
- studio operation;
- test sessions;
- launch goal.

### DOC 02 — `Broadcast Architecture & Security Contract`

Capture the existing architecture accurately.

Canonical lifecycle:

`scheduled -> backstage -> live -> reconnecting -> ended -> processing -> replay_ready`

plus:

`cancelled`

and allow:

`processing -> ended`

when replay processing fails.

Access modes:

- `free`
- `paid`
- `preview`
- `private`

Access must remain fail-closed.

Playback contract:

- no durable client media URL;
- backend issues a short-lived playback grant;
- HMAC-SHA256 signed playback access;
- current design uses 120-second TTL;
- renewal during playback;
- provider adapter remains provider-agnostic;
- persistent player survives portal navigation;
- polling-based active discovery because portal auth uses Bearer JWT and EventSource cannot attach the required auth header in the current design.

Live delivery provider:

# Cloudflare Stream Live

Approved architecture:

`Zoom -> RTMP -> Cloudflare Stream Live -> HLS -> signed/expiring playback -> Colaberry persistent player`

Zoom is the interactive production source.

Cloudflare is the public/in-app delivery layer.

YouTube is a distribution output, not the source of truth.

State clearly that Cloudflare Stream account credentials and Zoom Custom Live Streaming capability are external prerequisites.

### DOC 03 — `Session + Timeline + Broadcast Orchestration`

Document the desired relationship:

**Accelerator Session = show definition**

**Session Timeline = show rundown / orchestration**

**Broadcast Occurrence = one airing**

The Session/Timeline must ultimately drive:

- slides;
- scene cues;
- presenter notes;
- Prompt Drops;
- QR moments;
- phone companion state;
- polls;
- Builder pulse;
- Claude/Claude Code instructions;
- broadcast graphics;
- "mark this moment" clip candidates;
- CTA;
- replay metadata.

A Session can have more than one Broadcast Occurrence.

### DOC 04 — `Viewer Experience + Phone Companion`

Desktop:

- persistent video;
- Prompt;
- Poll;
- Chat / Builder Room;
- Build progress;
- Claude Code controls;
- no forced video interruption.

Phone:

- persistent/sticky live video when watching inside Colaberry;
- one-thumb interaction;
- Prompt;
- Poll;
- Chat;
- Build;
- "Following / Building / Stuck / Finished";
- Open in Claude;
- Save Claude Code version for later.

Second-screen behavior:

A viewer watching on a computer may scan the existing session QR and use their phone as the companion controller.

The same persistent session QR should normally resolve to the current session context; the server/timeline determines the current moment. Context-specific QR moments may deep-link to a poll/prompt but must still belong to the same session/occurrence.

### DOC 05 — `Studio, Equipment, OBS, Zoom & Piyush Requirements`

Include every requirement in Section 10 of this prompt.

### DOC 06 — `AI Avatar + Voice AI Recording & Training`

Include every requirement in Section 11 of this prompt.

### DOC 07 — `YouTube, Media Production & Weekly Content Engine`

Include:

- YouTube Live distribution;
- raw live replay policy;
- edited long-form video;
- 5-7 Shorts / clips;
- transcript;
- timestamps;
- suggested hooks;
- thumbnail concepts;
- Prompt Drop assets;
- replay page;
- Colaberry CTA;
- audience-to-builder funnel;
- post-show handoff to Piyush / videographer and marketing.

### DOC 08 — `Test Plan, Failure Drills & Launch Runbook`

Must include private technical tests, pilot broadcast, dress rehearsal, launch checklist, incident fallback, post-launch validation, and required evidence.

### DOC 09 — `Traceability Matrix`

Every requirement must map to one or more Basecamp todos and to implementation evidence.

Columns:

- Requirement ID
- Requirement
- Owner
- Basecamp Todo
- Repo files
- Test/evidence
- Status
- Launch blocker?
- Notes

### DOC 10 — `Current State Migration Ledger`

This is generated from the current tab and current repository state.

It is the audit trail showing:

- what existed before the Colaberry Live BC project;
- what the current tab already completed;
- what is partially complete;
- what is outstanding;
- what is blocked;
- what was superseded.

### DOC 11 — `Colaberry Live — System Architecture Handbook`

This is the primary technical explanation for Ali and Piyush.

It must explain the complete system in plain English first, then at technical depth.

Required sections:

- system purpose;
- major components;
- responsibility of each component;
- Session vs Timeline vs Broadcast Occurrence;
- Zoom responsibility;
- Cloudflare Stream Live responsibility;
- Colaberry backend responsibility;
- playback grant/security model;
- persistent player behavior;
- phone companion behavior;
- YouTube distribution behavior;
- replay behavior;
- community/Builder Room behavior;
- Prompt Drop / Claude / Claude Code behavior;
- production/studio workflow;
- failure/reconnect behavior;
- post-live media workflow;
- environment/configuration dependencies;
- key database records and relationships;
- main routes/services/files;
- operational ownership;
- known limitations;
- troubleshooting entry points.

This document must be maintained as the architecture changes.

### DOC 12 — `Colaberry Live — Architecture Diagrams`

Create diagram source plus rendered artifacts.

At minimum create:

1. **System Context Diagram**
   - Ali / presenter
   - Zoom
   - OBS where applicable
   - Cloudflare Stream Live
   - Colaberry backend
   - persistent player
   - phone companion
   - YouTube
   - community
   - replay/media production

2. **Live Video Data Flow**
   - Zoom RTMP
   - Cloudflare ingest
   - HLS
   - playback grant
   - client playback
   - token renewal

3. **Session-to-Live Sequence Diagram**
   - create session
   - prepare timeline
   - create occurrence
   - backstage
   - go live
   - timeline interaction
   - end
   - processing
   - replay ready

4. **Broadcast Occurrence Lifecycle Diagram**
   - scheduled
   - backstage
   - live
   - reconnecting
   - ended
   - processing
   - replay_ready
   - cancelled
   - processing failure -> ended

5. **Access / Entitlement Diagram**
   - free
   - paid
   - preview
   - private
   - fail-closed behavior

6. **Viewer Experience Diagram**
   - YouTube discovery path
   - Colaberry interactive path
   - desktop path
   - phone companion path
   - $0 account conversion path
   - Architect progression

7. **Timeline Orchestration Diagram**
   - one Timeline moment driving:
     - presenter slide/scene
     - broadcast cue
     - QR state
     - phone interaction
     - Prompt Drop
     - poll
     - audience pulse
     - clip marker

8. **Studio Signal / Audio Diagram**
   - camera
   - microphone
   - Zoom
   - OBS
   - participant audio
   - local recording
   - Cloudflare output
   - monitoring
   - no-duplicate-audio boundaries

9. **Replay / Media Pipeline Diagram**
   - end live
   - Cloudflare VOD/replay
   - replay metadata
   - transcript
   - long-form edit
   - Shorts
   - YouTube/social
   - Colaberry replay workspace

10. **Failure / Recovery Diagram**
    - RTMP loss
    - reconnect
    - provider timeout
    - expired playback grant
    - replay processing failure
    - user-facing state

Preferred diagram formats:
- Mermaid source in Markdown for AI readability;
- exported PNG/SVG/PDF where useful for humans;
- HTML architecture overview if the repository's artifact tooling makes review easier.

Every diagram must have a short explanation under it: **what the viewer should learn from this diagram**.

### DOC 13 — `Ali + Piyush Studio Operator Manual`

This is the step-by-step operational guide for running a show.

Required sections:

- pre-show checklist;
- power/network/device checks;
- OBS startup;
- Zoom startup;
- Cloudflare readiness;
- session occurrence readiness;
- presenter link;
- timeline controls;
- QR/companion test;
- audio test;
- camera/light test;
- backstage;
- go live;
- how Ali advances the show;
- how Piyush monitors production;
- how to handle audience pulse;
- how to handle Prompt Drops;
- how to handle reconnecting;
- emergency fallback;
- how to end cleanly;
- recording verification;
- replay verification;
- post-show media handoff;
- shutdown checklist.

Include screenshots wherever a step could be ambiguous.

### DOC 14 — `Developer & AI Maintenance Runbook`

For future Claude Code sessions and engineers.

Include:

- key code paths;
- models;
- services;
- routes;
- flags;
- environment variables;
- Cloudflare adapter;
- Zoom integration;
- tests;
- mocks/fixtures;
- deployment flow;
- production verification;
- metrics/logs;
- incident diagnosis;
- common failure modes;
- safe rollback;
- how to add a new provider without breaking the provider-agnostic contract;
- how to add a new Timeline interaction;
- how to add a new show/series.

### DOC 15 — `Testing Strategy & Evidence Matrix`

Must explain the testing pyramid and the exact minimum efficient test set.

For every major capability include:

- unit tests;
- contract tests;
- integration tests;
- UI tests;
- provider mock tests;
- production smoke test where necessary;
- manual physical/studio check where automation is impossible;
- evidence artifact;
- owner.

Avoid repetitive full-suite runs when a smaller authoritative test can prove the change.

Use targeted tests while building, then bounded integration tests at release gates, then one final production verification.

### DOC 16 — `Ram Executive Brief — How Colaberry Live Works`

Write for Ram, not for a developer.

Must explain:

- why Colaberry Live exists;
- how a single live class becomes a reusable media and lead-generation engine;
- how Ali creates a session;
- how the Timeline creates the experience;
- how Zoom, Cloudflare, Colaberry, and YouTube work together;
- why Colaberry owns the interactive experience;
- what Piyush does;
- what marketing does;
- how the system reduces recurring production work;
- how the system supports the 10,000 Architect goal;
- what costs/vendors are involved;
- what risks exist;
- what is automated;
- what still requires a human;
- what metrics show success.

Keep this concise enough for an executive review, but detailed enough that Ram can explain the system back accurately.

### DOC 17 — `Colaberry Live Case Study Source Pack`

This document accumulates evidence during the build so the case study is not reconstructed from memory later.

Capture:

- original problem;
- before state;
- architecture decisions;
- screenshots;
- milestones;
- failed approaches;
- important defects found;
- security protections;
- test evidence;
- studio before/after;
- first live test;
- first public live;
- metrics;
- quotes/feedback only when real;
- final system diagrams;
- lessons learned.

This source pack feeds the final Case Study OS publication task after launch.

---

# 4. Migration rule: create tickets for work already done, then close them honestly

This is essential.

The new Basecamp project must represent the **whole project**, not only future work.

For each historical/current requirement discovered in the current tab, current plan, current session log, relevant commits, and relevant source files:

1. Create the corresponding Basecamp todo.
2. Add the complete task description.
3. Add evidence.
4. If the work is genuinely complete and verified:
   - post a `MIGRATED COMPLETION EVIDENCE` comment;
   - include commit SHA / PR / tests / production proof;
   - mark the todo complete.
5. If code is complete but not deployed:
   - keep it open;
   - status `DONE_NEEDS_DEPLOY`.
6. If partially complete:
   - preserve what is done;
   - state the exact next action;
   - leave it open.
7. If the old task is no longer the right architecture:
   - mark it `SUPERSEDED`;
   - explain what replaced it;
   - close only after the replacement ticket exists.

Do not falsify history.

Do not mark anything done based solely on an old plan saying `[x]`.

Use artifact-backed evidence.

---

# 5. Every Basecamp ticket must be Claude-Code executable

Every implementation todo must use this minimum contract.

## Required task body

### Objective
What business/user outcome is being created?

### Why this exists
How does it support Colaberry Live and the October 31 launch?

### Current state
What exists right now in the repo?

### Files / systems to inspect first
Exact paths, services, routes, models, tests, session plans, or Basecamp docs.

### Dependencies
What must exist before execution?

### External prerequisites
Credentials, account settings, purchases, Zoom settings, Cloudflare settings, human recording, etc.

### Requirements
Numbered requirements.

### Claude Code execution prompt
A detailed, copy-ready prompt telling a future Claude Code session how to scope, plan, build, test, document, and integrate this task.

The prompt must explicitly say:

- read `CLAUDE.md`;
- inspect current code before proposing changes;
- do not reimplement an existing capability;
- preserve provider abstraction;
- use `/loop-architect` for implementation work that spans multiple components/phases;
- use current repo tests;
- record progress in the current session log;
- do not deploy until deployment gate is satisfied;
- verify via production only when the ticket requires it.

### Acceptance criteria
Observable pass/fail outcomes.

### Evidence required
Tests, screenshots, stream proof, logs, URLs, metrics, recorded session, etc.

### Rollback / failure behavior
What happens if this breaks?

### Deliverable / artifact

# EVERY TASK MUST PRODUCE AT LEAST ONE DURABLE ARTIFACT.

A ticket with no artifact is incomplete even if someone performed work.

Acceptable artifacts include:

- code/commit/PR;
- architecture diagram;
- system document;
- ADR;
- test or test report;
- screenshot;
- annotated screenshot;
- video;
- recording sample;
- equipment research matrix;
- approved purchase list;
- receipt/order confirmation;
- installation photo;
- setup checklist;
- configuration export;
- training sample;
- operator SOP;
- runbook;
- troubleshooting guide;
- production metrics snapshot;
- replay URL;
- transcript;
- media brief;
- executive brief;
- case-study evidence;
- or verified configuration evidence.

The task body must name the artifact **before the task starts**.

If the artifact is a website/app screen, document:
- exact URL/route;
- role required;
- screenshot evidence;
- relevant code paths.

If the artifact is external configuration, attach evidence with secrets removed.

### Basecamp completion rule
Do not close until:
1. the artifact exists;
2. acceptance criteria pass;
3. evidence is attached/linked;
4. Basecamp status matches reality.

---

# 6. Ownership model

Do not assign everything to one person merely because a legacy skill has one `builder_id`.

Use domain ownership.

## Ali
Owns:

- final architecture decisions;
- final go-live;
- purchase approvals;
- vendor/account approvals;
- Cloudflare credential setup when human action is required;
- Zoom account-level setting verification;
- on-camera participation;
- avatar consent;
- test host duties;
- final product acceptance.

## Piyush
Owns / co-owns:

- equipment validation;
- studio physical setup;
- OBS configuration;
- recording-quality validation;
- production scene package;
- HeyGen avatar recording workflow;
- AI avatar quality checks;
- voice-clone recording/training workflow;
- creation of first avatar sample;
- videographer operating SOP;
- post-production pipeline;
- clip workflow.

## Sohail
Owns / co-owns:

- YouTube/channel strategy;
- launch campaign;
- live-event promotion;
- titles/descriptions;
- CTA strategy;
- audience-growth plan;
- weekly content distribution;
- Shorts distribution;
- conversion measurement;
- post-live promotion.

## Aleem
Owns / co-owns:

- viewer UX review;
- mobile companion UX;
- studio/broadcast visual identity;
- overlays;
- lower thirds;
- Prompt Drop graphics;
- thumbnail system;
- visual scene pack;
- brand consistency;
- accessibility / contrast design review.

## Claude Code / AI execution
Owns:

- repository implementation;
- integration;
- test automation;
- project-state reconciliation;
- Basecamp migration/sync;
- technical documentation;
- code-level verification;
- deterministic task sequencing.

Human owners approve or supply physical/external work where AI cannot.

---

# 6.1 Efficient testing doctrine

Testing must be strong **and efficient**.

Do not turn every small task into a repository-wide test marathon.

Use a layered strategy:

## During implementation
Run the smallest authoritative tests that prove the changed behavior:
- unit test for pure logic;
- route/service test for backend behavior;
- focused component test for UI behavior;
- provider-contract test for adapter behavior.

## At integration boundaries
Run the bounded group of tests that proves components work together:
- Session -> Broadcast Occurrence;
- Zoom provider -> Cloudflare adapter contract;
- grant -> player renewal;
- Timeline -> companion state;
- end -> replay processing.

## At release gates
Run:
- relevant bounded regression suites;
- TypeScript/static validation;
- security/authorization tests;
- one end-to-end rehearsal for the release.

## Before production launch
Run:
- final launch checklist;
- private technical airing;
- dress rehearsal;
- failure drills;
- production smoke verification.

## Mutation / negative-path expectation
For load-bearing controls, test the failure path, not only the happy path:
- fail-closed entitlement;
- invalid signature;
- expired grant;
- reconnecting;
- external provider unavailable;
- replay processing failure;
- private occurrence hidden;
- stale/invalid Timeline state.

## Evidence efficiency
Do not create five artifacts that prove the same thing.

Prefer one high-quality artifact that proves the requirement:
- a focused test transcript;
- an annotated screenshot;
- a short screen recording;
- a production log excerpt with secrets redacted;
- a verification report.

Testing is complete when the risk is convincingly covered, not when the largest possible test suite has been run repeatedly.

---

# 7. Release structure and due-date strategy

Create one canonical story-driven build list with release groups.

Use the October 31, 2026 production go-live as the hard outer boundary.

Do not wait until October 31 to prove the first stream.

## R0 — Project migration + external prerequisites
**Target: immediately**

Objectives:

- create Colaberry Live BC project;
- grant project access;
- migrate current tab/current plan/current code state;
- publish the required Basecamp documents;
- resolve Piyush BC ID;
- create requirement traceability;
- verify Cloudflare Stream account status;
- obtain/store Cloudflare API credentials through the approved secret path;
- verify Zoom "Live Streaming to a Custom Service";
- confirm Zoom account/tier supports custom livestream RTMP;
- verify paid vendor/billing state;
- document fallback if Zoom custom RTMP is unavailable.

This release is a launch blocker.

## R1 — Live provider connection + first private airtime
**Target: no later than mid-month**

Objectives:

- create/configure Cloudflare Stream Live input;
- connect Zoom custom RTMP to Cloudflare;
- map Cloudflare provider adapter to existing broadcast contract;
- mint signed/expiring playback;
- play live HLS through Colaberry persistent player;
- validate reconnecting state;
- validate short-lived grant renewal;
- perform first private five-person technical airing.

This release is the spine of the project.

## R2 — Session setup -> full broadcast occurrence
Objectives:

- create/enable Broadcast Occurrence from Accelerator Session setup;
- connect Session to Broadcast Occurrence one-to-many;
- automatically generate public/live workspace URL;
- automatically generate companion URL/QR;
- automatically prepare stream/broadcast configuration;
- rehearsal mode;
- backstage mode;
- readiness checklist;
- go-live control;
- end broadcast;
- processing and replay state.

## R3 — Timeline-driven show orchestration
Objectives:

- Timeline drives presenter moments;
- Prompt Drops;
- polls;
- QR state;
- audience pulse;
- CTA;
- current show step;
- clip markers;
- participant companion state.

Preserve the existing Class Kit / Timeline behavior rather than rewriting it.

## R4 — Interactive viewer + companion
Objectives:

- desktop persistent player + interactive rail;
- mobile sticky player;
- phone companion;
- Prompt / Poll / Chat / Build;
- Builder Room;
- free-view vs account participation boundaries;
- Claude prompt behavior;
- Claude Code "save for desktop" / desktop execution path;
- audience pulse.

## R5 — Studio + production setup
Objectives:

- purchase and install required equipment;
- configure camera/mic/light/network;
- configure OBS;
- create production scenes;
- Zoom and OBS audio routing;
- local recording;
- broadcast graphics;
- dry technical tests.

## R6 — AI Avatar + Voice AI
Objectives:

- record approved training footage;
- create voice clone where appropriate;
- generate first HeyGen avatar sample;
- QA eye contact, mouth sync, expression, voice quality;
- define when Real Ali vs AI Ali is used;
- create repeatable videographer SOP.

## R7 — YouTube + post-production engine
Objectives:

- simulcast/distribute to YouTube;
- YouTube metadata workflow;
- raw replay classification;
- replay list/feed in Colaberry;
- long-form edit workflow;
- 5-7 Shorts;
- transcript/clip identification;
- content production brief;
- CTA into Colaberry;
- metrics.

## R8 — Documentation, enablement, executive communication + case-study evidence
Objectives:

- complete System Architecture Handbook;
- complete all architecture diagrams;
- complete Ali + Piyush Operator Manual;
- complete Developer & AI Maintenance Runbook;
- complete Testing Strategy & Evidence Matrix;
- create a recorded walkthrough for Ali and Piyush;
- create a short executive walkthrough for Ram;
- publish Ram Executive Brief;
- conduct a Ram briefing session and capture follow-up questions/actions;
- update documents based on the briefing;
- maintain the Case Study Source Pack;
- verify every open/closed task has its required artifact.

Required artifacts:

- architecture PDF/HTML/Markdown;
- rendered diagrams;
- operator manual;
- technical runbook;
- testing matrix;
- Ali/Piyush walkthrough recording;
- Ram executive brief;
- Ram briefing deck or HTML;
- case-study source pack.

## R9 — Rehearsal + go-live
Must include:

- private technical test;
- staff pilot;
- full dress rehearsal;
- failure drills;
- production readiness report;
- go/no-go;
- first public live;
- post-airing replay verification;
- analytics verification;
- launch retrospective.

# Hard deadline: October 31, 2026

Aim for the public production airing before the final day if possible so October 31 is not the first time the system is exposed to real traffic.

## R10 — Post-launch case study + institutionalization

After the first successful production airing and replay verification:

1. Use `/build-case-study`.
2. Build the Colaberry Live case study from DOC 17 evidence.
3. Do not invent metrics, quotes, savings, or outcomes.
4. Clearly separate:
   - verified production facts;
   - measured audience results;
   - qualitative lessons;
   - future expected benefits.
5. Include:
   - before/after;
   - architecture diagrams;
   - key technical decisions;
   - provider abstraction;
   - security model;
   - Timeline orchestration;
   - studio setup;
   - testing strategy;
   - defects/failures found during rehearsal;
   - first live proof;
   - replay/media workflow;
   - human + AI operating model;
   - lessons learned.
6. Create review artifacts before publication.
7. Publish only through the Case Study OS and existing approval process.
8. Link the published case study back into the Colaberry Live Basecamp project.

The case study is part of project completion, not optional marketing polish.

---

# 8. Existing broadcast architecture that MUST be preserved

The current broadcast subsystem is deliberately provider-independent.

Do not rip it out because Cloudflare was selected.

Cloudflare must be implemented behind the provider adapter.

Preserve:

- first-class Broadcast Occurrence;
- lifecycle state machine;
- fail-closed entitlement;
- private occurrence omission from ineligible discovery;
- short-lived signed playback;
- playback credential renewal;
- Range-capable replay transport;
- persistent app-level video player;
- shared tab-level discovery poller;
- server-defined polling cadence;
- current security fixes;
- current metrics dictionary/test matrix/ADRs where applicable.

Before implementing any ticket, inspect what is already built.

The existing report says:

- Phase 1 complete;
- Phase 2 complete;
- Phase 3 mostly complete;
- `BROADCAST_ENABLED` defaults false;
- no production broadcast has aired yet;
- live provider was the key missing capability;
- Cloudflare Stream Live has been selected;
- measurement remains;
- Community placement was deferred until after first airing;
- screenshots/contrast need a deployed flag-on environment;
- studio/live participation, subscriptions/recurring shows, replay/distribution, hardening/release still remain.

Reconcile that statement against current code before creating statuses.

---

# 9. Session builder / live-class experience requirements

Ali must ultimately be able to create a live class similarly to the existing Accelerator Sessions workflow.

The session setup should support:

- title;
- description;
- date/time;
- audience/access mode;
- duration;
- public/private/paid/preview;
- show/series identity;
- live provider;
- YouTube output selection;
- replay policy;
- CTA;
- build topic;
- tool mode:
  - Claude;
  - Claude Code;
  - both;
- Prompt Drops;
- polls;
- questions;
- Builder pulse;
- community/Builder Room;
- timeline scenes;
- presenter notes;
- broadcast scenes;
- QR behavior;
- artifact/challenge;
- post-show media brief.

Creating/readying the live session should generate or prepare:

- Broadcast Occurrence;
- persistent public workspace URL;
- phone companion URL;
- QR;
- replay identity;
- show rundown;
- prompts;
- agent-readable prompt version;
- production brief;
- YouTube metadata draft;
- launch/readiness checklist;
- analytics/tracking IDs.

---

# 10. Piyush's live-class / studio requirements

Source email:

**Piyush Prajapati — "Guides for Improving Video Production Quality and AI Avatar Creation" — October 8, 2026**

Piyush's requested order of operations:

1. Buy/setup the recommended equipment.
2. Proceed with HeyGen recording.
3. Piyush sets up and creates a short avatar-video sample.
4. Then move into regular production.

Treat the following as project requirements.

## 10.1 Equipment to research, approve, buy, receive, and validate

### Camera
**Logitech MX Brio**

Requirements:

- USB to computer;
- mount close to eye level;
- configure 1080p/30 for production baseline.

### Microphone + boom arm
**FIFINE K688 + BM88 boom arm bundle**

Requirements:

- USB to computer;
- mic approximately 4-6 inches from Ali's mouth;
- placement cannot cover face;
- validate no clipping/noise.

### Light
**Elgato Key Light with desk mount**

Requirements:

- wall power;
- slightly above eye level;
- approximately 30-45 degrees to one side;
- validate even face lighting and no harsh glare.

### Network
**Cat6 Ethernet cable**

Requirements:

- router to computer;
- adapter if the workstation lacks Ethernet;
- wired network preferred for live classes.

### Listening
Use Ali's existing earbuds.

Requirement:

- use as Zoom speaker output only.

## 10.2 Purchase research tasks

Before ordering:

- verify current USA availability;
- verify exact compatible models;
- verify return policy;
- verify current pricing;
- verify desk/mount compatibility;
- verify required USB ports/adapters;
- verify Ethernet distance/adapter requirements;
- verify Windows compatibility;
- verify no additional capture card or audio mixer is required;
- document approved purchase links;
- Ali approves purchases.

Do not hardcode a price from memory.

Use current vendor/product pages at execution time.

## 10.3 OBS + Zoom setup requirements

1. Connect camera and microphone directly to USB.
2. Use K688 via USB.
3. Connect Ethernet.
4. Turn on/configure lighting.
5. Create an OBS teaching scene:
   - Display Capture for the teaching monitor only;
   - MX Brio camera source;
   - camera resized/positioned;
   - OBS controls kept on a separate monitor when possible.
6. Audio:
   - Audio Input Capture -> K688;
   - Application Audio Capture -> Zoom for participant/student voices;
   - capture browser/player audio when required;
   - disable global Desktop Audio;
   - disable global Mic/Aux where duplicate capture would occur;
   - avoid duplicate audio;
   - leave monitoring off unless a validated production reason requires it.
7. Send video to Zoom using OBS Virtual Camera where that production mode is used.
8. Zoom inputs:
   - OBS Virtual Camera;
   - K688 microphone;
   - earbuds as speaker.
9. Zoom screen sharing:
   - share the teaching monitor separately;
   - Share Sound when playing clips;
   - leave "Optimize for video sharing" off for slides/code/websites unless a test proves another setting is preferable.
10. OBS local recording baseline:
    - canvas 1920x1080;
    - output 1920x1080;
    - 30 FPS;
    - webcam 1080p/30;
    - high-quality recording;
    - hardware H.264 if supported;
    - MKV primary local-record format;
    - save to local SSD;
    - remux to MP4 for sharing.
11. Run at least one 5-minute Zoom + OBS recording test before the first real production class.
12. Validate:
    - Ali voice;
    - student reply;
    - shared text readability;
    - lip sync;
    - no duplicate audio;
    - no clipping;
    - free disk space;
    - appropriate CPU/GPU use;
    - stable network;
    - Zoom mute behavior vs OBS recording behavior.

Piyush's guide explicitly notes:

**Zoom mute does not mute OBS.**

Include this in the operator checklist.

---

# 11. Piyush's HeyGen / AI Avatar / voice requirements

The Basecamp project must contain a full workstream for Ali's AI avatar and voice-AI production readiness.

## 11.1 Avatar recording behavior

Ali can speak naturally about a familiar topic.

Do not require him to memorize a complete script for the training recording.

Recommended format:

- explain something he already teaches;
- imagine one student sitting behind the camera;
- prepare roughly three cues:
  1. what he does;
  2. one common beginner problem;
  3. his advice;
- practice once;
- record naturally.

## 11.2 Eye contact

- use a small marker beside the camera lens;
- look toward the lens;
- blink naturally;
- allow natural facial expression;
- if cues are needed, keep a very short cue card close to lens position;
- avoid reading from side monitors;
- hide self-preview after framing when helpful;
- if full text becomes necessary, research/use a lens-aligned teleprompter;
- avoid a wide scrolling text column that causes visible eye scanning.

## 11.3 Standard recording baseline

For normal Digital Twin-style training footage, current Piyush guidance says:

- webcam or phone on stable mount;
- eye level;
- landscape;
- 1080p;
- 30 FPS;
- head and upper torso visible;
- soft steady lighting;
- clear microphone;
- quiet room;
- record Ali only;
- if using OBS, make a dedicated avatar scene:
  - camera fills frame;
  - USB mic;
  - no screen capture;
  - no overlays;
  - no desktop audio;
- keep mic out of Ali's face;
- record locally rather than recording the avatar training footage through Zoom;
- around two minutes for the standard Digital Twin flow;
- uninterrupted take;
- 2-3 second pause at beginning;
- natural sentence breaks;
- eyes near lens;
- gestures below chest level;
- avoid abrupt head turns;
- avoid cuts/splicing.

## 11.4 HeyGen flow-specific research

Do not assume the standard two-minute requirement applies to every HeyGen product.

Before recording, Piyush/Claude must verify the CURRENT official HeyGen workflow being used.

Piyush's note says Avatar V may use a shorter motion clip (for example a 15-second flow) and a more expressive delivery.

Create a research ticket that checks current HeyGen official requirements on the execution date.

Record the final selected process in Basecamp.

## 11.5 Consent

The cloned person must provide their own consent.

The separate HeyGen consent statement must be recorded exactly as the vendor flow instructs, including any displayed code.

Do not paraphrase vendor-required consent language.

## 11.6 Voice AI / voice clone training

This project must explicitly include voice work, not just visual-avatar work.

Create tickets for:

- determine the selected voice-clone / voice-AI provider and exact workflow;
- verify current official training requirements;
- recording environment;
- microphone setup;
- required duration;
- speaking style;
- pronunciation coverage;
- pacing;
- emotion range;
- noise floor;
- consent;
- upload;
- sample generation;
- QA;
- retake criteria;
- safe-use policy;
- when AI Ali may be used;
- when Real Ali is required.

If HeyGen's selected avatar workflow recommends a separate voice clone, include that path.

Do not create a voice clone without Ali's explicit participation/consent.

## 11.7 Avatar QA

After creation generate a short sample and score:

- eye direction;
- mouth movement;
- lip sync;
- expression;
- voice similarity;
- voice clarity;
- naturalness;
- pacing;
- pronunciation;
- visual artifacts;
- hand/gesture behavior;
- branding;
- overall credibility.

If it feels stiff or unnatural, create a retake ticket rather than accepting it because the pipeline technically completed.

---

# 12. YouTube + audience-growth system

The Basecamp project must include the operating workflow for turning one live session into the weekly media package.

One live session should generate:

- 1 live broadcast;
- 1 raw replay;
- 1 edited long-form YouTube video;
- 5-7 Shorts;
- Prompt Drop assets;
- clips;
- transcript;
- chapter markers;
- thumbnail options;
- titles;
- descriptions;
- social captions;
- email/community recap;
- replay workspace;
- next-live CTA.

YouTube is for reach/distribution.

Colaberry remains the authoritative system for:

- session;
- broadcast occurrence;
- access;
- prompts;
- participation;
- build progress;
- community;
- replay metadata;
- Architect conversion.

Raw-live retention policy:

- strong live -> keep public;
- acceptable live -> evaluate after edited version publishes;
- poor technical quality -> unlisted;
- sensitive/failed -> private.

Do not automatically delete every raw live and do not automatically keep every raw live public.

---

# 13. Viewer and conversion model

The project must support the progression:

`Watch -> Participate -> Prompt -> Build -> Save -> $0 Colaberry Account -> Community -> Completed Artifact -> Architect Progress`

Do not reduce success to YouTube subscribers.

Track:

- live views;
- unique viewers;
- average watch time;
- returning viewers;
- Prompt Drop opens;
- prompt copies;
- poll votes;
- Builder Room participation;
- build starts;
- build completions;
- $0 account creations;
- completed artifacts;
- Activated Architects.

A useful operational definition of an Activated Architect is:

- has a Colaberry account;
- has completed at least one tracked build;
- has created/submitted at least one artifact.

If the product team changes this definition, record the decision in the Basecamp Requirements doc.

---

# 14. External prerequisite tickets that MUST exist

Create explicit human-action tickets for:

## Cloudflare
- confirm Stream is enabled;
- create/retrieve API credentials;
- store credentials only in approved secret storage / production environment;
- validate API permissions;
- create test Live Input;
- confirm signed playback capability;
- confirm VOD recording behavior;
- confirm billing/cost visibility.

## Zoom
- verify account supports **Live Streaming to a Custom Service**;
- enable it at the correct account/group/user scope;
- verify custom RTMP can be configured for Ali's class host;
- verify existing Server-to-Server OAuth / recording configuration remains intact;
- verify no change regresses Zoom cloud recording;
- validate student/guest audio and Ali share behavior;
- document fallback if custom RTMP is not available.

## YouTube
- verify channel ownership/access;
- verify live-stream eligibility;
- verify stream destination setup;
- document stream key/API handling;
- verify test/unlisted live event;
- verify post-live replay ownership.

No ticket may pretend an external admin setting was verified from repository code.

---

# 15. Test-session ladder

Do not jump from dark feature flag to public launch.

Create and execute these stages.

## Test 1 — provider smoke test
Participants: minimum required technical staff.

Prove:

- Zoom produces RTMP;
- Cloudflare accepts it;
- HLS is created;
- signed playback works in Colaberry;
- grant renews;
- seek/playback behavior correct where applicable;
- end state correct.

## Test 2 — private five-person airing
Prove:

- viewer discovery;
- persistent player;
- navigation does not restart the video;
- companion QR;
- poll;
- Prompt Drop;
- Builder pulse;
- reconnect behavior;
- end;
- replay processing.

## Test 3 — internal staff pilot
Include Piyush, Sohail, Aleem.

Evaluate:

- content;
- UX;
- audio;
- video;
- lighting;
- camera;
- graphics;
- Prompt Drop timing;
- participation;
- marketing CTA.

## Test 4 — full dress rehearsal
Use the actual studio and actual live-class flow.

Include:

- cold open;
- Ali camera;
- slides;
- Claude/Claude Code;
- screen share;
- participant voice;
- prompt;
- poll;
- Builder Room;
- QR;
- CTA;
- end;
- replay.

## Test 5 — failure drills

Deliberately exercise:

- RTMP interruption;
- reconnect;
- expired playback grant;
- Cloudflare failure;
- Zoom disruption;
- viewer refresh;
- route navigation;
- phone reconnect;
- replay-processing failure;
- entitlement failure;
- invalid/private access;
- unpublishing replay;
- provider API timeout.

Confirm state is honest and no access fails open.

## Test 6 — production launch

Do not mark this complete until there is proof of a real production airing.

---

# 16. Basecamp sync behavior after migration

Once the project exists and all current work is migrated:

1. Reconcile Basecamp vs repository.
2. Close verified-done migrated tickets.
3. Leave unfinished items open.
4. Post one project-level migration summary.
5. Generate a ranked queue of open work.

Then **continue building**.

Do not stop and ask Ali what to do next if the next task is deterministically clear.

Select the next task using:

1. launch blocker;
2. dependency unlock;
3. external prerequisite;
4. provider spine;
5. testability;
6. user-facing orchestration;
7. production polish.

At the end of every work unit:

- update the Basecamp ticket;
- attach or link evidence;
- update status;
- close only if done;
- sync project docs if architecture changed;
- select the next highest-priority unblocked ticket.

Basecamp must remain synchronized with reality.

---

# 17. Required "current tab -> Basecamp" migration artifact

Before starting new implementation create a report named:

# `COLABERRY LIVE — CURRENT BUILD MIGRATION REPORT`

It must include:

## A. Current tab
- Session ID;
- branch;
- current plan;
- current task;
- commits;
- PR;
- uncommitted files.

## B. Broadcast system current state
For every known Phase 1-7 area:

- what exists;
- files;
- tests;
- deployed/not deployed;
- flag state;
- blockers.

## C. Work already completed
Each item mapped to new Basecamp todo + evidence.

## D. Work still outstanding
Each item mapped to open Basecamp todo.

## E. External blockers
Cloudflare / Zoom / purchase / voice/avatar actions.

## F. Next task
The next highest-priority unblocked task after migration.

Publish this report into Basecamp as DOC 10 and save a repository copy under an appropriate `docs/colaberry-live/` path if the current repository's documentation conventions support it.

---

# 18. Basecamp ticket quality bar

A future Claude Code session should never open a ticket and have to ask:

> "What did Ali mean?"

For every ticket:

- explain the reason;
- give exact source files to inspect;
- cite the Basecamp project docs;
- explain what already exists;
- explain what must NOT be rebuilt;
- specify the desired artifact;
- provide a detailed Claude Code execution prompt;
- include tests;
- include acceptance criteria;
- include evidence;
- include rollback/failure behavior;
- assign owner;
- assign due date;
- set dependency;
- identify whether it blocks launch.

For UI tasks, include screenshots/mockups/review artifacts as required by the repo's screenshot-review rules.

For external/human tasks, include an exact checklist that a non-developer can follow.

---

# 18.1 Ram communication and executive enablement workstream

Create explicit Basecamp tasks assigned appropriately for keeping Ram informed.

At minimum:

## Task — Create Ram's Colaberry Live executive architecture brief
Artifact:
- DOC 16;
- one-page system diagram;
- one-page business-value diagram.

## Task — Record 10-15 minute Colaberry Live walkthrough for Ram
Explain:
- how Ali creates a session;
- how the Timeline drives the show;
- how Zoom/Cloudflare/Colaberry/YouTube connect;
- how viewers participate;
- how replay/media content is produced;
- how the system supports revenue/audience growth.

Artifact:
- recording;
- transcript;
- linked executive brief.

## Task — Conduct Ram review
Capture:
- questions;
- concerns;
- requested changes;
- decisions;
- approvals.

Artifact:
- meeting notes / Basecamp summary;
- decision log;
- follow-up tickets.

## Task — Post-launch Ram results update
After the first production live, provide:
- what aired;
- viewer count;
- technical reliability;
- replay status;
- Prompt Drop/participation metrics;
- account/build conversions if available;
- media assets produced;
- lessons;
- next improvements.

Artifact:
- executive results memo.

Do not require Ram to read code-level documentation. Give him a clear executive view plus an optional link to deeper technical documents.

---

# 19. Production go-live definition of done

**Colaberry Live is not complete merely because broadcast code exists.**

The project is done only when all of the following are true:

1. Basecamp Colaberry Live project exists.
2. Ali, Piyush, Sohail, and Aleem have the intended access.
3. All project docs exist and are AI-readable.
4. Current historical work has been migrated/reconciled.
5. Cloudflare Stream is live and credentialed.
6. Zoom custom RTMP is verified and usable.
7. Zoom can feed Cloudflare.
8. Cloudflare HLS plays in the Colaberry persistent player.
9. Signed playback works and renews.
10. Session setup can create/prepare a Broadcast Occurrence.
11. A live workspace URL is generated/available.
12. The phone companion/QR path works.
13. Timeline moments can drive audience participation.
14. Polls work.
15. Prompt Drops work.
16. Builder pulse works.
17. Claude pathway works.
18. Claude Code desktop pathway works.
19. Builder Room/community participation works at the agreed access tier.
20. Studio equipment is purchased and installed.
21. Ali camera/audio/light/network quality passes.
22. OBS setup is documented and repeatable.
23. Piyush has an operating production workflow.
24. HeyGen avatar training is complete.
25. Voice-AI/voice-clone training is complete if selected.
26. AI Ali sample is reviewed.
27. YouTube live distribution is tested.
28. Replay processing works.
29. Replay discovery/listing exists for users who should see it.
30. Long-form/Shorts media handoff exists.
31. Failure drills are passed.
32. Full dress rehearsal is passed.
33. Production launch readiness report is approved.
34. A real production Colaberry Live session airs.
35. Replay is verified after the live.
36. Analytics are verified.
37. The operator runbook is complete.
38. System Architecture Handbook is complete and current.
39. Required architecture diagrams are complete and rendered.
40. Ali + Piyush have a recorded walkthrough and can explain/operate the system.
41. Developer & AI Maintenance Runbook is complete.
42. Testing Strategy & Evidence Matrix is complete.
43. Ram Executive Brief is complete.
44. Ram has received a walkthrough/briefing and follow-up actions are captured.
45. Every Basecamp task has at least one required artifact.
46. Case Study Source Pack is complete through first production airing.
47. Final Colaberry Live case study has been created through the Case Study OS after launch.
48. Basecamp final state matches repository and production truth.

---

# 20. Immediate execution instructions

Execute now.

Do NOT only write a plan.

### Step 1
Orient on `CLAUDE.md`, current Session ID, current tab, current branch, current plan, recent relevant session logs, current code, current tests.

### Step 2
Build the Current Tab Migration Ledger.

### Step 3
Invoke/reuse the existing Basecamp Story-Build / project creation capability and create:

# **Colaberry Live**

Resolve Piyush's Basecamp person ID live.

Grant Ali + Piyush + Sohail + Aleem.

### Step 4
Create the AI-readable project documents listed above, including the System Architecture Handbook, Architecture Diagrams, Ali + Piyush Operator Manual, Developer & AI Maintenance Runbook, Testing Strategy, Ram Executive Brief, and Case Study Source Pack.

Do not merely upload the two Piyush DOCX files. Convert their requirements into the canonical Basecamp docs so future AI sessions can read them reliably.

For diagrams:
- store AI-readable diagram source;
- generate human-readable rendered artifacts;
- link both from Basecamp.

### Step 5
Create todos for the entire project, including already-completed work.

Use the release structure above.

Before publishing each todo, verify it declares:
- owner;
- due date;
- dependency;
- launch-blocker flag;
- detailed Claude Code prompt where applicable;
- required artifact;
- test/evidence requirement.

### Step 6
For completed work:
- add evidence;
- close migrated tickets.

For unfinished work:
- keep open;
- preserve exact current state.

### Step 7
Reconcile:
- Basecamp requirements;
- Basecamp todos;
- current plan;
- current repository;
- current production state.

No duplicate requirements and no missing launch-critical requirement.

### Step 8
Post the Basecamp migration summary and identify the next highest-priority unblocked task.

### Step 9
Continue the current build from that task.

Use `/loop-architect` for multi-component implementation.

Do not restart completed phases.

### Step 10
Continue the project until the current bounded phase is complete, then sync Basecamp again.

Only interrupt Ali for:
- strategic ambiguity;
- paid-account/credential actions;
- physical purchase approval;
- consent/recording actions;
- production-risk gates;
- or truly blocked human action.

---

# 21. Final result expected from this prompt

When this bootstrap is complete, report to Ali:

- Basecamp project ID and URL;
- project members;
- Piyush BC ID resolved;
- Docs & Files created;
- number of requirements;
- number of todos;
- number migrated as VERIFIED_DONE;
- number open;
- number blocked;
- external prerequisites;
- current Broadcast phase/status;
- next task selected;
- whether execution resumed;
- target go-live date;
- launch-risk summary;
- documentation package status;
- architecture-diagram status;
- Ali/Piyush operator-training status;
- Ram briefing status;
- artifact-completeness status;
- case-study evidence status.

Then continue working the selected ticket unless a hard human blocker prevents progress.

---

# 21.1 Documentation-as-code and artifact upkeep rule

Documentation must evolve with the system.

Whenever a task changes:
- architecture;
- data flow;
- lifecycle;
- provider behavior;
- user flow;
- setup procedure;
- security;
- test strategy;
- production operation;

the same task must identify which project documents/diagrams require updating.

Do not create architecture documentation once and let it drift.

At each release gate:

1. compare docs to current implementation;
2. update diagrams;
3. update operator instructions;
4. update Ram-facing summary if the business explanation materially changed;
5. update Case Study Source Pack;
6. verify Basecamp links still work.

The project should always answer three questions without archaeology:

- **Ali:** What do I do to create and run a live class?
- **Piyush:** How is the studio/broadcast system wired and how do I operate/diagnose it?
- **Ram:** What does this system do for the business, what does it cost/require, and how does it support growth?

---

# 22. Final doctrine

The Basecamp project is not a duplicate of the repo.

It is the **operational brain and handoff layer** for the repo.

The repository proves what the product does.

Basecamp tells humans and future Claude Code sessions:

- why it exists;
- what is done;
- what remains;
- who owns it;
- what must be bought;
- what must be configured;
- what must be recorded;
- what must be tested;
- what evidence closes the work;
- and what to do next.

The desired steady state is:

`Open Colaberry Live in Basecamp -> read READ FIRST -> select highest-priority ticket -> copy/run the Claude Code prompt -> build -> verify -> attach evidence -> close -> sync -> continue`

That workflow should be smooth enough that a fresh Claude Code session can take over without reconstructing the project from chat history.

# Start now.
