# Accelerator Portal — Full System Detail

This document covers every screen, flow, endpoint, model, service, and decision rule in the Accelerator Portal as of 2026-05-01. It is intentionally exhaustive: every behavior the portal exhibits is documented, including edge cases, fallbacks, fields you might not see in the UI, and the assumptions baked into the recommendation engine.

The document is organized so a critic can read top-to-bottom and find the lever they want to move at the right level of detail.

---

## Table of Contents

1. [Purpose and Mental Model](#1-purpose-and-mental-model)
2. [Architecture & Deployment](#2-architecture--deployment)
3. [Authentication: Magic Link](#3-authentication-magic-link)
4. [Onboarding: Project Setup Wizard](#4-onboarding-project-setup-wizard)
5. [The Architect (External Service)](#5-the-architect-external-service)
6. [Activation: Requirements → Capabilities](#6-activation-requirements--capabilities)
7. [Blueprint Page (Landing)](#7-blueprint-page-landing)
8. [Cory — The Recommendation Orchestrator](#8-cory--the-recommendation-orchestrator)
9. [Project Kickoff (First-Wave Build)](#9-project-kickoff-first-wave-build)
10. [System Components Grid](#10-system-components-grid)
11. [System View V2 (Per-BP Detail)](#11-system-view-v2-per-bp-detail)
12. [BP Detail Tabs](#12-bp-detail-tabs)
13. [Build Flow: Prompt → Claude Code → Validation Report](#13-build-flow-prompt--claude-code--validation-report)
14. [Validation Report Parser](#14-validation-report-parser)
15. [Per-BP Validation Apply](#15-per-bp-validation-apply)
16. [Kickoff Sync (Project-Wide)](#16-kickoff-sync-project-wide)
17. [UI Advisor & Visual Review](#17-ui-advisor--visual-review)
18. [Define Component (Unmapped Pages)](#18-define-component-unmapped-pages)
19. [Route Detection & Frontend-Route Wiring](#19-route-detection--frontend-route-wiring)
20. [Preview URL System (Iframe + Direct)](#20-preview-url-system-iframe--direct)
21. [GitHub Integration](#21-github-integration)
22. [Cory Fullscreen (Learn Mode + Build Mode Chat)](#22-cory-fullscreen-learn-mode--build-mode-chat)
23. [Mode Awareness (MVP / Production / Enterprise / Autonomous)](#23-mode-awareness-mvp--production--enterprise--autonomous)
24. [Completion Math](#24-completion-math)
25. [Layer Detection (Per-Cap vs Project-Level)](#25-layer-detection-per-cap-vs-project-level)
26. [Capability Lifecycle States](#26-capability-lifecycle-states)
27. [Database Models](#27-database-models)
28. [Backend Services Inventory](#28-backend-services-inventory)
29. [Full API Endpoint Catalog](#29-full-api-endpoint-catalog)
30. [Recent Fixes, Known Limitations, and Tech Debt](#30-recent-fixes-known-limitations-and-tech-debt)

---

## 1. Purpose and Mental Model

The Accelerator Portal is an **AI-assisted build companion** for executives going through Colaberry's enterprise AI program. Each participant gets one project. The portal:

1. Captures their idea and turns it into requirements (via an external **Architect** service).
2. Decomposes those requirements into **Business Processes (BPs)** — the unit of work in the system. A BP is a coherent capability like "Role Management", "Notifications", "Milestones Management".
3. Maintains a **recommendation engine (Cory)** that always tells the user what to do next.
4. Generates **Claude Code prompts** focused on a specific BP and target (build backend, expose UI, fix usability, etc.).
5. Accepts a **validation report** the user pastes back after running the prompt, and uses it to update progress.
6. Renders a **System View** showing every BP with its layers (backend / frontend / agents / models), completion %, and the next action.
7. Optionally runs a **UI Advisor** that scans the page code and surfaces visual / accessibility / responsiveness issues.

The mental model: the portal is not the runtime that builds your app. **Claude Code is.** The portal is the planner, recommender, validator, and visualizer wrapped around the user's Claude Code sessions.

---

## 2. Architecture & Deployment

### Stack

- **Frontend:** React 18 + TypeScript, CRA + react-scripts, Bootstrap 5 (CDN), `react-router-dom`. Styling via design tokens in `frontend/src/styles/global.css`.
- **Backend:** Node 20, Express, Sequelize ORM, PostgreSQL. TypeScript throughout.
- **External services consumed:**
  - **Architect** at `advisor.colaberry.ai` — builds requirements docs from ideas (separate Python/FastAPI repo).
  - **OpenAI API** — used by clustering, prompt generation, expand-questions, intelligence services. Default model is `gpt-4o-mini`.
  - **GitHub API** — file tree listings, file reads, file writes via the `octokit`-style helpers in `services/githubService.ts`.
  - **Cloudflare** in front of the production VPS (DNS proxy).

### Deployment topology

- Production VPS: `95.216.199.47` running Docker Compose.
- Compose stack: `postgres`, `backend`, `intelligence`, `nginx` (which serves the multi-stage built frontend).
- Production URL: `enterprise.colaberry.ai`.
- Two parallel dev stacks (`accelerator-dev-*` and `accelerator-dev2-*`) for staging.
- No CI/CD: deploys are manual SSH + `docker compose up -d --build`.
- Backend startup runs `sequelize.sync({ alter: true })` against ~170+ models — slow (~3-5 min) and the reason the portal sometimes returns 502s right after a deploy.

### Routing structure

- **Frontend route file split:**
  - `App.tsx` — top-level routes including standalone pages (alumni page, etc.).
  - `publicRoutes.tsx`, `adminRoutes.tsx`, `portalRoutes.tsx` — JSX fragments grouped by audience.
- **Backend routes split:**
  - `projectRoutes.ts` (the largest — ~5200 lines, ~120 endpoints)
  - `participantRoutes.ts` (auth)
  - `adminRoutes.ts`, plus `routes/admin/` subdirectory
  - `enrollmentRoutes.ts`, `leadRoutes.ts`, etc. (CRM-side)

### Environments

- **Production**: Cloudflare → VPS nginx → backend on port 3001.
- **Local dev**: `localhost:8888` runs a Docker Compose mirror — but the VPS is the real production. Code must be pushed to `origin/main` then `git pull && docker compose up` on the VPS.

---

## 3. Authentication: Magic Link

The portal does not use passwords. Each participant has an `Enrollment` row with a `portal_token` UUID and an expiry.

### Flow

1. **Token creation**:
   - Manual today (created by ops via DB insert OR via the admin enrollment flow).
   - Token + `portal_token_expires_at` (typically 24h or 30 days from issue) stored on the Enrollment row.
2. **Magic link sent**:
   - `participantService.requestMagicLink(email)` looks up an active enrollment with `portal_enabled=true`.
   - Generates a fresh UUID token + 24h expiry.
   - Calls `emailService.sendPortalMagicLink` which renders an HTML email with the link `${portalBaseUrl}/portal/verify?token=<token>` and sends via Mandrill.
3. **Verification (`GET /api/portal/verify?token=...`)**:
   - Calls `participantService.verifyMagicLink(token)`.
   - If token valid and enrollment active, signs a JWT with `{ sub: enrollment.id, email, cohort_id, role: 'participant' }` valid for 7 days.
   - **Token is NOT cleared after use** — designed to be reusable so users can bookmark.
4. **JWT is returned** in the verify response. Frontend stores it (typically in localStorage) and includes it as `Authorization: Bearer <jwt>` on all subsequent calls.
5. **Middleware**: every protected endpoint calls `requireParticipant` which validates the JWT and attaches `req.participant = { sub, email, cohort_id, role }`.

### Edge cases handled

- Enrollment exists but `portal_enabled=false` → friendly "pending admin approval" message.
- Email not found → generic message ("if an active enrollment exists, a link has been sent") to prevent email enumeration.
- Token expired → `verifyMagicLink` returns null, frontend shows generic failure.

### NOT implemented

- No SSO, no OAuth, no 2FA.
- No automatic token rotation.
- No "log out everywhere" — JWT is stateless; revocation requires changing the JWT secret.

---

## 4. Onboarding: Project Setup Wizard

`ProjectSetupWizard.tsx` is the multi-step modal/page shown when a participant logs in and has no project yet (or their project's `setup_status.activated` is false).

### Wizard step keys

```
type WizardStep =
  | 'decision'            // "Do you already have a Requirements document?"
  | 'idea'                // "What are you looking to build?" (textarea)
  | 'loading_questions'   // spinner while LLM generates 9 questions
  | 'questions'           // 9-phase Discovery Framework Q&A
  | 'upload'              // requirements doc + GitHub repo combined screen
  | 'github'              // legacy: github-only step, used when reqs already saved
  | 'github_for_build'    // AI build path: github + target tier
  | 'starting_build'      // redirects to /portal/project/demo
  | 'activating'          // spinner with progress bar
  | 'complete';           // success card → calls onActivated
```

### Decision step

Two big buttons:

- **"Yes, I Have One"** → `step = 'upload'`. Goes to a single combined screen asking for requirements doc + GitHub repo + target tier. (This was originally split across two screens; combined into one in commit `18ef401`.)
- **"No, Build It With AI"** → `step = 'idea'`. AI build path.

### Upload step (Requirements + GitHub combined)

Single card on one screen:

- **Drag-and-drop file upload** (accepts `.md`, `.txt`, `.markdown`) OR paste-into-textarea.
- **GitHub repo URL** (`https://github.com/owner/repo`).
- **Access token** (optional, for private repos).
- **Target tier** picker — MVP / Production / Enterprise / Autonomous (see [Mode Awareness](#23-mode-awareness-mvp--production--enterprise--autonomous)).
- Submit calls in sequence:
  1. `POST /api/portal/project/setup/requirements` with `{ content }`
  2. `POST /api/portal/project/setup/github` with `{ repo_url, access_token }`
  3. `handleActivate()` (kicks off the activation pipeline)

### AI Build path

- **Idea step**: textarea (min 30 chars). On submit, calls `POST /api/portal/project/requirements/expand-questions` with the idea.
- **Loading questions**: spinner. The LLM may fail; one retry. If both fail, returns to idea with error.
- **Questions step (9-phase Discovery Framework)**: see next subsection.
- **GitHub for build step**: GitHub URL + access token + target tier. Submit calls `POST /api/portal/project/architect-build` with `{ idea (refined), repoUrl, accessToken }` which:
  - `findOrCreate`s the project record.
  - Connects GitHub via `connectGitHub`.
  - Calls `architectProxyService.startArchitectBuild(name, idea)` which kicks off the external Architect.
  - Stores `setup_status.architect_slug` so polling can find it.
- **Starting build**: redirects to `/portal/project/demo` (the Architect-status polling page).

### 9-phase Discovery Framework

This is the heart of the AI build path's idea-refinement step. Replaces the old yes/no questions.

The user's idea is sent to GPT-4o-mini with a prompt that asks for 9 questions (one per dimension) tailored to their idea, each with **3 multiple-choice options** labeled A (baseline), B (intermediate), C (advanced).

The 9 framework dimensions (hardcoded in `projectRoutes.ts` at the `expand-questions` endpoint):

| # | Phase Key       | Category              | Axis |
|---|-----------------|-----------------------|------|
| 1 | `control`       | Control Model         | Recommend / Approve / Execute |
| 2 | `intelligence`  | Intelligence Depth    | Rules-based / Adaptive / Self-learning |
| 3 | `data`          | Data Scope            | Internal / External signals / Full ecosystem |
| 4 | `decision`      | Decision Complexity   | Basic / Multi-variable optimization / Scenario simulation |
| 5 | `execution`     | Execution Level       | Suggest / Trigger workflows / Fully automate |
| 6 | `agents`        | Agent Structure       | Single AI / Multiple agents / Full AI org |
| 7 | `governance`    | Governance & Trust    | Basic / Auditability / Compliance + explainability |
| 8 | `strategy`      | Strategy Layer        | Operational / Strategic / Long-term planning |
| 9 | `differentiators` | Differentiators     | None / Simulation–digital twin / Proprietary models |

Per-question response shape:

```ts
{
  phase: string;          // matches one of the 9 keys above
  category: string;       // human-readable label
  text: string;           // the question
  options: [
    { letter: 'A', label: '...', description: '<concrete to user idea>' },
    { letter: 'B', label: '...', description: '...' },
    { letter: 'C', label: '...', description: '...' },
  ];
}
```

### Question normalizer (parser)

Backend has a fuzzy normalizer to handle LLM imperfection:

1. **Exact phase match** — preferred.
2. **Exact category match** — fallback.
3. **Fuzzy substring match** on either field (lowercased, alphanumerics only).
4. **Positional fallback** — same array index in the LLM's output.

This was added in commit `df69df9` because the LLM occasionally renamed phase keys (`agents` → `agent_structure`).

### UI behavior

- One question shown at a time, with a phase counter ("Phase 3 of 9").
- 3 large buttons (A/B/C) with the option's label and description.
- Click an option → marks the question's `selected = letter`, advances to the next question.
- Optional **per-question note** field for clarifications.
- Selected B/C levels surface as a **pill row** at the bottom showing the chosen sophistication profile.
- After 5+ questions answered, a **"Continue to Repository"** button appears.

### Refined idea construction

When the user clicks Continue, `buildRefinedIdea()` constructs:

```
<original idea>

Selected Sophistication Levels (AI System Discovery Framework):
- [Control Model] B. Approve before action — <description> (note: <note>)
- [Intelligence Depth] C. Self-learning adaptive — <description>
...
```

This refined idea is what's sent to the Architect.

---

## 5. The Architect (External Service)

The Architect lives at `https://advisor.colaberry.ai`. It is a **separate Python/FastAPI repo** ("AI Project Architect & Build Companion") with its own database, file storage, and chat engine. The portal proxies to it via `architectProxyService.ts`.

### The 8-phase pipeline

| Phase | Key | What happens |
|---|---|---|
| 1 | `idea_intake` | LLM analyzes the user's idea, generates a profile |
| 2 | `feature_discovery` | LLM proposes capabilities the system should have |
| 3 | `outline_generation` | LLM designs the document structure (chapters) |
| 4 | `outline_approval` | Outline is locked |
| 5 | `chapter_build` | Each chapter is generated by an LLM call (longest phase, ~7-11 chapters × 30-60s each) |
| 6 | `quality_gates` | Chapters are validated, weak ones regenerated |
| 7 | `final_assembly` | Chapters concatenated into one Build Guide markdown file |
| 8 | `complete` | Document available for download |

### How the portal drives it

`startArchitectBuild(name, idea)` in `architectProxyService.ts`:

1. POSTs `/projects/new` to create the project, captures the slug from the redirect.
2. Returns the slug immediately to the caller (so the UI can stop blocking).
3. In the **background**:
   - `chat(idea)` — sends the idea to the chat engine.
   - Sleeps 10s, sends "proceed" to advance.
   - POSTs `/feature-discovery/approve` to advance phase 2.
   - POSTs `/outline-generation/advance`, sleeps 15s.
   - POSTs `/outline-approval/lock`.
   - POSTs `/auto-build/start` to kick off chapters 5-7.

### Status polling (`GET /api/portal/project/architect-status`)

Reworked in commit `df69df9` to use the JSON status endpoint instead of HTML scraping (which silently failed during chapter_build because the page never showed aggregate chapter counts).

The proxy now:

1. Tries `GET /projects/{slug}/api/auto-build/status` — returns JSON with `phase`, `building`, `latest_event`, `event_count`.
2. Computes `chapters_done` from the latest event's `chapter_index` field, treating it as a high-water mark (anything that reached `gate`/`scoring`/`complete` events counts as done).
3. Falls back to HTML scraping if the JSON endpoint is unreachable (older Architect versions).

Phase progress mapping:

```
idea_intake: 8%    feature_discovery: 20%   outline_generation: 32%
outline_approval: 38%   chapter_build: 40-80% (scaled by chapters_done)
quality_gates: 85%   final_assembly: 93%   complete: 100%
```

### Document fetch (`getArchitectDocument`)

Tries in order:
1. `/projects/{slug}/final-assembly/download`
2. Scrape project page for any `Build_Guide` link
3. Scrape `/output/{slug}/` for `.md` files

When the user's project polling sees `complete: true`, the portal fetches the document and stores it on `project.requirements_document` plus stamps `setup_status.requirements_loaded = true`.

### Real-world timing (measured)

For a small project (7 chapters, 28 pages, 14k words, 16 LLM calls, ~$0.028 in tokens): **~14 minutes**. The portal's polling cadence was previously the bottleneck — it's now ~3s per poll so completion is detected within seconds of the actual finish.

---

## 6. Activation: Requirements → Capabilities

After requirements + GitHub are set, `POST /api/portal/project/setup/activate` triggers the activation pipeline (in `projectSetupService.activateProject`).

### Pipeline steps

1. **Parse the requirements document** — extracts sections, requirements (REQ-XXX style), splits flat list.
2. **Cluster requirements into capabilities** — `requirementClusteringService.clusterRequirements`:
   - LLM-driven (`gpt-4o-mini`).
   - Batches of 25-50 requirements at a time (depending on total size).
   - For each batch, asks LLM to group requirements into 3-7 capabilities each with up to 5 features.
   - Critical rule: every requirement key MUST appear in exactly one feature.
   - Orphan detection: any unmapped requirements go into a synthetic `"Uncategorized Requirements"` capability.
   - Status reporting via `clusteringProgress` Map (in-memory, cleared via finally block — fixed in commit `e2e7b0b`).
   - LLM failure fallback: groups by section name (no clustering).
3. **Persist** — `persistHierarchy(projectId, hierarchy)` creates `Capability` rows + `Feature` rows + `RequirementsMap` rows.
4. **Discover existing repo code** — runs the repo file tree through pattern detection to identify already-built BPs (frontend pages, backend services, models, agents). These are auto-discovered as **Page BPs** (`source: 'frontend_page'`) or **discovered BPs** (`source: 'repo_discovered'`).
5. **Stamp** `setup_status.activated = true`.

### Activation progress endpoint

`GET /api/portal/project/setup/activation-progress` is polled by the frontend during the activate phase. Returns:

```json
{
  "status": "processing|complete|failed",
  "message": "Clustering batch 3 of 7...",
  "batch": 3,
  "total_batches": 7,
  "capabilities_so_far": 15,
  "percent": 42
}
```

**Bug fix history (commit `e2e7b0b`):** the endpoint used to short-circuit on a stale `clusteringProgress` marker that wasn't cleared after success. Three fixes:
1. Added `finally { clusteringProgress.delete(enrollmentId); }` in clustering service.
2. GET endpoint now checks activation `complete`/`failed` first, returning immediately.
3. Frontend polling timeout bumped from 3 min → 10 min for large repos.

### What gets created

After activation, the project has:
- `Capability` rows — one per discovered or clustered BP.
- `RequirementsMap` rows — one per requirement, linked to a Capability.
- Possibly auto-detected `Page BP` rows (`source = 'frontend_page'`) for each detected route in the repo.

---

## 7. Blueprint Page (Landing)

`SystemBlueprint.tsx` at route `/portal/project/blueprint`. This is what the user lands on after login (assuming activated).

### Top-level structure (top to bottom)

1. **Header** — project name, version badge (V2), implementation badge, "X/N components complete", and right-side controls:
   - **Mode**: Production (or whatever target_mode is set).
   - **Manual ↔ Autonomous** toggle.
   - **Watch 60s Demo** button.
   - **Full System View** button (links to V2).
2. **Production Readiness card** — overall %, maturity level badge, progress bar, fraction "X of N components at 100%", "X% requirements matched".
3. **Your System Blueprint card** — auto-derived system prompt summary (Industry & domain, Core capabilities) with "Save as System Prompt" + "Edit" + "Expand" buttons.
4. **System Architecture card** — file/component counts split by layer with detected tech stack badges (React, Express, Docker, GitHub Actions, etc.).
5. **Cory — Your Next Step card** — see [Cory section](#8-cory--the-recommendation-orchestrator).
6. **System Components grid** — see [System Components](#10-system-components-grid).
7. **Footer**: "Open Full System View" button.

### Modes

- **Build mode** (default) — focuses on the recommendation engine + grid.
- **Reporting mode** — switches the layout to insights/gaps/trends. Toggle via the buttons in the header.

### Loading / error states

- `loading=true` → centered spinner.
- `error === 'no-project'` → renders `<ProjectSetupWizard />` directly (this is how a fresh enrollment lands on the wizard).
- `setup_status.activated === false` AND `architect_slug` set → redirects to `/portal/project/demo`.
- `setup_status.activated === false` AND no architect_slug → renders the wizard.

---

## 8. Cory — The Recommendation Orchestrator

Cory is the unified decision engine. Lives in `backend/src/services/intelligence/coryOrchestrator.ts`.

### The CoryTask interface

```ts
interface CoryTask {
  id: string;
  title: string;
  description: string;
  source: 'build' | 'health' | 'improve' | 'ui';
  type: 'foundational' | 'fix' | 'enhancement' | 'experience';
  impact: number;       // 0-100
  urgency: number;      // 0-100
  confidence: number;   // 0-100
  blocking: boolean;
  blocked: boolean;
  block_reason?: string;
  dependencies: string[];
  system_layer: 'backend' | 'frontend' | 'agents_backend' | 'agents_frontend' | 'data' | 'observability';
  mode_relevance: { mvp, production, enterprise, autonomous: number };
  color: string;
  prompt_target?: string;
  component_id?: string;
  priority?: number;
  ui_step_key?: 'layout_hierarchy' | 'usability' | 'mobile_responsiveness';
  decision_trace: { reason, inputs, confidence, scoring_breakdown };
}
```

### Per-cap orchestrator: `getTopTasks(enriched, projectMode)`

For a single capability, returns the top N tasks ordered by score. Considers:

- **System layer state** — has backend? frontend? agents? models? (`getSystemState`).
- **Quality scores** — determinism, reliability, observability, ux_exposure, automation, production_readiness.
- **Coverage** (% of requirements verified).
- **Maturity level** (L0 Not Started → L4 Autonomous).
- **Effective mode** (mvp / production / enterprise / autonomous).
- **Strategy template** (priority overrides per BP).
- **Profile thresholds** (per-mode coverage/quality minimums).

### Project-wide orchestrator: `getProjectTopTasks(enrichedCapabilities, projectMode)`

1. **Skip filters**:
   - Synthetic Uncategorized bucket.
   - Inactive (`applicability_status !== 'active'`).
   - User-resolved (`user_status === 'verified' OR 'archived'`).
   - Undefined Page BPs (auto-discovered but not yet confirmed via Define Component).
   - Complete (coverage ≥ 90% AND readiness ≥ 90%).
2. **Per-cap tasks**: runs `getTopTasks` on each remaining cap, tags each task with `component_id`.
3. **Global re-sort** by priority.
4. **De-dup**: only one task per component_id in the global view (so the user doesn't see "Build Backend" 12 times).
5. **Returns top 5**.

### Fresh project special case

`isFreshProject(enrichedCapabilities)` returns true when no capability has `last_execution.status` in `{complete, verified, foundation_built}`.

When fresh, `getProjectTopTasks` returns ONLY the **kickoff task** (see [next section](#9-project-kickoff-first-wave-build)).

### `last_execution.status` taxonomy

- `pending` — user clicked Generate Build Prompt but hasn't synced a validation report yet.
- `complete` — per-BP validation report applied successfully.
- `verified` — user-marked verified (manual override).
- `incomplete` — validation report applied but some files missing.
- `foundation_built` — kickoff sync has applied (added in commit `ef7a9bc`). Soft signal: the cap was scaffolded but per-BP completion still tracks reqCoverage.

### "Up next" panel

On the Cory card, below the primary task, an expandable "Up next (N more steps)" shows the next 4 tasks. **Hidden when the primary task is the kickoff** (fixed in commit `e1810cc` — was leaking legacy `coryPlan` items).

---

## 9. Project Kickoff (First-Wave Build)

A synthetic, project-level task that surfaces only on fresh projects.

### Task identity

```
id: 'kickoff:project'
title: 'Kickoff: plan and build the foundation in one session'
component_id: '__project_kickoff__'   // synthetic, not a real cap
prompt_target: 'project_kickoff'
```

### Endpoint: `POST /api/portal/project/kickoff-prompt`

Returns the Claude Code prompt text that, when run, will:

1. **Step 1 (plan mode)**: verify `CLAUDE.md` and a `*Build_Guide*.md` exist at repo root. Stop if either is missing.
2. **Step 2 (still plan mode)**: propose a complete sprint plan covering the **whole foundation** (3–6 phases ordered by dependency: data → backend → UI → integrations → polish).
3. **Step 3**: execute every phase end-to-end in one Claude Code session. Between phases, briefly announce what's next but do NOT wait for user confirmation. Only pause for: governance boundaries, missing credentials, or unresolvable test failures.
4. **Step 4**: commit (`git add -A && git commit -m "kickoff: foundation built — phases 1-N"` then `git rev-parse HEAD`), then deliver ONE consolidated report with `Commit: <sha>` line.

### The kickoff report format (what the user pastes back)

```
# Kickoff Report

Commit: <sha>

## Phases shipped
- Phase 1: <name> — ✅ complete | ⏳ partial | ❌ deferred

## Capabilities advanced
- <capability or domain name> — <what now exists> — files: <key path>

## Files Created
- path/to/file.ts

## Files Modified
- path/to/existing.ts

## Routes
- GET /api/...

## Database
- TableName

## Tests added and passing
## Directives updated
## Assumptions made
## Items that genuinely need the user
## Open escalations
## What's left for per-component iteration in the portal

Status: COMPLETE
```

### Frontend dispatch

When the user clicks **Generate Build Prompt** on a kickoff task, `handleGeneratePrompt` detects `target === 'project_kickoff'` and calls the kickoff-prompt endpoint instead of the per-BP `/prompt` endpoint. The prompt is copied to clipboard, and the build flow proceeds (paste-back routes to `/kickoff-sync` instead of `/validation-report` — see [Kickoff Sync section](#16-kickoff-sync-project-wide)).

### Learn About This for kickoff

`SystemBlueprint.handleLearnAbout` special-cases `primaryTarget === 'project_kickoff'` and navigates to `/portal/project/cory?mode=learn&componentId=__project_kickoff__&stepName=Project%20Kickoff`. CoryFullscreen detects the synthetic id and renders a hardcoded explanation (the `KICKOFF_LEARN_TEXT` constant) instead of calling the architect/learn endpoint (which would otherwise ramble about unmatched requirements because no real cap matches).

---

## 10. System Components Grid

Renders below Cory's Next Step. One card per BP.

### Card content

- **Name** + Page BP icon (if applicable) + Verified checkmark (if user_status='verified').
- **Status badge**: Complete / In Progress / Not Started.
- **Completion %** + progress bar (color-coded).
- **Maturity level** (L0–L4).
- **Layer badges**: Backend / Frontend / Agent — colored by readiness (ready / partial / missing / n/a).
- **Click** → navigates to `/portal/project/system-v2?componentId=<id>&tab=overview`.

### Sort order (ordered by Cory's priority — commit `c9093ea`)

1. Verified or archived BPs sink to the bottom.
2. BPs in `orchestratorTasks` (Cory's queue) come first, in his order.
3. Other BPs follow, lower-completion first.

### "Mark N 100%-built BPs Verified" button

Appears in the grid header when `eligibleCount > 0`. Clicking it bulk-marks all BPs with `user_status !== 'verified' AND completion >= 95` as verified. Confirmation modal before applying.

### Awaiting-definition banner

Above the grid, a yellow banner appears if `pendingDefinitionPages.length > 0`. Lists Page BPs auto-discovered from the repo but not yet confirmed via Define Component. Click any pill → selects that BP. Refresh after Define Component completes (via `loadData()` and `window.location.reload()` — fixed in commit `7ed9294`).

---

## 11. System View V2 (Per-BP Detail)

`SystemViewV2.tsx` at route `/portal/project/system-v2`. This is the deep view for working on a single BP.

### Top-level layout

- **Top bar**: project name, V2 badge, implementation badge, "X/N components complete", mode toggle (Build ↔ Reporting), Blueprint button.
- **Left sidebar (System Map)**: tile view of all BPs grouped by category. Click a tile → selects that BP.
- **Right pane (BP detail)**: shows the selected BP's tabs.

### URL params

- `componentId` — BP id (UUID).
- `tab` — one of `overview | build | health | improve | ui` (or `insights | gaps | trends` in reporting mode).
- `autorun` — special param for auto-firing UI Advisor steps. Values: `layout_hierarchy | usability | mobile_responsiveness`. Used by Cory's "Run UI Advisor" deep links.

### Auto-run effect

```tsx
useEffect(() => {
  if (!autorunStepKey) return;
  if (autorunFiredRef.current) return;
  if (!compDetail || !selectedId) return;
  if (compDetail.id !== selectedId) return;
  // ...
  uiAnalyzeRef.current?.(selectedId, FEEDBACK[autorunStepKey], autorunStepKey);
}, [autorunStepKey, compDetail, selectedId]);
```

Uses a `useRef` to forward-reference `handleUIAnalyze` (which is declared later in the component), preventing TDZ errors after Terser minification (a real production bug — fixed in commit `2321ebe`).

---

## 12. BP Detail Tabs

The right pane has a `nav nav-tabs` with these tabs (in build mode):

| Tab | Purpose |
|---|---|
| Overview | Cory recommendations + System Intelligence diagram |
| Build | Generate prompt → paste validation report flow |
| Health | Quality scores, missing layers, gaps |
| Improve | Enhancement suggestions (after coverage is high) |
| **UI (N)** | Page preview iframe + 3-step UI Advisor (only shows when BP has frontend evidence) |

In reporting mode: Overview / Insights / Gaps / Trends.

### When the UI tab appears

Updated in commit `21fd8c0`. The UI tab shows when `selectedComponent.ui.pages.length > 0`. `transformBPs` populates `ui.pages` if any of:

- BP has `frontend_route` set → `'mapped'` page (UI tab opens to iframe preview).
- BP has `linked_frontend_components.length > 0` → `'pending'` page (UI tab opens to route picker).
- BP's `usability.frontend` is `'partial'` or `'ready'` (per-cap repo scan) AND not a Page BP → `'pending'` page.

### Overview tab

- **Cory — What You Should Do Next** card on the left.
- **System Intelligence** panel on the right with sub-tabs:
  - **Architecture** — diagram showing Frontend / API Routes / Services / Agents / Database boxes with file counts. Boxes are colored if the layer exists, faded if missing.
  - **Flow** — process flow visualization (deeper).
  - **Database** — DB schema visualization.

### Build tab

- The full **Build flow** — see [section 13](#13-build-flow-prompt--claude-code--validation-report).

### Health tab

- Backend/frontend/agents readiness summary.
- List of detected gaps from the repo analysis.
- Quality scores (determinism, reliability, observability, etc.).

### Improve tab

- **Enhancement options** — once a BP is at high coverage, Cory generates a list of "what next" items (add monitoring, improve UI polish, add tests, etc.).

---

## 13. Build Flow: Prompt → Claude Code → Validation Report

### Phase machine

```ts
type BuildPhase = 'idle' | 'generating' | 'waiting_for_execution' | 'validating' | 'validated';
```

### `idle` phase (action buttons)

Two buttons:

- **Generate Build Prompt** (or **Run UI Advisor** if target is `ui_advisor_step`) — primary action.
- **Learn About This** — opens Cory in learn mode for this BP.

### `handleGeneratePrompt(comp, opts)` flow

1. **Special cases first**:
   - `target === 'ui_advisor_step'` → navigate to V2 UI tab with `?autorun=<stepKey>`.
   - `target === 'project_kickoff'` → call `POST /kickoff-prompt`, copy to clipboard, set phase to `waiting_for_execution`.
2. **Default**: call `POST /api/portal/project/business-processes/:id/prompt` with `{ target }`.
3. **Returns** `prompt_text` which is copied to clipboard.
4. **Toast**: "Prompt copied — paste into Claude Code".
5. **Phase** → `waiting_for_execution`.

### `waiting_for_execution` phase

Shows:

- A pulsing indicator + message: "Run this in Claude Code — your system is about to evolve".
- "Open Claude" button (links to `claude.ai`).
- Description text from `TARGET_DESCRIPTIONS[promptTarget]`.
- "Show Prompt" / "Hide Prompt" / "Copy Again" buttons.
- "Mark Verified Directly" green button (for when Claude Code already reported COMPLETE in a prior session — skips the paste-back).
- **Paste textarea** — user pastes the validation report.
- **Validate Build** button (enabled when `pasteDetected && reportText.trim()`).

### Paste detection

`handleReportChange` detects pastes by checking if the value grew by >100 chars in one event. Sets `pasteDetected = true`. Used to enable the Validate button only after a real paste (not while typing).

### `handleValidate(comp)` flow

1. Phase → `validating`.
2. **Kickoff special case**: if `orchestratorTasks[0].prompt_target === 'project_kickoff'`, call `POST /api/portal/project/kickoff-sync` instead of the per-BP endpoint.
3. **Default**: `POST /api/portal/project/business-processes/:id/validation-report` with `{ reportText }`.
4. Phase → `validated`. Display the result.
5. Reload data via `loadData()`.

### `validated` phase render

Three branches:

1. **Error** → red alert with the error message.
2. **Kickoff** → project-wide summary (see [Kickoff Sync](#16-kickoff-sync-project-wide)).
3. **Per-BP** → standard summary card:
   - **Build Validated** header with celebration animation.
   - **Coverage / Maturity / Readiness** metrics row.
   - **Requirements Matched** card with delta bullets ("Coverage increased from 0% to 100%", etc.).
   - **Files Created / Modified / Routes / Database** sections (parsed from the report).
   - **Continue to Next Step** button.

### Per-BP prompt content (structure)

`promptGenerator.ts` builds prompts with these sections:

1. **Preamble** — "You are operating in Claude Code PLAN MODE."
2. **Project Context** — project name, repo URL, system prompt.
3. **Codebase Structure** — top-level dirs + file counts + key files (CLAUDE.md, package.json, etc.).
4. **Target-specific section** — depends on `prompt_target`:
   - `backend_improvement` — focus on services + routes for this BP.
   - `frontend_exposure` — focus on UI pages/components for this BP.
   - `ui_fix` — focus on a single UI element issue.
   - `ui_fix_bulk` — combined prompt covering multiple UI issues for this BP.
   - `agent_enhancement` — focus on agent loops.
   - `monitoring_gap` — focus on logging/metrics.
   - `requirement_implementation` — generic build prompt.
   - `verify_requirements` — verification-only.
   - etc.
5. **Constraints** — follow existing patterns, no breaking changes, additive only.
6. **VALIDATION REPORT (REQUIRED AT END)** — exact format with required `Commit: <sha>` line. Tells Claude Code to commit before reporting.

---

## 14. Validation Report Parser

`backend/src/services/validationReportParser.ts`. Parses the report the user pastes back.

### Sections recognized (case-insensitive headers)

- `Files Created:` / `New Files`
- `Files Modified:` / `Changed Files` / `Updated Files`
- `Routes:` / `API Endpoints`
- `Database:` / `Tables` / `Models`
- `Status: <X>` (sets `result.status`)
- `Duplicates` / `Already Exist`
- `## Phases shipped` (kickoff-only)
- `## Capabilities advanced` (kickoff-only)
- `Commit: <sha>` (anywhere in the doc)

### Phase status detection (kickoff)

Loose match (commit `e8dab83` — earlier strict regex broke on em-dashes inside parens):

```
✅ or "complete" or "done"  → status: 'complete'
⏳ or "partial" or "in progress" → 'partial'
❌ or "deferred" or "skipped" or "blocked" → 'deferred'
```

### Capability claim parsing (kickoff)

Lines under `## Capabilities advanced`:

```
- <name> — <what was done> — files: <path>
```

Parsed into:

```ts
{ name, description, files: extractFilePaths(line) }
```

### File path extraction

Regex captures any path with a known extension: `.ts | .tsx | .js | .jsx | .py | .go | .rs | .java | .sql | .vue | .svelte | .md | .yml | .yaml | .json | .toml | .cjs | .mjs | .html | .css`.

### Output: `ParsedReport` interface

```ts
{
  filesCreated: string[];
  filesModified: string[];
  routes: string[];
  database: string[];
  status: string;
  commitSha: string | null;
  phases: ParsedPhase[];
  capabilityClaims: ParsedCapabilityClaim[];
  rawText: string;
  duplicatesNoted: string[];
}
```

---

## 15. Per-BP Validation Apply

`applyReportToBP(capabilityId, parsed, commitSha?, enrollmentId?)`.

### Logic

1. **Classify files** by layer (backend/frontend/agent/model) using path heuristics:
   - `/agents/` or `/intelligence/` or filename includes "agent" → agent
   - `.tsx`/`.jsx` or `/component`/`/page`/`/frontend/` → frontend
   - `/model`/`/schema`/`/entity`/`/migration` → model
   - `/service`/`/route`/`/controller`/`/handler`/`/api/`/`/backend/` → backend
   - Default for `.ts`/`.js`/`.py` → backend
2. **Mark all requirements verified** if `hasEvidence`. Per-requirement file linking by category:
   - UI requirements → frontend files
   - Agent requirements → agent files
   - Data requirements → model files
   - Default → backend files
3. **Update capability**:
   - Append new files to `linked_backend_services / linked_frontend_components / linked_agents` (accumulative).
   - Stamp `last_execution.validation_report` with files, routes, status, commit, applied_at.
   - Add `validation_report_applied` to `completed_steps`.
4. **Auto-mark verified** if any of:
   - Report status starts with `COMPLETE`.
   - Coverage now ≥ 90%.
   - All requirements verified.
5. **Auto-detect frontend_route** (added commit `fa47f49`): if the report includes new frontend files and no `frontend_route` is set, run route detection. If a single high-confidence (≥0.9) candidate is found, auto-set `frontend_route`.

### Returns

```ts
{
  requirementsVerified: number;
  requirementsTotal: number;
  duplicatesDetected: string[];
  detectedRoute?: string | null;
  routeCandidates?: Array<{ route, confidence, source }>;
}
```

Plus the endpoint adds:
- `parsed` — subset of the parsed report for display.
- `metrics_after` — re-enriched coverage / maturity / readiness.
- `autonomous_suggestions` — gap-detection-driven next-step ideas.

---

## 16. Kickoff Sync (Project-Wide)

The kickoff produces a project-wide report. Per-BP `applyReportToBP` would only credit one BP. Kickoff sync fans the evidence across every capability the report touches.

### Endpoint: `POST /api/portal/project/kickoff-sync`

Body: `{ reportText }`. Returns:

```ts
{
  ok: true,
  commit_sha: string | null,
  summary: {
    phases_shipped, phases_partial, phases_deferred,
    capabilities_advanced, capabilities_total,
    files_claimed, files_verified_in_repo,
    files_missing_from_repo: string[],
  },
  capability_deltas: Array<{
    id, name, matched, match_score,
    matched_by: string[],
    files_linked, requirements_verified, requirements_total,
  }>
}
```

### `applyKickoffReport(projectId, enrollmentId, parsed)` algorithm

1. **Refresh the GitHub file tree** from origin via `syncFileTree` (so file claims can be verified).
2. **Verify file claims**: for each claimed file, check if it exists in the repo file tree (suffix match for path mismatches).
3. **Score every capability** via `scoreCapabilityMatch`:
   - Signal 1 (+0.6): exact match between cap name and any `Capabilities advanced` claim line.
   - Signal 2 (+0.1 to +0.4): cap name variants appear in claimed file paths (more hits = higher).
   - Signal 3 (+0.15): cap name or description tokens appear in phase bodies.
   - Threshold: `score >= 0.25` to be considered "matched".
4. **For matched caps**:
   - **Pick relevant files** — only files whose path contains a name-variant of the cap. If none, link nothing (no fallback to "first 8" — fixed in commit `ef7a9bc`).
   - **Classify by layer** and append to `linked_*_components` (only the genuinely-name-matched files).
   - **DO NOT change requirement statuses** (fixed in commit `8ae7948`). Foundation work isn't requirement-level evidence. Earlier versions flipped reqs to `verified` (inflating coverage to 100%) or `matched` (same problem since `matchedR` counts both).
   - **Hint files only**: for high-confidence matches (≥0.6), if the requirement has no `github_file_paths`, attach the layered files as a hint (with `verified_by = 'kickoff_inferred'`). Status untouched.
   - **Snapshot req state** (`reqSnapshot` in `last_execution.validation_report`) so the reset endpoint can roll back.
   - **Stamp `last_execution.status = 'foundation_built'`** (not `complete`).
5. **Stamp project**: `setup_status.kickoff_synced = true`, `kickoff_synced_at`, `kickoff_commit`.

### Capability name → path variant generator

`normalizeForPath("Role Management")` returns:

```
['role-management', 'role_management', 'rolemanagement', 'role', 'management', 'roles', 'managements']
```

Used to fuzzy-match cap names against repo file paths.

### Reset endpoint: `POST /api/portal/project/kickoff-sync/reset`

Idempotent. For every cap with `last_execution.validation_report.source === 'kickoff_sync'`:

1. **Restore requirements** from snapshot (only touches reqs whose `verified_by` is `kickoff_sync` or `kickoff_inferred`).
2. **Snapshot-less fallback**: any req on the cap with `verified_by` in `(kickoff_sync, kickoff_inferred)` not in the snapshot gets reset to `unmatched` with `verified_by` cleared.
3. **Strip kickoff-contributed files** from `linked_backend_services / linked_frontend_components / linked_agents` (using the `filesLinked` we recorded).
4. **Clear** `last_execution.validation_report`, remove `kickoff_sync_applied` from `completed_steps`.
5. **Roll back project-level** `setup_status.kickoff_synced` flag.

### Frontend kickoff summary panel (commit `d5842fa`)

When `validationResult.kickoff` is set, renders instead of the per-BP summary:

- **Kickoff Synced** header with phase count + commit short-SHA.
- **Capabilities Advanced** scrollable list with per-cap match scores and req counts.
- **Not Yet Covered** amber pill row for unmatched caps.
- **Files claimed but missing from repo** warning banner if any.

---

## 17. UI Advisor & Visual Review

The UI tab on a BP that has a `frontend_route` (or pending route — see [next section](#19-route-detection--frontend-route-wiring)).

### Three analysis steps

| Key | Title | Description |
|---|---|---|
| `layout_hierarchy` | Improve page layout and hierarchy | Analyzes spacing, visual hierarchy, component structure |
| `usability` | Fix usability issues | Detects broken interactions, missing feedback, accessibility gaps |
| `mobile_responsiveness` | Check mobile responsiveness | Ensures layout works across screen sizes |

### Per-step state

`ui_element_map.steps[key]` is `null` (not run) or `{ run_at, issues_found }`. Persisted via `PUT /api/portal/project/business-processes/:id/ui-step-status`.

### Run Analysis flow

1. User clicks Run Analysis on a step.
2. Frontend calls `POST /api/portal/project/business-processes/:id/analyze-page` with the feedback prompt.
3. Backend uses LLM + page screenshot/analysis to surface issues.
4. Issues persisted in `UIElementFeedback` rows (per-element, with hash-based dedup).
5. Step's `run_at` and `issues_found` stamped.
6. Frontend auto-expands the step's panel (commit `bb8c7e1` and earlier) to show the issues.

### Per-issue actions

Each issue in the panel has:

- **Fix** — generates a focused Claude Code prompt for that single element via `prompt_target='ui_fix'` and switches to the Build tab. Marks issue `in_progress`.
- **Done** — marks `resolved` manually.
- **Dismiss** — marks `dismissed`.

### Bulk fix

A "Generate prompt for these N issues" button at the top of the panel bulk-marks all open issues `in_progress` and posts to `/prompt` with `prompt_target='ui_fix_bulk'` plus the array of issue ids. Generates a single combined prompt covering all of them.

### Auto-resolve on validation

`handleValidateBuild` calls `bpApi.bulkResolveFeedback(bpId)` after a successful Build validation, which flips all `in_progress` UI feedback to `resolved`. Stamps `ui_element_map.steps[*].last_resolved_at` per step. Frontend renders "✓ N issues resolved from your last build" for ~1 minute.

### Step status visual states

- `ran && issueCount > 0` → amber `bi-search-heart` icon, **"N issues to fix"** subtitle, pale amber background.
- `ran && issueCount === 0` → green `bi-check-lg` icon, "all issues resolved" subtitle, pale green background.
- Not run → gray.

### Page BP visual review (5-category roll-up)

Page BPs (auto-discovered frontend pages) have their own completion model: 5 categories the user manually verifies via tick boxes:

- `layout`
- `accessibility`
- `responsiveness`
- `interaction`
- `content`

Each category's verification stored in `ui_element_map.category_scores[key].verified`. `pageVisualCompletionPct = (verified count / 5) * 100`. This OVERRIDES requirement coverage as the BP's `completion_pct` for Page BPs.

PUT endpoint: `/api/portal/project/business-processes/:id/page-category` with `{ category, verified }`.

---

## 18. Define Component (Unmapped Pages)

When the repo scan finds frontend pages that don't map to any requirement-driven cap, they're auto-created as **Page BPs** with `is_page_bp = true` and `source = 'frontend_page'`. They appear in the System Components grid as discovered pages, BUT they're flagged `isPendingDefinition` until the user confirms them.

### The pending definition banner

Above the System Components grid, shows pills like "5 pages from your repo aren't yet mapped to a system component". Clicking a pill selects that BP.

### Define Component modal flow

When a Page BP is selected and not yet defined, a modal appears:

1. **Step 1: URL** — preview the route in an iframe (if preview_url is set), confirm the URL is correct. Save calls `PUT /api/portal/project/business-processes/:id/connect-page` with `{ route }` which:
   - Sets `frontend_route` on the cap.
   - Stamps `ui_element_map.user_defined_at`.
2. **Step 2: Action** — pick what to do:
   - **Keep as Standalone Component** → adds to `promotedIds` (frontend state, persists in localStorage).
   - **Attach to Existing Component** → goes to step 3.
3. **Step 3: Select target** — pick from the list of non-discovered, non-Page BPs. Save adds to `pageAttachments[targetCompId]` (frontend state).
4. **Step 4: Done** — close button. Calls `window.location.reload()` (commit `7ed9294`) so the awaiting-definition banner refreshes.

### Backend element-map endpoint

`POST /api/portal/project/business-processes/:id/element-map` saves the discovered UI element structure. Important fix in earlier commit: was wiping `user_defined_at` on every call; now MERGEs to preserve it.

---

## 19. Route Detection & Frontend-Route Wiring

`backend/src/services/routeDetectionService.ts` (commit `fa47f49`).

### The problem it solves

When a per-BP build creates a new frontend page, the user previously had to manually run Define Component to attach a route. This service auto-detects the route from the repo's router config.

### Algorithm: `detectRouteCandidates(enrollmentId, pageFilePath)`

1. **List candidate router files** by name pattern:
   - `App.tsx`, `App.jsx`
   - `routes.tsx`, `Routes.tsx`, `*Routes.tsx` (e.g. `adminRoutes.tsx`)
   - `router.tsx`, `Router.tsx`
   - `main.tsx`, `index.tsx`
2. **Sort by priority** (App.tsx first, then routes.tsx, etc.).
3. **For each router file**, fetch via `readFileFromRepo`:
   - Check if the page component is imported (regex on `import\s+\{?\s*<ComponentName>\b` OR `const <ComponentName>\s*=\s*lazy\(`).
   - If imported, scan for `<Route>` JSX patterns:
     - `<Route path="..." element={<Component .../>} />`
     - `<Route path="..." element={<Component>...</Component>} />`
     - Object-config: `{ path: "...", element: <Component /> }`
     - `{ path: "...", Component: Component }`
   - Extract the path with `confidence: 0.95`.
4. **De-dup** by route, keep highest confidence.
5. **Inferred fallback** (confidence: 0.3): if no JSX match, derive from the page name (`MilestonesPage.tsx` → `/milestones`).

### Used in two places

1. **`applyReportToBP`** — auto-set `frontend_route` if a single high-confidence (≥0.9) candidate is found and significantly above the next.
2. **`GET /api/portal/project/business-processes/:id/route-candidates`** — surfaced on demand for the UI tab's route picker.

### `route-candidates` endpoint extra logic (commit `21fd8c0`)

Considers BOTH `linked_frontend_components` AND repo-scanned files matching the BP's name stems (so it works for BPs where the file came from a name-match scan, not a validation-report link).

### `UIRoutePicker` frontend component

Renders on the UI tab when the page is `pending`. Shows:
- List of route candidates with confidence badges (e.g. "95% — App.tsx via import + Route element").
- Frontend file paths linked to the BP.
- Custom-route input as fallback.
- Save calls `connect-page`.

---

## 20. Preview URL System (Iframe + Direct)

Two URLs per project, both optional:

| Field | Where stored | Purpose |
|---|---|---|
| `portfolio_url` | `Project.portfolio_url` column | Iframe-embedded preview (must be HTTPS + no `X-Frame-Options: DENY`) |
| `direct_preview_url` | `Project.project_variables.direct_preview_url` | "Open in new tab" — any URL |

### How preview URLs compose with frontend_route

Both fields are bases. Per-BP:

```
preview_url        = portfolio_url        + frontend_route
direct_preview_url = direct_preview_url   + frontend_route
```

So if `portfolio_url=https://my-app.vercel.app` and BP has `frontend_route=/milestones`, `preview_url=https://my-app.vercel.app/milestones`.

### Setter endpoints

- `PUT /api/portal/project/preview-url` body `{ url }` → sets `portfolio_url`.
- `PUT /api/portal/project/settings` body `{ direct_preview_url }` → sets `project_variables.direct_preview_url`.

### Frontend `PreviewUrlPanel` (commit `ffaa4a1`)

When the BP has `ui.pages.length > 0` but `previewUrl` is null, the UI tab renders a settings panel instead of "Preview not available". Shows:

- **Three-option guide** (commit `7b257f4` — based on real Claude Code feedback):
  1. Quick — localhost only (Direct URL = localhost, iframe blank, Open-in-new-tab works).
  2. Real iframe — Vercel deploy (frontend deployed, iframe renders, API calls 404 unless backend deployed too).
  3. Full working preview — frontend + backend + DB all deployed.
- **Two input fields** (both optional): Iframe preview base URL + Direct URL.
- **Live preview**: shows what URL the iframe will load.

### Direct URL only mode (commit `7b257f4`)

When `preview_url` is null but `direct_preview_url` is set, the UI tab renders a "Preview ready in a new tab" surface with a big button instead of dumping the user back into the settings panel.

### Iframe rendering

When `previewUrl` is set:

```html
<iframe src={previewUrl}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ width: '100%', height: 500, border: 'none' }} />
```

URL bar above shows the live URL + "Open in new tab" button (using direct URL).

---

## 21. GitHub Integration

`backend/src/services/githubService.ts`.

### Stored on the project

- `GitHubConnection` model (linked 1:1 to project) with:
  - `repo_owner`, `repo_name`
  - `access_token_encrypted` (for private repos)
  - `file_tree_json` (cached `git/trees/{branch}?recursive=1` response)
  - `commit_history_json` (cached recent commits)
  - `default_branch` (auto-detected)

### Functions

- `connectRepo(enrollmentId, repoUrl, accessToken?)` — parses owner/name from URL, validates via API, stores connection.
- `getConnection(enrollmentId)` — fetches the connection.
- `checkRequiredFiles(enrollmentId, paths[])` — checks if specific files exist.
- `getRepoStatus(enrollmentId)` — basic repo metadata (private, default branch, etc.).
- `syncFileTree(enrollmentId)` — fetches the recursive tree from GitHub, computes file count + primary language, stores.
- `syncCommitHistory(enrollmentId)` — fetches recent commits.
- `fullSync(enrollmentId)` — runs both syncs.
- `getFileTree(enrollmentId)` — returns cached tree.
- `readFileFromRepo(enrollmentId, filePath)` — fetches file content via `/repos/{owner}/{name}/contents/{path}` with base64 decoding.
- `writeFileToRepo(enrollmentId, filePath, content, commitMessage)` — creates/updates a file via PUT.
- `writeMultipleFilesToRepo` — batch version.

### Used by

- Activation (file tree + content for repo discovery)
- Cory orchestrator (file tree for layer detection)
- Route detection (router file reads)
- Kickoff sync (file tree refresh + claim verification)
- All prompt generation (file tree for codebase summary)

---

## 22. Cory Fullscreen (Learn Mode + Build Mode Chat)

`CoryFullscreen.tsx` at route `/portal/project/cory`.

### Modes (URL params)

- `mode=learn&componentId=<id>&stepName=<encoded>` — Learn Mode for a specific BP/step.
- `mode=build` (or no mode) — Build Mode (free-form chat to design new functionality).

### Special case: kickoff componentId

When `componentId === '__project_kickoff__'`, the init function skips the API entirely and renders the hardcoded `KICKOFF_LEARN_TEXT` constant. Three continuation buttons: "Generate the kickoff prompt" (navigates back to Blueprint), "What happens after Wave 1?", "Why not just build one BP at a time from the start?".

### Initialization

1. Calls `POST /api/portal/project/architect/start` to create an `ArchitectSession`.
2. If learn mode + componentId:
   - Sets initial Cory message: "Let me look into this for you...".
   - Calls `POST /api/portal/project/architect/learn` with `{ componentId, stepName }`.
   - Replaces the placeholder with the LLM response.
   - Generates 3 continuation buttons (`generateContinuationButtons(stepName, 'learn')`).
3. If build mode: shows a welcome message.

### Architect chat backend

- Uses ArchitectChat infrastructure (`POST /architect/start` + `POST /architect/turn`).
- Sessions persisted in `ArchitectSession` table.

### UI features

- **Markdown rendering** (commit `656cab7`) — uses `react-markdown` with executive-friendly styling: 15px body, 17px h2, 19px h1, real bold, proper indentation. User text stays plain.
- **Close button + Esc shortcut** — explicit Close button in header, Escape key handler that goes back via history (or falls back to Blueprint).
- **Continuation buttons** under each Cory message — click to send canned prompts.
- **Spinner** while Cory is "thinking".
- **Send via Enter** (Shift+Enter for newline).

---

## 23. Mode Awareness (MVP / Production / Enterprise / Autonomous)

The portal supports four execution profiles. Each defines coverage thresholds, maturity targets, and which actions are allowed.

### Profiles (in `intelligence/profiles/executionProfiles.ts`)

| Profile | Maturity threshold | Coverage threshold | Quality gate | Notable |
|---|---|---|---|---|
| MVP | L1 (Prototype) | 60% | Off | Fastest path, allows lots of stubs |
| Production | L3 (Production) | 90% | On (95%) | Default — backend + frontend + tests required |
| Enterprise | L4 (Autonomous) | 95% | On (95%) | Adds agent layer requirements |
| Autonomous | L4 (Autonomous) | 99% | On (99%) | Full autonomous loop with HITL gates |

### Where mode lives

- **Project-level**: `Project.target_mode` (default `'production'`).
- **BP-level override**: `Capability.mode_override` (nullable).
- **Effective mode** for a BP: `mode_override || project.target_mode`.

### Setting modes

- `PUT /api/portal/project/target-mode` body `{ mode, cascade: true }`:
  - Sets project's target_mode.
  - If `cascade !== false` (default true): clears all BP-level overrides + resets `completed_steps` on all BPs (mode change means re-evaluation).
- `PUT /api/portal/project/business-processes/:id/mode` body `{ mode_override }` — per-BP override.
- `POST /api/portal/project/auto-tag-modes` — uses LLM heuristics to suggest per-BP mode overrides.

### Mode-aware completion

A BP is "complete for its mode" if:

```
processComplete = isPageBPComplete OR (meetsMaturity AND isProcessComplete(systemState, profile.completion_thresholds))
```

So Production-mode BPs need maturity ≥ L3 AND coverage ≥ 90% AND quality scores meeting profile thresholds.

### Mode_completion field

The BP detail response includes:

```json
{
  "mode_completion": {
    "target_maturity": 3,
    "current_maturity": 1,
    "complete_for_mode": false,
    "gap_reason": "Maturity L1 below L3 target for production mode"
  }
}
```

---

## 24. Completion Math

Several percentages and scores power the UI. Important to distinguish them.

### `requirements_coverage` (a.k.a. `reqCoverage`, `coverage_pct`)

```
matched_count = requirements with status in {matched, verified, auto_verified}
reqCoverage = round(matched_count / total_requirements * 100)
```

### `system_readiness`

A weighted score combining:

- Layer presence (backend / frontend / agents / models existing).
- Quality scores (determinism, reliability, observability, ux_exposure, automation, production_readiness).

### `quality_score`

Sum of individual quality dimension scores (each 0-10, total max ~60), normalized to 0-100.

### `completion_pct` (the displayed % on the grid)

```ts
completion_pct = isPageBP ? pageVisualCompletionPct : reqCoverage
```

Page BPs use the 5-category visual review tick count. Non-Page BPs use requirement coverage.

### `completion` (from `transformBPs` on the frontend)

```ts
completion = userVerified ? 100 : Math.round(coverage)
```

So `user_status='verified'` overrides everything to 100%.

### `is_complete` (canonical "is this BP done")

```ts
is_complete = (user_status === 'verified') || processComplete
```

`processComplete` is the mode-aware check (maturity + coverage + quality thresholds).

### Maturity levels (L0-L4)

```
L0 Not Started  — no files, no coverage
L1 Prototype    — files OR effective backend exists
L2 Functional   — backend + coverage > 50%
L3 Production   — backend + frontend + coverage > 70%
L4 Autonomous   — backend + frontend + agents + coverage > 85%
```

---

## 25. Layer Detection (Per-Cap vs Project-Level)

Two different layer signals (commit `bffa10c` clarified the distinction):

### Per-capability layer signals

`hasBackend`, `hasFrontend`, `hasAgents` — derived from files matching the cap's name stems:

- `combinedBackendFiles = backendFiles (linked) + processBackendFiles (repo scan matching name stems)`
- Same pattern for frontend, agents.
- Only if ≥1 file matches → `has* = true`.

### Project-level layer signals

`projectHasBackend`, `projectHasFrontend`, `projectHasAgents` — true if ANY file matching that layer's pattern exists in the repo (regardless of cap name).

```ts
projectHasBackend  = repoTree.some(f => /\/(services?|routes?|controllers?|...)\b/i.test(f) && /\.(ts|js|py|go|rs|java)$/.test(f));
projectHasFrontend = repoTree.some(f => /\/(components?|pages?|views?|screens?|layouts?)\b/i.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f));
projectHasAgents   = repoTree.some(f => /(agents?|intelligence|automation|workers?|bots?)\b/i.test(f) && /\.(ts|js|py)$/.test(f));
```

### Where each is used

| Signal | Used for |
|---|---|
| `hasBackend` (per-cap) | `usability.backend` flag (commit `bffa10c` made this strict) |
| `hasFrontend` (per-cap) | `usability.frontend` flag |
| `effectiveBackend` (per-cap OR project) | Maturity scoring, quality scoring |
| `projectHasBackend` | Gap detection ("Backend services needed") |

### Why the distinction matters

Before the fix, `usability.backend` fell back to `effectiveBackend` which is `hasBackend OR projectHasBackend`. This meant once any backend code existed anywhere in the repo, EVERY cap reported `backend: partial` — even pure backend-only caps would show `frontend: partial` because the project had ANY frontend code. Result: the Frontend filter on the BP grid showed every cap.

Now `usability` uses STRICT per-cap signals. Maturity/quality still use the project-level fallback.

### Usability values

- `'ready'` — layer fully present (e.g. backend with `frontend_route` set)
- `'partial'` — layer files match this cap but missing routes/full wiring
- `'missing'` — no layer files for this cap
- `'n/a'` — Page BP (which has `backend: 'n/a'` etc.)

---

## 26. Capability Lifecycle States

Three orthogonal state tracks per cap:

### 1. `applicability_status`

User-set whether this cap is in scope:

- `active` — in scope (default).
- `deferred` — moved to backlog.
- `archived` — not gonna do.

### 2. `user_status` (canonical "user-asserted state")

- `in_progress` (default).
- `verified` — user manually confirmed it's done. Overrides all heuristics. is_complete becomes true. Hidden from Cory's queue.
- `archived` — soft delete. Hidden from grid, hidden from Cory.

### 3. `last_execution.status` (system-tracked execution state)

- (null) — never executed.
- `pending` — Generate Build Prompt clicked, no validation report synced yet.
- `complete` — validation report applied, all promised files present.
- `incomplete` — validation report applied, some files missing.
- `verified` — bulk-verified by user.
- `foundation_built` — kickoff sync applied (cap is no longer fresh, but per-BP completion tracking continues).

### Sources of cap data

- `source = 'parsed'` — generated from clustering at activation.
- `source = 'auto'` — auto-generated by some other process.
- `source = 'frontend_page'` — Page BP discovered from repo.
- `source = 'repo_discovered'` — non-page BP discovered from repo (e.g. a backend service folder).
- `source = 'manual'` — added via "Add Business Process" UI.

---

## 27. Database Models

Selected key models. There are ~170+ Sequelize models total (most are not portal-related).

### Core project models

- **Enrollment** — participant identity + magic link token.
- **Project** — one per enrollment. Has `enrollment_id` (unique), `program_id`, `organization_name`, `industry`, `project_stage`, `target_mode`, `setup_status` (JSONB), `project_variables` (JSONB), `requirements_document` (TEXT), `portfolio_url`.
- **GitHubConnection** — 1:1 with project, holds repo info + cached file tree.

### Capability models

- **Capability** — one per BP. Key columns:
  - `project_id`, `name`, `description`, `source`, `sort_order`
  - `frontend_route` (where the UI lives)
  - `backend_context` (cached read of services/routes/models for this cap)
  - `user_status`, `user_status_set_at`, `user_status_set_by`
  - `applicability_status` (`active` / `deferred` / `archived`)
  - `mode_override` (per-BP target mode)
  - `execution_profile`, `strategy_template`, `modes` (mode tags)
  - `last_execution` (JSONB) — status, completed_steps, validation_report, etc.
  - `linked_backend_services`, `linked_frontend_components`, `linked_agents` (JSONB arrays)
  - `ui_element_map` (JSONB) — visual review state for Page BPs + UI Advisor step state
  - `hitl_config`, `autonomy_level`, `autonomy_history`
  - `strength_scores`, `confidence_score`, `success_rate`, `failure_rate`, `last_evaluated_at`
- **Feature** — one per feature inside a Capability.
- **RequirementsMap** — one per requirement. Maps to a Capability + Feature. Fields: `requirement_key`, `requirement_text`, `status`, `verified_by`, `confidence_score`, `github_file_paths`, `modes`, `verification_status`.

### UI feedback

- **UIElementFeedback** — per-element issues from UI Advisor. Hash-based dedup. Fields: `capability_id`, `project_id`, `element_id`, `element_selector`, `element_type`, `page_route`, `issue_type`, `title`, `description`, `suggestion`, `severity`, `status` (`open / in_progress / resolved / dismissed`), `feedback_hash`, `prompt`, `source` (`rule / llm`), `confidence`, `source_step`, `resolved_by`, `resolved_at`.

### NextAction (legacy)

- **NextAction** — one per project's "currently pending action". Older recommendation system, partially replaced by Cory.

### Architect

- **ArchitectSession** — chat session for `/portal/project/cory` fullscreen.

### Other

- **AssignmentSubmission, AttendanceRecord, LiveSession, Cohort** — accelerator program (live sessions, attendance, etc.) — not directly portal-flow-related.
- **Lead, Campaign, CampaignLead, ...** — CRM side.

---

## 28. Backend Services Inventory

Selected services in `backend/src/services/`:

### Portal flow

- `participantService.ts` — magic link auth.
- `projectService.ts` — `createProjectForEnrollment`, `getProjectByEnrollment`, stage transitions.
- `projectSetupService.ts` — `connectGitHub`, `activateProject`.
- `projectScopeService.ts` — `getCapabilityHierarchy` — assembles caps + features + requirements.
- `requirementClusteringService.ts` — LLM-based clustering with batching + progress map.
- `requirementsMatchingService.ts` — matches requirements to repo files.
- `requirementsGenerationService.ts` — generates requirements (alt path to architect).
- `architectProxyService.ts` — wraps the external Architect.
- `frontendPreviewService.ts` — preview URL setter + getter.

### Validation + sync

- `validationReportParser.ts` — parses paste-back reports.
- `kickoffSyncService.ts` — project-wide validation apply + reset.
- `routeDetectionService.ts` — finds router config + matches page files to routes.

### Intelligence

- `intelligence/coryOrchestrator.ts` — Cory's core scoring + task generation.
- `intelligence/coryTaskTypes.ts` — `CoryTask` interface + related types.
- `intelligence/agentEvolutionEngine.ts` — analyzes process evolution.
- `intelligence/promptGenerator.ts` — builds Claude Code prompts.
- `intelligence/profiles/executionProfiles.ts` — MVP/Production/Enterprise/Autonomous.
- `intelligence/strategies/strategyTemplates.ts` — strategy template overrides.
- `intelligence/requirements/gapDetectionEngine.ts` — finds missing reqs.
- `intelligence/execution/reconciliationEngine.ts` — reconciles claims vs reality.
- `intelligence/execution/validationParser.ts` — alt parser.
- `intelligence/processSyncEngine.ts` — sync engine.

### Other

- `nextAction/nextActionService.ts` — legacy next-action service.
- `nextAction/requirementPriorityService.ts` — prioritizer.
- `nextAction/actionGeneratorService.ts` — action generator.
- `pageBPSurface.ts` — discovers Page BP attachable backend + agents.
- `uiFeedbackStore.ts` — UI feedback CRUD.
- `extensiveCheckService.ts` — deep verification.
- `verification/verificationOrchestrator.ts` — orchestrates verification flows.
- `risk/riskOrchestrator.ts` — risk analysis.
- `mentorInterventionService.ts` — escalations to mentors.
- `previewStackService.ts` — per-user Docker preview stacks (Phase 1 live).
- `claudeMdService.ts` — manages CLAUDE.md file in user repos.
- `projectReconciliationService.ts` — reconciles state.

---

## 29. Full API Endpoint Catalog

`projectRoutes.ts` — ~120 endpoints grouped by purpose. Selected highlights (full list at the file head, lines 26-5215):

### Setup

- `GET /setup/status`
- `POST /setup/requirements` — save requirements doc
- `POST /setup/claude-md` — save CLAUDE.md content
- `POST /setup/github` — connect repo
- `POST /setup/activate` — kick off activation
- `GET /setup/activation-progress` — poll progress

### Project

- `GET /api/portal/project` — basic project info
- `GET /artifacts`, `/portfolio`, `/executive`, `/mentor`, `/workflow`
- `POST /refresh` — manual refresh

### Architect

- `POST /architect-build` — kick off external architect
- `GET /architect-status` — poll architect
- `POST /architect/start` — start chat session
- `POST /architect/turn` — chat turn
- `POST /architect/learn` — learn mode
- `GET /architect/sessions` — list sessions

### Requirements

- `POST /requirements/expand-questions` — 9-phase Discovery Framework
- `POST /requirements/generate` — alt generation
- `POST /requirements/extract` — extract from doc
- `POST /requirements/match` — match to files
- `GET /requirements/map` — view map
- `PUT /requirements/map/:id` — update map entry

### Capabilities / BPs

- `GET /business-processes` — list all
- `GET /business-processes/:id` — single BP detail
- `PUT /business-processes/:id/hitl` — HITL config
- `PUT /business-processes/:id/autonomy` — autonomy level
- `POST /business-processes/:id/evaluate` — re-evaluate
- `POST /business-processes/:id/prompt` — generate prompt
- `POST /business-processes/:id/combined-prompt` — combined prompt
- `POST /business-processes/:id/validation-report` — submit report
- `POST /business-processes/:id/sync` — sync to repo
- `POST /business-processes/:id/resync` — re-discover
- `POST /business-processes/:id/accept-suggestion` — accept Cory suggestion
- `POST /business-processes/:id/predict` — predict impact
- `GET /business-processes/:id/verify` — verification status
- `PUT /business-processes/:id/mode` — set mode override
- `PUT /business-processes/:id/user-status` — set user_status
- `PUT /business-processes/:id/profile` — execution profile
- `POST /business-processes/bulk-verify` — bulk mark verified
- `POST /business-processes/reclassify` — re-cluster orphans
- `POST /business-processes/add` — add new BP manually
- `PUT /business-processes/:id/lifecycle` — applicability_status
- `GET /business-processes/:id/backend-context` — read repo backend
- `PUT /business-processes/:id/page-category` — Page BP visual review
- `POST /business-processes/:id/element-map` — store discovered UI elements
- `GET /business-processes/:id/element-feedback` — get UI Advisor feedback
- `POST /business-processes/:id/analyze-page` — run UI Advisor
- `PUT /business-processes/:id/ui-step-status` — update UI Advisor step state
- `PUT /business-processes/:id/element-feedback/bulk-resolve` — bulk resolve in_progress
- `PUT /element-feedback/:feedbackId` — single feedback update
- `POST /business-processes/:id/ui-feedback` — submit UI feedback
- `GET /business-processes/:id/route-candidates` — route detection
- `PUT /business-processes/:id/connect-page` — set frontend_route
- `PUT /business-processes/:id/frontend-route` — set frontend_route (alt)

### Cory + Kickoff

- `GET /cory-tasks` — Cory's project-wide top 5
- `POST /kickoff-prompt` — generate kickoff prompt
- `POST /kickoff-sync` — apply kickoff report
- `POST /kickoff-sync/reset` — undo kickoff sync

### Pages / Routes

- `POST /discover-pages` — find pages in repo
- `GET /frontend-routes` — list routes
- `POST /auto-map-routes` — auto-attach routes to BPs

### Settings / Modes

- `PUT /target-mode` — project target mode
- `POST /auto-tag-modes` — LLM mode tagging
- `GET /system-prompt` / `PUT /system-prompt` — project system prompt
- `GET /system-prompt/draft` — draft from heuristics

### Preview

- `PUT /preview-url` — iframe base URL
- `PUT /settings` — direct_preview_url
- `GET /preview-status` — preview stack status

### NextAction (legacy)

- `GET /next-action`
- `POST /next-action/accept`
- `POST /next-action/complete`

### Steering / Reconciliation

- `POST /steer` — propose steering action
- `POST /steer/:actionId/apply` — apply steering
- `POST /steer/:actionId/revert` — revert
- `GET /steering-history` — history
- `POST /reconcile` — reconcile state

### Misc

- `GET /execution-status`, `/execution-intelligence`, `/execution-activity`
- `POST /execution-ticket` — create execution ticket
- `GET /capabilities`, `POST /capabilities/scope`, `POST /capabilities/add-feature`, `POST /capabilities/recluster`
- `GET /github/tree`, `GET /github/status`, `POST /github/sync`
- `GET /progress`, `POST /progress/refresh`
- `POST /verify`, `GET /verification-status`
- `POST /progression-evaluate` — adaptive progression
- `GET /warroom` — warroom dashboard
- `GET /risk-summary` — risk analysis
- `POST /contract/generate`, `GET /contract`, `POST /contract/lock`
- `POST /suggestions/generate`, `POST /suggestions/select`
- `GET /claude-md`, `POST /claude-md/push` — CLAUDE.md sync
- `POST /scaffold/generate` — scaffolding
- `GET /workstation-context` — for IDE integrations
- `POST /discover-code`
- `GET /taxonomy`, `POST /taxonomy/regenerate`
- `GET /system-model`, `POST /system-model/refresh`
- `GET /decision-rules`
- `POST /compile`, `POST /compile/all`, `GET /compile/status`
- `POST /build-preview`
- `GET /interventions`
- `GET /export`
- `GET /guided-execution`

---

## 30. Recent Fixes, Known Limitations, and Tech Debt

### Recent fixes (this session)

| Commit | Fix |
|---|---|
| `4532653` | Project kickoff task as first wave for fresh projects |
| `a0811ca` | Kickoff fresh-project detection: only count `complete`/`verified` (not `pending`) |
| `656cab7` | Cory: close button, markdown rendering, kickoff-aware Learn |
| `a2450b1` | Kickoff prompt builds all phases in one session, single final report |
| `e1810cc` | Align kickoff task title with full-build prompt; hide stale Up next |
| `bcbbd1b` | Auto-create project on architect-build/target-mode for fresh enrollments |
| `f80a54b` | Reframe kickoff as 'foundation' (not 'full project') |
| `8e06e2f` | Replace yes/no setup questions with 9-phase Discovery Framework |
| `2321ebe` | Fix React error #310 / TDZ via uiAnalyzeRef pattern |
| `7ed9294` | Refresh page after Define Component to clear awaiting banner |
| `e2e7b0b` | Activation spinner: clear cluster progress, prefer activation status, bump frontend timeout |
| `df69df9` | Architect status proxy uses JSON endpoint; loosen 9-phase normalizer |
| `d5842fa` | Project-level kickoff sync — fan evidence across capabilities |
| `e8dab83` | Phase status detection — loose match (em-dash safe) |
| `ef7a9bc` | Kickoff sync no longer auto-verifies reqs or pollutes layer linkage |
| `2717a3b` | Reset endpoint: snapshot-less fallback for pre-snapshot kickoff runs |
| `bffa10c` | Per-cap usability uses strict per-cap layer signals, not project fallback |
| `8ae7948` | Kickoff sync: drop req status changes entirely, attach hint files only |
| `fa47f49` | Auto-attach frontend_route on validation; UI tab unlocks via route picker |
| `21fd8c0` | Route picker: also trigger on per-BP repo-scan frontend signal |
| `ffaa4a1` | Inline preview URL settings panel on the UI tab |
| `7b257f4` | Preview panel: explicit 3-option guide + new-tab surface for localhost users |
| `c9093ea` | Order System Components grid by Cory's recommended priority |

### Known limitations

1. **No real CI/CD** — production deploys are manual SSH + `docker compose up`. Backend startup runs `sequelize.sync({ alter: true })` which is slow.
2. **Magic link tokens are reusable** — by design (so users can bookmark), but means a leaked link gives long-lived access.
3. **No SSO/OAuth** — only magic link.
4. **OpenAI is a hard dependency** — every clustering/expand-questions/UI Advisor call is an LLM call. Cost scales with project size.
5. **Architect is fragile** — long async pipeline at advisor.colaberry.ai. The portal handles common failures (HTML scrape fallback, retry on expand-questions) but the Architect itself can hang on a single chapter.
6. **Page BP visual review is binary per category** — no granular feedback within a category. UI Advisor partially addresses this.
7. **Iframe preview requires HTTPS + frameable** — localhost won't iframe. The "Open in new tab" workaround is the only path for local dev servers.
8. **Per-BP prompts get long** — they include the entire codebase summary + system prompt + target details. Can hit Claude Code context limits on huge repos.
9. **Cory's scoring is heuristic** — no learning loop. The same repo state will always produce the same recommendation.
10. **Reset endpoints are project-scoped** — no per-cap reset.
11. **No undo for "Mark Verified"** — can be reversed via PUT user-status, but no first-class undo.
12. **The 9 framework questions are LLM-generated per call** — not cached. Fresh calls cost ~$0.001 each but introduce variability.
13. **No multi-tenant org-level features** — each enrollment has its own isolated project. Org-level rollups exist on the admin side but aren't exposed to participants.

### Tech debt

1. **`projectRoutes.ts` is 5200+ lines, 120+ endpoints** — should be split into multiple route files (BP routes, kickoff routes, setup routes, etc.).
2. **Two parallel orchestrators** — Cory (new) and NextAction (legacy). NextAction is still wired in some endpoints.
3. **Two parallel parsers** — `validationReportParser.ts` and `intelligence/execution/validationParser.ts`.
4. **Frontend page state in localStorage** — `pageAttachments`, `promotedIds`, `ignoredIds`, `detachedPages` all persist in localStorage rather than the DB. Sync drift possible.
5. **`enrichCapability` is ~700 lines** — does too much (layer detection, maturity scoring, execution plan, usability flags, exec history merging). Should be decomposed.
6. **Inline IIFEs in JSX** — frequent `(() => {...})()` patterns in SystemBlueprint.tsx and SystemViewV2.tsx. Should be extracted to subcomponents.
7. **Many endpoints don't use middleware-extracted ownership checks** — `findOwnedCapability` is open-coded in many handlers.
8. **No structured logging** — `console.log` everywhere with ad-hoc prefixes.
9. **Migration system is `sequelize.sync({ alter: true })`** — known to fail on shared resource exhaustion in production. Several endpoints have explicit "ensure column exists" SQL as workaround.
10. **The Architect proxy assumes a specific HTML structure** of the Architect's pages for fallback scraping. JSON endpoint helps but coverage isn't full.

---

## End

This document captures the portal as of 2026-05-01. For changes after that date, the commit log is authoritative.
