# Student Onboarding Experience — Phase 1 Plan

**Owner:** Ali Muwwakkil · **Session:** CC-20260701-k2p9 · **Branch:** `workstream/onboarding-experience` (off `main` @ b909f70a)

Goal: connect the moving parts into one onboarding journey. A visitor creates a **free account**, logs in, and gets a **sample of the platform** with **0 points** (earning minimal points via engagement like open-house attendance). During onboarding they load a **LinkedIn/resume** so the **ProjectDnaWizard runs in the background** and personalizes their project. Enrolled members land on the full platform (the "Design E" experience).

Login: `https://enterprise.colaberry.ai/portal/login`.

---

## Current state (verified on `main`)

**Already connected & live:**
- Magic-link auth: `/portal/login` → 24h token → 7-day JWT (`sub = enrollment.id`, `role=participant`). Enrollment IS the student identity (`participantService.ts`, `participantAuth.ts`).
- **Kes's Epic 1 engine (canonical):** `ProjectDnaWizard` (4-step) → `POST /api/portal/project-dna` → `startRequirementsGeneration` (GPT writes a 16-section spec) → `studentTaskService.createTasksFromRequirements` groups requirements by cluster into `StudentTaskList` + `StudentTask`.
- Rich portal already wired: Today (`CoryHome`), Curriculum, Sessions (class data via `LiveSession`), Assignments, Progress, Project Builder, Portfolio.
- Colaberry design tokens already in `frontend/src/colaberry/` (cherry/leaf/berry, Roboto/Quicksand). Design E is a re-skin, not a rebuild.
- PaySimple payment (hosted checkout + webhook). Cohort `start_date`/`core_time` → countdown data available.

**Missing (the onboarding gap):**
1. **No free / non-member tier.** Portal is gated behind payment + admin flipping `portal_enabled`. No `tier` field, no self-serve free account.
2. **Onboarding is project-centric, not student-centric** — no first-run flow tying the parts together.
3. **No resume/LinkedIn ingestion** → no background pre-fill of ProjectDna. Wizard is a blocking 4-step form; state lost on navigate-away (no draft persistence).
4. **Broken link in DNA→tasks:** the generated spec has no requirement *keys*, so nothing parses it into `RequirementsMap` rows. Highest-leverage fix.
5. **Points are scaffolding** (`LeaderboardScore` model + page exist; nothing writes points; no ledger).
6. **No real multi-tenancy** (`company`/`organization_name` are free-text; `AiCompany` disconnected).

---

## Collision resolution — MERGE into one task model (decided 2026-07-01)

Kes's `student_tasks` (task-list model) is live and canonical. The earlier story-driven build-sync (PR #121) defines a *different* schema on the same table. Resolution: **unify into one `StudentTask` model built on Kes's canonical one**, adding the story-driven fields (`narrative`, gherkin `acceptance`, `owner_agent`, `execution_mode`, `vibe`, `trust`, `fulfills`, optional sprint grouping) as **nullable** columns. PR #121 is refactored to write into the unified model rather than a second table; the standalone `StudentSprint`/duplicate `StudentTask` are retired. Tracked as **Foundation slice F**.

---

## Phase 1 slices (each ships with tests + tsc + a PROGRESS.md entry)

- **S1 — Free tier + self-serve signup (backend).** Add `Enrollment.tier` (`guest` | `member`, default `member`). `POST /api/portal/free-signup` (public): idempotent-by-email create of a `guest` enrollment (`portal_enabled=true`, no payment, no cohort), issues a participant JWT immediately so they land in the app. Tests: idempotent create, tier=guest, portal enabled, token verifies. *(this commit)*
- **S2 — Points ledger + minimal earn events (backend).** `student_points_events` table + `pointsService.award(enrollmentId, event, points)` (idempotent per `(enrollment_id, event_key)`). Seed events: `account_created` (0), `profile_completed`, `open_house_rsvp`, `open_house_attended`. `GET /api/portal/points` returns total + history. Guests start at 0.
- **S3 — Open house + countdown surface (backend + Today).** Endpoint returning next open house (from cohort/event data) + countdown to first class from `Cohort.start_date`/`core_time`. RSVP endpoint that awards `open_house_rsvp` points. Wire into the Today page.
- **S4 — Resume/LinkedIn ingest → background ProjectDna pre-fill.** Upload endpoint (resume file / LinkedIn URL) → LLM parse → pre-fill `ProjectDna` + `variableService` variables. Add ProjectDna **draft/partial-step persistence** so the wizard runs progressively in the background instead of as a blocking form.
- **S5 — Requirement-key parser (the broken link).** New service: parse the generated 16-section spec into keyed `RequirementsMap` rows (FR-###/NFR-###/ARCH-### by section), so `createTasksFromRequirements` completes end-to-end from the wizard.
- **S6 — Student-centric onboarding flow (frontend).** First-run experience after free signup: welcome → resume/LinkedIn → sees the platform preview with open house + countdown + first points. Guests see a gated "sample"; members see the full Design E platform.
- **F — Unified task model** (foundation for the merge; sequence before S5's tasks depend on story fields, else independent).

## Later phases (explicitly deferred)
- In-app embedded payment (PaySimple embed / card form) — payment-compliance scope.
- Real Organization/multi-tenancy model + `1st-project-free` enforcement.
- Design E net-new sections: Schedule (calendar), Cert Prep (MCQ), Community, Group Chat.
- Points depth (levels, streaks, badges).

---

## Guardrails
- Build on `main` via this worktree; PR into `main` (CI: 1 review + 4 checks). No prod deploy without after-hours + Ali's go.
- Schema changes via idempotent `ensureXxxSchema()` raw SQL in `server.ts` (repo has no migration runner) + the Sequelize model field.
- Every side-effecting endpoint idempotent (dedup keys). Free-signup deduped by email.
- No secrets; Zod-validate all inbound; `tsc --noEmit` + jest gate each slice.
