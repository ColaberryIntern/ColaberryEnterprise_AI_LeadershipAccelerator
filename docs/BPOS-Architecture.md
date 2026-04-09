# Business Process Operating System (BPOS) — Architecture & Process Documentation

## What It Is

BPOS is an AI-powered execution engine that turns a requirements document into a structured, trackable implementation plan — then guides developers through building it step-by-step with Claude Code prompts, verifying each step against the actual codebase.

It is **not** an AI agent runtime. It is an **orchestration layer** that:
- Decomposes requirements into business processes
- Matches requirements to existing code via GitHub integration
- Generates deterministic execution plans based on system state
- Produces Claude Code prompts for each step
- Verifies implementation via resync with the repo
- Advances to the next step automatically

---

## The Onboarding Journey (Conception → First Execution)

A new user starts with three inputs. By the end of onboarding, the system has a complete map of what needs to be built, what already exists, and what to do next.

### Step 1: Upload Requirements Document

The user uploads a markdown or text file describing what they want built — their business requirements, features, user stories, or system specification. This is the **source of truth** for the entire system.

**What happens behind the scenes:**
- `requirementsParserService` splits the document into individual requirements (REQ-001, REQ-002, etc.)
- Fragment filtering removes noise: bold labels, formatting-only lines, entries under 15 chars or 4 words
- Each requirement is stored in `RequirementsMap` with a unique key

### Step 2: Upload CLAUDE.md (Optional)

The user provides their Claude Code configuration file. This defines:
- Coding conventions and patterns
- Architecture rules
- What the AI agent should and shouldn't do
- Project-specific constraints

This content is stored as `claude_md_content` on the Project and injected into every generated prompt.

### Step 3: Connect GitHub Repository

The user provides their repo URL and access token. The system:
- Fetches the full file tree via GitHub API
- Stores it in `GitHubConnection.file_tree_json`
- Fetches recent commits for the Code Intelligence tab
- Identifies the primary language

### Step 4: Extract & Decompose (Automatic)

Once all three inputs are provided, the system automatically:

1. **Clusters requirements into Business Processes** using the 3-pass algorithm:
   - Pass 1: Keyword matching against existing process names (threshold 0.15)
   - Pass 2: GPT-4o-mini clustering — creates 3-10 categories, never "Miscellaneous"
   - Pass 3: Fallback assignment for stragglers

2. **Creates the Capability → Feature → Requirement hierarchy** in the database

3. **Runs initial resync** to match requirements against the GitHub file tree

4. **Builds the Context Graph** across all processes

5. **Computes all metrics** — coverage, readiness, quality, maturity for every process

6. **Generates the first execution plan** — the system now knows what's built, what's missing, and what to do first

### What the User Sees After Onboarding

The portal loads with:
- **Project Progress bar** showing overall stage (Discovery → Architecture → Implementation → Portfolio → Complete)
- **"Next Business Process" card** showing the #1 priority process to work on
- **Business Processes tab** with all processes ranked, each showing coverage %, readiness %, quality %, maturity level, and gap count
- **Clicking any process** reveals its detail panel with 8 sections and an execution plan

The user is immediately ready to start the iterative execution loop.

---

## The Iterative Execution Loop (How Projects Move Forward)

Once onboarded, the project advances through a deterministic loop. Each cycle takes one business process one step closer to completion.

### The Loop

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  1. System shows BP #1 (highest priority incomplete)     │
│     └── With Recommended Step #1 and Preview button      │
│                                                          │
│  2. User clicks Preview → sees impact prediction         │
│     └── Readiness change, quality change, maturity       │
│         progression, risk assessment                     │
│                                                          │
│  3. User clicks Copy Prompt → prompt on clipboard        │
│     └── Includes: actual requirements, existing code     │
│         context, PLAN MODE, validation report format     │
│                                                          │
│  4. User pastes prompt into Claude Code → executes       │
│     └── Claude studies codebase, implements the step,    │
│         outputs VALIDATION REPORT, commits & pushes      │
│                                                          │
│  5. User clicks Resync → system verifies the work        │
│     └── Full GitHub sync, keyword re-matching,           │
│         process-level matching, gap recalculation         │
│                                                          │
│  6. Resync Complete modal shows before/after metrics     │
│     └── Coverage change, quality change, maturity        │
│         advancement, files found/missing                 │
│                                                          │
│  7. System auto-advances:                                │
│     ├── Step marked complete in completed_steps          │
│     ├── If BP has more steps → show next step            │
│     ├── If BP is done → advance to next BP               │
│     └── Priority list re-ranks all processes             │
│                                                          │
│  8. Loop back to 1 with the new BP #1                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### What Drives Forward Motion

Each loop iteration changes the system state:

| What Changes | How It Changes | What It Affects |
|---|---|---|
| New files in repo | Resync detects them, matches to requirements | Coverage goes up |
| Requirements matched | Coverage increases, quality dimensions improve | Readiness goes up, maturity may advance |
| Step completed | Added to `completed_steps`, filtered from plan | Next step appears |
| Process reaches 90% coverage + 70% quality | Marked `is_complete` | Drops from priority list |
| All steps done for a process | Auto-selects next BP | Different process becomes #1 |

### What Prevents Stalling

| Guard | What It Prevents |
|---|---|
| Quality guard (<10% coverage) | Showing quality steps when coverage can't be measured |
| Auto-complete on zero-change | Infinite loop of "already built" steps |
| Safety net | Empty execution plan for incomplete processes |
| Additive-only resync | Losing progress on re-evaluation |
| Project-level layer detection | "Build Backend" when backend already exists in repo |
| 2+ stem matching | False positive file matches |
| Completed steps sanitization | Corrupt data from old bugs |

### The Progression Path

For a typical process, the execution steps flow like this:

```
Process at 0% coverage, no layers:
  Step 1: Build Backend Services (if project has none)
  Step 2: Add Database Models
  Step 3: Create Frontend UI
  Step 4: Add AI Agent Automation
  Step 5: Implement Unmapped Requirements
  Step 6: Verify Requirements
  Step 7: Enhance Agent Intelligence
  Step 8: Optimize System Performance

Process at 0% coverage, project HAS layers:
  Step 1: Implement Unmapped Requirements  ← skips straight here
  (quality steps unlock after coverage > 10%)

Process at 100% coverage, quality < 90:
  Step 1: Optimize System Performance
  Step 2: Enhance Agent Intelligence  (if agents exist)

Process at 100% coverage, quality > 90:
  → COMPLETE (no more steps)
```

---

## System Flow

```
Requirements Document
        │
        ▼
┌─────────────────────────┐
│  1. PARSE & DECOMPOSE   │  Parse doc → REQ-001..REQ-N
│     requirementsParser  │  Cluster → Business Processes
│     requirementGrouper  │  (keyword match + LLM clustering)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  2. MATCH TO CODE       │  Resync requirements ↔ GitHub files
│     resyncProcess()     │  Keyword matching (30% overlap)
│                         │  Process-level matching (2+ stems)
│                         │  Additive only (never demote)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  3. ENRICH & SCORE      │  Compute per-process metrics:
│     enrichCapability()  │  - Requirement coverage (%)
│                         │  - System readiness (40% layers + 60% coverage)
│                         │  - Quality score (6 dimensions, 0-100)
│                         │  - Maturity level (L0-L5)
│                         │  - Gaps (system, quality, requirement)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  4. PLAN NEXT ACTION    │  Deterministic execution engine:
│     nextBestAction      │  - 10 action templates with conditions
│     Engine              │  - Quality guard (block at <10% coverage)
│                         │  - completed_steps filtering
│                         │  - Safety net (never empty for incomplete)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  5. PRIORITIZE          │  Rank all processes:
│     getProcessPriority  │  - Penalize existing implementation
│                         │  - Boost not-started processes (+200)
│                         │  - Foundation processes first
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  6. GENERATE PROMPT     │  Per-action prompt templates:
│     promptGenerator     │  - PLAN MODE instruction
│                         │  - Actual requirements from DB
│                         │  - Existing code context
│                         │  - Validation report format
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  7. PREDICT IMPACT      │  Before execution:
│     predictiveEngine    │  - Projected readiness/quality
│                         │  - Maturity progression
│                         │  - Risk assessment
│                         │  - Dependency check
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  8. EXECUTE             │  User runs prompt in Claude Code
│     (Human + Claude)    │  → Code changes committed to repo
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  9. VERIFY & ADVANCE    │  Resync after execution:
│     resyncProcess()     │  - Verify promised files exist
│                         │  - Auto-complete step
│                         │  - Auto-select next #1 process
│                         │  → Loop back to step 2
└─────────────────────────┘
```

---

## Data Model

### Hierarchy

```
Project
  └── Capability (Business Process)  ← "User Management", "Data Security"
        ├── Feature                   ← Grouping within process
        │     └── RequirementsMap     ← Individual requirement + matched files
        ├── last_execution            ← JSONB: completed_steps, status, promised_files
        ├── strength_scores           ← JSONB: 6 quality dimensions
        └── hitl_config               ← JSONB: approval thresholds
```

### Requirement States (4-state model)

```
UNMAPPED → PLANNED → BUILT → VERIFIED
   │          │         │        │
   │          │         │        └── Human or auto confirmed
   │          │         └── Matched to real impl files (conf ≥ 0.7)
   │          └── Assigned to process/feature (via grouper)
   └── Parsed from document, not yet matched
```

DB `status` values: `not_started` → `unmatched` → `partial` → `matched` → `auto_verified` → `verified`

### GitHub Integration

```
GitHubConnection
  ├── file_tree_json    ← Full repo file tree (blob paths)
  ├── commit_summary    ← Recent commits
  └── repo metadata     ← owner, name, language, file_count
```

---

## Metrics System

### Three Independent Metrics

| Metric | Formula | Range | Purpose |
|--------|---------|-------|---------|
| **Requirement Coverage** | `matched_reqs / total_reqs * 100` | 0-100% | How much of the spec is implemented |
| **System Readiness** | `layerScore * 0.4 + coverage * 0.6` | 0-100% | Overall build progress |
| **Quality Score** | `sum(6 dimensions) / 60 * 100` | 0-100% | Implementation quality |

Where `layerScore = (hasBackend?50) + (hasFrontend?30) + (hasAgents?20)`

### Quality Dimensions (0-10 each)

| Dimension | How Scored |
|-----------|-----------|
| Determinism | Backend service count |
| Reliability | Model count (data layer) |
| Observability | Always 0 (honest — no monitoring detected) |
| UX Exposure | Frontend component count |
| Automation | Agent count |
| Production Readiness | Composite of all layers |

### Maturity Levels

| Level | Label | Requirements |
|-------|-------|-------------|
| L0 | Not Started | No files |
| L1 | Prototype | Any files exist |
| L2 | Functional | Backend + coverage > 50% |
| L3 | Production | Backend + Frontend + coverage > 70% |
| L4 | Autonomous | All layers + coverage > 85% |
| L5 | Self-Optimizing | All layers + coverage > 95% + quality > 70 |

### Completion Definition (Deterministic)

A process is **complete** when ALL are true:
- `reqCoverage >= 90%`
- `qualityScore >= 70`
- `hasBackend === true`
- `hasFrontend === true`
- `hasModels === true`

---

## Execution Engine

### 10 Action Templates

| Priority | Key | Condition | Prompt Target |
|----------|-----|-----------|---------------|
| 100 | `build_backend` | No backend in process OR project | `backend_improvement` |
| 90 | `add_database` | No models in process OR project | `add_database` |
| 80 | `add_frontend` | No frontend in process OR project | `frontend_exposure` |
| 70 | `add_agents` | No agents in process OR project | `agent_enhancement` |
| 65 | `implement_requirements` | Coverage < 80% AND unmapped > 3 | `requirement_implementation` |
| 60 | `add_monitoring` | Quality < 50 AND has quality gaps | `monitoring_gap` |
| 55 | `improve_reliability` | Quality < 60 | `improve_reliability` |
| 50 | `verify_requirements` | Has unverified matches | `verify_requirements` |
| 40 | `enhance_agents` | Has agents AND quality < 80 | `agent_enhancement` |
| 30 | `optimize_performance` | All layers AND quality < 90 | `optimize_performance` |

### Guards

1. **Quality Guard**: When coverage < 10%, block all quality-based steps. Quality is derived from matched files — can't improve until requirements are mapped.

2. **Completed Steps**: `completed_steps` array in `last_execution` JSONB. Only accepts keys from `VALID_STEP_KEYS`. Corrupt data ignored.

3. **Safety Net**: If all actions filtered out but process NOT complete, force-show the most relevant action (implement_requirements → optimize → build missing layer).

4. **Auto-Complete**: When resync verifies a step with 0 missing files, ALL infrastructure/quality step keys are auto-added to `completed_steps`. Prevents infinite cycling through inapplicable steps.

### Project-Level Layer Detection

The engine checks if the **project repo** (not just the process) has backend/frontend/agents/models. If the project already has a backend, individual processes skip "Build Backend" and go straight to "Implement Requirements."

---

## Resync Pipeline

### Keyword Matching

```
For each unmatched requirement:
  1. Extract keywords (remove stopwords, min 3 chars)
  2. For each code file in repo:
     - Tokenize file path
     - Calculate overlap: keywords matching file tokens
     - Require: overlap >= max(2, keywords.length * 0.3)
  3. Score: min(1, matchedFiles / max(2, keywords * 0.4))
  4. Status: >= 0.7 matched, >= 0.3 partial, else unmatched
```

### Process-Level Matching

```
If process name stems match 2+ filenames in services/routes/agents/models:
  → Promote ALL unmatched + partial reqs to 'matched' (conf 0.75)
  → Sets verified_by = 'process_level'
```

### Noise Filtering

**Excluded directories**: `.claude/`, `.github/`, `.git/`, `node_modules/`, `dist/`, `migrations/`, `__tests__/`, `scripts/`

**Excluded files**: `.gitignore`, `.env.*`, `package.json`, `tsconfig.json`, `README.md`, `docker-compose*.yml`, `CLAUDE.md`, config files

**Required extensions**: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.sql`, `.json`

### Additive-Only Rule

Already-matched or verified requirements are NEVER re-evaluated. This prevents resync from demoting progress.

---

## Priority Ranking

**Score formula** (higher = work first):

```
Base:                    100
+ Not-started bonus:     +200 (if no files AND has requirements)
+ Requirement count:     +min(totalReqs * 3, 120)
+ Foundation bonus:      +sharedProcessCount * 15
- Implementation files:  -min(allFiles * 20, 300)
- Has backend:           -100
```

**Key insight**: Processes with existing implementation are penalized. Processes with nothing built get a +200 boost. This ensures new work gets attention before polishing.

---

## Prompt Architecture

Each execution step generates a Claude Code prompt with:

1. **PLAN MODE** instruction (study first, don't code immediately)
2. **Objective** specific to the action type
3. **Business context** from process description
4. **Current state** (existing services, components, agents)
5. **What to build** (specific files, patterns to follow)
6. **Requirements list** (for `requirement_implementation`: actual unmapped reqs from DB)
7. **Constraints** (TypeScript, Bootstrap 5, no breaking changes, existing patterns)
8. **Validation Report** template (exact format for post-execution verification)

11 unique prompt targets — each generates context-appropriate instructions. No two actions share a prompt template.

---

## Frontend Flow

1. **Business Processes tab** — Lists all processes sorted by priority rank
2. **Click process** — Shows detail panel with 8 sections (overview, metrics, gaps, execution plan)
3. **Click Preview** on execution step — Opens PredictionModal with impact preview
4. **Copy Prompt** — Copies Claude Code prompt to clipboard
5. **Execute in Claude Code** — User runs the prompt
6. **Click Resync** — Verifies work, updates metrics, shows before/after
7. **Auto-select next process** — After resync, switches to new #1 priority

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Deterministic engine, not LLM-driven | Reproducible, auditable, no hallucination risk |
| Additive-only resync | Never lose progress — only gain |
| Quality guard at <10% coverage | Can't measure quality without matched requirements |
| 2+ stem matching for process-level | Prevents false positives (e.g., "user" matching AdminUser) |
| Auto-complete on zero-change verify | Breaks infinite loop of inapplicable steps |
| Separate readiness/coverage/quality | Each metric measures something different |
| Project-level layer detection | Monolith repos share infrastructure across processes |
| 0.75 confidence for process-level | Above enrichCapability's 0.7 auto-verify threshold |
| Completed steps sanitization | Only accept VALID_STEP_KEYS, ignore corrupt data |

---

## Context Graph (3-Level Intelligence Layer)

The Context Graph is the system's understanding of how everything connects. It sits behind the metrics and provides the data for priority ranking, flow visualization, and gap detection. Built from existing data (no additional user input required), it evolves as code is written and requirements are matched.

### Level 1: Structural Graph (What Exists)

Maps the hierarchy of the project and links requirements to code files.

```
Process ──contains──► Feature ──contains──► Requirement ──matched_to──► File
                                                  │
                                                  └──missing──► Gap (if no file)
```

**Node types**: `process`, `feature`, `requirement`, `file`, `service`, `api_route`, `db_model`, `agent`, `gap`

**Built from**: Capability hierarchy + RequirementsMap + GitHub file tree

**File classification** (by path patterns):
- `api_route`: path includes `routes/` or filename includes `Route`
- `agent`: path in `agents/` or `intelligence/`, filename contains `Agent`, ends `.ts`
- `db_model`: path in `models/`, ends `.ts`, not in `frontend/`
- `service`: matches `/service|route|controller|middleware/i`, ends `.ts`
- `file`: everything else

**Cross-process edges**: When two processes share a file (e.g., both use `authMiddleware.ts`), a `depends_on` edge is created between them. This is what makes the priority ranking work — processes with more shared infrastructure are foundations that should be built first.

### Level 2: Relational Graph (How Things Connect)

Infers connections between architectural layers using naming conventions.

```
API Route ──calls_service──► Service ──uses_model──► Database Model
                                  │
                                  └──triggers_agent──► Agent
```

**Inference method**: Extract a "stem" from each filename by removing suffixes like `Service`, `Routes`, `Controller`, `Agent`, `Model`:
- `userService.ts` → stem: `user`
- `userRoutes.ts` → stem: `user`
- `User.ts` (model) → stem: `user`
- `userAgent.ts` → stem: `user`

If two files share a stem, they're assumed to be connected:
- Route stem matches Service stem → `calls_service` edge
- Service stem matches Model stem → `uses_model` edge
- Service stem matches Agent stem → `triggers_agent` edge

**Gap detection**: If a Route has no matching Service, a `missing_connection` gap node is created. This surfaces broken wiring in the architecture before runtime.

### Level 3: Behavioral Graph (How Things Perform)

Enriches the graph with real execution data from the `AiAgentActivityLog` table.

**Data source**: Last 7 days of agent execution logs (aggregated per agent)

**Metrics per agent node**:
- `execution_count`: Total runs
- `success_rate`: % successful
- `failure_rate`: % failed
- `avg_duration_ms`: Average execution time

**Behavioral edges**:
- `execution_success`: Agent consistently succeeds (>90% success rate)
- `execution_failed`: Agent has high failure rate (>10%)
- `execution_slow`: Agent is slow (avg >500ms)

**Output**: The graph now knows not just what exists and how it connects, but how well it performs. This feeds into quality scores and agent enhancement recommendations.

### How the Graph Is Used

| Consumer | What It Reads | Purpose |
|----------|--------------|---------|
| `getProcessPriority()` | Cross-process `depends_on` edges, file counts | Rank processes by importance |
| `getProcessFlow()` | Layer nodes (Frontend → API → Service → DB → Agent) | Architecture visualization in UI |
| `getUnconnectedAPIs()` | Route nodes without `calls_service` edge | Surface broken wiring |
| `getOrphanServices()` | Services not called by any route | Find dead code |
| `getAgentIntegrationGaps()` | Services without `triggers_agent` edge | Suggest automation |
| `getExecutionStats()` | L3 behavioral data | Execution intelligence tab |
| `getFailingPaths()` | `execution_failed` edges | Identify reliability issues |

### Graph Construction Flow

```
1. buildProjectGraph(projectId)
   ├── For each Capability:
   │     ├── Add process node
   │     ├── For each Feature:
   │     │     ├── Add feature node + contains edge
   │     │     └── For each Requirement:
   │     │           ├── Add requirement node + contains edge
   │     │           ├── For each matched file:
   │     │           │     └── Add file node + matched_to edge
   │     │           └── If no files:
   │     │                 └── Add gap node + missing edge
   │     └── Track file→process mapping
   ├── Add depends_on edges (shared files)
   └── addRelationalEdges() [L2]
         ├── Route → Service (stem match → calls_service)
         ├── Service → Model (stem match → uses_model)
         └── Service → Agent (stem match → triggers_agent)

2. buildExecutionGraph(graph) [L3]
   ├── Query AiAgentActivityLog (last 7 days)
   ├── Enrich agent nodes with execution metadata
   └── Add behavioral edges (success/failed/slow)
```

---

## Comparison Points (for framework analysis)

- **vs. Jira/Linear**: BPOS is code-aware — it reads the repo and knows what's built. Traditional PMs track tasks but can't verify implementation.
- **vs. GitHub Projects**: BPOS generates the work items from requirements, not the other way around. Requirements are first-class, not afterthoughts.
- **vs. Copilot/Cursor**: BPOS orchestrates WHAT to build; Copilot/Cursor help HOW to build. BPOS generates full prompts with context, constraints, and validation requirements.
- **vs. CI/CD**: BPOS is pre-CI — it determines what code needs to exist before anything can be tested or deployed.
- **vs. Requirements Management (Doors, Jama)**: BPOS closes the loop — it doesn't just track requirements, it matches them to code and generates the prompts to implement them.
