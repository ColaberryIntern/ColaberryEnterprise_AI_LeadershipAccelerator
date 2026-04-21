# Colaberry Enterprise AI Accelerator Portal — Complete System Documentation

This document captures every feature, metric, flow, background process, and architectural decision in the Accelerator Portal. It is intended as a reference for UI/UX overhaul — nothing should be changed or removed without understanding what it does and why.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Portal Authentication & Navigation](#2-portal-authentication--navigation)
3. [Project Dashboard — All 5 Tabs](#3-project-dashboard--all-5-tabs)
4. [Business Process Detail Panel](#4-business-process-detail-panel)
5. [Code BPs vs Page BPs](#5-code-bps-vs-page-bps)
6. [All Metrics & How They Are Calculated](#6-all-metrics--how-they-are-calculated)
7. [Quality Dimensions (6 Scores)](#7-quality-dimensions-6-scores)
8. [Maturity Levels (L0–L5)](#8-maturity-levels-l0l5)
9. [Mode System (MVP / Production / Enterprise / Autonomous)](#9-mode-system-mvp--production--enterprise--autonomous)
10. [Usability Scoring](#10-usability-scoring)
11. [Enhancement Prompt Builder (Section 8)](#11-enhancement-prompt-builder-section-8)
12. [Prompt Generation System](#12-prompt-generation-system)
13. [Path to Autonomous — Goal & Mechanics](#13-path-to-autonomous--goal--mechanics)
14. [Sync Flows (GitHub, Resync, Validation Report)](#14-sync-flows-github-resync-validation-report)
15. [Preview Stack System](#15-preview-stack-system)
16. [System Intelligence Panel](#16-system-intelligence-panel)
17. [Architect Chat System](#17-architect-chat-system)
18. [UI Feedback System (Page BPs)](#18-ui-feedback-system-page-bps)
19. [Project Onboarding Flow](#19-project-onboarding-flow)
20. [Docker Architecture](#20-docker-architecture)
21. [Background Processes & Scheduler](#21-background-processes--scheduler)
22. [Data Model — What Fills What](#22-data-model--what-fills-what)
23. [All Buttons & What They Do](#23-all-buttons--what-they-do)
24. [Security & Determinism Assessment](#24-security--determinism-assessment)
25. [Key Files Reference](#25-key-files-reference)

---

## 1. System Architecture Overview

The Accelerator Portal is a full-stack application for building, tracking, and autonomously evolving AI-powered business processes.

**Stack:**
- **Frontend:** React (CRA) + Bootstrap 5 + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL 15 (with pgvector extension)
- **Intelligence Engine:** Python Flask service (LLM orchestration)
- **Reverse Proxy:** Nginx (serves built React, proxies API to backend)
- **Containerization:** Docker Compose (production + per-user preview stacks)

**Core Concepts:**
- A **Project** represents a student's AI initiative (e.g., ShipCES, LandJet Growth Engine)
- Each project has **Business Processes (BPs)** — discrete capabilities to be built
- BPs have **Requirements** extracted from a requirements document
- Requirements are **matched** to actual repo files via keyword analysis + LLM verification
- **Metrics** (coverage, readiness, quality, maturity) are computed deterministically from file/requirement state
- The system generates **Claude Code prompts** to guide implementation
- **Background agents** continuously monitor and expand requirements for autonomous-mode projects

**Data Flow:**
```
Requirements Document → Parse → RequirementsMap rows → Match to GitHub files
                                                        ↓
GitHub Repo ← Sync ← File tree + Commits → enrichCapability() → Metrics
                                                        ↓
                                            Execution Plan → Prompts → Claude Code
                                                        ↓
                                            Validation Report → Re-enrich → Gap Detection
```

---

## 2. Portal Authentication & Navigation

### Authentication
- **Magic Link** system — no passwords
- User enters email → system sends a link with a UUID token
- Token stored on the `Enrollment` record with 24-hour expiry
- Tokens are **reusable** (not cleared on use) so users can bookmark their portal link
- On verification, a JWT is issued (7-day expiry) with enrollment ID, email, cohort_id

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/portal/login` | PortalLoginPage | Email input for magic link |
| `/portal/verify` | PortalVerifyPage | Token verification + JWT issuance |
| `/portal/dashboard` | Redirects → `/portal/project` | Legacy redirect |
| `/portal/project` | ProjectDashboard | **Main hub** — 5 tabs |
| `/portal/project/artifacts` | ProjectArtifacts | Artifact category board |
| `/portal/project/portfolio` | ProjectPortfolio | Portfolio preview |
| `/portal/project/executive` | ExecutiveDeliverable | Executive summary document |
| `/portal/curriculum` | PortalCurriculumPage | Course curriculum |
| `/portal/sessions` | PortalSessionsPage | Live session schedule |
| `/portal/sessions/:id` | PortalSessionDetailPage | Individual session detail |
| `/portal/assignments` | PortalAssignmentsPage | Assignment submissions |
| `/portal/progress` | PortalProgressPage | Student progress tracking |

### Navigation
- **Top navbar:** "Accelerator Portal" brand + "Project" link + "Sessions" link + Sign Out
- **Dev mode banner** shows when `REACT_APP_ENV === 'dev'`

---

## 3. Project Dashboard — All 5 Tabs

The Project Dashboard (`/portal/project`) is the main hub. It has a persistent header section and 5 switchable tabs.

### Persistent Header (Always Visible)

**ProjectHeader component:**
- Organization name (e.g., "ShipCES — AI Project")
- "Open AI Workstation" button — opens ChatGPT in new tab
- Project stage badge (Discovery / Architecture / Implementation / Portfolio / Complete)

**ProjectProgress component:**
- 5-step visual progress bar: Discovery → Architecture → Implementation → Portfolio → Complete
- Current stage highlighted with filled circle

**Next Business Process Card:**
- Shows the highest-priority unfinished BP
- Displays: name, requirement count (matched/total), readiness %, maturity level
- "Start Work" button — opens the BP detail panel
- **Usability badge:** "Usable" (green) or "Not Ready" (red)

**Target Mode Selector (slider):**
- 4 modes: MVP → Production → Enterprise → Autonomous
- Each shows: maturity target, coverage target, description
- Changing mode recalculates all BP completion thresholds
- Default: Production

### Tab 1: Overview

**Readiness KPI Bar** (5 compact metrics):
| Metric | Source | Color Logic |
|--------|--------|-------------|
| Readiness | `execution_status.readiness` | Green ≥70%, Yellow ≥40%, Red <40% |
| Requirements | `execution_status.requirements` | Same color logic |
| Health | `execution_status.health` | Same color logic |
| Velocity | `execution_status.velocity` | Same color logic |
| Stability | `execution_status.stability` | Same color logic |

**System Architecture Card:**
- Scanned file count, component count, detected language
- Architecture flow diagram showing layers: Frontend → API → Services → Database → Agents
- Interactive layer selector (click a layer to see its components)
- Framework badges (React, Express, PostgreSQL, etc.)
- Architecture style badge (e.g., "microservices architecture")
- Infrastructure container count
- "Refresh" button to re-scan

**Project System Prompt Card:**
- Editable textarea for project-wide context
- This text is injected into ALL generated Claude Code prompts
- Examples: "Use PostgreSQL", "Follow our API conventions", "Require audit logging"
- "Save" and "Cancel" buttons

**Execution Overview:**
- CapabilityGrid — visual matrix of all BPs with status colors
- RepoComponentsPanel — repo analysis showing component breakdown by type

### Tab 2: Business Processes

This is the primary working tab. Shows all BPs as a card grid with filtering.

**Header Stats:**
- Total processes count
- Completed count / total
- Matched requirements / total requirements
- Overall completion % badge

**Filter Controls:**
- **Layer filter:** All | Code | Pages | Backend | Frontend | Agents
- **Lifecycle filter:** Active | Deferred | All
- **Overall % badge** (color-coded)

**Reclassification Banner** (conditional):
- Appears when >10 requirements lack a BP category
- "Reclassify Now" button — runs LLM-based requirement clustering

**BP Cards Grid** (3 columns):

Each card shows:

| Element | Code BP | Page BP |
|---------|---------|---------|
| Border color | Maturity level color | Purple (#8b5cf6) |
| Background | White | Light purple (#faf5ff) |
| Priority badge | "#1", "#2", etc. | Same |
| Name | Process name | Process name + layout icon |
| Mode badge | Shows if not production (e.g., "MVP ✦") | Same |
| Maturity badge | L0–L5 with color | Same |
| Usability badge | "Usable" or "Not Ready" | Same |
| Layer dots | Backend + Frontend + Agents | Frontend only + "Page BP" label |
| Metric 1 | Matched % | UX Improvements % |
| Metric 2 | Readiness % | Page Health % |
| Metric 3 | Quality % | Visual Quality % |
| Maturity bar | Shows L1–L4 thresholds | Same |
| Gap count | Number of unmatched requirements | Same |

**Clicking a card** opens the full BP Detail Panel (see Section 4).

### Tab 3: Execution (War Room)

Real-time execution monitoring with risk alerts.

**Risk Alert Banner** (if risks detected):
- Risk level (high/medium/low) with color
- Risk type and reason
- Suggested action

**Health Scores Row** (3 cards):
- Health Score %
- Velocity %
- Stability %

**Header Stats** (4 cards):
- Readiness Score %
- Requirements Completion %
- Verified Complete count / total
- Recent Events count

**Current Action Card:**
- Title of the active execution step
- Action type badge (Create/Update/Build/Fix)
- Status badge (accepted/pending)
- Reason text
- Confidence %

**Progress Breakdown Card:**
- Artifact Completion: score + detail
- Requirements Coverage: score + detail
- GitHub Health: score + detail
- Portfolio Quality: score + detail
- Workflow Progress: score + detail

**Requirement Coverage Card:**
- Coverage bar (green=complete, yellow=partial)
- Scrollable list of requirements with:
  - Requirement key
  - Verification badge (Verified/Partial/Not Verified)
  - Confidence %
  - Expandable details (text, notes, semantic status)

**Activity Feed Card:**
- Recent events (scrollable)
- Each event: type icon, title, timestamp (relative), detail text, confidence badge

**Anomalies Section** (conditional):
- Shows detected anomalies by type and severity

**Artifact Graph Summary** (conditional):
- Node/edge count
- First 20 artifact badges

### Tab 4: Code Intelligence

Two sub-sections: GitHub and Requirements.

**GitHub Section:**
- Repository URL link
- "Sync Now" button — triggers full GitHub sync
- 4 metric cards: Files, Language, Total Commits, Last Sync
- **Commit History Timeline:**
  - Each commit: message, author, SHA badge, files changed, time ago
  - Green dot for latest commit, grey for older
  - "Load More Commits" button
  - Click a commit → detail modal with analysis (infers agent/backend/frontend/DB changes from message keywords)

**Requirements Section:**
- "Extract Requirements" button — parses requirements document into rows
- "Match to Repo" button — runs keyword matching against GitHub files
- Progress bar during extraction with step text
- Stats row: Total, Matched (green), Partial (orange), Unmatched (grey)
- Filter controls: text search, BP dropdown filter, clear button
- Requirements table: key, text, BP badge, status badge, confidence %, file count
- Paginated (first 100)

### Tab 5: System Evolution

**Add Business Process Card:**
- Text input: "e.g., I want automated email onboarding..."
- "Add" button — creates a new BP from natural language description
- Success/error feedback

**System Documents Card:**
- 4 document types (2-column grid):
  - Requirements
  - CLAUDE.md
  - System Prompt
  - Interaction Protocol
- Each shows "Click to compile and edit"
- Clicking opens an editor with "Save & Replace" button

---

## 4. Business Process Detail Panel

Opens when a BP card is clicked on the Business Processes tab. This is the most feature-dense part of the portal.

**Sections (numbered):**

### Section 1: Process Overview
- Process name and description
- System Intelligence panel (see Section 16)

### Section 2: System Truth
- Layer status dots: Backend (ready/partial/missing), Frontend, Agents
- Key metrics displayed:
  - Requirements Coverage %
  - System Readiness %
  - Quality Score %

### Section 3: What Exists (Implementation Links)
- Lists matched files organized by layer:
  - Backend files (services, routes, controllers)
  - Frontend files (components, pages)
  - Agent files
  - Database models
- Collapsible, shows first few then "show all"

### Section 3.2: Backend Stack (Auto-Loaded)
- **Auto-loads on mount** — no manual button click needed
- Shows discovered backend context:
  - **API Endpoints table:** Method, Path, Details (middleware, description), Source file
  - **Database Models table:** Model name, Table name, Fields with types, Associations
  - **Agents table:** Agent name, Methods with parameters
- "Refresh" button to reload
- Data extracted by reading actual source files from the repo (regex-based parsing)

### Section 4: Requirements
- Requirements grouped by feature
- Each requirement shows: text, status badge (matched/verified/partial/unmatched), confidence %
- Expandable to show matched files

### Section 5: Requirements Status
- Summary counts: total, matched, verified, unmatched

### Section 6: Gaps Analysis
- Shows unmatched or low-confidence requirements
- Visual gap indicators

### Section 7: Autonomous Enhancements (Conditional)
- Only appears if the BP has system-generated requirements (`verified_by: 'AUTONOMOUS_ENGINE'`)
- Shows auto-generated requirements with:
  - Purple left border and robot badge
  - Gap type icon (behavior/intelligence/optimization/reporting)
  - Impact score (X/10)
  - Status badge
  - Category and generation date

### Section 7.5: Quality Scores
- Maturity level display with color
- Progress bar toward next maturity level
- "L2 Functional → L3 Target" style display

### Section 8: Enhancement Prompt Builder
- **See Section 11** for full details
- Unified section combining execution steps + autonomy gaps with checkboxes
- "Generate & Copy Prompt" button

### Preview Section (Page BPs Only)
- Iframe showing the live preview of the page
- Overlay while preview stack boots
- "Open in new tab" link

### UI Feedback Section (Page BPs Only)
- **See Section 18** for full details
- Quick action buttons for common improvements
- Custom feedback input
- Issue list with fix/resolve/dismiss buttons

### Validation Report Modal
- Accessible from PredictionModal or standalone button (Page BPs)
- Textarea for pasting Claude Code output
- "Submit & Verify" button
- Shows results: requirements verified, files created/modified, routes, database changes
- Post-submit metrics display

### Resync Modal
- Shows after a resync operation
- Last step verification (complete/incomplete)
- LLM-generated summary of changes
- Before/after metrics table
- KPI change indicators

---

## 5. Code BPs vs Page BPs

These are fundamentally different types of business processes with different completion criteria.

### Code BPs (Requirement BPs)
- **Source:** Extracted from the requirements document during project setup
- **Created by:** Document parsing + LLM clustering into capabilities
- **Requirements:** Full hierarchy — Features → Requirements → Matched files
- **Completion criteria:** Must meet mode-specific thresholds:
  - Maturity level threshold (e.g., L3 for Production mode)
  - Requirements coverage threshold (e.g., 90% for Production)
  - Quality score threshold (e.g., 70% for Production)
  - Required infrastructure layers present
- **Layer checks:** Backend + Frontend + Agents (all 3 evaluated)
- **Card styling:** Border color = maturity level color
- **Card metrics:** Matched %, Readiness %, Quality %
- **Feedback:** Prompt generation (Fix Backend, Add UI, Enhance Agent)
- **Priority ranking:** Gap-driven scoring (200-500 range)

### Page BPs (Report BPs / Frontend Pages)
- **Source:** Auto-discovered from frontend files in the repo
- **Created by:** `frontendPageDiscovery.ts` — scans for Next.js pages, React CRA pages, etc.
- **Requirements:** None initially (0 requirements) — UX improvement requirements can be added later via UI feedback
- **Completion criteria:** Much simpler:
  - `frontend_route` is set (page is connected to an actual route)
  - No pending UX requirements
- **Layer checks:** Frontend only (Backend and Agents shown as "n/a")
- **Card styling:** Purple border (#8b5cf6), light purple background (#faf5ff)
- **Card metrics:** UX Improvements %, Page Health %, Visual Quality %
- **Feedback:** UI element analysis with fix suggestions (accessibility, layout, UX)
- **Priority ranking:** Page importance scoring (100-190 range, always below incomplete code BPs)

### How Page BPs Are Created
1. `frontendPageDiscovery.ts` scans the repo file tree for page files
2. Detects patterns: `app/{route}/page.tsx`, `src/pages/*Page.tsx`, `src/components/*Page.tsx`
3. Returns discovered pages with route, file path, and category (admin/portal/public)
4. `processOrphanedPages()` checks which pages have no BP mapped
5. Creates Page BPs for orphaned pages with:
   - `source: 'frontend_page'`
   - `frontend_route: page.route`
   - Default "User Experience" feature for collecting UX requirements
   - Sort order 200 (lower priority)

### Route Mapping
- **Auto-mapping:** LLM (GPT-4o-mini) maps BP names to available routes during setup
- **Manual override:** Users can select/change the route via a dropdown in the detail panel
- **Route discovery:** `GET /api/portal/project/frontend-routes` scans the repo for route definitions

---

## 6. All Metrics & How They Are Calculated

All metrics are computed by the `enrichCapability()` function in `projectRoutes.ts` (lines 1143-1558). This function runs every time a BP detail is requested — it's deterministic and computed from current file/requirement state.

### Requirements Coverage (`reqCoverage`)
```
reqCoverage = (matchedRequirements / totalRequirements) × 100
```
- **Range:** 0-100%
- **Matched** means: status is 'verified', 'auto_verified', or 'matched'
- **Total** includes all requirements for the BP (across all features)
- If totalRequirements = 0 (page BPs), coverage = 0

### Layer Score (`layerScore`)
```
layerScore = (hasBackend ? 50 : 0) + (hasFrontend ? 30 : 0) + (hasAgents ? 20 : 0)
```
- **Range:** 0-100
- Based on file detection in the repo (regex patterns match service/route/controller files, component/page files, agent files)
- Dual detection: checks BP-specific file matches AND project-level file detection

### System Readiness (`readiness`)
```
readiness = (layerScore × 0.4) + (reqCoverage × 0.6)
```
- **Range:** 0-100
- 60% weight on requirements, 40% on infrastructure
- Example: Backend only (50 layer) + 60% coverage = (50×0.4) + (60×0.6) = 20 + 36 = 56

### Quality Score (`qualityTotal`)
```
qualityTotal = sum(6 quality dimensions) × 100 / 60
```
- **Range:** 0-100%
- See Section 7 for individual dimension formulas

### Execution Plan Health Metrics (Tab 3: Execution)
- **Health Score:** Composite of artifact completion + requirements coverage + GitHub health
- **Velocity:** Rate of progress based on recent activity events
- **Stability:** Inverse of anomaly count and failure rate

---

## 7. Quality Dimensions (6 Scores)

Each dimension is scored 0-10. They measure different aspects of system maturity.

### Determinism (0-10)
```
if hasBackend:
  determinism = min(10, 5 + backendFileCount)
else if reqCoverage > 50:
  determinism = 2
else:
  determinism = 0
```
- **What it measures:** How much business logic is in deterministic code vs LLM-generated responses
- **How to improve:** Add more backend service files
- **Deterministic?** Yes — purely based on file count

### Reliability (0-10)
```
if hasModels:
  reliability = min(10, 4 + modelFileCount)
else if hasBackend:
  reliability = 2
else:
  reliability = 0
```
- **What it measures:** Data persistence and structured error handling
- **How to improve:** Add database models and migrations
- **Deterministic?** Yes — purely based on model file count

### Observability (0-10)
```
observability = 0  // Currently hardcoded to 0
```
- **What it measures:** Monitoring, logging, and alerting capability
- **Note:** Reserved for future implementation. Always 0 in current system.
- **Deterministic?** Yes (trivially)

### UX Exposure (0-10)
```
if hasFrontend:
  ux_exposure = min(10, 6 + frontendFileCount)
else:
  ux_exposure = 0
```
- **What it measures:** User interface availability and coverage
- **How to improve:** Add frontend components and pages
- **Deterministic?** Yes — purely based on frontend file count

### Automation (0-10)
```
if hasAgents:
  automation = min(10, 6 + agentFileCount)
else if reqCoverage > 70:
  automation = 1
else:
  automation = 0
```
- **What it measures:** AI agent presence and automation level
- **How to improve:** Add agent implementation files
- **Deterministic?** Yes — purely based on agent file count

### Production Readiness (0-10)
```
production_readiness = min(10,
  (hasBackend ? 3 : 0) +
  (hasFrontend ? 3 : 0) +
  (hasAgents ? 2 : 0) +
  (hasModels ? 2 : 0)
)
```
- **What it measures:** Holistic system maturity across all layers
- **How to improve:** Build out all infrastructure layers
- **Deterministic?** Yes — boolean layer checks

### File Detection Patterns

**Backend files:** Matched by regex patterns:
- `/service|route|controller|handler|gateway|api|server|resolver/i`
- Files in `backend/`, `src/` directories with `.ts`, `.js`, `.py`, `.go` extensions

**Frontend files:** Matched by:
- `/component|page|view|screen|layout/i`
- Files with `.tsx`, `.jsx`, `.vue`, `.svelte` extensions
- Files in `frontend/`, `app/`, `pages/`, `components/` directories

**Database models:** Matched by:
- `/model|schema|entity|migration/i`
- Files in `models/` directory (excluding index files)

**Agent files:** Matched by:
- Filenames containing `agent` or `Agent` with `.ts` extension
- Excludes: timestamp-prefixed files, seed files, migration files, compiled `.js`

---

## 8. Maturity Levels (L0–L5)

Maturity is a deterministic assessment of infrastructure readiness. It does NOT depend on quality — only on layers present and coverage achieved.

| Level | Label | Requirements | What It Means |
|-------|-------|-------------|---------------|
| **L0** | Not Started | No conditions met | Concept only, no implementation files |
| **L1** | Prototype | Files exist in repo OR backend detected | Early-stage — some code exists |
| **L2** | Functional | Backend exists AND coverage > 50% | Core features working, requirements half-matched |
| **L3** | Production | Backend + Frontend exist AND coverage > 70% | Ready for production use |
| **L4** | Autonomous | Backend + Frontend + Agents AND coverage > 85% | AI-driven execution possible |
| **L5** | Self-Optimizing | All layers + coverage > 95% + quality > 70% | Fully autonomous with continuous improvement |

**Logic (exact conditions):**
```
L5: hasBackend AND hasFrontend AND hasAgents AND reqCoverage > 95% AND qualityTotal > 70%
L4: hasBackend AND hasFrontend AND hasAgents AND reqCoverage > 85%
L3: hasBackend AND hasFrontend AND reqCoverage > 70%
L2: hasBackend AND reqCoverage > 50%
L1: anyFiles.length > 0 OR hasBackend
L0: default
```

**Colors used in UI:**
- L0: Grey (#9ca3af)
- L1: Red (var(--color-danger))
- L2: Yellow (var(--color-warning))
- L3: Blue (var(--color-info))
- L4: Green (var(--color-success))
- L5: Purple (#8b5cf6)

---

## 9. Mode System (MVP / Production / Enterprise / Autonomous)

Modes set different completion thresholds for BPs. A BP's "mode" determines what maturity level and coverage it needs to be considered "complete."

| Mode | Maturity Target | Req Coverage | Quality Score | Required Layers | Structural Check |
|------|----------------|-------------|---------------|-----------------|-----------------|
| **MVP** | L2 Functional | ≥60% | ≥40% | Backend only | Skip |
| **Production** | L3 Production | ≥90% | ≥70% | Backend + Frontend + Models | Warn |
| **Enterprise** | L4 Autonomous | ≥95% | ≥85% | Backend + Frontend + Models + Agents | Block |
| **Autonomous** | L5 Self-Optimizing | ≥98% | ≥90% | All layers | Block |

### Mode Resolution (Precedence)
1. **BP-level override** (`mode_override` on Capability) — highest priority
2. **Campaign override** (if BP is in a campaign with a specific mode)
3. **Project target mode** (`target_mode` on Project)
4. **Default:** Production

### How Modes Affect Behavior
- **Requirement filtering:** Requirements tagged with `modes: ['enterprise']` only appear in Enterprise+ modes. This means MVP/Production users see fewer requirements.
- **Completion thresholds:** Each mode has different bars for "done." An MVP BP is complete at L2 + 60% coverage. A Production BP needs L3 + 90%.
- **Execution plan:** Mode profiles define `allowed_action_keys` — which steps are available. MVP mode may skip agent-related steps.
- **Autonomous mode:** Enables background autonomous requirement expansion (gap detection + auto-generated requirements every 15 minutes).

### Mode Display
- Non-production modes show a badge on the BP card (e.g., "MVP", "Enterprise ✦")
- The ✦ symbol indicates the mode was overridden at the BP level (not inherited from project)
- Mode completion status shows in the detail panel: "Meets L3 target" or "Below L3 target"

---

## 10. Usability Scoring

The usability object determines whether a BP shows "Usable" or "Not Ready."

### Structure
```json
{
  "backend": "ready" | "partial" | "missing",
  "frontend": "ready" | "partial" | "missing",
  "agent": "ready" | "missing",
  "usable": true | false,
  "why_not": ["Connect a frontend route to mark as ready"]
}
```

### For Code BPs
- `backend`: 'ready' if reqCoverage > 70%, 'partial' if some coverage, 'missing' if no backend
- `frontend`: 'ready' if frontend files found, 'partial' if basic detection, 'missing' if none
- `agent`: 'ready' if agent files detected, 'missing' otherwise
- `usable`: TRUE only if the BP meets its mode's maturity threshold AND completion thresholds (coverage + quality)
- `why_not`: Lists specific blockers (e.g., "Coverage below 90%", "Missing frontend layer")

### For Page BPs
- `backend`: Based on `backend_context` — if API routes detected, 'ready'; else 'n/a'
- `frontend`: 'ready' if `frontend_route` is set, 'missing' if not connected
- `agent`: Based on `backend_context` agents; else 'n/a'
- `usable`: TRUE if `frontend_route` is set AND no pending UX requirements
- `why_not`: "Connect a frontend route to mark as ready"

---

## 11. Enhancement Prompt Builder (Section 8)

This is the unified prompt generation section that combines execution steps and autonomy gaps into a single checklist.

### Two Subsections

**Execution Steps** (blue-tinted background):
- Dynamic steps generated by the Next Best Action Engine based on current BP state
- Each step shows: step number, label, impact badge, "Preview" button
- Steps can be **blocked** (greyed out, checkbox disabled) if dependencies aren't met
- Each step has a `prompt_target` that maps to a prompt generator function
- Examples: "Build Backend" (priority 100), "Add Database" (90), "Add Frontend" (80), "Add Agents" (70)

**Path to Autonomous** (purple-tinted background):
- Gap detection results from `gapDetectionEngine.ts`
- 4 gap types, each with icon:
  - 🧑 Behavior — missing user tracking, decision logging
  - 💡 Intelligence — no AI agents, pattern detection, simulation
  - ⚡ Optimization — no feedback loops, performance scoring
  - 📊 Reporting — missing dashboards, agent visibility
- Each gap shows: title, description, severity (X/10), gap type badge
- Some gaps include **Suggested Agent** (green dashed border):
  - Monitoring agents (Process Health Monitor, Agent Performance Monitor)
  - Alerting agents (KPI Tracking Agent)
  - Analytics agents (Feedback Collection Agent)
  - Each agent has its own checkbox

### How It Works
1. User checks items they want to build (execution steps, gaps, agents)
2. Click "Generate & Copy Prompt"
3. System calls `POST /api/portal/project/business-processes/:id/combined-prompt`
4. Backend generates a single consolidated Claude Code PLAN MODE prompt
5. Prompt is copied to clipboard
6. User pastes into Claude Code, builds, then submits validation report

### Action Bar
- Item count display ("N items selected")
- "Select All" / "Clear" buttons
- "Generate & Copy Prompt (N)" button (purple, disabled when 0 selected)

---

## 12. Prompt Generation System

All prompts follow a consistent structure designed for Claude Code's PLAN MODE.

### Prompt Structure
```
1. PREAMBLE: "You are operating in Claude Code PLAN MODE. DO NOT start coding immediately..."
2. PROJECT CONTEXT: Project name, repo URL, system prompt
3. CODEBASE STRUCTURE: Top-level directories with file counts, key files list
4. OBJECTIVE: What to build (target-specific)
5. BUSINESS CONTEXT: BP description, current state
6. WHAT TO BUILD: Numbered steps specific to the action
7. CONSTRAINTS: "Follow existing patterns, don't break things, additive only"
8. VALIDATION REPORT FORMAT: Exact template for output
```

### Prompt Targets (11 types)

| Target | When Generated | What It Builds |
|--------|---------------|----------------|
| `backend_improvement` | No backend exists | Backend services and API routes |
| `frontend_exposure` | No frontend exists | Frontend UI components and pages |
| `agent_enhancement` | No agents exist | AI agent implementations |
| `add_database` | No models exist | Database models and migrations |
| `requirement_implementation` | >3 unmapped requirements | Implements specific unmatched requirements |
| `improve_reliability` | Quality < 60% | Error handling, validation, retry logic |
| `verify_requirements` | Unverified matches exist | Manually verify auto-matched requirements |
| `optimize_performance` | All layers built, quality < 90% | DB optimization, caching, pagination |
| `hitl_adjustment` | Manual HITL tuning | Human-in-the-loop configuration |
| `autonomy_upgrade` | Upgrading autonomy level | Success rate, monitoring, rollback |
| `monitoring_gap` | Observability score low | KPI tracking, anomaly detection, logging |

### Combined Prompt (New)
The Enhancement Prompt Builder generates a combined prompt that includes:
- Selected execution step objectives (reusing per-target generators)
- Selected autonomy gap descriptions
- Selected agent creation instructions
- All wrapped in the standard preamble/codebase/constraints/validation structure

### System Blocks (Accelerator-Specific)
For the Accelerator's own codebase, prompts include additional system blocks with Sequelize patterns, Op.iLike usage, and Accelerator-specific file paths. These are NOT injected for other projects.

### Project-Specific Context
Prompts are dynamically built from:
- The project's GitHub file tree (not hardcoded paths)
- The project's system prompt
- The project's repo URL and name
- The BP's description and current state
This means prompts are accurate regardless of which project they're generated for.

---

## 13. Path to Autonomous — Goal & Mechanics

### Goal
Move each business process from manual operation to fully autonomous self-operation. The system continuously detects what's missing and guides users to fill gaps.

### How It Works

**Gap Detection Engine** (`gapDetectionEngine.ts`):
- Runs deterministically (no LLM calls)
- Analyzes 4 gap categories with max 3 gaps per type per BP
- Uses quality scores, linked files, and requirement keywords as signals
- Gaps require multiple signals before surfacing (prevents false positives)

**Gap Types and What They Detect:**

| Type | Gap ID | Title | Signals | Severity |
|------|--------|-------|---------|----------|
| Behavior | BEHAVIOR-USER-TRACKING | User Interaction Tracking | observability=0, no tracking files, no tracking requirements | 7/10 |
| Behavior | BEHAVIOR-DECISION-LOGGING | Decision Audit Logging | No decision/audit logging files or requirements | 6/10 |
| Intelligence | INTELLIGENCE-RECOMMENDATIONS | Smart Recommendations | automation=0, no linked agents | 8/10 |
| Intelligence | INTELLIGENCE-PATTERN-DETECTION | Pattern Detection | No pattern/anomaly/trend requirements | 7/10 |
| Intelligence | INTELLIGENCE-SIMULATION | Simulation Capability | No simulation/forecast requirements | 6/10 |
| Optimization | OPTIMIZATION-FEEDBACK-LOOP | Feedback Loop | production_readiness < 5, no feedback requirements | 6/10 |
| Optimization | OPTIMIZATION-PERFORMANCE-SCORING | Performance Scoring | No performance/benchmark/kpi requirements | 5/10 |
| Reporting | REPORTING-DASHBOARD | Process Health Dashboard | ux_exposure < 3, no dashboard requirements | 5/10 |
| Reporting | REPORTING-AGENT-VISIBILITY | Agent Performance Visibility | No agent monitoring requirements | 4/10 |

**Suggested Agents (attached to gaps):**
- OPTIMIZATION-FEEDBACK-LOOP → "Feedback Collection Agent" (analytics)
- OPTIMIZATION-PERFORMANCE-SCORING → "KPI Tracking Agent" (alerting)
- REPORTING-DASHBOARD → "Process Health Monitor" (monitoring)
- REPORTING-AGENT-VISIBILITY → "Agent Performance Monitor" (monitoring)

**Suppression Logic:**
- Gaps already addressed (via build history) are filtered out
- Gaps that already have auto-generated requirements are filtered out
- Build history tracks: files created, routes built, keywords, and gap IDs from past validation reports

**Autonomous Expansion (Background):**
- Runs every 15 minutes for projects with `target_mode='autonomous'`
- Calls gap detection → generates RequirementsMap rows with `verified_by: 'AUTONOMOUS_ENGINE'`
- Includes feedback loop: updates outcomes for past auto-generated requirements
- Safety limits: max 5 requirements per BP, max 20 per project, max 50 per day, max 30 outstanding

---

## 14. Sync Flows (GitHub, Resync, Validation Report)

### GitHub Sync (`fullSync`)
**Trigger:** "Sync Now" button on Code Intelligence tab, or automatic during resync
**What it does:**
1. Fetches recursive file tree from GitHub API
2. Detects primary language from file extension counts
3. Stores tree in `connection.file_tree_json`
4. Fetches latest N commits (default 20)
5. Extracts: SHA, message, author, date, files_changed
6. Stores in `commit_summary_json`
7. Updates `last_sync_at` timestamp

**Deterministic?** Yes — reads GitHub state directly
**Secure?** Uses stored GitHub access token per enrollment

### Resync (Multi-Stage Requirement Matching)
**Trigger:** Manual "Resync" button on BP detail panel
**Purpose:** Re-evaluate all requirements against current repo state

**Stages (in order):**

1. **Capture BEFORE snapshot** — records current readiness, quality, coverage metrics

2. **Full GitHub sync** — ensures file tree is up-to-date

3. **Keyword-based matching** (strict):
   - Extracts keywords (3+ chars, no stopwords) from each requirement
   - Filters noise files (package.json, .env, dotfiles, migrations, tests, build artifacts)
   - Requires 30% keyword overlap with file paths/names
   - Confidence: ≥0.7 = matched, ≥0.3 = partial, <0.3 = unmatched
   - Preserves already-matched/verified requirements (additive only)

4. **Process-level matching:**
   - If process has implementation files (services/, routes/, agents/, models/)
   - Promotes unmatched/partial to "matched" at 0.75 confidence
   - Requires ≥4-char stem match of process name

5. **LLM verification:**
   - For still-unmatched requirements
   - Sends file tree + requirement text to LLM
   - Confidence 0.85 for verified

6. **Content-aware verification (deep dive):**
   - Reads actual source code from matched files
   - LLM analyzes file content vs requirement text
   - Confidence 0.9 for content-verified matches

7. **Auto-verify stragglers (two tiers):**
   - Tier 1: If ≥50% matched AND <5 unmatched remain → auto-verify at 0.7
   - Tier 2: If 0% matched but project has implementation AND <5 reqs → verify at 0.6

8. **Reconciliation** — rebuilds dependency graph, recalculates metrics

9. **Capture AFTER snapshot** — detects regressions by comparing before/after

10. **Execution promise verification:**
    - Checks if the last prompt's promised files now exist in repo
    - Tracks: found_files, missing_files, status (complete/incomplete)
    - Auto-completes steps if no new files needed

11. **LLM summary generation:**
    - If no changes: static bullet list (no LLM)
    - If real changes: GPT-4o-mini generates 3-4 executive-facing bullets

**Deterministic?** Stages 1-4, 7-10 are deterministic. Stages 5-6 use LLM (GPT-4o-mini).
**Secure?** Operates on authenticated user's repo only.

### Validation Report
**Trigger:** "Submit & Verify" in the report modal (after pasting Claude Code output)

**Flow:**
1. Parse report text with regex — extracts: filesCreated, filesModified, routes, database, status, duplicatesNoted
2. Apply to BP — updates `last_execution.validation_report`, records commit SHA
3. Re-enrich capability — recalculates all metrics
4. Gap detection — detects remaining gaps for autonomous suggestions

**Response includes:**
- `parsed`: structured report data
- `requirementsVerified`: count of newly verified requirements
- `requirementsTotal`: total requirements
- `metrics_after`: updated coverage, readiness, quality, maturity
- `autonomous_suggestions`: remaining gaps (now shown in Section 8)

**Deterministic?** Parsing is deterministic. Re-enrichment is deterministic.

---

## 15. Preview Stack System

Per-user isolated Docker environments booted from each project's repository.

### How It Works

1. **Provision request** — user action or API call
2. **Allocate slug** — unique identifier from project name
3. **Clone repo** — `git clone --depth 1` using GitHub token
4. **Verify compose file** — `docker-compose.preview.yml` must exist in repo root
5. **Seed environment** — copies `.env.preview.example` to `.env.preview` if missing
6. **Allocate ports** — frontend: 10000-10500, backend: 10500-10999 (collision-safe)
7. **Boot stack** — `docker compose up -d --build` with environment variables:
   - `PREVIEW_SLUG`, `PREVIEW_FRONTEND_PORT`, `PREVIEW_BACKEND_PORT`
   - `PREVIEW_DB_VOLUME`, `PREVIEW_CPU_LIMIT`, `PREVIEW_MEM_LIMIT`
8. **Stack running** — accessible at allocated port

### Stack Lifecycle
- **Provisioning** → **Running** → **Stopped** (idle timeout) → **Archived** (teardown)
- Idle timeout: 30 minutes default
- Reaper service stops idle stacks to free resources
- Stopped stacks can be re-booted

### Preview in Portal
- BP detail panel shows iframe with preview URL
- Overlay while stack boots
- "Open in new tab" link uses `direct_preview_url` (bypasses proxy for clean access)
- Preview status polled every 3 seconds until running

### Resource Limits
- CPU: 0.5 cores per service (configurable)
- Memory: 512MB per service (configurable)
- Each stack gets its own PostgreSQL volume

---

## 16. System Intelligence Panel

Displayed in the BP detail panel, showing real-time system awareness.

**Components:**
- Architecture diagram (layers: Frontend → API → Services → Database → Agents)
- Active connections between layers
- Layer health indicators
- Process flow visualization
- Risk assessment

**Data Source:** Computed from enriched capability data + agent mappings + implementation links.

---

## 17. Architect Chat System

Conversational UI (bottom-right floating button) for designing new BPs through guided conversation.

### UI
- Minimized: pill button with robot icon
- Expanded: 420×540px chat modal
- Message bubbles (user right, system left)
- Quick-reply option buttons
- Summary cards and prompt output blocks

### Conversation Phases
1. **Identify:** "What would you like to build?" — user describes need
2. **Clarify:** "Which category fits best?" — system offers options
3. **Design:** "Describe the core functionality..." — deeper requirements
4. **Requirements:** "What specific requirements matter?" — detailed specs
5. **Generate:** Creates Capability + Feature + RequirementsMap rows in database
6. **Prompt:** Generates execution prompt for Claude Code
7. **Complete:** Returns created BP with requirement count

### Backend
- `POST /api/portal/project/architect/start` — creates session
- `POST /api/portal/project/architect/turn` — processes each message
- `GET /api/portal/project/architect/sessions` — lists recent sessions
- State machine in `architectEngine.ts` manages phase progression
- Each turn may include: message, options, examples, summary, prompt, action_required, created_bp

---

## 18. UI Feedback System (Page BPs)

Only available for Page BPs and BPs with a `frontend_route` set.

### Quick Action Buttons
- "Improve Layout" — layout, spacing, visual hierarchy
- "Fix UX Issues" — usability issues, broken interactions
- "Make Enterprise Ready" — accessibility, security, error handling
- "Optimize for Conversion" — CTAs, user flow
- "Mobile Responsive" — mobile/tablet layout
- "Accessibility Audit" — WCAG 2.1 AA compliance

### Analysis Engine (`uiFeedbackEngine.ts`)
**Phase 1: Rule-Based (Deterministic)**
11 rule categories run first:
- Hierarchy: Missing h1, heading level skips
- Accessibility: Missing alt text, form labels, accessible names
- Interaction: Vague link text ("click here", "read more")
- Content: Long text blocks
- Navigation: Missing nav landmark
- Forms: Forms without accessible names

**Phase 2: LLM Augmentation (Non-Deterministic)**
- Triggered when rules find <3 issues OR user provides custom feedback
- Uses GPT-4o-mini with detailed system prompt
- Constrained to analyze only the current page

### Results Display
Each issue shows:
- Severity badge (high/medium/low)
- Title and description
- Suggestion for fix
- Source badge (rule/llm)
- "Fix" button — copies a Claude Code prompt for that specific issue
- "Resolved" button — marks as done
- "Dismiss" button — hides the issue

### "Fix All" Button
- Aggregates all open issues into a single prompt
- Copies to clipboard
- Format: numbered list of issues with severity, description, and fix suggestion

### Storage
- Issues stored in `ui_element_feedback` table
- Deduplicated by SHA256 hash of `elementId|issueType|description`
- Unique constraint on `(capability_id, feedback_hash)`

---

## 19. Project Onboarding Flow

Three-step setup + activation sequence. Nothing activates until all steps complete.

### Step 1: Upload Requirements Document
- `POST /api/portal/project/setup/requirements`
- Input: `{ content: string }` (raw text of requirements doc)
- Stores in `project.requirements_document`
- Quick-parses to show requirement count preview

### Step 2: Upload CLAUDE.md
- `POST /api/portal/project/setup/claude-md`
- Input: `{ content: string }`
- Stores in `project.claude_md_content`
- Provides coding agent guidelines for the project

### Step 3: Connect GitHub Repository
- `POST /api/portal/project/setup/github`
- Input: `{ repo_url, access_token? }`
- Stores repo URL, parses owner/name
- Auto-runs `processOrphanedPages()` to discover frontend pages

### Step 4: Activate (Background Job)
- `POST /api/portal/project/setup/activate`
- Returns immediately with `{ status: 'processing' }`
- Background sequence:
  1. Parse requirements → create RequirementsMap rows (status='unmatched')
  2. Cluster requirements into Capabilities → Features hierarchy via LLM
  3. Full GitHub sync (file tree + commits)
  4. Match requirements to repo files (keyword-based)
  5. Set `project_stage = 'implementation'`, `setup_status.activated = true`

### Progress Tracking
- In-memory progress map per enrollment
- Cascading sources: activation progress → clustering progress
- Auto-cleanup after 5 minutes of completion/failure
- `GET /api/portal/project/setup/status` returns current setup state

---

## 20. Docker Architecture

### Production Stack (`docker-compose.production.yml`)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **postgres** | pgvector/pgvector:pg15 | 5432 (internal) | PostgreSQL with vector extension |
| **backend** | Custom (node:20-bookworm-slim) | 3001 (internal) | Express API + Playwright + Docker CLI |
| **intelligence** | Custom (Python Flask) | 5000 (internal) | LLM orchestration engine |
| **nginx** | Custom (nginx:alpine) | 8888:80 (public) | Serves React build + proxies API |

### Backend Container Details
- **Build:** Multi-stage — Node 20 builder compiles TypeScript, runtime copies dist
- **Includes:** Playwright with Chromium, Xvfb (headless display), Docker CLI + Compose plugin
- **Mounts:** Docker socket (for preview provisioning), preview-stacks directory, uploads, screenshots, browser profiles
- **Env:** DATABASE_URL, INTELLIGENCE_ENGINE_URL, NODE_OPTIONS (512MB heap)
- **Preview support:** PREVIEW_STACKS_ROOT, PORT_POOL_START/END, CPU/MEM limits

### Nginx Container Details
- **Build:** Multi-stage — Node 20 Alpine builds React frontend, nginx:alpine serves
- **Config:** `nginx/nginx.conf` routes `/api/` to backend upstream, everything else serves React
- **SPA support:** `try_files $uri /index.html` for client-side routing

### Intelligence Container
- Python Flask service
- Models: GPT-4o-mini (default), text-embedding-3-small
- Handles LLM calls, embeddings, semantic analysis
- Internal only — not exposed publicly

### Preview Stack (`docker-compose.preview.yml`)
- Template in each project's repo root
- Spawned per-user with isolated postgres
- CPU/memory capped
- No intelligence service by default
- Auto-reaped after 30 minutes idle

### Deployment
- **Production URL:** enterprise.colaberry.ai
- **VPS:** 95.216.199.47
- **Cloudflare:** DNS proxy in front
- **Deploy command:** `ssh root@95.216.199.47 "cd /opt/colaberry-accelerator && git pull origin main && docker compose -f docker-compose.production.yml up -d --build"`
- **No CI/CD** — manual SSH deployment

---

## 21. Background Processes & Scheduler

The `aiOpsScheduler.ts` orchestrates all background jobs using `node-cron`.

### Scheduling System
- Each agent has a hardcoded default cron schedule
- Schedules can be overridden via `cron_schedule_configs` database table
- On startup: seeds departments (18), agent registry (176 agents), admissions knowledge base
- Logs each agent's schedule source (DB or hardcoded)

### Key Intelligence Jobs

| Job | Schedule | What It Does |
|-----|----------|-------------|
| **AutonomousRequirementExpansion** | Every 15 min (3,18,33,48) | Detects gaps → generates requirements for autonomous-mode projects |
| **AutonomousEngine** | Every 10 min (5,15,...55) | Evaluates and executes autonomous decisions |
| **AICOOStrategicCycle** | Every 30 min | Cory Brain — strategic planning and reasoning |
| **MetaAgentLoop** | Every hour (:02) | Meta-level agent coordination |
| **IntelligenceRetentionCycle** | Daily 3:15 AM | Archives/compacts historical agent logs |

### Platform Core Jobs

| Job | Schedule | What It Does |
|-----|----------|-------------|
| **OrchestrationHealthAgent** | Every 5 min | Monitors system health |
| **StudentProgressMonitor** | Every 2 min | Tracks student progress |
| **PromptMonitorAgent** | Every 1 min | Monitors prompt execution |
| **OrchestrationAutoRepairAgent** | Every 5 min | Auto-repairs system issues |
| **SystemAutoResponse** | Every 1 min | Evaluates and sends auto-responses |

### Campaign Jobs

| Job | Schedule | What It Does |
|-----|----------|-------------|
| **CampaignHealthScanner** | Every 15 min | Scans campaign health |
| **CampaignRepairAgent** | Every 20 min | Repairs broken campaigns |
| **CampaignSelfHealingAgent** | Every 30 min | Self-healing for campaigns |
| **ContentOptimizationAgent** | Every 6 hours | Optimizes content |
| **CampaignQAAgent** | Every 6 hours | Quality checks on campaigns |

### Reporting & Briefings

| Job | Schedule | What It Does |
|-----|----------|-------------|
| **DailyExecutiveBriefing** | 7 AM daily | Generates executive briefing |
| **WeeklyStrategicBriefing** | 7 AM Mondays | Weekly strategic summary |
| **ExecutiveMorningDigest** | 7 AM daily | Morning digest email |
| **ExecutiveEveningDigest** | 6 PM daily | Evening digest email |
| **StrategicMetricCapture** | Every 15 min | Captures strategic metrics |

### Other Categories
- **Admissions Intelligence:** 11 agents (2-30 min intervals) — lead management, outreach
- **OpenClaw Network:** 11 agents (2-30 min intervals) — social media posting, monitoring
- **Department Strategy Architects:** 16 agents (every 6 hours, staggered) — department-specific strategy
- **Security Operations:** 8 agents — code audit, dependency scanning, threat detection
- **Super Agents:** 8 agents (every 30 min, staggered) — high-level coordination

### Cooldown & Safety
- Per-project cooldowns prevent thrashing (e.g., 10-minute cooldown on autonomous expansion)
- Safety limits on auto-generated requirements (max 5/BP, 20/project, 50/day)
- Failed jobs are logged but don't crash the scheduler

---

## 22. Data Model — What Fills What

### Core Tables and Their Data Sources

| Table | What It Stores | Filled By |
|-------|---------------|-----------|
| **Project** | Organization, industry, use case, target_mode, project_variables, requirements_document, claude_md_content | Setup wizard, user input |
| **Enrollment** | Student email, cohort, portal_token, portal_enabled | Admin creation, magic link auth |
| **Capability** | BP name, description, type, source, frontend_route, mode_override, backend_context, last_execution, strength_scores | Requirements clustering, enrichCapability, prompt execution |
| **Feature** | Feature name under a capability, requirements group | Requirements clustering |
| **RequirementsMap** | Individual requirements: text, key, status, confidence, matched files | Requirements extraction, matching, resync, autonomous expansion |
| **GitHubConnection** | Repo URL, owner, name, file_tree_json, commit_summary_json, file_count, language | GitHub sync |
| **PreviewStack** | Stack slug, ports, status, repo_commit_sha, failure_reason | Preview provisioning |
| **PreviewEvent** | Stack events (provision, boot, error, stop) | Preview lifecycle |
| **UIElementFeedback** | Page analysis issues: title, description, suggestion, severity, status | UI feedback engine |
| **AiAgent** | Agent name, status, run_count, error_count, category, description | Agent registry, execution |
| **AiAgentActivityLog** | Agent execution logs: action, result, confidence, duration | Agent runtime |
| **BposExecutionSnapshot** | Before/after metrics snapshots for resync tracking | Resync verification |
| **ArchitectSession** | Chat session state, generated prompt, created_bp_id | Architect chat |
| **ReportingInsight** | Auto-generated reporting suggestions | Autonomous expansion |
| **CronScheduleConfig** | Database-driven cron overrides for agents | Admin configuration |

### Key JSONB Fields

**Capability.last_execution:**
```json
{
  "step": "Build backend for Security Management",
  "target": "backend_improvement",
  "promised_files": [],
  "promised_at": "2026-04-20T...",
  "status": "pending",
  "completed_steps": ["build_backend", "add_database"],
  "validation_report": { "filesCreated": [...], "routes": [...] }
}
```

**Capability.backend_context** (cached 1 hour):
```json
{
  "api_routes": [{ "method": "GET", "path": "/api/...", "source_file": "...", "middleware": [...] }],
  "models": [{ "name": "User", "table_name": "users", "fields": [...], "associations": [...] }],
  "agents": [{ "name": "SecurityAgent", "methods": [...] }]
}
```

**Project.project_variables:**
```json
{
  "system_prompt": "Use PostgreSQL, follow our API conventions...",
  "direct_preview_url": "http://95.216.199.47:8889"
}
```

**GitHubConnection.file_tree_json:**
```json
{
  "tree": [{ "path": "backend/src/routes/api.ts", "type": "blob", "sha": "..." }, ...]
}
```

---

## 23. All Buttons & What They Do

### Project Dashboard Header
| Button | What It Does |
|--------|-------------|
| "Open AI Workstation" | Opens ChatGPT in new tab |
| "Start Work" | Opens highest-priority BP detail panel |
| Mode slider (MVP/Production/Enterprise/Autonomous) | Changes completion thresholds for all BPs |

### Overview Tab
| Button | What It Does |
|--------|-------------|
| Architecture layer boxes | Click to view components in that layer |
| "Refresh" (architecture) | Re-scans repo for architecture data |
| "Save" (system prompt) | Saves project system prompt to database |
| "Cancel" (system prompt) | Discards system prompt edits |

### Business Processes Tab
| Button | What It Does |
|--------|-------------|
| Layer filter buttons (All/Code/Pages/Backend/Frontend/Agents) | Filters BP cards by layer type |
| Lifecycle filter (Active/Deferred/All) | Filters by lifecycle status |
| "Reclassify Now" | Runs LLM-based requirement re-clustering |
| BP card click | Opens BP detail panel |

### BP Detail Panel
| Button | What It Does |
|--------|-------------|
| "Preview" (execution step) | Opens PredictionModal with impact preview + prompt |
| Execution step checkboxes | Select items for combined prompt |
| Autonomy gap checkboxes | Select gaps for combined prompt |
| Agent checkboxes | Select agent creation for combined prompt |
| "Select All" | Checks all available items |
| "Clear" | Unchecks all items |
| "Generate & Copy Prompt (N)" | Generates combined prompt, copies to clipboard |
| "Submit Report" (Page BPs) | Opens validation report modal |
| "Refresh" (backend context) | Re-reads backend source files from repo |
| "Analyze UI" (Page BPs) | Runs UI feedback analysis |
| Quick action buttons (Page BPs) | Pre-set UI analysis categories |
| "Fix" (issue) | Copies Claude Code fix prompt for single issue |
| "Fix All" (issues) | Copies combined fix prompt for all open issues |
| "Resolved" (issue) | Marks UI issue as resolved |
| "Dismiss" (issue) | Hides UI issue |

### PredictionModal
| Button | What It Does |
|--------|-------------|
| "Copy Prompt" | Copies the generated prompt to clipboard |
| "Submit Report" | Opens validation report view within modal |
| "Submit & Verify" | Parses report, verifies requirements, shows impact |
| "Continue" | Closes modal |

### Code Intelligence Tab
| Button | What It Does |
|--------|-------------|
| "Sync Now" | Triggers full GitHub sync (file tree + commits) |
| "Load More Commits" | Fetches older commits |
| Commit click | Opens commit detail modal |
| "Extract Requirements" | Parses requirements document into rows |
| "Match to Repo" | Runs keyword matching against GitHub files |
| Clear filters | Resets search and filter controls |

### System Evolution Tab
| Button | What It Does |
|--------|-------------|
| "Add" (business process) | Creates new BP from natural language description |
| Document card click | Opens document editor |
| "Save & Replace" | Saves compiled document |

### Architect Chat
| Button | What It Does |
|--------|-------------|
| Architect pill button | Opens/closes chat modal |
| Option buttons | Quick-reply to system questions |
| Reset button | Starts fresh conversation |
| Minimize button | Collapses chat |
| Copy prompt button | Copies generated prompt to clipboard |
| Confirm/Cancel | Confirms or cancels BP creation |

---

## 24. Security & Determinism Assessment

### Authentication & Authorization
- **Portal:** Magic link tokens + JWT — no passwords stored
- **GitHub:** Access tokens stored encrypted per enrollment
- **Admin:** Separate admin auth system (not covered here)
- **API:** All portal endpoints require `requireParticipant` middleware
- **Project isolation:** Users can only access their own project (enrollment-scoped queries)

### Deterministic Processes (No LLM, Reproducible)
- ✅ `enrichCapability()` — all metrics computed from file counts and requirement status
- ✅ Maturity level calculation — threshold checks only
- ✅ Quality dimension scoring — file count formulas
- ✅ Usability scoring — boolean layer checks
- ✅ Gap detection engine — keyword/signal matching
- ✅ Mode resolution — precedence-based lookup
- ✅ Build history tracking — file path analysis
- ✅ GitHub file tree sync — reads GitHub API
- ✅ Validation report parsing — regex extraction
- ✅ Execution plan generation — priority-based step ordering
- ✅ Preview stack provisioning — Docker orchestration

### Non-Deterministic Processes (LLM-Dependent)
- ❌ Resync stages 5-6 — LLM verification of requirement matches
- ❌ Resync stage 11 — LLM summary generation (GPT-4o-mini)
- ❌ UI feedback augmentation — GPT-4o-mini for creative analysis
- ❌ Requirement clustering — LLM groups requirements into capabilities
- ❌ Frontend route mapping — LLM maps BP names to routes
- ❌ Architect chat — multi-turn LLM conversation
- ❌ Autonomous engine decisions — LLM-evaluated proposals
- ❌ Content optimization — LLM-driven content generation
- ❌ Strategy briefings — LLM-generated summaries

### Data Safety
- No user passwords stored (magic link only)
- GitHub tokens stored in database (should be encrypted at rest)
- Preview stacks get their own isolated databases
- Docker socket mounted in backend (required for preview provisioning — security consideration)
- File reads limited to authenticated user's repo
- Requirement data is project-scoped (no cross-project leakage)

---

## 25. Key Files Reference

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/routes/portalRoutes.tsx` | All portal route definitions |
| `frontend/src/pages/project/ProjectDashboard.tsx` | Main dashboard with 5 tabs |
| `frontend/src/components/project/PortalBusinessProcessesTab.tsx` | BP card grid + filtering |
| `frontend/src/components/project/PortalBusinessProcessDetail.tsx` | BP detail panel (1200+ lines) |
| `frontend/src/components/project/EnhancementPromptBuilder.tsx` | Unified prompt builder (Section 8) |
| `frontend/src/components/project/PredictionModal.tsx` | Impact preview + report submission |
| `frontend/src/components/project/ArchitectChat.tsx` | Conversational BP design |
| `frontend/src/components/project/SystemIntelligencePanel.tsx` | System intelligence display |
| `frontend/src/components/project/WarRoomTab.tsx` | Execution tab content |
| `frontend/src/services/portalBusinessProcessApi.ts` | BP API client |
| `frontend/src/utils/portalApi.ts` | Authenticated API client |

### Backend — Routes
| File | Purpose |
|------|---------|
| `backend/src/routes/projectRoutes.ts` | All portal project API routes (3000+ lines) |
| `backend/src/routes/participantRoutes.ts` | Auth + profile routes |
| `backend/src/routes/admin/autonomyRoutes.ts` | Autonomy decision management |

### Backend — Intelligence
| File | Purpose |
|------|---------|
| `backend/src/intelligence/promptGenerator.ts` | Generates Claude Code prompts |
| `backend/src/intelligence/nextBestActionEngine.ts` | Execution plan step generation |
| `backend/src/intelligence/predictiveEngine.ts` | Impact prediction per action |
| `backend/src/intelligence/requirements/gapDetectionEngine.ts` | Path to Autonomous gap detection |
| `backend/src/intelligence/requirements/requirementGenerationEngine.ts` | Converts gaps to requirements |
| `backend/src/intelligence/architect/architectEngine.ts` | Multi-turn chat state machine |
| `backend/src/intelligence/agentEvolutionEngine.ts` | Agent improvement recommendations |
| `backend/src/intelligence/execution/reconciliationEngine.ts` | Post-execution reconciliation |
| `backend/src/intelligence/profiles/executionProfiles.ts` | Mode thresholds (MVP/Prod/Enterprise/Auto) |

### Backend — Services
| File | Purpose |
|------|---------|
| `backend/src/services/aiOpsScheduler.ts` | Background job scheduler |
| `backend/src/services/autonomousRequirementExpansionService.ts` | Auto gap detection + requirement generation |
| `backend/src/services/githubService.ts` | GitHub sync, file read/write |
| `backend/src/services/backendContextService.ts` | Extracts API routes, models, agents from source |
| `backend/src/services/uiFeedbackEngine.ts` | Rule-based + LLM page analysis |
| `backend/src/services/uiFeedbackStore.ts` | Feedback CRUD + dedup |
| `backend/src/services/buildHistoryService.ts` | Tracks what's been built |
| `backend/src/services/previewStackService.ts` | Preview stack provisioning |
| `backend/src/services/frontendPageDiscovery.ts` | Discovers frontend pages from repo |
| `backend/src/services/projectSetupService.ts` | Project onboarding flow |
| `backend/src/services/projectService.ts` | Core project operations |
| `backend/src/services/requirementsMatchingService.ts` | Keyword-based requirement matching |

### Infrastructure
| File | Purpose |
|------|---------|
| `docker-compose.production.yml` | Production stack definition |
| `docker-compose.preview.yml` | Preview stack template (in each project repo) |
| `nginx/Dockerfile` | Frontend build + nginx serving |
| `nginx/nginx.conf` | Reverse proxy configuration |

---

*This document was generated on 2026-04-21 as a reference for the Accelerator Portal UI/UX overhaul. It captures the system state as of commit `47f8bbd`.*
