# AI Systems Architect Accelerator - Student Platform Build Spec

**Date:** 2026-06-10 · **Author:** Claude Code (for Ali) · **Session:** CC-20260610-q4d7
**Status:** Ready to convert into Basecamp tasks for Kes (build) + Aleem (design).
**Launch:** Cohort 1 classes start **Mon 2026-07-27** (orientation Thu 2026-07-23). **Curriculum already live in Basecamp.**

> **How to use this document.** This is the single source of truth for building the
> student-facing platform. It contains: (1) what the curriculum is and how it works,
> (2) the platform we are building and why, (3) a feature-by-feature checklist of the
> four systems we are fusing - **Skool + Basecamp + Anthropic (Skilljar) + our current
> platform** - with a build decision on each, (4) the phased build plan, (5) the
> explicit design workstream for Aleem, and (6) a ready-to-paste Basecamp task
> breakdown for Kes. Hand Section 10 to Basecamp to create the tasks; hand Sections
> 6-9 to Kes and Aleem as the spec.

---

## 1. The one-paragraph vision

Every student gets a personal, AI-accelerated workspace where they (1) take the
Anthropic course for the week, (2) apply it to **their own project** through an
advisor-like builder that turns a raw idea into a requirements doc and a task list,
(3) build it in Claude Code and push to GitHub where our system tracks their progress
and flips requirements to *verified*, (4) preview their running app live, (5) assemble
a portfolio of build + showcase artifacts, and (6) do it all inside a Skool-style
community where they post build logs, comment, see who is online, and level up. One
synced system. The "ultimate system" is **Skool's community + gamification, Basecamp's
project/task model, Anthropic's LMS/courses, and our advisor/portfolio/preview engine**,
fused so the student never leaves the platform.

---

## 2. What is already done (do not rebuild)

| Done | Evidence |
|---|---|
| Curriculum list rebuilt: 12 week-groups × 5-item checklist, 60 todos | Basecamp project 47502609, list 9946468992 (LIVE) |
| Each week pre-mapped to its Anthropic Skilljar course | See Section 4 + Appendix A |
| Build deadlines staggered, all before 7/27 launch | I1 06-19, I2 06-26, I3 07-03, I4 07-10 |
| Ali co-signs Intensive 1 sign-off (Weeks 1-3) | Verified live |
| Reconfiguration script + tests on `main` + VPS | `reconfigureCurriculumList.js`, 17/17 tests |
| Platform strategy | `docs/training-program-2026-q3/STUDENT_PLATFORM_STRATEGY.md` |
| ~70% of the platform already exists in our codebase | See Section 5 + 6.D |

---

## 3. The curriculum: structure and mechanics

**12 weeks, 2 sessions/week** (Mon Architecture Day + Thu Build Day), delivered as
**4 stackable Intensives** of 3 weeks each (TWC seminar-independence frame). Students
build **one project across all 12 weeks** (Lego model), not 12 toys.

**Per-week build checklist (the 5 tasks the team must produce - LIVE in Basecamp):**

1. **Anthropic section mapped** - confirm + wire the specific Skilljar course for the week on enterprise.colaberry.com. *Owner: Kes.*
2. **Lab + artifact spec built** - define what the student builds + which artifact(s) it produces. *Owner: Swati (CB drafts).*
3. **Assessment pack** - 5-q warmup + 10-q post quiz + feedback survey. *CB drafts, Swati approves.*
4. **NotebookLM video produced.** *Owner: Swati/CB.*
5. **Sign-off** - week validated, launch-ready. *Owner: Swati; **Ali co-signs Weeks 1-3** to set the standard.*

**Build schedule (all before the 7/27 launch, staggered one intensive per week):**

| Intensive | Weeks | Themes | Build due |
|---|---|---|---|
| 1 - Build Your AI Foundation | 1-3 | Claude Code Foundations · Agent Skills · Claude API + Workflow Assistant | **2026-06-19** |
| 2 - Create Your AI Team | 4-6 | Prompt Engineering · MCP Foundations · Advanced MCP | **2026-06-26** |
| 3 - Connect AI To The Real World | 7-9 | Subagents/Multi-Agent · Workflows/Automation · Reliability | **2026-07-03** |
| 4 - Design AI That Scales | 10-12 | Governance · Systems Architecture · Capstone + Expo | **2026-07-10** |

Teaching dates are unchanged (delivery runs 7/27 → 10/12). See Appendix A for the
full week → Anthropic course map.

---

## 4. Anthropic Skilljar linkage (validated against the live catalog)

Each week is pre-mapped to a real Anthropic Skilljar course. Weeks 4/9/10/11 have no
Anthropic course - they are **Colaberry-original** architecture content (our
differentiator). **Open integration decision for Kes:** *how* Skilljar is delivered on
enterprise.colaberry.com - deep-link/SSO vs. embed vs. Partner content access. Skilljar
is Anthropic's hosted LMS; we link/wrap, we do not re-host. (See Appendix A for the table.)

**Curriculum decision (RESOLVED 2026-06-18, BC#9985688677, Ali): build Colaberry-original
(lean).** Week 4 (Prompt Engineering) has no Anthropic *Skilljar* course, but Anthropic
publishes a free *public* Prompt Engineering tutorial + docs (not on Skilljar) - curate
that as the read/watch layer (Claude 101 as foundation only) and build an original
Colaberry lab: the **Enterprise Prompt Library** Tier-A artifact layered onto the student's
project. Rejected: *fold into Week 3* (breaks the 3-week TWC intensive boundary + forces
renumbering 60 live BC todos) and *point at Claude 101* (intro product course students
already did pre-program; no PE depth, no differentiated artifact). See Section 12 #1.

---

## 5. The platform we are building (target architecture)

**Core decision: build native in our Accelerator codebase** (Node/TS, Postgres,
multi-tenant, preview stacks, GitHub, portfolio) and **port the advisor's "brain"**
(idea → ~10-question enhancement → requirements generation → quality gates). Do **not**
fork the Python advisor (single-tenant, JSON-file). Do **not** put students on per-seat
Basecamp. Replicate the Basecamp experience natively (Section 6.B).

**The student journey (one synced flow):**

```
Start program → pick Project DNA (ProjectDnaWizard, EXISTS)
  For each project they add:
    1 Add project           projectService.createNewProjectForEnrollment (EXISTS)
    2 Give raw idea          idea intake (PORT from advisor)
    3 10-question enhance    profile/feature enhancement (PORT from advisor)
    4 Requirements document  requirementsGenerationService (EXISTS) + advisor writer
    5 Task list created      RequirementsMap → native student tasks (CB-System)
    6 GitHub connected       githubService (EXISTS) - this IS the "no-MCP" path
  Build loop: work in Claude Code → push → portal ingests → requirements flip to VERIFIED
  Live preview at {slug}.preview.colaberry.ai (EXISTS)
  Portfolio auto-assembles artifacts (EXISTS, extend)
  Build-log engine drafts a weekly social post → student posts w/ #Colaberry
  All of the above lives inside a native Skool-style community (BUILD)
```

**The student "CB-System"** (their personal AI ops layer): replicate the employee AI
Ops Command Center for students - "project → tasks → here's your one next action + the
Claude Code prompt for it." The employee machinery (`services/ops/*` priority engine,
approval workspace, Run My Day, skills, automation, metrics) is mostly **not**
Basecamp-coupled and is reusable for students; only the Basecamp-sync layer is discarded
(students create tasks natively). Mount on the existing `CoryHome.tsx`. ~20-26h Phase 1.

**Artifacts (structure + flexible):** Tier A = structured build artifacts fixed by the
12-week Lego model (gradeable, comparable). Tier B = flexible showcase artifacts per
project (demo video, explainer/podcast, one-pager/infographic, PPT) the system scaffolds
and AI drafts. **Social** = a recurring *optional* student assignment driven by the
build-log engine (constant #Colaberry stream), not a per-week build task.

---

## 6. The functionality matrix - fusing four systems (the bulletproof checklist)

This is the master checklist. For every feature in Skool, Basecamp, Anthropic Skilljar,
and our current system, the build decision is one of: **REPLICATE** (build native),
**LINK** (integrate/SSO to the external system), **REUSE** (already in our codebase),
or **SKIP** (out of scope for v1, with reason). Hand this to Kes as the feature spec.

### 6.A - SKOOL (community + gamification)  → what our system must REPLICATE

| Skool feature | Build decision | Notes |
|---|---|---|
| Single central community feed | **REPLICATE** | One feed; posts, announcements, build-logs flow here |
| Text + rich media posts, polls | **REPLICATE** | WYSIWYG, images, video, links, polls |
| Comments + nested replies | **REPLICATE** | Threaded |
| Likes (drive points) | **REPLICATE** | 1 like = 1 point (gamification currency) |
| Categories / feed filtering | **REPLICATE** | By topic/cohort/industry |
| Pinned posts (feed + lessons) | **REPLICATE** | Pin announcements + pin posts to lessons |
| @mentions | **REPLICATE** | Notify mentioned members |
| Member profiles + directory | **REPLICATE** | Name, photo, bio, level, contributions |
| **Online/active presence ("who's online")** | **REPLICATE (P0 lite / P2 full)** | P0: poll/heartbeat "who's online" (no websockets, reuses `Member.presence`). P2: full realtime over websockets. Resolved 2026-06-18, BC#9985688722 |
| Direct messages (1:1) | **REPLICATE** | Peer chat |
| **Gamification: points → levels → leaderboards** | **REPLICATE (points+levels P0 / leaderboards P1)** | Skool's killer feature. Personal points + level progression ship at launch (P0); 7/30/all-time leaderboards in P1. Resolved 2026-06-18, BC#9985704174 |
| Level-gated unlockable content | **REPLICATE (P1)** | Unlock weeks/labs/bonuses at levels. P1 — couples to the just-in-time curriculum drip. Resolved 2026-06-18, BC#9985704174 |
| Custom level names | **REPLICATE** | Themed to "Architect" levels |
| Classroom: modules → lessons → video | **REUSE/REPLICATE** | We have portal curriculum; align to module/lesson |
| Native video + transcripts | **REPLICATE/LINK** | NotebookLM videos + course video |
| Drip / content scheduling | **REPLICATE** | Unlock weeks on cohort cadence |
| Calendar / events + reminders | **REPLICATE/REUSE** | Mon/Thu sessions, Open Houses; local-tz display |
| Notifications (in-app/email/push) + digest | **REPLICATE** | Multi-channel |
| Membership / paywall / tiers / trials | **REUSE** | We already do multi-tenant + paid projects |
| Admin / moderation / roles / approval | **REPLICATE** | Roles, approve members, moderate |
| Mobile app | **SKIP (v1)** | Responsive web first; native app later |
| About/landing page + discovery | **REUSE** | Marketing site + portal |
| **Killer features to nail:** gamification, community+classroom-in-one, native payments, simplicity | **REPLICATE** | These are *why* people use Skool |

### 6.B - BASECAMP (project / list / task model)  → REPLICATE natively for students

Replicate the **Project → To-do List → To-do (→ optional Subtask)** hierarchy with
groups, assignees, due dates, notify-when-done, comments, completion.

| Basecamp feature | Build decision | Notes |
|---|---|---|
| Projects (workspace, membership boundary) | **REUSE** | `Project.ts` multi-tenant; each student project |
| Per-project tool toggles | **SKIP (v1)** | Students get a fixed toolset |
| Project templates | **REPLICATE** | Project-DNA templates per industry |
| To-do lists (title, description, progress pie) | **REUSE/REPLICATE** | Map to RequirementsMap clusters |
| **Groups within a list** | **REUSE** | We just built `createTodoGroup`; mirror natively |
| To-dos (title, notes, assignee, due, complete) | **REUSE/REPLICATE** | Native student tasks |
| Subtasks (independently assignable) | **REPLICATE** | Shallow second level |
| Notify-when-done subscribers | **REPLICATE** | Mentor/peer notification |
| Comments + attachments on tasks | **REPLICATE** | |
| Recurring to-dos | **SKIP (v1)** | Not needed for students |
| Card Table (kanban: Triage→In Progress→Done) | **REPLICATE** | Student build board |
| Message board (posts + categories + boosts) | **REPLICATE** | Folds into community feed (6.A) |
| Campfire (group chat) + Pings (DM) | **REPLICATE** | Folds into community chat/DM (6.A) |
| Schedule / calendar + due-date sync | **REPLICATE/REUSE** | Folds into calendar (6.A) |
| Docs & Files (vault) | **REPLICATE** | Project docs + portfolio artifacts |
| **Hill Charts** (uphill/downhill progress) | **REPLICATE (P1/P2)** | Great "are we actually on track" signal for projects |
| Automatic Check-ins | **REPLICATE (P1)** | Daily/weekly async standup per student |
| **My Stuff / My Assignments / "Do Today"** | **REUSE** | This IS the student CB-System / CoryHome queue |
| Hey! menu + Work-Can-Wait + notifications | **REPLICATE** | Calm notification model |
| Reports (overdue, upcoming, who's-on-what) | **REUSE** | Mentor/admin dashboards |
| Client access / permissions / roles | **REUSE** | Multi-tenant roles |
| Search, @mentions, boosts, keyboard nav | **REPLICATE** | |
| **Killer features to nail:** all-in-one hub, to-dos with assignees+due+notify, Hill Charts, Check-ins, calm notifications | **REPLICATE** | |

> **Decision (confirmed earlier):** students live in our **portal-native** project/task
> system, not per-seat Basecamp. Basecamp stays the internal team/PMO surface.

### 6.C - ANTHROPIC (Skilljar LMS + courses)  → LINK + wrap

| Anthropic / Skilljar feature | Build decision | Notes |
|---|---|---|
| Course catalog + course player | **LINK** | Deep-link/SSO/embed Skilljar (Kes to confirm method) |
| The 5 priority courses + agent-skills/MCP-advanced | **LINK** | See Appendix A mapping |
| Progress tracking | **LINK + MIRROR** | Pull Skilljar progress into our portal dashboard |
| Quizzes / assessments | **REPLICATE** | Our 5-q warmup + 10-q post quiz wrap each course |
| Completion certificates | **LINK** | Plus our internal readiness score |
| **CCA-F certification** (Week 12) | **LINK** | claudecertifications.com exam |
| SSO / enrollment | **LINK** | Confirm Skilljar SSO/Partner access |
| Companion Course wrapper (pre/during/post) | **REPLICATE** | Objectives + vocab + warmup → coach → lab + quiz + reflection + **AI mock interview** + artifact |
| **AI Mock Interview** (per section) | **REPLICATE (P0)** | AI asks section-scoped questions → deterministic rubric score → emailed results. Launch-min typed; voice P1. Folded into base program 2026-06-26 |
| **AI Video Critiquer** | **REPLICATE (P0)** | Record demo/interview answer → AI delivery feedback (transcript+audio) → portfolio artifact. Visual body-language analysis P1. Folded into base program 2026-06-26 |

### 6.D - OUR CURRENT SYSTEM  → REUSE (the foundation)

| Capability | Status | File(s) |
|---|---|---|
| Multi-tenant per-student projects | **REUSE** | `Project.ts`, `projectService.ts` |
| Project-DNA advisor wizard | **REUSE/EXTEND** | `ProjectDnaWizard.tsx` (extend to 10-Q) |
| Requirements 4-state (UNMAPPED→…→VERIFIED) | **REUSE** | `RequirementsMap.ts`, `requirementsEngine.ts` |
| GitHub sync (repo → requirement evidence) | **REUSE** | `githubService.ts`, `GitHubConnection.ts` |
| Live preview stacks | **REUSE** | `PreviewStack.ts`, `{slug}.preview.colaberry.ai` |
| Portfolio + readiness score | **REUSE/EXTEND** | `portfolioGenerationService.ts` |
| Student home / next-action queue | **REUSE/EXTEND** | `CoryHome.tsx` |
| CB-System ops engine (priority/approval/Run-My-Day/skills/automation/metrics) | **REUSE/ADAPT** | `services/ops/*`, `AiOpsCommandCenter.tsx` |
| Advisor idea→requirements brain (MCP-free) | **PORT** | advisor repo `requirements_writer.py` etc. |
| Build-log → social drafter | **BUILD** | spec'd in TRAINING_INTEGRATION_PLAN §3.7 |

**Net new (gaps to build):** native community + gamification + presence (6.A), the
idea→10Q→requirements port (5/6.C), the student CB-System adaptation (6.B/6.D), and the
Skilljar link/mirror (6.C).

---

## 7. Unified data model (entities Kes will need)

```
Enrollment (student in a cohort)
 └── Project (Project DNA, stage, github_repo, preview_stack, readiness_score)
      ├── Requirement (4-state: unmatched→matched→partial→verified, github evidence)
      ├── TaskList  (≈ Basecamp list / requirement cluster)
      │    └── Task (title, assignee=student, due, status, comments, subtasks)   ← student CB-System
      ├── Artifact (Tier A build | Tier B showcase: type, url, status, portfolio_slot)
      └── BuildLog (weekly; feeds social drafter + community feed)
Community
 ├── Post (author, body, media, category, pinned)  ← feed
 │    └── Comment → Reply ; Like (→ points)
 ├── Member (profile, level, points, presence)      ← gamification + who's-online
 ├── DirectMessage / Chat
 ├── Leaderboard (7d / 30d / all-time)
 └── Event (calendar; Mon/Thu sessions, open houses)
LMS
 └── CourseLink (week → Skilljar course URL/SSO) ; Quiz ; Survey ; Progress(mirrored)
```

---

## 8. Phased build plan to 2026-07-27 (and beyond)

**P0 - launch-critical (by 7/27):**
- Wire the end-to-end project-builder: ProjectDnaWizard → idea + 10-Q → requirements → native student tasks → GitHub connect (port advisor brain; reuse existing pieces).
- Student CB-System Phase 1 (Run My Day + approval workspace + next-action prompt) on `CoryHome`.
- Skilljar link/SSO wired per week + progress mirror; quizzes/surveys loaded.
- Portfolio Tier-A/B slots; build-log social drafter.
- Community v1: feed + threaded comments + categories + basic profiles + lite presence ("who's online", poll/heartbeat - no websockets; reuses `Member.presence`). *(Full realtime presence + peer chat stay P2.)*
- Gamification (lite): points + personal level progression (deterministic tally over feed/like/comment/build-log events; `Member.points`/`level` already in the §7 data model). *(Leaderboards + level-gated unlocks stay P1.)*
- **AI career features (launch-min, folded into base program 2026-06-26):** per-section **AI Mock Interview** (AI asks section-scoped questions → deterministic rubric → emailed results; typed at launch, voice P1) and **AI Video Critiquer** (record → transcript+audio delivery feedback → portfolio artifact; visual body-language analysis P1). *Gated on Kes build-capacity sign-off; if tight, AI Interview ships P0 and the Video Critiquer fast-follows.* (Paid "Job Edition" upgrade — live mentorship, job-submission, per-interview prep — PARKED; revisit post-launch with TWC posture confirmed.)*
- Intensive 1 (Weeks 1-3) content fully built (already scheduled due 6/19).

**P1 - Weeks 1-6 (during cohort):**
- Gamification (full): leaderboards (7/30/all-time) + level-gated unlocks. *(Points + personal levels already shipped in P0 — BC#9985704174.)*
- NotebookLM videos + assessment packs week-by-week.
- Hill Charts + Automatic Check-ins; portfolio polish.

**P2 - post-cohort / v1.1:**
- **Full realtime presence + peer chat** (websocket layer - the long pole). *(Lite poll-based "who's online" already ships in P0 - BC#9985688722.)*
- Per-industry communities, reactions, mobile.

---

## 9. Design workstream for Aleem (we do NOT know what it looks like yet)

The platform's look is undefined - these are **design tasks, owned by Aleem, that gate
build.** Each produces an approved mockup (Aleem + Ali) before Kes builds the surface.

1. **Student home / "Command Center" dashboard** - Today's One Priority + queue + readiness score + week status + build-log feed. (The most important screen.)
2. **Project builder flow** - the add-project → idea → 10-question → requirements → tasks wizard UI.
3. **Community feed + post composer** - Skool-style feed, categories, post card, comment thread.
4. **Member profile + leaderboard + level badge** - gamification visual language ("Architect" levels).
5. **Classroom / week view** - course (Skilljar) + lab + quiz + NotebookLM video in one week page. **APPROVED 2026-06-26 (Ali); mockup `mockups/classroom-week-view.html`.** Two bands: **Content** (course/video/readings) open across all sections; **Activities** (warm-up → lab → record+critique → post-quiz/survey → AI interview → done) reveal once the student starts + completes ≥1 activity. AI Mock Interview + AI Video Critiquer are activity steps (folded into base program, §12 #6). **Visibility gates the timeline:** items not visible on the week page are NOT emitted to the student's main timeline — single `visible`/`revealed_at` flag per `(enrollment_id, section, item)` is the source of truth for both the week page and the timeline.
6. **Portfolio page** - Tier-A build artifacts + Tier-B showcase artifacts, public shareable.
7. **Live preview embed** - how the running student app appears in-portal.
8. **Presence / who's-online + chat UI** (P2).
9. **Design system extension** - tokens/components for community + gamification, on top of the existing baseline-ui system (enterprise executive tone: clean, calm, authoritative).

Deliverable per task: Figma/mockup → Aleem + Ali approval → handoff to Kes.

---

## 10. Basecamp task breakdown for Kes (ready to create)

Create these as a **"Student Platform" project (or a list on the AI Systems list,
Basecamp 9946469022)**. Suggested groups = the epics below; todos = the bullets. Assign
Kes (build), Aleem (design), CB (drafts), Swati (curriculum content). Set due dates
**ahead of 7/27** for P0 items.

**EPIC 1 - Project Builder (port advisor brain) [Kes + CB]**
- [ ] Port idea-intake + 10-question enhancement into a portal service (Claude-targeted, not OpenAI)
- [ ] Wire ProjectDnaWizard → idea → 10-Q → requirementsGenerationService
- [ ] Generate requirements doc + create native student TaskList/Tasks from requirements
- [ ] GitHub connect step + ingest loop (push → requirement VERIFIED)
- [ ] Design approval: project builder flow (Aleem) ← blocks build

**EPIC 2 - Student CB-System [Kes]**
- [ ] `StudentTask` model + `studentOpsRoutes` adapted from `services/ops/*`
- [ ] Priority engine + approval workspace + Run My Day on `CoryHome`
- [ ] Per-task Claude Code prompt generator (strip Basecamp tools, add project/GitHub resources)
- [ ] Design approval: student command center (Aleem) ← blocks build

**EPIC 3 - Anthropic / LMS link [Kes]**
- [ ] Decide + implement Skilljar delivery (deep-link / SSO / embed) on enterprise.colaberry.com
- [ ] Per-week course wiring (Appendix A) + progress mirror into portal
- [ ] Quiz (5-q + 10-q) + survey engine per week (content from Swati/CB)
- [ ] **P0 (launch-min):** AI Mock Interview per section — AI asks rubric-scored questions, emails results (typed v1; voice P1). Folded into base program 2026-06-26 [Kes + CB]
- [ ] CCA-F cert link (Week 12)

**EPIC 4 - Community + Gamification (the Skool layer) [Kes + Aleem]**
- [ ] Data model: Post/Comment/Like/Member/Leaderboard/Event (Section 7)
- [ ] Feed + composer + categories + pinned + @mentions
- [ ] Threaded comments + likes; profiles + directory
- [ ] **P0:** Gamification lite — points + personal level progression (deterministic tally; `Member.points`/`level`) — BC#9985704174
- [ ] **P1:** Gamification full — leaderboards (7/30/all-time) + level-gated unlocks — BC#9985704174
- [ ] Calendar/events + notifications (in-app/email) + digest
- [ ] Build-log → social drafter (#Colaberry stream)
- [ ] **P0:** lite heartbeat presence ("who's online", poll-based, no websockets - reuses `Member.presence`) - due 2026-07-09 (BC#9985688722)
- [ ] **P2:** full realtime presence + peer chat (websocket layer)
- [ ] Design approval: feed, profile/leaderboard, classroom, portfolio (Aleem) ← blocks build

**EPIC 5 - Portfolio + Artifacts [Kes + CB]**
- [ ] Tier-A build-artifact slots (per 12-week Lego model)
- [ ] Tier-B showcase-artifact slots (demo/explainer/podcast/PPT/infographic) + AI drafting
- [ ] **P0 (launch-min):** AI Video Critiquer — record → transcript+audio delivery feedback → portfolio artifact (visual analysis P1). Folded into base program 2026-06-26 [Kes + CB]
- [ ] Public shareable portfolio + readiness score wiring

**EPIC 6 - Curriculum content [Swati + CB]** (already tracked on the Curriculum list)
- [ ] Per the 12-week × 5-item checklist already live in Basecamp (Section 3)

---

## 11. Rules & guardrails (every task must adhere - from CLAUDE.md)

- **Idempotency & replayability** - every script/worker/webhook is safe to run twice; side effects gated by idempotency keys (the curriculum script is the reference pattern).
- **Failure-first design** - timeouts, capped retries + backoff (see the Basecamp 429 backoff we just shipped), circuit breakers, fallbacks, dead-letter on external boundaries.
- **Contract enforcement** - TS types mandatory; Zod on inbound routes; `tsc --noEmit` green before merge.
- **Test pyramid** - ~70% unit / 20% integration / 10% E2E; every feature ships happy + failure + boundary + idempotency tests.
- **Determinism** - business logic is deterministic; LLM is for reason/draft, never the runtime executor (scores/gates are pure functions).
- **Security** - validate all untrusted input; no secrets in code/logs; auth on every protected route; per-student data isolation.
- **Observability** - structured JSON logs, correlation IDs, per-job metrics.
- **Modular composition** - files ≤500 lines, functions ≤100; one responsibility per module.
- **PROGRESS.md gate** - every code change logged with verification evidence.

---

## 12. Open decisions (Ali to resolve when back)

1. **Week 4 (Prompt Engineering)** — **RESOLVED 2026-06-18 (BC#9985688677, Ali): build Colaberry-original (lean).** No Anthropic *Skilljar* course exists for prompt engineering, but Anthropic publishes free *public* PE material (interactive Prompt Engineering tutorial + the docs PE guide) that is **not** a Skilljar course; curate that as the read/watch layer (Claude 101 as foundation only) and build an original Colaberry lab — the **Enterprise Prompt Library** Tier-A artifact layered onto the student's own project + the system / Claude-Code prompts that drive their build loop. **Rejected:** *fold into Week 3* (Week 3 is in Intensive 1, Week 4 opens Intensive 2 — folding breaks the clean 4×3-week TWC seminar-independence frame and forces renumbering 60 live BC todos for negative value) and *point at Claude 101* (already the pre-program Foundations course — re-serves consumed content, teaches no PE depth, yields no differentiated artifact, and would strip Week 4 out of the four Colaberry-original differentiator weeks 4/9/10/11). Curriculum source of truth updated: `scripts/lib/curriculumWeeks.js` W4 + `seeds/seedCurriculumCourseLinks.ts` (already `colaberry_original`/`not_applicable`). Lab + assessment build tracked on the Curriculum list (Intensive 2, due 2026-06-26).
2. **Skilljar delivery method** - deep-link vs SSO vs embed vs Partner content (Kes to scope; gates Epic 3).
3. **Presence at launch?** - **RESOLVED 2026-06-18 (BC#9985688722, Ali):** lite poll-based "who's online" ships in **P0**; full websocket realtime presence + peer chat deferred to **P2**.
4. **Gamification depth at launch** — **RESOLVED 2026-06-18 (BC#9985704174, Ali):** thin slice ships in **P0** — points + personal level progression (deterministic tally over feed/like/comment/build-log events; `Member.points`/`level` already in the §7 P0 data model). **Leaderboards (7/30/all-time) + level-gated unlocks stay P1.** Rationale: points are already a P0 dependency (likes→points→readiness), so the thin slice is near-free and delivers Skool's day-one personal-progress hook; a leaderboard is an empty board on Day 1 of a 25-student cohort (negative signal) and level-gated unlocks couple to the JIT curriculum (launch risk). Matches presence (BC#9985688722) + community (BC#9985688801) phasing. Build-capacity sign-off pending from Kes; level-badge visual from Aleem.
5. **Community: native vs interim Skool** - **RE-CONFIRMED native (launch-min) 2026-06-18 (Ali, BC#9985688801).** Launch-min = async build-log feed + threaded comments + categories + basic profiles + lite poll-based presence (reuses `Member.presence`); full websocket realtime presence + peer chat stay P2 (BC#9985688722). Interim Skool rejected: it breaks the one-synced-system thesis (build-log→feed, likes→points→readiness, never-leave-platform) and forces a throw-away migration of the 25-student Founding Cohort. Build-capacity sign-off pending from Kes (System Approval).
6. **AI career features at launch** — **RESOLVED 2026-06-26 (Ali): fold the two scalable AI features into the base program (launch-min); PARK the paid upgrade.** In P0: (a) **AI Mock Interview** — per-section AI interviewer asks rubric-scored questions and emails results (typed at launch, voice P1); (b) **AI Video Critiquer** — record a demo/answer, get AI delivery feedback (transcript+audio at launch, visual body-language P1), clip files to portfolio. Both are scalable, near-zero-marginal-cost, and on-brand (an AI program using AI to make students interview-ready). **Parked** to a later paid "Job Edition" upgrade: live mentorship, job-submission services, per-interview prep + tracking — these are staff-hours (margin/capacity) and, for job-submission/placement, change the **TWC career-services regulatory surface**; parking them keeps the launch a "learn + get interview-ready" product with no new compliance gate before 7/27. **Gate:** Kes build-capacity sign-off (does launch-min fit by 7/13/7/27 alongside existing P0); fallback if tight = ship AI Interview in P0, fast-follow the Video Critiquer. Upgrade pricing deferred with the tier ($199 annual must be a discount or carry extra value vs the $149 base; Job-Edition human-services need usage caps or a higher price). Design folded into the Classroom/Week-view mockup (§9 #5, BC#9985688999, pending Ali approval); spec amended here (§6.C, §8 P0, Epic 3 + Epic 5).

---

## Appendix A - Week → Anthropic Skilljar course map

| Week | Theme | Anthropic Skilljar course | Type |
|---|---|---|---|
| 1 | Claude Code Foundations | Claude Code 101 (+ Claude Code in Action) | linked |
| 2 | Agent Skills | Introduction to agent skills | linked |
| 3 | Claude API + Workflow Assistant | Building with the Claude API | linked |
| 4 | Prompt Engineering | Colaberry-original — build original (BC#9985688677); bg: Anthropic public PE tutorial/docs | original |
| 5 | MCP Foundations | Introduction to Model Context Protocol | linked |
| 6 | Advanced MCP | Model Context Protocol: Advanced Topics | linked |
| 7 | Subagents + Multi-Agent Team | Introduction to subagents | linked |
| 8 | Workflows + Automation | Claude Code in Action (workflows) | linked |
| 9 | Reliability | - Colaberry-original | original |
| 10 | Governance | - Colaberry-original | original |
| 11 | Systems Architecture | - Colaberry-original | original |
| 12 | Capstone + Expo | Claude Certified Architect - Foundations (CCA-F) | cert |
| Pre | Foundations | Claude 101 + Claude Platform 101 | linked |

Skilljar base: `https://anthropic.skilljar.com`. CCA-F: `https://claudecertifications.com/claude-certified-architect/exam-guide`.

## Appendix B - Source documents
- `STUDENT_PLATFORM_STRATEGY.md` (the convergence strategy)
- `TRAINING_INTEGRATION_PLAN.md` (build-log engine §3.7, companion-course wrapper §3.2)
- `launch-briefs/11-swati-curriculum-twc.md` (week themes), `TWC_INTENSIVE_OUTCOMES.md`
- Curriculum scripts: `backend/src/scripts/reconfigureCurriculumList.js`, `lib/curriculumWeeks.js`
