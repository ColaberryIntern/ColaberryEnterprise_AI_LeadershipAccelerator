# Brief: Kes — AI Systems

**You are:** Kes Delele, AI Systems Architect. You own `enterprise.colaberry.ai` (the student platform + ops console), plus every AI agent that ships into prod. CB User is your execution arm — Claude Code drives all the AI-tier tasks; you architect, review, approve, deploy.

---

## Read first

- `00-program-overview.md`
- `02-launch-timeline-41d.md`
- `04-decisions-locked.md` (A6 in particular — OpenAI for v1, swap to Claude when API key plumbed)
- `05-cb-pmo-contract.md`

---

## Your scope at launch (2026-07-10)

### `enterprise.colaberry.ai` platform

This is the engine. It does:
- **Student platform** — learning experience, assignments, progress, portfolio
- **Student CRM** — cohort + lifecycle + retention + subscription tracking
- **Community** — Skool-style in-platform community (MVP at launch, expanded v1.1)
- **Certification preparation** — Anthropic CCA-F + Colaberry per-module
- **Incubator** — post-grad project marketplace + ongoing AI agent ecosystem
- **Operations console** — what your team uses to run the program (this is *your* tool, separate UI from the student tool)

### The 6 AI agents (4 ship at launch)

| Agent | Status | Pattern | Notes |
|---|---|---|---|
| **Mentor Agent** | LAUNCH | OpenAI fn-call, reviews submissions, gives feedback | **MUST have human-review queue from day 1** — Ali insists |
| **Portfolio Agent** | LAUNCH | Daily cron, monitors GitHub + assessment progress, updates readiness score | Reuses `dailyInternNudges` engine pattern |
| **Architect Agent** | LAUNCH | Weekly cron, evaluates project, suggests next artifacts | |
| **SuccessCoach Agent** | LAUNCH | Attendance / progress / completion / nudges. 3 updates/week target. | Reuses `dailyInternNudges` engine. Different bar from interns. |
| **Curriculum Agent** | DEFERRED v1.1 | Wraps Anthropic Intelligence L1–3 | Anthropic watcher ships at launch but doesn't expose agent-level interface until v1.1 |
| **Community Agent** | DEFERRED v1.1 | Welcomes users, answers questions | Not blocking launch |

### Anthropic Intelligence Layer (L1–L3 launch)

| Level | What | Status |
|---|---|---|
| L1 | `Anthropic_ContentRegistry` table + nightly cron checking course / docs / news / partner-portal URLs | LAUNCH (Week 2 = 2026-06-20) |
| L2 | Change Detection Engine — nightly diff, writes to `anthropic_change_events` table | LAUNCH (Week 3 = 2026-06-27) |
| L3 | AI Curriculum Impact Agent — gpt-4o-mini severity scoring, emails Ali on severity 7+ | LAUNCH (Week 3 = 2026-06-27) |
| L4–L7 | Strategic Opportunity / Anthropic Alignment Dashboard / Cert Blueprint Monitoring / Steering Committee | DEFERRED v1.1 |

### Project Builder + Project DNA wizard

Heart of the student experience. Captures the student's project Week 1 and drives every subsequent week's personalized lab.

- **Lands at:** `frontend/src/pages/portal/ProjectBuilder*.tsx` (exists) + new `ProjectDnaWizard.tsx`. Backend: `backend/src/services/projectDnaService.ts` writing to new `project_dna` table.
- **Captures:** Business (problem / who uses / industry / internal vs external / revenue vs operational). Technical (web / agent / workflow / mobile / dashboard / data sources). AI (Claude / MCP / Agents / RAG / Workflows). Industry track.
- **Emits:** A `project_dna` record that drives every subsequent week's personalized lab recommendation.
- **Owner:** You for `project_dna` writer. Tejesh has the wizard UI. **ETA: end of Week 2, 2026-06-20.**

### Anthropic Companion Course wrapper

Wraps every Anthropic Skilljar course with pre/during/post Colaberry context.

- **Pre:** Learning objectives + Vocabulary + Warmup assessment (5 questions)
- **During:** Progress tracker + AI Coach (slide into existing `@CB` handler pattern as new "course coach" tool)
- **After:** Colaberry lab + 10-question quiz + reflection + portfolio artifact generation
- **DB new:** `AnthropicCourses`, `AnthropicLessons`, `StudentAnthropicProgress`, `ColaberryLabs`, `ColaberryCapstones`
- **ETA: end of Week 3, 2026-06-27.** Wraps the 5 priority courses (Claude 101, Claude Code 101, Intro to MCP, Intro to Subagents, Claude API).

### GitHub integration

- **Lands at:** `backend/src/services/githubIntegrationService.ts` (new). OAuth flow + webhook receiver.
- **Captures:** Repo creation, commits/day, PRs, stars, contribution graph. Writes to new `student_github_activity` table.
- **Feeds:** Portfolio Agent + the AI Architect Readiness Score.
- **ETA: end of Week 2, 2026-06-20.**

### Architect Portfolio Dashboard

Replaces the generic portal home for enrolled students.

- **Lands at:** `frontend/src/pages/portal/ArchitectDashboard.tsx`. Backend: `backend/src/routes/portal/architectRoutes.ts`.
- **Components:** AI Architect Readiness Score / GitHub activity / Anthropic Skilljar progress / Colaberry lab progress / Current week's artifacts / Build Log feed / Project Story.
- **ETA: end of Week 3, 2026-06-27.**

### CCPP integration (student progress + cert tracking)

- **New tables in CCPP:** `ADF_AISystemsArchitect_Cohort`, `ADF_AISystemsArchitect_StudentProgress`, `ADF_AISystemsArchitect_Certifications`. Sequelize models in `backend/src/models/`.
- **Why CCPP:** source of truth for all Colaberry school enrollments.
- **ETA: schema by end of Week 1 (2026-06-13), sync flow by end of Week 2 (2026-06-20).**

### Voice AI + Cora + GHL rebuild

Per Ali's 2026-05-31 directive, by 2026-06-21 (3 weeks out) you have all of:
- **Voice AI on 972-992-1024** trained on the new program (intensives, pricing, schedule, common Q&A)
- **Cora (inbox AI at support@colaberry.com)** retrained on the new class
- **GHL workflows** rebuilt for the new enrollment + onboarding sequences

### Capacity analysis (this week)

**By 2026-06-06 (Friday):** how many concurrent projects can the platform manage in its current state? What N starts to break? This informs the Cohort 1 size cap (currently 25 — see A5).

---

## How to drive your area in Claude Code

1. **Open `enterprise.colaberry.ai` codebase + this brief** in Claude Code.
2. **Pick a todo from the AI Systems list** in Basecamp (https://3.basecamp.com/3945211/projects/47502609).
3. **Ask Claude:** "Here's the brief. Here's the todo: [paste]. Generate the implementation plan, then start the code."
4. **CB User executes** all AI-tier tasks autonomously when you've architected the design. You review + approve.
5. **Tag `@Kes` when CB needs your architectural call.** Tag `@Ali` only for strategic/budget decisions.

---

## Approvals you own (with Ali)

System Approval is you + Ali. Anything CB ships that touches prod platform code goes through your review queue.

---

## Where to find more

- Full architecture per component: `docs/training-program-2026-q3/TRAINING_INTEGRATION_PLAN.md` Sections 3.1–3.6
- Anthropic course list (5 priority): see Appendix B of the integration plan
- Existing `@CB` handler pattern: `scripts/ops-engine/cb-system-handler.js`
- Existing nudge engine pattern: `backend/src/scripts/dailyInternNudges*.js`
- `dailyInternNudges` is the template for SuccessCoachAgent.

**Source:** TRAINING_INTEGRATION_PLAN.md Sections 3.1–3.6, 3.13; ASSUMPTIONS_LOG A6; Ali's 2026-05-31 directives.
