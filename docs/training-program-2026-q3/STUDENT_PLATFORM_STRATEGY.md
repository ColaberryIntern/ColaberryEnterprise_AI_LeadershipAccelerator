# Student Platform Strategy - AI Systems Architect Accelerator

**Date:** 2026-06-10 · **Session:** CC-20260610-q4d7 · **Author:** Claude Code (for Ali)
**Status:** Strategy locked, build sequencing proposed. Owners: Kes (platform), Swati (curriculum), Ali (approval).
**Launch:** Cohort 1 kickoff **2026-07-13** (~4.5 weeks out).

---

## Executive summary

The student-facing vision - an advisor-like project builder, per-student project/list/task workspace,
GitHub sync, a portfolio of artifacts, and an interactive Skool-like community - is **~70% already built or
specced**, spread across two repos and the training-program docs. The strategic problem is **convergence,
not greenfield construction**: unify what exists into one synced student journey, build the student version of
the CB-System operating model, and close ~3 real gaps before 2026-07-13.

**Core architectural decision:** Build everything **native in the Accelerator** (Node/TS, Postgres,
multi-tenant, preview stacks, GitHub, portfolio) and **port the advisor's "brain"** (idea enhancement +
requirements generation + quality gates) into it. Do **not** fork the Python advisor repo (single-tenant,
JSON-file, anonymous, OpenAI-based) and do **not** stand students up on per-seat Basecamp.

### Decisions locked (2026-06-10)

1. **Community = native v1.** All components sync in one system (project, tasks, artifacts, build-log,
   community feed). Not Skool. Rationale: Ali wants every component synced together and tied to the
   Anthropic/Claude Code training layer.
2. **Task system = portal-native, replicating the CB-System employee experience.** Students get their own
   "project → list → task → next-action + Claude Code prompt" operating model, native in the portal. No
   per-student Basecamp, no MCP. Basecamp stays the internal team/PMO surface only.
3. **Curriculum build-tracker = lean 5-item checklist per week** (see §7).

---

## 1. Current-state asset inventory (what we reuse vs. build)

| Capability | Status | Where |
|---|---|---|
| Advisor flow: idea → DNA | **Built** | `frontend/src/pages/portal/ProjectDnaWizard.tsx` (4-step), `CoryStrategicAgent.ts` |
| idea → ~10 questions → requirements doc | **Port-able (MCP-free)** | advisor repo: `idea_intake` → `profile_generator` → `feature_discovery` → `requirements_writer.py` |
| Multi-tenant per-student projects | **Built** | `models/Project.ts`, `services/projectService.ts` (multi-project per enrollment) |
| Requirements 4-state (UNMAPPED→…→VERIFIED) | **Built** | `models/RequirementsMap.ts`, `intelligence/execution/requirementsEngine.ts` (BPOS) |
| GitHub sync (repo → requirement evidence) | **Built** | `services/githubService.ts`, `models/GitHubConnection.ts` |
| Live preview of student app | **Built** | `models/PreviewStack.ts`, preview proxy, `{slug}.preview.colaberry.ai` |
| Portfolio + readiness score | **Built** | `services/portfolioGenerationService.ts`, portal dashboard |
| Student home / next-priority queue | **Built (extend)** | `frontend/src/pages/portal/CoryHome.tsx` (Today's One Priority + top-5 queue + blockers) |
| CB-System operating model (priority, approval workspace, Run My Day, skills, automation, metrics) | **Built, lightly BC-coupled** | `services/ops/*`, `pages/admin/AiOpsCommandCenter.tsx` |
| Build-log → LinkedIn/video/social drafter | **Specced** | TRAINING_INTEGRATION_PLAN §3.7 |
| 12-week labs/artifacts catalog | **Specced** | TRAINING_PROGRAM_CRITIQUE, TWC_INTENSIVE_OUTCOMES |
| **Per-student task workspace (CB-System for students)** | **Gap (adapt ops/*)** | new `studentOps*` from `ops/*` |
| **Native community (feed, comments, presence, peer chat)** | **Gap (mostly greenfield)** | only basic chat models today; no websockets/presence/threads |
| **idea→requirements→tasks wired end-to-end in portal** | **Gap (wire existing pieces)** | connect ProjectDnaWizard → requirements → student tasks |

**Why not the Python advisor repo:** its project pipeline is anonymous, flat-namespace, JSON-file, single-worker,
OpenAI-based, and its Basecamp/GitHub/MCP machinery is an operator backbone not wired to per-project requirements.
The Accelerator is already the multi-tenant, Postgres-backed, GitHub-integrated, preview-capable base. Port the
advisor's *generation logic*, not its plumbing.

---

## 2. Target architecture - one synced student journey

```
Student starts program
   │
   ├─ Onboarding: pick Project DNA        ► ProjectDnaWizard (EXISTS; extend to 10-Q enhance)
   │
   ├─ For each project they add:
   │     1. Add project                    ► projectService.createNewProjectForEnrollment (EXISTS)
   │     2. Give raw idea                  ► idea intake (PORT from advisor)
   │     3. 10-question enhancement        ► profile/feature enhancement (PORT from advisor)
   │     4. Requirements document          ► requirementsGenerationService (EXISTS) + advisor writer
   │     5. Task list created (PORTAL)     ► RequirementsMap → student tasks (CB-System, native)
   │     6. GitHub connected               ► githubService (EXISTS) - the "no-MCP" path
   │
   ├─ Build loop: student works in Claude Code locally → pushes to GitHub
   │     → portal ingests via githubService → requirement states flip to VERIFIED
   │     → CB-System surfaces "your one next action + the Claude Code prompt for it"
   │
   ├─ Live preview at {slug}.preview.colaberry.ai (EXISTS)
   │
   ├─ Portfolio auto-assembles artifacts (EXISTS; extend artifact slots - §4)
   │
   └─ Build-log engine drafts a weekly "building in public" post → student posts w/ #Colaberry (§5)
```

The **curriculum is the spine**: each week layers one component onto the student's single Lego-model project.

---

## 3. The Student CB-System (the answer to "can we replicate the employee experience?")

**Yes.** The employee CB-System (`AiOpsCommandCenter.tsx` + `services/ops/*`) is mostly **not** Basecamp-coupled.
The student version reuses the operating model and swaps the work source from Basecamp to native student tasks.

| Employee piece | Student reuse | Effort |
|---|---|---|
| `priorityEngineService` (urgency 0-100, categories) | Reuse - scores any task record | ~2-3h |
| Approval workspace UI (Approve/Revise/Reject/Escalate + Claude Code prompt) | Reuse - generic | ~4-6h |
| Run My Day (keyboard walk, next-action sequencing) | Reuse - rank by same engine | ~3-4h |
| `OpsSkill` capture, `automationRulesService`, `metricsDailyService` | Reuse | ~3h |
| `runMyDayPromptService` (Claude Code prompt per action kind) | Adapt - strip BC tools, add project/GitHub resources | ~6-8h |
| `approvalService` (record + write-back) | Adapt - write to portal project, not BC comment | ~3-4h |
| `bcSyncService`, `basecampClient` (pull from Basecamp) | **Discard** - students create tasks natively | - |

**Net:** ~20-26h for a working Phase-1 student CB-System. Student-side differences: work source = native task
creation (Project + requirements + walk phases), assignee always the student, write-back = portal DB + progress
post, resources = project GitHub + assignment docs + curriculum (not BC Vault/Gmail), relaxed brand compliance.

`CoryHome.tsx` is the natural mount point - it already renders Today's One Priority + a top-5 queue.

**New backend surface:** `StudentTask` model + `routes/portal/studentOpsRoutes.ts` mirroring `opsRoutes.ts`
(`/my-queue`, `/run-my-day`, `/decisions`, `/metrics/today`). **New frontend:** `StudentCommandCenter.tsx`
adapted from `AiOpsCommandCenter.tsx`, or embedded as a queue widget in `CoryHome`.

---

## 4. Artifact strategy ("structure, but flexible")

Two tiers - this resolves the structure-vs-flexibility tension:

- **Tier A - Build artifacts (structured, fixed by the 12-week Lego model).** Week 1 = Architect Workspace + repo;
  Week 5 = first MCP server; Week 12 = production system. Non-negotiable slots → make portfolios comparable and
  gradeable. Already cataloged in TRAINING_PROGRAM_CRITIQUE.
- **Tier B - Showcase artifacts (flexible, student-chosen per project).** Each project gets a fixed *set of slots*
  the system scaffolds; the student fills them with whatever fits: demo video, explainer (video **or** podcast),
  one-pager/infographic, PPT, architecture doc, live-preview link, social posts. AI drafts each (build-log engine).

**Structured container, flexible contents.** Portfolio = Tier A (graded) + Tier B (promotional), per project,
feeding the AI Architect Readiness Score (0-100 across MCP / Claude Code / Architecture / Reliability / Governance).

---

## 5. Social media as a program mechanic (not a per-week build task)

The build-log engine (specced, TRAINING_INTEGRATION_PLAN §3.7) auto-drafts a weekly "building in public" post
about the student's product. It becomes a **recurring optional student assignment**: system drafts → student
posts → hashtags Colaberry. This is the "constant stream from the user's perspective" Ali wants, and it is free
marketing. It is **not** one of the per-week curriculum build tasks.

---

## 6. Native community v1 (everything synced)

Decision: build native, integrated with the portfolio/project system rather than Skool.

- **v1 launch-min:** global build-log feed (auto-posted build logs from all students) + threaded comments on
  projects/artifacts + per-cohort discussion thread. Async first.
- **v1.1:** real-time presence ("who's online"), peer chat, reactions, @-mentions, per-industry communities.
  (Presence/real-time requires a websocket layer - none exists today; this is the heaviest greenfield piece and
  is **deferred past launch** unless prioritized.)

Risk to manage: native real-time presence is multi-week work competing with launch-critical build. The honest
phasing puts **async community at launch, real-time presence post-launch** (see §8).

---

## 7. Curriculum build-tracker - lean 5-item per week

Applies to the **internal Curriculum build list**
([todolist 9946468992](https://app.basecamp.com/3945211/buckets/47502609/todolists/9946468992)) - what the team
must produce, distinct from the student-facing system. Per Ali's refinements (drop visual; Anthropic = section
mapping only; CB drafts test+survey w/ Swati approval; keep NotebookLM; social = program mechanic):

Per week (12 week-groups, ~60 todos):

1. **Anthropic section mapped** - which Skilljar course/section this week maps to (the 5 priority: Claude 101,
   Claude Code 101, Intro to MCP, Intro to Subagents, Claude API). *[Swati + Kes]*
2. **Lab + artifact spec built** - what the student builds this week + which artifacts it produces. *[Swati / CB drafts]*
3. **Assessment pack (quiz + survey)** - CB drafts, Swati approves. *[CB → Swati]*
4. **NotebookLM video** produced. *[CB / Swati]*
5. **Swati validation sign-off** (the gate). *[Swati]*

Week themes (from `launch-briefs/11-swati-curriculum-twc.md`): W1 Claude Code Foundations · W2 Agent Skills ·
W3 Claude API + Business Workflow Assistant · W4 Prompt Engineering · W5 MCP Foundations · W6 Advanced MCP ·
W7 Subagents / Multi-Agent Team · W8 Workflows / Automation · W9 Reliability · W10 Governance ·
W11 Systems Architecture · W12 Capstone + Architect Expo. Intensives: W1-3, W4-6, W7-9, W10-12.

Implementation: `reconfigureCurriculumList.js` using `lib/launchPmoOps.js` (add `createTodoGroup` + `trashTodo`),
groups-per-week, idempotent, fully scheduled (Kes on item 1, Swati on the rest; due dates build-ahead of each
week's teaching Monday from 2026-07-13).

The **student-platform build work** is a separate workstream and should be tracked on Kes's
**[AI Systems list 9946469022](https://app.basecamp.com/3945211/buckets/47502609/todolists/9946469022)**.

---

## 8. Phased plan to 2026-07-13

**P0 - Launch-critical (by 7/13)**
- Wire the end-to-end project-builder in the portal: ProjectDnaWizard → idea + 10-Q enhance → requirements →
  native student tasks → GitHub connect. (Port advisor brain; reuse existing portal pieces.)
- Student CB-System Phase 1 (Run My Day + approval workspace + next-action prompt) on `CoryHome`.
- Weeks 1-3 curriculum content fully built (Intensive 1). Weeks 4-12 built just-in-time during cohort.
- Portfolio Tier-A/B slots; build-log social drafter.
- Community: **async feed + comments** only.

**P1 - Weeks 1-6 (during cohort)**
- NotebookLM videos + assessment packs week-by-week; portfolio polish.
- CB-System skill capture + automation rules for students.

**P2 - Post-cohort / v1.1**
- Real-time presence ("who's online"), peer chat, reactions, per-industry communities.
- Consider optional mirror of student tasks to a shared cohort Basecamp (no per-seat blowup) if desired.

---

## 9. Open decisions / risks

- **Real-time presence is the long pole.** No websocket layer exists. If "see who's online" is required *at*
  launch, it displaces other P0 work - needs an explicit call.
- **LLM provider for the ported advisor brain.** Advisor generation runs on OpenAI; the program standardizes on
  Claude/Claude Code. Port should target Claude (latest Opus/Sonnet) - provider swap, not a lift.
- **Grading + cohort scale persistence.** Student projects must be DB-backed and per-student-scoped (the
  Accelerator already is; the advisor repo was not - another reason to build native).
- **Anthropic Partner course set** (4 courses for partner status) still unconfirmed (Ali has the playbook).

---

## 10. Immediate next steps

1. Reconfigure the Curriculum list to the lean 5-item × 12-week structure (`reconfigureCurriculumList.js`).
2. Open a "Student Platform" epic on Kes's AI Systems list (9946469022) with the P0 workstream from §8.
3. Spike: port the advisor idea→10-Q→requirements brain into a portal service (Claude-targeted).
4. Spike: `StudentTask` model + `studentOpsRoutes` adapted from `ops/*`.
