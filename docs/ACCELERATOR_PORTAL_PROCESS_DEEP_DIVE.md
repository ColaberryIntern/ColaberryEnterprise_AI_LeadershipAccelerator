# Accelerator Portal — Process Deep Dive

This document explains, end-to-end, exactly how the Accelerator Portal turns "I just logged in" into "the portal shows me what's been built and what to do next." Every formula. Every decision. Every JSONB shape. Every fallback. Every inconsistency.

If you're trying to understand the system to fix it, read top-to-bottom. If you're trying to find a specific calculation, jump to the [Completion Math](#completion-math) section.

---

## Table of Contents

1. [Mental Model & Glossary](#1-mental-model--glossary)
2. [The Five Lifecycle Phases — Overview](#2-the-five-lifecycle-phases--overview)
3. [Phase 1: Project Entry (Three Paths)](#3-phase-1-project-entry-three-paths)
4. [Phase 2: Activation & Discovery](#4-phase-2-activation--discovery)
5. [Phase 3: Capability Population](#5-phase-3-capability-population)
6. [Phase 4: Build & Update Loop (Per-BP)](#6-phase-4-build--update-loop-per-bp)
7. [Phase 5: Reporting & Status](#7-phase-5-reporting--status)
8. [Cross-Cutting: Cory Orchestrator](#8-cross-cutting-cory-orchestrator)
9. [Cross-Cutting: Completion Math](#9-cross-cutting-completion-math)
10. [Cross-Cutting: Layer Detection](#10-cross-cutting-layer-detection)
11. [Cross-Cutting: Documentation Signals (PROGRESS.md, CLAUDE.md)](#11-cross-cutting-documentation-signals-progressmd-claudemd)
12. [The Data Model](#12-the-data-model)
13. [Known Inconsistencies & Tech Debt](#13-known-inconsistencies--tech-debt)
14. [Appendix A: Every JSONB Field Reference](#14-appendix-a-every-jsonb-field-reference)
15. [Appendix B: Every Endpoint Contract Reference](#15-appendix-b-every-endpoint-contract-reference)

---

## 1. Mental Model & Glossary

The portal is a **planner + recommender** wrapped around the user's Claude Code sessions. It does not run code. It does not deploy anything. It tracks state and produces recommendations.

### Core nouns

| Term | What it is | Where it lives |
|---|---|---|
| **Enrollment** | One participant's seat in the accelerator | `enrollments` table |
| **Project** | One participant's connected codebase + state | `projects` table (1:1 with Enrollment) |
| **Capability (cap, BP)** | One Business Process — the unit of work | `capabilities` table |
| **Page BP** | A capability that maps to a single frontend page | `capabilities` with `source='frontend_page'` |
| **Feature** | A sub-unit inside a Capability | `features` table |
| **Requirement** | A spec line item (REQ-001, etc.) | `requirements_map` table |
| **GitHub Connection** | The link to the user's repo | `github_connections` table |
| **Architect** | The external service at advisor.colaberry.ai that turns ideas into requirement docs | Separate Python/FastAPI repo |
| **Cory** | The recommendation engine inside the portal | `services/intelligence/coryOrchestrator.ts` |
| **Validation Report** | The structured paste-back from Claude Code | Parsed by `validationReportParser.ts` |
| **Kickoff** | A synthetic first-task for fresh projects | `coryOrchestrator.buildKickoffTask()` |

### Key verbs

| Verb | What it does |
|---|---|
| **Activate** | Take a project from "set up" to "BPs populated and ready" |
| **Discover** | Read the repo and infer what already exists |
| **Cluster** | LLM-group requirements into capabilities |
| **Enrich** | Compute every derived field for a capability (completion %, maturity, recommendations) |
| **Sync** | Apply a validation report's claims to capability state |
| **Validate** | User pastes a Claude Code report; portal verifies file claims against the repo |

### The two onboarding worlds

The portal supports two **fundamentally different** project types, and a lot of the inconsistencies you'll encounter come from these two paths sharing infrastructure that was originally designed for one:

1. **Greenfield** — user has an idea or a build guide, starts from zero. The Architect generates requirements, clustering produces capabilities, completion is measured by **requirements coverage**.

2. **Brownfield** — user points at an existing mature codebase. No requirements doc. Capabilities are inferred from file structure. Completion is measured by **file evidence + PROGRESS.md mentions**.

These two paths produce capabilities with different `source` values and different completion math. The frontend tries to render them uniformly. That's where most of the inconsistencies hide.

---

## 2. The Five Lifecycle Phases — Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  PHASE 1: ENTRY            PHASE 2: ACTIVATION & DISCOVERY               │
│  ─────────────────         ──────────────────────────────                │
│  Magic link →              Path A: Architect → requirements doc          │
│  Setup Wizard              Path B: Upload requirements doc directly      │
│  Pick a path               Path C: Brownfield repo scan                  │
│       ↓                                ↓                                 │
│                                                                          │
│  PHASE 3: CAPABILITY POPULATION                                          │
│  ──────────────────────────────                                          │
│  Greenfield: cluster requirements → Capability rows                      │
│  Brownfield: deterministic stems → LLM consolidate → Capability rows     │
│  Either way: discover Page BPs from frontend/src/pages/                  │
│       ↓                                                                  │
│                                                                          │
│  PHASE 4: BUILD & UPDATE LOOP                          ┌──── repeats ────┐
│  ──────────────────────────                            │                 │
│  User views Blueprint → Cory recommends task           │                 │
│  User clicks Generate Build Prompt                     │                 │
│  Prompt copied → user runs in Claude Code              │                 │
│  Claude Code commits → user pastes validation report   │                 │
│  Portal parses report → updates state                 ─┘                 │
│       ↓                                                                  │
│                                                                          │
│  PHASE 5: REPORTING & STATUS                                             │
│  ──────────────────────────                                              │
│  Every page read recomputes completion / readiness / maturity            │
│  Cory re-evaluates recommendations                                       │
│  System Components grid orders by Cory's priority                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Each phase has its own section below with every step spelled out.

---

## 3. Phase 1: Project Entry (Three Paths)

### 3.1 Authentication: Magic Link

The portal has no passwords. Every entry starts with a magic link.

#### How a token gets created

Three paths today:
1. **Manual DB insert** — ops creates an Enrollment row with `portal_token = gen_random_uuid()` and `portal_token_expires_at = NOW() + INTERVAL '30 days'`.
2. **Self-service via `/api/portal/request-link`** — calls `participantService.requestMagicLink(email)`:
   - Looks up an enrollment by email with `status='active' AND portal_enabled=true`.
   - If found: generates a fresh UUID token + 24h expiry, stores on the enrollment, sends email via Mandrill.
   - If found but `portal_enabled=false`: returns "pending admin approval".
   - If not found: returns generic message (anti-enumeration).
3. **Admin approval flow** — admin endpoints can flip `portal_enabled` and trigger the email.

#### How a link is verified

`GET /api/portal/verify?token=<uuid>` calls `participantService.verifyMagicLink(token)`:

1. Find Enrollment WHERE `portal_token = token AND portal_token_expires_at > NOW() AND status = 'active'`.
2. If not found → return null → frontend shows "link expired or invalid."
3. **Token is NOT cleared** — designed to be reusable so users can bookmark.
4. Sign a JWT with payload:
   ```ts
   {
     sub: enrollment.id,
     email: enrollment.email,
     cohort_id: enrollment.cohort_id,
     role: 'participant',
   }
   ```
   Signed with `env.jwtSecret`, expires in 7 days.
5. Return `{ jwt, enrollment: {...basic fields} }`.
6. Frontend stores JWT in `localStorage`, includes as `Authorization: Bearer <jwt>` on every request.
7. Every protected route's `requireParticipant` middleware validates the JWT and attaches `req.participant = { sub, email, cohort_id, role }`.

#### After verify

Frontend redirects to `/portal/project/blueprint`. The Blueprint page calls `GET /api/portal/project` which returns:

```ts
{
  id, organization_name, target_mode, project_stage, ...,
  setup_status: { requirements_loaded, claude_md_loaded, github_connected, activated, brownfield, ... }
}
```

The frontend then decides:

```
if (!project)                    → render <ProjectSetupWizard />  (no project yet)
if (!setup_status.activated)     → render <ProjectSetupWizard />  (or redirect to /demo if architect_slug set)
if (setup_status.activated)      → render <SystemBlueprint />     (the real Blueprint)
```

### 3.2 Setup Wizard — The Three Paths

`ProjectSetupWizard.tsx` is a state machine with these states:

```ts
type WizardStep =
  | 'decision'                  // 3-button entry
  | 'idea' | 'loading_questions' | 'questions' | 'github_for_build'  // Path A: AI build
  | 'upload' | 'github'                                              // Path B: existing reqs doc
  | 'brownfield_connect' | 'brownfield_discovering' | 'brownfield_review'  // Path C: existing codebase
  | 'starting_build' | 'activating' | 'complete'                     // shared terminals
```

#### The decision step (three buttons)

```
┌─────────────────────────────────────────────────────────────────┐
│  How would you like to start?                                   │
│                                                                 │
│  [📄 I have a Requirements document]   →  step='upload'         │
│      Upload your build guide and connect your repo              │
│                                                                 │
│  [⚡ Build it with AI]                  →  step='idea'           │
│      Cory will design your system from your idea                │
│                                                                 │
│  [🐙 I have an existing codebase]      →  step='brownfield_connect'  │
│      Point at a mature repo — we'll discover what's built       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Each button transitions to a different step. The three paths are documented next.

### 3.3 Path A — Build It With AI (Greenfield from idea)

The flow:

```
'idea'                 user types idea (min 30 chars)
   ↓
'loading_questions'    POST /requirements/expand-questions
                       LLM (gpt-4o-mini) generates 9 questions tailored to idea
   ↓
'questions'            User answers 9 multiple-choice questions (A/B/C)
                         (with optional per-question note)
                       After 5+ answered, "Continue to Repository" button appears
   ↓
'github_for_build'     User enters repo URL + access token + target tier
                       Click "Start Building" → POST /architect-build
   ↓
'starting_build'       Redirects to /portal/project/demo (architect status polling)
   ↓
                       External Architect runs for ~10-45 minutes
                       Phases: idea_intake → feature_discovery → outline_generation
                                → outline_approval → chapter_build → quality_gates
                                → final_assembly → complete
   ↓
'activating'           POST /setup/activate
                       Backend: parse requirements doc → cluster into caps
                       (see Phase 2 below)
   ↓
'complete'             onActivated() → reload Blueprint
```

#### The 9-phase Discovery Framework (in detail)

The questions step is the most distinctive part of Path A. The framework is hardcoded in `projectRoutes.ts` at the `expand-questions` endpoint:

```ts
const PHASES = [
  { phase: 'control',         category: 'Control Model',          axis: 'Recommend / Approve / Execute' },
  { phase: 'intelligence',    category: 'Intelligence Depth',     axis: 'Rules / Adaptive / Self-learning' },
  { phase: 'data',            category: 'Data Scope',             axis: 'Internal / External signals / Full ecosystem' },
  { phase: 'decision',        category: 'Decision Complexity',    axis: 'Basic / Multi-variable / Scenario simulation' },
  { phase: 'execution',       category: 'Execution Level',        axis: 'Suggest / Trigger workflows / Fully automate' },
  { phase: 'agents',          category: 'Agent Structure',        axis: 'Single AI / Multiple agents / Full AI org' },
  { phase: 'governance',      category: 'Governance & Trust',     axis: 'Basic / Auditability / Compliance + explainability' },
  { phase: 'strategy',        category: 'Strategy Layer',         axis: 'Operational / Strategic / Long-term planning' },
  { phase: 'differentiators', category: 'Differentiators',        axis: 'None / Simulation–digital twin / Proprietary models' },
];
```

The endpoint sends the idea + this list to GPT-4o-mini, which returns 9 questions each with 3 options labeled A (baseline), B (intermediate), C (advanced). Options are tailored to the user's specific idea — not generic phrasing.

#### Question normalization (parser)

The LLM occasionally returns slightly different phase keys (e.g. `agents` → `agent_structure`). The normalizer matches in this order:

1. Exact phase match
2. Exact category match
3. Fuzzy substring match on either field (lowercased, alphanumeric only)
4. Positional fallback (same array index)

This is in `projectRoutes.ts` lines ~620-680. Without this fuzzy matching, ~10-20% of LLM responses would drop a question.

#### Refined idea construction

When the user finishes 5+ questions and clicks Continue, `buildRefinedIdea()` constructs:

```
<original idea text>

Selected Sophistication Levels (AI System Discovery Framework):
- [Control Model] B. Approve before action — <description> (note: <user note>)
- [Intelligence Depth] C. Self-learning adaptive — <description>
- [Data Scope] A. Internal data only — <description>
...
```

This refined idea is what's sent to `architect-build` (and ultimately to the Architect's chat engine).

### 3.4 Path B — I Have a Requirements Document

The simpler greenfield path. User already has a build guide markdown file.

```
'upload'               Single combined screen:
                         - Requirements doc upload (drag-drop or paste)
                         - GitHub URL + access token
                         - Target tier picker
                       Submit:
                         POST /setup/requirements with { content }
                         POST /setup/github with { repo_url, access_token }
                         handleActivate() → POST /setup/activate
   ↓
'activating'           Polls /setup/activation-progress every 3s
                       Progress message updates as clustering batches complete
   ↓
'complete'             onActivated() → reload Blueprint
```

Note: this used to be two separate steps (upload, then github). It was combined in commit `18ef401` because users repeatedly forgot to do the github step.

### 3.5 Path C — I Have an Existing Codebase (Brownfield)

The newest path. Skips the Architect → requirements → clustering pipeline entirely.

```
'brownfield_connect'   User enters:
                         - GitHub repo URL
                         - Access token (required for private repos)
                         - Target tier
                       Click "Discover existing capabilities" →
                       POST /setup/brownfield-discover
   ↓
'brownfield_discovering'   Spinner ~30-60 seconds
                           Backend runs the 3-stage discovery pipeline
                           (deterministic candidates → LLM consolidation
                           → per-domain enumeration → Page BP scan)
   ↓
'brownfield_review'    Card showing:
                         - "Discovery complete"
                         - X capabilities found across Y files
                         - Detected stack badges (Node, TypeScript, React, ...)
                         - Scrollable list of every cap with per-layer file counts
                       User clicks "Open the Blueprint" → onActivated() → Blueprint
```

#### What `setup/brownfield-discover` does (detailed)

`projectRoutes.ts` line ~95 onward:

1. **Auto-create the Project** if missing:
   ```ts
   const project = await createProjectForEnrollment(enrollmentId);
   ```
   This was a real bug fix — previously the brownfield path would fail with "No project found" because the project record didn't exist yet.

2. **Connect GitHub** if a `repo_url` was provided. Uses `connectGitHub` from projectSetupService → `connectRepo` from githubService:
   - Parses owner/name from URL via regex `/github\.com[/:]([^/]+)\/([^/.]+)/`.
   - `findOrCreate` on `github_connections` keyed by `enrollment_id`.
   - **Important fix**: also re-parses owner/name if the existing row has them blank (commit `d9115f2` — earlier rows had `repo_url` set but blank owner/name, and the original update guard didn't repair them).

3. **Run discovery** via `brownfieldDiscoveryService.discoverBrownfieldCapabilities(enrollmentId, projectId)`. This is the 3-stage pipeline detailed in Phase 2.

4. **Stamp `setup_status`**:
   ```ts
   project.setup_status = {
     ...existing,
     github_connected: true,
     brownfield: true,
     brownfield_discovered_at: ISO timestamp,
     activated: true,    // brownfield projects are immediately "active"
   };
   ```

5. Return `{ ok, capabilitiesCreated, capabilities, totalFilesAnalyzed, detectedStack, candidatesIdentified, pageBpsCreated }`.

---

## 4. Phase 2: Activation & Discovery

This phase is where requirements + repo become Capability rows. It works very differently for greenfield vs brownfield.

### 4.1 Greenfield Activation Pipeline

`POST /setup/activate` calls `projectSetupService.activateProject(enrollmentId)`:

```
1. Load Project + requirements_document
2. Parse requirements doc:
     - Split by section headings
     - Extract REQ-XXX style requirement keys
     - Build flat list + sectioned hierarchy
3. Cluster via requirementClusteringService.clusterRequirements:
     a. Calculate batch size based on total requirements (BATCH_SIZE = 50)
     b. For each batch:
        - LLM (gpt-4o-mini) groups requirements into 3-7 capabilities
        - Each capability has up to 5 features
        - Each feature has requirement_keys[]
     c. Verify coverage — every requirement key MUST appear in exactly one feature
     d. Orphans → "Uncategorized Requirements" synthetic capability
4. Persist hierarchy:
     For each capability in result:
       Capability.findOrCreate({
         project_id, name,
         defaults: { description, sort_order, source: 'parsed' }
       })
     For each feature: Feature.findOrCreate(...)
     For each requirement: RequirementsMap.create(...)
5. Discover existing repo code as additional Page BPs / discovered BPs
6. Stamp setup_status.activated = true
```

#### Clustering progress tracking

`requirementClusteringService.clusteringProgress` is an in-memory `Map<enrollmentId, ProgressState>`. The activation polling endpoint reads this map.

States:
```ts
{
  status: 'processing' | 'complete',
  batch: number,
  total_batches: number,
  capabilities_so_far: number,
  message: string,
}
```

**Critical bug fix history (commit `e2e7b0b`)**:
- Originally the map was set to `processing` at start of clustering but never cleared on success.
- The `/setup/activation-progress` endpoint short-circuited if `clusteringProgress` had `processing` status.
- Result: even after activation completed, the polling endpoint reported "still processing" forever, so the frontend's spinner never stopped.

Three fixes:
1. Added `finally { clusteringProgress.delete(enrollmentId); }` in clustering service.
2. The `/activation-progress` endpoint now checks `activationProgress.status === 'complete' || 'failed'` BEFORE the cluster check, so it returns immediately when activation is done.
3. Frontend polling timeout bumped from 3 minutes to 10 minutes for large repos.

### 4.2 Brownfield Discovery Pipeline (3-stage)

`brownfieldDiscoveryService.discoverBrownfieldCapabilities()`:

```
STAGE 0: Setup
  - Verify GitHub connection has owner + name (else throw)
  - syncFileTree(enrollmentId) → refresh from origin
  - Read tree.tree → flatten to list of file paths (only blobs)

STAGE 1: Deterministic candidate extraction
  Input: list of file paths
  Output: list of RawCandidate objects (typically 600-1000 for a mature repo)

STAGE 2: Domain context loading
  Read CLAUDE.md, README.md, package.json description, up to 5 directives/*.md
  Cap at 15K chars total
  Read PROGRESS.md (full content, used for completion signals)

STAGE 3: Two-pass LLM consolidation
  Pass 1: cluster candidates into buckets, ask LLM for 8-15 top-level domains
  Pass 2: for each domain (parallel), ask LLM for 2-7 capabilities within it
  Merge results, de-dup by name (case-insensitive)

STAGE 4: Persist
  For each LLM-output capability:
    - Verify key_files exist in tree (skip if 0 valid files)
    - Skip if a cap with this name already exists (idempotent)
    - Classify files by layer (backend/frontend/agents/models)
    - Compute evidence_completion_pct
    - Capability.create({ ..., source: 'brownfield_discovered',
        last_execution: { status: 'foundation_built', evidence_completion_pct, progress_md_mentions } })

STAGE 5: Page BP discovery
  Call processOrphanedPages(projectId, fileTree)
  Auto-creates Page BPs for any frontend page not already linked to a cap
```

#### Stage 1 detail: Deterministic candidate extraction

`extractCandidates(allFiles)` walks every file in the tree and tries to extract a "name stem":

```ts
function extractStem(file): { stem, signal } | null {
  // 1. Skip noise files (index.ts, helpers.ts, types.ts, schema.ts, ...)
  // 2. Try patterns in order:

  // domains/<X>/... or features/<X>/... or modules/<X>/...
  /\/(domains?|features?|modules?)\/([a-z0-9-_]+)\//
    → stem = match[2], signal = 'domain'

  // services/<X>Service.ts (or routes, controllers, etc.)
  /^([a-z][a-z0-9-_]*?)(service|routes?|router|controller|handler|provider|engine|orchestrator|agent|store|client|adapter|broker|sync|parser|generator|builder|manager)\.(tsx?|jsx?|py|go)$/
    → stem = match[1], signal = match[2]

  // Path-based: file under services/, routes/, etc.
  /\/(services?|routes?|controllers?|...)/.test(path)
    → stem from filename minus suffix

  // models/<Name>.ts
  path.includes('/models/') && /\.(ts|js|py)$/
    → stem = filename without extension

  // pages/<Name>.tsx
  path.includes('/pages/')
    → stem = filename minus 'page'/'view'/'screen'

  // intelligence/<X>/ or intelligence/agents/<X>.ts
  /\/intelligence\/(?:agents\/)?([a-z0-9-_]+)\.?/
    → stem = match[1]
}
```

After extraction, files are grouped by stem into `RawCandidate` objects:

```ts
{
  stem: 'lead',
  display_name: 'Lead',
  files: [
    'backend/src/routes/leadRoutes.ts',
    'backend/src/services/leadService.ts',
    'backend/src/models/Lead.ts',
    'frontend/src/pages/admin/LeadsPage.tsx'
  ],
  layer_hits: { backend: 2, frontend: 1, agent: 0, model: 1, page: 1 },
  signals: ['routes', 'service', 'model', 'page']
}
```

For the Accelerator repo this produces ~1,000-1,028 candidates. Most are noise (single-file utilities) but the LLM gets to see the full set.

**Critical filter**: test files are excluded (commit `22246e9`):
```ts
if (/\.(test|spec)\.(t|j)sx?$/.test(lower)) return false;
if (/\/__tests__\//.test(lower) || /\/__mocks__\//.test(lower) || /\/__snapshots__\//.test(lower)) return false;
if (/\/tests?\//.test(lower) && /\.(t|j)sx?$/.test(lower)) return false;
if (/\/fixtures?\//.test(lower)) return false;
```

Without this, you get caps named "Adminroutestest" and "Curriculumgenerationtest".

#### Stage 2 detail: Domain context loading

`loadDomainContext(enrollmentId, allFiles)`:

```
1. Try CLAUDE.md → claude.md → README.md → readme.md (in order)
   Take first 4000 chars of each, max 2 docs
2. package.json → extract name, description, workspaces
3. Up to 5 directives/*.md files (1500 chars each)
4. Concatenate with --- separators
5. Cap at 15K chars
```

`loadProgressMd(enrollmentId, allFiles)`:

```
1. Try PROGRESS.md → progress.md → Progress.md
2. Return full content (used for evidence completion, not LLM context)
```

#### Stage 3 detail: Two-pass LLM consolidation

```ts
async function twoPassDiscovery(candidates, domainContext, detectedStack, totalFiles): Promise<DiscoveryResult> {
  const buckets = clusterCandidatesIntoBuckets(candidates);
  // ~15-25 buckets keyed by canonical home path:
  //   "services/api/domains/auth"
  //   "frontend/pages/admin"
  //   "backend/services"
  //   "scripts/_misc"

  const pass1 = await identifyDomains(buckets, domainContext, detectedStack, totalFiles);
  // → returns 8-15 domains, each mapping to bucket_keys[]

  const pass2Results = await Promise.all(
    pass1.domains.map(domain => {
      const candidatesInDomain = buckets
        .filter(b => domain.bucket_keys.includes(b.key))
        .flatMap(b => b.candidates)
        .dedupBy(stem);

      return enumerateCapabilitiesForDomain(domain, candidatesInDomain, domainContext);
      // → 2-7 capabilities per domain
    })
  );

  const allCaps = pass2Results.flat();

  // De-dup by name (case-insensitive). On collision, merge key_files.
  return uniqByName(allCaps);
}
```

Total LLM calls: 1 (pass 1) + N (where N = number of domains, ~10-15) = 11-16 calls. Parallelism keeps wall time at ~30-45s. Cost is ~$0.015 per discovery on gpt-4o-mini.

#### Pass 1 prompt (verbatim shape)

```
SYSTEM: You are organizing an existing codebase. Identify 8-15 top-level
domains (functional areas) and map the supplied candidate buckets to them.
Use the project's own domain language. Output JSON only.

USER:
PROJECT: 1743 files, stack: Node, TypeScript, React, Python, Docker.

DOMAIN CONTEXT (use this language for domain names):
{CLAUDE.md content + README + directives}

CANDIDATE BUCKETS:
- services/api/domains/auth — 12 candidates, 34 files. Examples: Auth, Auth Routes, Auth Service, Auth Schemas
- backend/services — 87 candidates, 220 files. Examples: Lead, Campaign, Cory, Validation, ...
- frontend/pages — 54 candidates, 54 files. Examples: HR Dashboard, Operations, IT Admin, ...
- ... (15-25 buckets total)

Identify 8-15 TOP-LEVEL DOMAINS in this codebase. ...

Output strict JSON:
{
  "domains": [
    { "name": "Lead Pipeline", "description": "...", "bucket_keys": ["backend/services", "frontend/pages/admin"] }
  ]
}
```

#### Pass 2 prompt (per domain, in parallel)

```
SYSTEM: Enumerate the capabilities within a single domain of an existing
codebase. Be exhaustive — output 2-7 distinct capabilities per domain ...

USER:
DOMAIN: Lead Pipeline
"Captures, scores, routes, and persists leads from various sources."

DOMAIN CONTEXT:
{first 5000 chars of CLAUDE.md/README/directives}

CANDIDATES IN THIS DOMAIN:
- "Lead" (stem=lead) [backend:5, model:1] e.g. backend/src/routes/leadRoutes.ts, ...
- "Lead Source" (stem=lead-source) [backend:2, model:1]
- "Lead Score" (stem=lead-score) [backend:1] e.g. ...
- ... (all candidates from buckets that map to this domain)

Output 2-7 capabilities within this domain. ...
```

#### Stage 4 detail: Per-cap persistence with evidence completion

For each capability the LLM returns:

```ts
1. Validate key_files exist in tree (case-insensitive suffix match for path mismatches)
2. Skip if all files invalid OR if a cap with same name exists
3. Classify each valid file by layer (classifyFile path heuristic)
4. Count layers: layerCounts = { backend, frontend, agents, models } as integers
5. Count PROGRESS.md mentions: countProgressMentions(cap.name, progressMd)
6. Compute evidence_completion_pct = computeEvidenceCompletion(layerCounts, mentions)
7. Capability.create({
     project_id, name, description,
     source: 'brownfield_discovered',
     sort_order: incrementing from 1000,
     applicability_status: 'active',
     user_status: 'in_progress',
     last_execution: {
       status: 'foundation_built',
       source: 'brownfield_discovery',
       appliedAt: ISO timestamp,
       completed_steps: ['brownfield_discovered'],
       evidence_completion_pct: <number>,
       progress_md_mentions: <number>,
     },
     linked_backend_services: [...backend, ...models],
     linked_frontend_components: [...frontend],
     linked_agents: [...agents],
   })
```

#### `countProgressMentions` formula

```ts
function countProgressMentions(capName, progressMd) {
  if (!progressMd) return 0;
  const stems = capName.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(s => s.length >= 4 && !STOP_WORDS.includes(s));
  // STOP_WORDS = ['management', 'service', 'system', 'page', 'and', 'the', 'for']

  let mentions = 0;
  for (const stem of stems) {
    const matches = progressMd.match(new RegExp(`\\b${stem}\\b`, 'g'));
    if (matches) mentions += matches.length;
  }
  return mentions;
}
```

So "Lead Management" → stems = `['lead']` (management is stop-word). Counts every occurrence of `\blead\b` in PROGRESS.md.

#### `computeEvidenceCompletion` formula

```ts
function computeEvidenceCompletion(layers, progressMentions) {
  const layersCovered = Object.values(layers).filter(v => v > 0).length;  // 0-4
  const totalFiles = sum(layers values);

  // Step 1: layer-based base
  let pct;
  if (layersCovered === 0) pct = 10;
  else if (layersCovered === 1) pct = totalFiles >= 3 ? 45 : 30;
  else if (layersCovered === 2) pct = 60;
  else if (layersCovered === 3) pct = 75;
  else pct = 85;  // 4 layers

  // Step 2: PROGRESS.md bonus (cap at +15%)
  if (progressMentions > 0) pct += Math.min(15, progressMentions * 2);

  // Step 3: large feature bonus
  if (totalFiles >= 8) pct += 5;

  // Step 4: clamp to [15, 90]
  return Math.min(90, Math.max(15, pct));
}
```

**Why max 90?** Heuristics never claim 100%. The user must explicitly mark a cap verified (or have a per-BP validation report verify all promised files) to push to 100%.

**Examples** (Accelerator repo):

| Cap | Layers | Files | Mentions | Calc | Final |
|---|---|---|---|---|---|
| Lead Management | 2 (backend+models) | 5 | 4 | 60 + 8 = 68... but actual was 83 | 83 (different layer count) |
| Prompt Generation | 2 (backend+agents) | 3 | 31 | 60 + min(15, 62) = 75 | 75 |
| AI Architect Landing Page | 1 (frontend) | 1 | 0 | 30 + 0 = 30 | clamp → 30 |
| Verification | 2 (backend+agents) | 5 | 17 | 60 + min(15, 34) = 75 | 75 |

The hardcoded numbers are conservative on purpose — better to under-claim than over-claim.

#### Stage 5: Page BP integration

After Stage 4 completes, the service calls `processOrphanedPages(projectId, fileTree)` from `frontendPageDiscovery.ts`:

```
1. discoverFrontendPages(fileTree) — scans frontend/src/pages/ for .tsx files
   Returns: array of { route, pageName, filePath, ... }
2. Get existing capabilities with frontend_route set
3. For each discovered page:
   a. Skip utility/auth pages (/login, /register, /portal/verify, ...)
   b. Skip if page.route already mapped to an existing cap
   c. Skip if page name fuzzy-matches an existing BP name
   d. Otherwise: create a new Capability with:
      source: 'frontend_page',
      is_page_bp: true,
      frontend_route: <inferred route>,
      ui_element_map: { discovered_at: ... },
      ...
```

**Page BPs do NOT get evidence_completion_pct.** They use a different completion model: 5-category visual review (see Phase 5 / Page BP Visual Review).

---

## 5. Phase 3: Capability Population

After activation, the project has:

- N **Capability rows** (greenfield: from clustering; brownfield: from LLM consolidation)
- M **Page BPs** (auto-discovered from frontend/src/pages/)
- For greenfield: K **RequirementsMap rows** linked to Capabilities
- For brownfield: 0 RequirementsMap rows (this is a key inconsistency — see [Known Issues](#13-known-inconsistencies--tech-debt))

### 5.1 The Capability Row — Field by Field

```sql
TABLE capabilities (
  id                          UUID PRIMARY KEY,
  project_id                  UUID NOT NULL,
  name                        VARCHAR(255) NOT NULL,
  description                 TEXT,
  source                      VARCHAR(50)   -- 'parsed' | 'frontend_page' | 'repo_discovered' | 'manual' | 'brownfield_discovered' | 'auto'
  sort_order                  INTEGER,

  -- User assertion
  user_status                 VARCHAR(50)   -- 'in_progress' | 'verified' | 'archived'
  user_status_set_at          TIMESTAMPTZ,
  user_status_set_by          UUID,

  -- Lifecycle
  applicability_status        VARCHAR(50),  -- 'active' | 'deferred' | 'archived'

  -- Mode
  mode_override               VARCHAR(50),  -- nullable per-BP override of project.target_mode
  execution_profile           JSONB,
  strategy_template           VARCHAR(50),
  modes                       JSONB,        -- e.g. { mvp: true, production: true, ... }

  -- Frontend wiring
  frontend_route              VARCHAR(500),

  -- File evidence (accumulative across builds)
  linked_backend_services     JSONB,        -- string[]
  linked_frontend_components  JSONB,        -- string[]
  linked_agents               JSONB,        -- string[]

  -- Cached repo analysis
  backend_context             JSONB,        -- { api_routes, services, models, agents }

  -- Last execution state
  last_execution              JSONB,        -- see below

  -- Page BP state
  ui_element_map              JSONB,        -- visual review + UI Advisor step state

  -- HITL / autonomy
  hitl_config                 JSONB,
  autonomy_level              VARCHAR(50),  -- 'manual' | 'approval' | 'autonomous'
  autonomy_history            JSONB,

  -- Metrics (cached)
  strength_scores             JSONB,
  confidence_score            FLOAT,
  success_rate                FLOAT,
  failure_rate                FLOAT,
  last_evaluated_at           TIMESTAMPTZ,

  created_at, updated_at
);
```

### 5.2 The `last_execution` JSONB shape

This field is the single most-touched piece of state in the system. Different sources produce different shapes:

#### From per-BP validation report (greenfield path)

```json
{
  "status": "complete",
  "step": "Build backend for Lead Management",
  "completed_steps": ["validation_report_applied"],
  "promised_at": "2026-04-30T10:41:36.002Z",
  "promised_files": ["path/to/file.ts"],
  "validation_report": {
    "filesCreated": [...],
    "filesModified": [...],
    "routes": [...],
    "database": [...],
    "status": "COMPLETE",
    "duplicatesNoted": [...],
    "commitSha": "abc123...",
    "appliedAt": "2026-04-30T...",
    "requirementsVerified": 5,
    "classified": {
      "backend": [...],
      "frontend": [...],
      "agents": [...],
      "models": [...]
    }
  }
}
```

#### From kickoff sync

```json
{
  "status": "foundation_built",
  "completed_steps": ["kickoff_sync_applied"],
  "validation_report": {
    "source": "kickoff_sync",
    "commitSha": "abc123...",
    "appliedAt": "...",
    "matchScore": 0.85,
    "matchedBy": ["claim:lead", "paths:3", "phase:lead"],
    "filesLinked": { "backend": [...], "frontend": [...], "agents": [...], "models": [...] },
    "requirementsTouched": 0,
    "reqSnapshot": [...]   // for reset endpoint
  }
}
```

#### From brownfield discovery

```json
{
  "status": "foundation_built",
  "source": "brownfield_discovery",
  "appliedAt": "2026-05-06T...",
  "completed_steps": ["brownfield_discovered"],
  "evidence_completion_pct": 75,
  "progress_md_mentions": 31
}
```

#### Status taxonomy (very important)

| Status | Meaning |
|---|---|
| `null` / no `last_execution` | Never executed. Cap is fresh. |
| `pending` | User clicked "Generate Build Prompt" but hasn't synced yet. Pre-sync placeholder. |
| `complete` | Per-BP validation report applied successfully, all promised files present. |
| `incomplete` | Per-BP validation report applied but some files missing. |
| `verified` | User-marked verified (manual override, OR bulk-verify hit). |
| `foundation_built` | Either kickoff sync OR brownfield discovery applied. Cap exists in code but per-BP completion still tracked separately. |

### 5.3 The `requirements_map` table

```sql
TABLE requirements_map (
  id                       UUID PRIMARY KEY,
  project_id               UUID NOT NULL,
  capability_id            UUID,           -- nullable for orphans
  feature_id               UUID,
  requirement_key          VARCHAR(50),    -- e.g. 'REQ-001'
  requirement_text         TEXT,
  status                   VARCHAR(50),    -- 'unmatched' | 'matched' | 'auto_verified' | 'verified' | 'partial' | 'not_started'
  source_artifact_id       UUID,
  github_file_paths        JSONB,          -- string[]
  confidence_score         FLOAT,
  verified_by              VARCHAR(50),    -- 'manual' | 'validation_report' | 'kickoff_inferred' | 'kickoff_sync'
  modes                    JSONB,
  verification_status      VARCHAR(50),
  created_at, updated_at
);
```

#### Status transitions (for greenfield path)

```
unmatched           Initial state. No file evidence yet.
   ↓                Validation report comes in with files
matched             Has files attached but not formally verified.
   ↓                Per-BP validation says all files present + status=COMPLETE
verified            Counts toward completion, stamped with verified_by.
   ↓                User marks verified manually
verified            (terminal state; verified_by='manual')

unmatched           If kickoff sync runs, status untouched (commit 8ae7948 fix).
                    Only github_file_paths gets set as a hint with verified_by='kickoff_inferred'.
                    Coverage stays 0% — kickoff doesn't count as requirement-level evidence.
```

#### Brownfield projects: requirements_map is empty

This is the critical inconsistency. A brownfield project has 0 RequirementsMap rows. The completion math designed around `matchedR / totalR` produces NaN-equivalent (0/0 → handled as 0%). That's why the evidence-based completion fallback exists.

### 5.4 The `features` table

Less important. Used by greenfield clustering output. Each capability has 0-5 features; each feature lists its requirement_keys.

```sql
TABLE features (
  id, capability_id, name, description, success_criteria, sort_order, created_at, updated_at
);
```

Brownfield caps have no features. The frontend handles this gracefully (renders an empty features section).

---

## 6. Phase 4: Build & Update Loop (Per-BP)

This is the day-to-day flow once a project is activated.

### 6.1 The Blueprint Page Flow

The user lands on `/portal/project/blueprint`. The page calls:

```
1. GET /api/portal/project           → project metadata
2. GET /api/portal/project/business-processes  → all caps (enriched)
3. GET /api/portal/project/cory-tasks → top 5 recommendations
4. GET /api/portal/project/progress   → overall % complete
```

The frontend's `transformBPs(bps)` then converts each enriched cap into a `SystemComponent` for rendering.

#### `transformBPs` decisions

```ts
.filter(bp => (bp.applicability_status || 'active') === 'active' && bp.user_status !== 'archived')
.map(bp => {
  const coverage = bp.metrics?.requirements_coverage || 0;
  // Prefer the backend's already-computed completion_pct (which falls
  // back to evidence_completion_pct for brownfield caps)
  const apiCompletion = typeof bp.completion_pct === 'number' ? bp.completion_pct : coverage;
  const userVerified = bp.user_status === 'verified';
  const isComplete = userVerified || bp.is_complete === true;
  const isPageBP = bp.source === 'frontend_page' || bp.is_page_bp === true;

  let status;
  if (isComplete) status = 'complete';
  else if (apiCompletion > 0 || maturityLevel >= 1) status = 'in_progress';
  else status = 'not_started';

  const completion = userVerified ? 100 : Math.round(apiCompletion);

  return {
    id, name, status, completion, maturity, maturityLevel,
    isPageBP, frontendRoute,
    layers: { backend, frontend, agent } from bp.usability,
    ui: { pages: ... },  // see UI tab logic
    ...
  };
})
.sort((a, b) => {
  // Complete BPs sink to the bottom by default
});
```

This is then re-sorted by Cory's task order in `SystemBlueprint.tsx` so the top-left card matches Cory's "Next Step":

```ts
const taskOrder = new Map();
orchestratorTasks.forEach((t, i) => {
  if (t.component_id && !taskOrder.has(t.component_id)) {
    taskOrder.set(t.component_id, i);
  }
});
const corySorted = components.sort((a, b) => {
  // Verified/archived sink to bottom
  if (verifiedRank(a) !== verifiedRank(b)) return verifiedRank(a) - verifiedRank(b);
  // Cory-recommended next, in his order
  const ai = taskOrder.has(a.id) ? taskOrder.get(a.id) : Infinity;
  const bi = taskOrder.has(b.id) ? taskOrder.get(b.id) : Infinity;
  if (ai !== bi) return ai - bi;
  // Tiebreak: lower completion first (more pending = closer to top)
  return (a.completion || 0) - (b.completion || 0);
});
```

### 6.2 The Build Flow (Per-BP)

`SystemBlueprint.tsx` and `SystemViewV2.tsx` both implement this. The state machine:

```ts
type BuildPhase = 'idle' | 'generating' | 'waiting_for_execution' | 'validating' | 'validated';
```

#### `idle` phase

Two buttons visible:
- **Generate Build Prompt** (or "Run UI Advisor" if `prompt_target = 'ui_advisor_step'`)
- **Learn About This** (opens Cory in learn mode)

Click "Generate Build Prompt" → `handleGeneratePrompt(comp, opts)`.

#### `handleGeneratePrompt` decisions

```ts
async function handleGeneratePrompt(comp, opts) {
  const target = opts?.promptTarget || comp.promptTarget;

  // Special case 1: UI Advisor steps
  if (target === 'ui_advisor_step' && opts?.uiStepKey) {
    navigate(`/portal/project/system-v2?componentId=${comp.id}&tab=ui&autorun=${opts.uiStepKey}`);
    return;
  }

  // Special case 2: Project Kickoff (only fires on fresh projects)
  if (target === 'project_kickoff') {
    setBuild({ phase: 'generating' });
    const res = await portalApi.post('/api/portal/project/kickoff-prompt', {});
    await copyToClipboard(res.data.prompt_text);
    setBuild({ phase: 'waiting_for_execution', prompt: res.data.prompt_text });
    return;
  }

  // Default per-BP path
  setBuild({ phase: 'generating' });
  const res = await portalApi.post(`/api/portal/project/business-processes/${comp.id}/prompt`, { target });
  await copyToClipboard(res.data.prompt_text);
  setBuild({ phase: 'waiting_for_execution', prompt: res.data.prompt_text });
}
```

#### `waiting_for_execution` phase

Shows:
- Pulsing indicator: "Run this in Claude Code — your system is about to evolve"
- "Open Claude" button (links to claude.ai)
- "Show Prompt / Hide Prompt / Copy Again" controls
- "Mark Verified Directly" green button (for when Claude Code already reported COMPLETE in a prior session)
- A textarea for pasting the validation report
- "Validate Build" button (enabled when paste detected and report > 50 chars)

Paste detection: `handleReportChange` checks if the value grew by >100 chars in one event. Sets `pasteDetected = true`. Validate button is disabled until both `pasteDetected && reportText.trim().length > 0`.

#### `handleValidate(comp)` flow

```ts
async function handleValidate(comp) {
  setBuild({ phase: 'validating' });

  // Special case: kickoff task
  const isKickoff = orchestratorTasks[0]?.prompt_target === 'project_kickoff';
  if (isKickoff) {
    const res = await portalApi.post('/api/portal/project/kickoff-sync', { reportText });
    setBuild({ phase: 'validated', validationResult: { kickoff: res.data } });
    await loadData();
    return;
  }

  // Per-BP validation
  const res = await portalApi.post(
    `/api/portal/project/business-processes/${comp.id}/validation-report`,
    { reportText }
  );
  setBuild({ phase: 'validated', validationResult: res.data });
  await loadData();
}
```

### 6.3 Per-BP Validation Report (the deepest path)

`POST /api/portal/project/business-processes/:id/validation-report`. This is where most state changes land.

```
1. Validate ownership: findOwnedCapability(enrollmentId, capId)
2. Parse report: parseValidationReport(reportText)
   Returns: ParsedReport { filesCreated, filesModified, routes, database,
                           status, commitSha, phases, capabilityClaims, ... }
3. Apply to BP: applyReportToBP(capId, parsed, commitSha, enrollmentId)
   (full algorithm below)
4. Re-enrich BP via getCapabilityHierarchy + enrichCapability
5. Auto-mark user_status='verified' if any of:
     - Report status starts with 'COMPLETE'
     - reqCoverage now >= 90%
     - All requirements verified
6. Return { ...result, parsed, metrics_after, autonomous_suggestions }
```

#### `parseValidationReport` algorithm

The parser is forgiving but extracts these sections:

```
Section header detection (case-insensitive):
  /^files?\s*created/      → section = 'files_created'
  /^files?\s*modified/     → section = 'files_modified'
  /^routes?:?/             → section = 'routes'
  /^database:?/            → section = 'database'
  /^status:/               → result.status = rest of line
  /^commit:/               → result.commitSha = rest of line (if 7-40 hex chars)
  /^phases?\s*shipped/     → section = 'phases_shipped'
  /^capabilit(y|ies)\s+advanced/ → section = 'capabilities_advanced'

Bullet item detection:
  /^[-*•]\s+(.+)/  → push item to current section's array

Phase status (loose match):
  ✅ or 'complete' or 'done'    → 'complete'
  ⏳ or 'partial' or 'in progress' → 'partial'
  ❌ or 'deferred' or 'skipped' → 'deferred'

File path extraction (freeform fallback):
  Regex captures any *.{ts,tsx,js,jsx,py,go,rs,java,sql,vue,svelte,md,json,yml,yaml,toml,cjs,mjs,html,css}
```

#### `applyReportToBP` algorithm (in detail)

```
1. Compute hasEvidence:
   allEvidence = [...filesCreated, ...filesModified, ...routes, ...database]
   hasEvidence = allEvidence.length > 0 OR rawText.length > 50

2. Classify files by layer (path heuristics):
   /agents/ or /intelligence/ or name includes 'agent'  → agent
   .tsx/.jsx OR /component/ OR /page/ OR /frontend/    → frontend
   /model/ OR /schema/ OR /entity/ OR /migration/      → model
   /service/ OR /route/ OR /controller/ OR /api/       → backend
   default for .ts/.js/.py                              → backend

3. If hasEvidence: mark all requirements verified
   For each RequirementsMap row WHERE capability_id = capId:
     Skip if verified_by === 'manual' (don't clobber manual verification)
     status = 'verified'

     Determine layered files for THIS requirement:
       reqText = req.requirement_text || req.requirement_key
       isUI = matches /\b(ui|page|component|display|layout|form|button|screen|view)\b/
       isAgent = matches /\b(agent|automat|monitor|schedule|autonomous|intelligence)\b/
       isData = matches /\b(model|database|table|schema|migration|persist|store)\b/
       layered = isUI && frontend.length > 0 ? frontend
               : isAgent && agents.length > 0 ? agents
               : isData && models.length > 0 ? models
               : backend.length > 0 ? backend
               : allFiles
     req.github_file_paths = layered.slice(0, 5)
     req.confidence_score = 1.0
     req.verified_by = 'validation_report'
     await req.save()
     verifiedCount++

4. Update capability:
   prevExec = cap.last_execution || {}
   cap.linked_backend_services = uniq([...prev, ...backend, ...models])
   cap.linked_frontend_components = uniq([...prev, ...frontend])
   cap.linked_agents = uniq([...prev, ...agents])
   cap.last_execution = {
     ...prevExec,
     validation_report: {
       filesCreated, filesModified, routes, database,
       status, duplicatesNoted, commitSha,
       appliedAt: ISO timestamp,
       requirementsVerified: verifiedCount,
       classified: { backend, frontend, agents, models },
     },
     completed_steps: uniq([...prev.completed_steps, 'validation_report_applied']),
   }
   await cap.save()

5. Auto-detect frontend_route (commit fa47f49):
   If frontend files exist AND cap.frontend_route is null:
     candidates = await detectRouteCandidates(enrollmentId, frontendFile) for each file
     If single candidate with confidence >= 0.9 AND clearly above next:
       cap.frontend_route = top candidate
     else:
       Return candidates as routeCandidates in response

6. Return {
     requirementsVerified: verifiedCount,
     requirementsTotal: reqs.length,
     duplicatesDetected: report.duplicatesNoted,
     detectedRoute: <set route or null>,
     routeCandidates: <list or []>,
   }
```

### 6.4 Kickoff Sync (Project-Wide)

`POST /api/portal/project/kickoff-sync`. Fundamentally different from per-BP because the kickoff report covers many capabilities.

#### `applyKickoffReport` algorithm

```
1. Refresh GitHub file tree (sync from origin)
2. Verify file claims:
   For each claimed file:
     If exists in tree → filesVerifiedInRepo++
     Else → filesMissingFromRepo.push(file)

3. Load all capabilities for project (excluding synthetic Uncategorized)

4. For each capability, score the match:

   scoreCapabilityMatch(capName, capDescription, report, claimedFilesLower):
     score = 0
     signals = []

     // Signal 1 (+0.6): explicit Capabilities-advanced claim
     For each claim in report.capabilityClaims:
       claimVariants = normalizeForPath(claim.name)  // e.g. ['lead', 'leads', 'lead-management', ...]
       capVariants = normalizeForPath(capName)
       if any overlap:
         score += 0.6
         signals.push('claim:<name>')
         break  // only count one claim match

     // Signal 2 (+0.1 to +0.4): name in any reported file path
     pathHits = 0
     For each claimed file:
       For each variant of capName (length >= 4):
         if file.includes(variant):
           pathHits++
           break  // one hit per file
     if pathHits > 0:
       score += min(0.4, 0.1 + pathHits * 0.05)
       signals.push(`paths:${pathHits}`)

     // Signal 3 (+0.15): name token in phase body
     phaseText = all phase bodies concatenated
     if any descToken in phaseText OR any nameVariant in phaseText:
       score += 0.15
       signals.push('phase:<token>')

     return { score: min(1, score), signals }

5. Decide matched: score >= 0.25 (tunable threshold)

6. For matched caps:
   nameVariants = normalizeForPath(capName).filter(v => v.length >= 4)
   relevantFiles = allClaimedFiles.filter(f =>
     nameVariants.some(v => f.toLowerCase().includes(v))
   )
   // If relevantFiles is empty: link NOTHING (no fallback to "first 8 of all files"
   // — that produced layer pollution where every cap looked like it had frontend)

   Classify relevantFiles by layer → backend/frontend/agents/models

   For each requirement of this cap:
     // CRITICAL: kickoff sync does NOT change requirement status.
     // Coverage stays at 0% from kickoff alone (commit 8ae7948).
     // Only attach hint files if score >= 0.6 AND relevant files exist:
     If shouldHintFiles AND req.github_file_paths is empty:
       layered = pick by req text type (UI/agent/data/backend)
       If layered.length > 0:
         req.github_file_paths = layered.slice(0, 5)
         req.verified_by = 'kickoff_inferred'   // marker only
         // status NOT changed
         await req.save()
         touched++

   Update cap:
     cap.linked_backend_services = uniq([...prev, ...backend, ...models])  // accumulate
     cap.linked_frontend_components = uniq([...prev, ...frontend])
     cap.linked_agents = uniq([...prev, ...agents])
     cap.last_execution = {
       ...prevExec,
       validation_report: {
         source: 'kickoff_sync',
         commitSha, appliedAt, matchScore: score, matchedBy: signals,
         filesLinked: { backend, frontend, agents, models },
         requirementsTouched: touched,
         reqSnapshot: [...]  // for reset endpoint
       },
       status: 'foundation_built',  // NOT 'complete'
       completed_steps: uniq([...prev, 'kickoff_sync_applied']),
     }
     await cap.save()

7. Stamp project:
   project.setup_status.kickoff_synced = true
   project.setup_status.kickoff_synced_at = ISO timestamp
   project.setup_status.kickoff_commit = parsed.commitSha

8. Return summary + per-cap deltas
```

#### `normalizeForPath` (capability name → path variants)

```ts
function normalizeForPath(text) {
  // "Role Management" → variants:
  // ['role-management', 'role_management', 'rolemanagement', 'role', 'management',
  //  'role-managements', 'role_managements', 'rolemanagements']
  const lower = text.toLowerCase().trim();
  const variants = new Set();
  variants.add(lower.replace(/\s+/g, '-'));     // role-management
  variants.add(lower.replace(/\s+/g, '_'));     // role_management
  variants.add(lower.replace(/\s+/g, ''));      // rolemanagement
  for (const w of lower.split(/\s+/)) {
    if (w.length >= 3) variants.add(w);          // role, management
  }
  for (const v of [...variants]) {
    if (!v.endsWith('s')) variants.add(v + 's'); // pluralize each
  }
  return [...variants];
}
```

### 6.5 Kickoff Reset (Undo)

`POST /api/portal/project/kickoff-sync/reset`. Idempotent. Used to undo polluted state from earlier kickoff runs.

```
For each cap WHERE last_execution.validation_report.source === 'kickoff_sync':
  1. Restore requirements from snapshot:
     For each entry in reqSnapshot:
       If req.verified_by IN ('kickoff_inferred', 'kickoff_sync'):
         req.status = snap.prev_status
         req.verified_by = snap.prev_verified_by
         req.github_file_paths = snap.prev_files
         await req.save()

  2. Snapshot-less fallback (for pre-snapshot kickoff runs):
     For each req on this cap WHERE verified_by IN ('kickoff_sync', 'kickoff_inferred')
        AND NOT in snapshot:
       req.status = 'unmatched'
       req.verified_by = null
       req.github_file_paths = []
       await req.save()

  3. Strip kickoff-contributed files from linked_*_components:
     toRemove = filesLinked.backend + filesLinked.models
     cap.linked_backend_services = filter out toRemove
     toRemove = filesLinked.frontend
     cap.linked_frontend_components = filter out toRemove
     toRemove = filesLinked.agents
     cap.linked_agents = filter out toRemove

  4. Clear validation_report and rewind status:
     remove validation_report from last_execution
     remove 'kickoff_sync_applied' from completed_steps
     If last_execution would be empty: set to null

5. Roll back project:
   delete setup_status.kickoff_synced, kickoff_synced_at, kickoff_commit
```

---

## 7. Phase 5: Reporting & Status

This is what happens every time the user views the Blueprint or System View.

### 7.1 The `enrichCapability` function

`projectRoutes.ts` line ~1305-1900 (yes, ~600 lines for one function — the largest tech debt item).

Inputs:
- `cap` — raw Capability row plus injected fields (`_repoFileTree`, `_projectMode`, `last_execution`, etc.)
- `repoTree` — full file paths from GitHub
- effective project mode

Outputs (every field on the API response):

```ts
{
  ...cap,
  source: isPageBP ? 'frontend_page' : (cap.source || 'requirements'),
  is_page_bp: <boolean>,
  total_requirements: <int>,
  matched_requirements: <int — status in {matched, auto_verified, verified}>,
  verified_requirements: <int — status in {auto_verified, verified}>,
  auto_matched_requirements: <int — status === 'matched'>,
  partial_requirements: <int — status === 'partial'>,
  unmatched_requirements: <int — status in {unmatched, not_started}>,

  // The "completion %" the frontend reads
  completion_pct: (() => {
    if (isPageBP) return pageVisualCompletionPct;        // 5-category visual review
    if (totalR > 0) return reqCoverage;                  // matchedR / totalR * 100
    return cap.last_execution?.evidence_completion_pct || 0;  // brownfield fallback
  })(),

  metrics: {
    requirements_coverage: isPageBP ? pageVisualCompletionPct : reqCoverage,
    system_readiness: readiness,
    quality_score: qualityTotal,
  },

  page_visual_review: isPageBP ? {
    categories: ['layout', 'accessibility', 'responsiveness', 'interaction', 'content'],
    scores: cap.ui_element_map.category_scores,
    verified_count: pageCategoriesVerified,
    total: 5,
    completion_pct: pageVisualCompletionPct,
  } : null,

  confidence: {
    score: avg of req.confidence_score for reqs with score > 0,
    source: 'requirement_avg',
    sample_size: count,
  },

  quality: {
    determinism, reliability, observability, ux_exposure, automation, production_readiness  // each 0-10
  },

  effective_mode: 'mvp' | 'production' | 'enterprise' | 'autonomous',
  mode_source: 'project' | 'override' | 'campaign',
  mode_completion: {
    target_maturity, current_maturity, complete_for_mode, gap_reason
  },

  maturity: {
    level: 0-4,
    label: 'Not Started' | 'Prototype' | 'Functional' | 'Production' | 'Autonomous',
    target_level, next_level_requirements, mode_gap
  },

  gap_count, gaps: [...],

  user_status, user_status_set_at,
  is_complete: (user_status === 'verified') || processComplete,

  execution_plan: <array of next-step objects, empty if user_status='verified'>,

  // Layer presence
  usability: {
    backend: 'ready' | 'partial' | 'missing',
    frontend: 'ready' | 'partial' | 'missing',
    agent: 'ready' | 'missing',
    usable: <boolean>,
    why_not: [reasons],
  },
}
```

### 7.2 The Math for Each Field (in detail)

#### `total_requirements`

```ts
const allReqsFlat = await RequirementsMap.findAll({ where: { capability_id: cap.id } });
const totalR = allReqsFlat.length;
```

For brownfield caps: 0.

#### `matched_requirements`, `verified_requirements`, etc.

```ts
const verified = allReqsFlat.filter(r => r.status === 'verified' || r.status === 'auto_verified');
const autoMatched = allReqsFlat.filter(r => r.status === 'matched');
const matched = [...verified, ...autoMatched];
const partial = allReqsFlat.filter(r => r.status === 'partial');
const unmatched = allReqsFlat.filter(r => r.status === 'unmatched' || r.status === 'not_started');

const matchedR = matched.length;       // counted toward coverage
const verifiedR = verified.length;     // strict subset
```

#### `reqCoverage` (requirements_coverage)

```ts
const reqCoverage = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;
```

For brownfield caps with 0 requirements: 0.

#### `pageVisualCompletionPct` (Page BPs only)

```ts
const PAGE_CATEGORIES = ['layout', 'accessibility', 'responsiveness', 'interaction', 'content'];
const pageCategoryScores = cap.ui_element_map?.category_scores || {};
const pageCategoriesVerified = PAGE_CATEGORIES.filter(k => pageCategoryScores[k]?.verified).length;
const pageVisualCompletionPct = Math.round((pageCategoriesVerified / 5) * 100);
```

So for a Page BP with `category_scores = { layout: { verified: true }, accessibility: { verified: true }, responsiveness: { verified: false }, ...}`, the value is `(2/5)*100 = 40`.

#### `system_readiness`

A weighted combination of layer presence and quality scores:

```ts
const layerScore = (effectiveBackend ? 50 : 0)
                 + (effectiveFrontend ? 30 : 0)
                 + (effectiveAgents ? 20 : 0);
const qualityScore = sum of quality dimensions (each 0-10) / 6 * 10;  // normalized to 0-100

// Final:
const readiness = Math.round(0.6 * layerScore + 0.4 * qualityScore);
```

#### `quality_score`

```ts
quality = {
  determinism: effectiveBackend ? min(10, 5 + effectiveBackendCount) : (reqCoverage > 50 ? 2 : 0),
  reliability: effectiveModels ? min(10, 4 + effectiveModelCount) : (effectiveBackend ? 2 : 0),
  observability: <derived from project monitoring file presence>,
  ux_exposure: effectiveFrontend ? min(10, 6 + effectiveFrontendCount) : 0,
  automation: effectiveAgents ? min(10, 6 + effectiveAgentCount) : (reqCoverage > 70 ? 1 : 0),
  production_readiness: min(10,
    (effectiveBackend ? 3 : 0)
    + (effectiveFrontend ? 3 : 0)
    + (effectiveAgents ? 2 : 0)
    + (effectiveModels ? 2 : 0)
  ),
};

const qualityTotal = sum(values) * (100 / 60);  // normalize to 0-100
```

#### `maturity.level` (L0 → L4)

```ts
let maturityLevel = 0;
if (allFiles.length > 0 || effectiveBackend) maturityLevel = 1;            // L1 Prototype
if (effectiveBackend && reqCoverage > 50) maturityLevel = 2;                // L2 Functional
if (effectiveBackend && effectiveFrontend && reqCoverage > 70) maturityLevel = 3;  // L3 Production
if (effectiveBackend && effectiveFrontend && effectiveAgents && reqCoverage > 85) maturityLevel = 4;  // L4 Autonomous
```

For brownfield caps: `reqCoverage = 0`, so maturity caps at L1 even if all layers exist. **This is a known inconsistency** — see Section 13.

#### `processComplete`

```ts
const meetsMaturity = maturityLevel >= profile.completion_maturity_threshold;
// profile thresholds:
//   MVP: L1, Production: L3, Enterprise: L4, Autonomous: L4

const processComplete = isPageBPComplete
                     || (meetsMaturity && isProcessComplete(systemState, profile.completion_thresholds));
// isProcessComplete checks coverage, quality, layer presence against profile
```

#### `is_complete` (canonical)

```ts
is_complete: (cap.user_status === 'verified') || processComplete
```

#### `usability` (per-cap layer flags)

```ts
const bCtx = cap.backend_context;
const ctxHasBackend = bCtx?.api_routes?.length > 0;
const ctxHasAgents = bCtx?.agents?.length > 0;

// STRICT per-cap signals (no project-level fallback — commit bffa10c)
const realBackend = hasBackend || ctxHasBackend;
const realAgents = hasAgents || ctxHasAgents;
const realFrontend = cap.frontend_route || cap.source === 'frontend_page' || hasFrontend;

if (isPageBP) {
  return {
    backend: ctxHasBackend ? 'ready' : 'n/a',
    frontend: realFrontend ? 'ready' : 'missing',
    agent: ctxHasAgents ? 'ready' : 'n/a',
    usable: isPageBPComplete,
    why_not: isPageBPComplete ? [] : ['Connect a frontend route to mark as ready'],
  };
}

return {
  backend: realBackend ? (reqCoverage > 70 ? 'ready' : 'partial') : 'missing',
  frontend: realFrontend ? (cap.frontend_route ? 'ready' : 'partial') : 'missing',
  agent: realAgents ? 'ready' : 'missing',
  usable: processComplete,
  why_not,
};
```

**Critical fix history (commit bffa10c)**: usability was previously falling back to `effectiveBackend` (project-wide layer detection). That made every cap show `backend: partial` once the project had any backend code anywhere. Now strict per-cap.

#### `execution_plan`

The list of next-step actions for this cap. Generated by `generateStepsFromRequirements` which:

1. Lists every unmatched/partial requirement
2. Filters by mode (skip requirements not relevant to this mode)
3. Suggests specific build actions (backend_improvement, frontend_exposure, ui_fix, etc.)
4. Truncates to top 8 actions
5. Returns array of `{ key, label, prompt_target, blocked, block_reason, ... }`

If `cap.user_status === 'verified'`, the array is empty (cap is done).

If `execution_plan` is empty AND processComplete: the cap renders the **Improve / Health** tab content showing enhancement options instead of build steps.

### 7.3 Layer detection (per-cap vs project-level)

This is one of the most error-prone areas.

#### Per-cap signals (used in `usability`)

```ts
// Files matching THIS cap's name
const processBackendFiles = repoTree.filter(f => {
  const name = (f.split('/').pop() || '').toLowerCase();
  if (!(f.includes('services/') || f.includes('routes/'))) return false;
  if (!name.endsWith('.ts')) return false;
  return processNameStems.some(stem => stem.length >= 4 && name.includes(stem));
});
const combinedBackendFiles = uniq([...backendFiles (linked), ...processBackendFiles]);
const hasBackend = combinedBackendFiles.length > 0;

// Same pattern for frontend, agents.
// Plus: ctxHasBackend reads from cap.backend_context.api_routes (cached repo-read).
```

#### Project-level signals (used in maturity scoring, gap detection)

```ts
const projectHasBackend = repoTree.some(f =>
  /\/(services?|routes?|controllers?|handlers?|gateways?|apis?|servers?|resolvers?)\b/i.test(f)
  && /\.(ts|js|py|go|rs|java)$/.test(f)
);

const projectHasFrontend = repoTree.some(f =>
  /\/(components?|pages?|views?|screens?|layouts?)\b/i.test(f)
  && /\.(tsx|jsx|vue|svelte)$/.test(f)
);

const projectHasAgents = repoTree.some(f =>
  /(agents?|intelligence|automation|workers?|bots?)\b/i.test(f)
  && /\.(ts|js|py)$/.test(f)
);

const projectHasModels = repoTree.some(f =>
  /\/(models?|schemas?|entit(y|ies)|migrations?)\b/i.test(f)
  && /\.(ts|js|py|go|rs|java)$/.test(f)
);

// effective* combine per-cap + project-level (ONLY used in maturity / quality):
const effectiveBackend = hasBackend || projectHasBackend;
const effectiveFrontend = hasFrontend || projectHasFrontend;
const effectiveAgents = hasAgents || projectHasAgents;
```

The `projectHas*` flags are deliberately broad — they detect common conventions across diverse architectures (monolith, microservices, Next.js, Python/Django, Go).

---

## 8. Cross-Cutting: Cory Orchestrator

### 8.1 Inputs

For each enriched capability, Cory receives:

```ts
interface SystemState {
  backend_exists, backend_partial: boolean;
  frontend_exists, frontend_partial: boolean;
  agents_exist, has_models: boolean;
  coverage, readiness, quality_score: number;
  quality: { determinism, reliability, observability, ux_exposure, automation, production_readiness };
  maturity_level: number;
  mode: 'mvp' | 'production' | 'enterprise' | 'autonomous';
  completed_steps: string[];
  has_frontend_route: boolean;
  has_ui_pages: boolean;
}
```

### 8.2 `getTopTasks(enriched, projectMode)` — per-cap

For each capability, generates 1-3 tasks (sorted by score) from these task sources:

| Source | Generator file | Triggers |
|---|---|---|
| **Build** | `taskGenerators/buildTaskGenerator.ts` | Coverage gaps, missing layers, unmatched requirements |
| **Health** | `taskGenerators/healthTaskGenerator.ts` | Quality gaps, missing observability, low reliability |
| **Improve** | `taskGenerators/improveTaskGenerator.ts` | After coverage is high, polish opportunities |
| **UI** | `taskGenerators/uiTaskGenerator.ts` | UI Advisor steps not yet run |

Each generator returns `CoryTask[]`. The orchestrator merges all sources, de-duplicates, then scores.

### 8.3 Scoring

```ts
function scoreCoryTask(task, systemState, profile, strategy): number {
  let score = 0;

  // Impact (0-100)
  score += task.impact * 0.4;

  // Urgency (0-100, e.g. blocking other work)
  score += task.urgency * 0.3;

  // Confidence (0-100)
  score += task.confidence * 0.1;

  // Mode relevance multiplier
  score *= task.mode_relevance[profile.name] || 1.0;

  // Strategy template overrides
  if (strategy.priority_overrides[task.source]) {
    score *= strategy.priority_overrides[task.source];
  }

  // Blocking bonus
  if (task.blocking) score += 25;

  return score;
}
```

Top N tasks per cap (typically N=3) are returned, with the highest-scored first.

### 8.4 `getProjectTopTasks` — project-wide top 5

```ts
function getProjectTopTasks(enrichedCapabilities, projectMode): CoryTask[] {
  // Fresh project special case
  if (isFreshProject(enrichedCapabilities)) return [buildKickoffTask()];

  const allTasks = [];
  for (const enriched of enrichedCapabilities) {
    if (isSyntheticBucket(enriched)) continue;     // Uncategorized Requirements
    if (isUserResolved(enriched)) continue;        // user_status === 'verified' or 'archived'
    if (isInactive(enriched)) continue;            // applicability_status !== 'active'
    if (isUndefinedPageBP(enriched)) continue;     // Page BPs awaiting Define Component
    if (coverage >= 90 && readiness >= 90) continue;  // already complete

    const componentTasks = getTopTasks(enriched, projectMode);
    componentTasks.forEach(t => t.component_id = enriched.id);
    allTasks.push(...componentTasks);
  }

  // Global re-sort by score
  allTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // De-dup: only one task per component_id (so user doesn't see "Build Backend"
  // 12 times across 12 different BPs)
  const seen = new Map();
  const result = [];
  for (const task of allTasks) {
    if (result.length >= 5) break;
    const compKey = task.component_id || 'unknown';
    if (seen.has(compKey)) continue;
    seen.set(compKey, task);
    result.push(task);
  }
  return result;
}
```

### 8.5 `isFreshProject` — when does kickoff fire?

```ts
function isFreshProject(enrichedCapabilities) {
  const real = enrichedCapabilities.filter(c => !isSyntheticBucket(c) && !isInactive(c));
  if (real.length === 0) return true;

  return real.every(c => {
    const le = c.last_execution;
    if (!le) return true;
    const status = le.status;
    // 'foundation_built' counts as non-fresh — kickoff already happened
    if (status === 'complete' || status === 'verified' || status === 'foundation_built') {
      return false;
    }
    return true;
  });
}
```

This is critical:
- Greenfield project freshly activated → all caps have `last_execution = null` → fresh = true → kickoff shows
- After kickoff sync OR brownfield discovery → caps have `status = 'foundation_built'` → fresh = false → per-BP tasks show
- After any per-BP validation report → caps have `status = 'complete'` → fresh = false

### 8.6 Why "fresh project" is a brittle heuristic

Two real edge cases that have caused issues:

1. **A user generates a build prompt but never validates** → `last_execution.status = 'pending'` → counted as non-`pending` because the check is `complete || verified || foundation_built`. So pending counts as fresh. **Fix landed in commit a0811ca**.

2. **Brownfield projects** were treated as fresh because their initial 8 stub caps had no `last_execution`. **Fix landed in the brownfield discovery service** which stamps `foundation_built` on creation.

The existing heuristic still doesn't handle:
- A project where some caps are foundation_built and others are fresh (e.g. partial discovery, or the user manually adds a new cap). It returns false (not fresh) and the new cap gets generic per-BP tasks instead of a focused "build this cap from scratch" prompt.

---

## 9. Cross-Cutting: Completion Math

Already covered in detail in Phase 5. Quick reference:

```
completion_pct (frontend reads):
  if isPageBP:           pageVisualCompletionPct = (verified categories / 5) * 100
  if totalR > 0:         reqCoverage = (matched / total) * 100
  else (brownfield):     evidence_completion_pct (set at discovery time, max 90%)

is_complete:
  user_status === 'verified' OR
  processComplete (mode-aware: maturity threshold + coverage threshold + quality)

maturity.level:
  L0: nothing
  L1: any files OR backend exists
  L2: backend + coverage > 50%
  L3: backend + frontend + coverage > 70%
  L4: backend + frontend + agents + coverage > 85%
```

### Why Page BPs and brownfield caps look different

Both have `totalR = 0`. Both bypass `reqCoverage`. But they use different fallback math:

- Page BP: `pageVisualCompletionPct` (5 user-verified ticks)
- Brownfield cap: `evidence_completion_pct` (file evidence + PROGRESS.md mentions)

The frontend reads `bp.completion_pct` which the backend computes correctly for both cases. **But the maturity score still requires `reqCoverage > 70` for L3** — which brownfield caps can never reach by design. So a brownfield cap with full layer coverage gets stuck at L1 even though it's clearly more than a Prototype.

This is the most visible inconsistency. See Section 13.

---

## 10. Cross-Cutting: Layer Detection

Already covered in Phase 5. Quick reference:

```
hasBackend (per-cap):     files matching cap name stems in services/routes/controllers
hasFrontend (per-cap):    files matching cap name stems in components/pages/views with .tsx/.jsx
hasAgents (per-cap):      files in agents/intelligence/automation
hasModels (per-cap):      files in models/schemas/entities/migrations

projectHasBackend:        ANY file under services/routes/controllers in repo
projectHasFrontend:       ANY file under components/pages/views with .tsx/.jsx
projectHasAgents:         ANY file under agents/intelligence/automation
projectHasModels:         ANY file under models/schemas/entities

effectiveBackend = hasBackend || projectHasBackend  // used for maturity/quality only
```

`usability` flags use STRICT per-cap signals. Maturity/quality uses `effective*` (per-cap or project-level fallback).

---

## 11. Cross-Cutting: Documentation Signals (PROGRESS.md, CLAUDE.md)

### 11.1 What gets read at brownfield discovery time

```
1. CLAUDE.md / claude.md   (first 4000 chars)
2. README.md / readme.md   (first 4000 chars, capped at 2 docs total with CLAUDE)
3. package.json            (extract name, description, workspaces)
4. directives/*.md         (up to 5 files, 1500 chars each)
5. PROGRESS.md             (full content)

Combined into a single 15K-char "domain context" string for the LLM.
```

### 11.2 How PROGRESS.md is used

For each created capability, the discovery service computes:

```ts
const stems = capName.toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/)
  .filter(s => s.length >= 4 && !['management', 'service', 'system', 'page', 'and', 'the', 'for'].includes(s));

let mentions = 0;
for (const stem of stems) {
  const matches = progressMd.match(new RegExp(`\\b${stem}\\b`, 'g'));
  if (matches) mentions += matches.length;
}
```

This count is stored as `last_execution.progress_md_mentions` and used in the evidence completion formula.

### 11.3 What's NOT read

- The repository's commit history (we cache it in `commit_summary_json` but don't use it for capability discovery).
- File contents (only paths). The LLM never sees actual code.
- Tests (filtered out as noise — see `isInterestingFile`).
- The cap's own README if it has one (no per-cap doc loading).

This is a gap — see Section 13.

---

## 12. The Data Model

### 12.1 Tables relevant to the portal

```
enrollments
  ─ id (PK), email, full_name, company, title, cohort_id, status
  ─ portal_token, portal_token_expires_at, portal_enabled
  ─ readiness_score, prework_score, attendance_score, assignment_score, maturity_level

projects
  ─ id (PK), enrollment_id (UNIQUE FK)
  ─ program_id, organization_name, industry
  ─ project_stage ('discovery' | 'architecture' | 'implementation' | 'portfolio' | 'complete')
  ─ target_mode ('mvp' | 'production' | 'enterprise' | 'autonomous')
  ─ project_variables (JSONB)
  ─ setup_status (JSONB)         -- see below
  ─ requirements_document (TEXT)
  ─ portfolio_url

  setup_status JSONB shape:
  {
    requirements_loaded: bool,
    claude_md_loaded: bool,
    github_connected: bool,
    activated: bool,
    architect_slug: string,         -- for greenfield AI build
    brownfield: bool,
    brownfield_discovered_at: ISO,
    kickoff_synced: bool,
    kickoff_synced_at: ISO,
    kickoff_commit: string,
  }

github_connections
  ─ id (PK), enrollment_id (UNIQUE FK)
  ─ repo_url, repo_owner, repo_name
  ─ access_token_encrypted, status_json
  ─ file_tree_json, last_sync_at
  ─ commit_summary_json
  ─ repo_language, file_count

capabilities
  (see Section 5.1 for full field list)

features
  ─ id (PK), capability_id (FK), name, description, success_criteria, sort_order

requirements_map
  (see Section 5.3 for full field list)

ui_element_feedback
  ─ id, capability_id, project_id, element_id, element_type, element_selector
  ─ element_text, page_route
  ─ issue_type, title, description, suggestion, severity
  ─ status ('open' | 'in_progress' | 'resolved' | 'dismissed')
  ─ feedback_hash (sha256 — for dedup)
  ─ prompt, source ('rule' | 'llm'), confidence, source_step
  ─ resolved_by, resolved_at

architect_sessions
  ─ id, enrollment_id, slug, current_phase, ...
  ─ used by Cory Fullscreen + the Architect proxy
```

### 12.2 Data flow diagram

```
┌─────────────┐   magic link   ┌─────────────┐
│ Enrollment  │◀───────────────│   Email     │
└─────┬───────┘                └─────────────┘
      │
      │ JWT (Bearer)
      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Project (1:1 with Enrollment)             │
│                                                                 │
│  setup_status, target_mode, organization_name, ...             │
│                                                                 │
└─────┬────────────────────────────────────────────────────┬──────┘
      │                                                    │
      │                                                    │
      ▼                                                    ▼
┌───────────────────┐  cached    ┌─────────────────────────────────┐
│GitHubConnection   │◀───────────│  GitHub API (octokit)           │
│  file_tree_json   │            └─────────────────────────────────┘
│  commit_summary   │
└───────────────────┘
      │
      │ feeds discovery
      ▼
┌────────────────────────────────────────────────────────────────────┐
│                     Capability rows (many)                         │
│                                                                    │
│  source: 'parsed' | 'frontend_page' | 'brownfield_discovered' |    │
│           'manual' | 'auto'                                        │
│                                                                    │
│  last_execution: {                                                 │
│    status: 'pending' | 'complete' | 'verified' | 'foundation_built'│
│    validation_report: { ... } OR { source: 'kickoff_sync' ... }    │
│    evidence_completion_pct: <number>                               │
│  }                                                                 │
│                                                                    │
│  linked_backend_services: [path, path, ...]                        │
│  linked_frontend_components: [path, path, ...]                     │
│  linked_agents: [path, path, ...]                                  │
│                                                                    │
│  user_status: 'in_progress' | 'verified' | 'archived'              │
│  applicability_status: 'active' | 'deferred' | 'archived'          │
│  mode_override: nullable per-BP target                             │
│  frontend_route: '/page' if Page BP or wired                       │
│  ui_element_map: {                                                 │
│    category_scores: { layout: { verified }, ... }                  │
│    steps: { layout_hierarchy: {run_at, issues_found}, ... }        │
│  }                                                                 │
└────────────────────────────────────────────────────────────────────┘
      │
      │ has many
      ▼
┌────────────────────────────────────────────────────────────────────┐
│                   RequirementsMap rows (many per cap)              │
│                                                                    │
│  requirement_key: 'REQ-001'                                        │
│  status: 'unmatched' | 'matched' | 'verified' | 'partial' | ...    │
│  github_file_paths: [path, path, ...]                              │
│  verified_by: 'manual' | 'validation_report' | 'kickoff_inferred'  │
│  confidence_score: 0..1                                            │
└────────────────────────────────────────────────────────────────────┘
```

---

## 13. Known Inconsistencies & Tech Debt

This section is the most important for your "fix it" goal. Here's everything currently broken or fragile, ordered by severity.

### 13.1 SEVERE — completion math has 3 different sources of truth

The frontend can compute completion in 3 different ways depending on cap source:

| Cap source | Completion formula | Range |
|---|---|---|
| Greenfield (parsed) | `reqCoverage = matched / total * 100` | 0-100 |
| Page BP | `pageVisualCompletionPct = verified / 5 * 100` | 0-100 |
| Brownfield | `evidence_completion_pct` (heuristic) | 15-90 |

The frontend uses `bp.completion_pct` which falls through these in priority order. But:
- **Maturity scoring** still uses `reqCoverage` exclusively. So a brownfield cap with full backend+frontend+agents+models can never reach L3 because `reqCoverage = 0`.
- **`isComplete` check** uses `processComplete` which requires `meetsMaturity` which requires reqCoverage thresholds. Same problem.
- **Cory's task generators** use `coverage` to decide what to recommend. For brownfield, coverage is always 0 so Cory recommends "Build Backend Services" even when backend exists.

**Fix needed:** introduce a unified "effective completion" concept that works for all three sources. Brownfield evidence should feed into the same maturity ladder.

### 13.2 SEVERE — brownfield caps don't have requirements

When the user runs Cory's recommendations on a brownfield project, the per-BP task generators expect requirements to drive recommendations. Brownfield caps have 0 requirements. So:

- "Implement N unmatched requirements for X" never appears (no requirements).
- "Verify Coverage for X" never appears.
- The cap's execution_plan is always empty.
- Cory falls back to layer-based suggestions ("Add backend services") which is often nonsensical for a cap that has 5 backend files already.

**Fix needed:** brownfield caps need a different recommendation model. Maybe:
- "Improve test coverage for X" (if no tests detected)
- "Verify X is using correct mode" (compare cap mode to project mode)
- "Document X" (if no JSDoc/docstrings detected)
- "Refactor X" (if file size > threshold)

### 13.3 HIGH — duplicate caps with similar names

The brownfield two-pass discovery can produce caps like:
- "Lead Management"
- "Lead Ingestion"
- "Lead Pipeline"
- "Lead Ingestion Pipeline"

These overlap heavily. The de-dup is only on exact case-insensitive name match. No fuzzy match.

**Fix needed:** Levenshtein-distance or token-set de-dup, OR a third LLM pass that "merges obvious duplicates."

### 13.4 HIGH — frontend completely unaware of brownfield distinction in some places

The frontend treats all caps the same in transformBPs (after the recent fix). But:

- The "Up next" recommendation panel uses `coryPlan` (legacy) for fallback, which doesn't know about brownfield.
- The `ProjectDashboard` page (separate from Blueprint) reads `requirements_coverage` directly.
- The `ProjectArtifacts` page expects requirements + features.

These haven't been updated for brownfield. Users on brownfield projects clicking around hit pages that read 0% or empty.

### 13.5 MEDIUM — kickoff vs brownfield are partially redundant

Both kickoff sync and brownfield discovery stamp `last_execution.status = 'foundation_built'`. Both grow `linked_*_components` arrays. Both add to `completed_steps`.

If you run brownfield discovery THEN run a per-BP kickoff prompt and paste it, the kickoff sync code path runs and overwrites parts of brownfield's state. The two paths weren't designed to coexist.

**Fix needed:** either explicitly disallow kickoff after brownfield (hide the kickoff task), OR make kickoff sync brownfield-aware (preserve evidence_completion_pct, don't reset linked files that brownfield set).

### 13.6 MEDIUM — `isFreshProject` heuristic is too binary

```ts
return real.every(c => !c.last_execution || statusInExcludeList(c.last_execution.status));
```

This is "any cap is fresh". So:
- A project where 1 of 60 caps has last_execution returns false → kickoff hidden, even if 59 caps are still genuinely fresh.
- A project where 60 of 60 caps have last_execution but it's all `pending` returns true → kickoff shows even though work is in progress.

**Fix needed:** scale — "more than 50% of caps are fresh" or similar.

### 13.7 MEDIUM — repo file tree gets stale

`syncFileTree` runs at brownfield discovery time and on demand. But:
- If the user pushes new commits and triggers a per-BP validation report, the stale tree might miss new files, falsely flagging them as "claimed but not in repo."
- The kickoff sync's `filesMissingFromRepo` warning fires on stale data sometimes.

**Fix needed:** every validation report applies should refresh the tree first. Currently only kickoff sync refreshes.

### 13.8 MEDIUM — `enrichCapability` is 600 lines

This function is the most touched in the codebase and has accumulated edge case after edge case. It does:
- Layer detection (per-cap and project-level)
- Quality scoring (6 dimensions with their own formulas)
- Maturity calculation
- Mode resolution
- Execution plan generation
- Requirement coverage calculation
- Page BP visual review aggregation
- Usability flag construction
- File classification
- Gap detection
- Confidence scoring
- Effective mode resolution
- Mode completion gap analysis

Should be decomposed into 8-10 smaller functions. Right now it's hard to change anything without breaking something.

### 13.9 MEDIUM — `pages` field on capability for the UI tab

The frontend's `transformBPs` creates a `ui.pages` array:

```ts
pages: bp.frontend_route ? [{...mapped page...}] :
       (hasLinkedFrontend OR usability.frontend in {ready, partial}) AND !isPageBP ? [{...pending page...}] :
       []
```

So a non-Page-BP cap with linked frontend files but no `frontend_route` shows a "pending" page entry that triggers the Route Picker UI. Mostly works, but:
- For Page BPs, `pages` always has 1 entry (themselves).
- For caps with frontend_route already set, `pages` has 1 mapped entry.
- For caps with multiple linked frontend files but only one route: only 1 page entry.

If a cap genuinely covers multiple pages, the UI tab can only show one at a time via the page selector.

### 13.10 LOW — magic link tokens are forever-reusable

By design (so users can bookmark), tokens don't get consumed on use. But this means:
- A leaked link gives 30-day access.
- No "log out everywhere" feature.
- JWT secret rotation invalidates all tokens (heavy-handed).

### 13.11 LOW — no cap-level audit log

Every cap state change (validation report, kickoff sync, manual verify, etc.) overwrites `last_execution.validation_report`. No history. Can't see "this cap was 60% on Tuesday, 80% on Friday."

The only history-like field is `completed_steps` (a JSONB array of step names) and `autonomy_history`.

### 13.12 LOW — discovery is not incremental

If the user adds 3 new feature folders to their repo, re-running brownfield discovery:
- Skips caps that already exist by name (idempotent).
- Doesn't surface "5 new candidate caps detected since last run."
- Doesn't update existing caps' `linked_*_components` arrays.

**Fix needed:** a "re-discover and merge" mode that diffs against existing state.

---

## 14. Appendix A: Every JSONB Field Reference

### `Project.setup_status`

```ts
{
  // Greenfield
  requirements_loaded: boolean,
  claude_md_loaded: boolean,
  github_connected: boolean,
  activated: boolean,
  architect_slug?: string,
  build_started_at?: ISO,
  build_idea?: string,

  // Brownfield
  brownfield: boolean,
  brownfield_discovered_at?: ISO,

  // Kickoff
  kickoff_synced: boolean,
  kickoff_synced_at?: ISO,
  kickoff_commit?: string,
}
```

### `Project.project_variables`

```ts
{
  system_prompt: string,           // user-edited
  direct_preview_url: string,
  // ... and many other settings
}
```

### `Capability.last_execution`

```ts
{
  status: 'pending' | 'complete' | 'incomplete' | 'verified' | 'foundation_built',
  step?: string,                   // e.g. "Build backend for Lead Management"
  promised_at?: ISO,
  promised_files?: string[],
  completed_steps: string[],
  validation_report?: {
    // From per-BP path:
    filesCreated, filesModified, routes, database, status, duplicatesNoted, commitSha,
    appliedAt, requirementsVerified, classified

    // From kickoff sync:
    source: 'kickoff_sync',
    matchScore, matchedBy, filesLinked, requirementsTouched, reqSnapshot

    // From brownfield (only the marker fields):
    source: 'brownfield_discovery',
    appliedAt, evidence_completion_pct, progress_md_mentions
  }

  // Brownfield-only flat fields:
  evidence_completion_pct?: number,      // 15-90
  progress_md_mentions?: number,
}
```

### `Capability.ui_element_map`

```ts
{
  // Page BP visual review state
  category_scores: {
    layout: { verified: boolean, verified_at?: ISO, issues_found?: number },
    accessibility: { ... },
    responsiveness: { ... },
    interaction: { ... },
    content: { ... },
  },

  // UI Advisor step run state
  steps: {
    layout_hierarchy: { run_at: ISO, issues_found: number, last_resolved_at?: ISO, last_resolved_count?: number },
    usability: { ... },
    mobile_responsiveness: { ... },
  },

  // Element map (discovered DOM elements for analysis)
  elements: [{ id, type, selector, text, ... }],

  // User confirmation
  user_defined_at?: ISO,            // set when user runs Define Component flow
  discovered_at?: ISO,              // set when frontendPageDiscovery created the BP
}
```

### `RequirementsMap.modes`

```ts
{
  mvp: boolean,
  production: boolean,
  enterprise: boolean,
  autonomous: boolean,
}
```

Used to filter recommendations per project mode — a requirement only flagged for `enterprise` won't show as a gap on a `production` project.

---

## 15. Appendix B: Every Endpoint Contract Reference

(See `ACCELERATOR_PORTAL_FULL_DETAIL.md` Section 29 for the complete catalog. The high-level groups are repeated here for convenience.)

### Setup
- `GET /setup/status`
- `POST /setup/requirements`
- `POST /setup/claude-md`
- `POST /setup/github`
- `POST /setup/activate`
- `GET /setup/activation-progress`
- **`POST /setup/brownfield-discover`** (new)

### Project
- `GET /api/portal/project`
- `GET /artifacts`, `/portfolio`, `/executive`, `/mentor`, `/workflow`
- `POST /refresh`

### Architect
- `POST /architect-build`
- `GET /architect-status`
- `POST /architect/start`, `/turn`, `/learn`
- `GET /architect/sessions`

### Capabilities
- `GET /business-processes`
- `GET /business-processes/:id`
- `POST /business-processes/:id/prompt`
- `POST /business-processes/:id/validation-report`
- `PUT /business-processes/:id/user-status`
- ... (~80 more — see full catalog)

### Cory + Kickoff
- `GET /cory-tasks`
- `POST /kickoff-prompt`
- `POST /kickoff-sync`
- `POST /kickoff-sync/reset`

### Pages / Routes
- `POST /discover-pages`
- `GET /frontend-routes`
- `POST /auto-map-routes`
- `GET /business-processes/:id/route-candidates`
- `PUT /business-processes/:id/connect-page`

### Settings
- `PUT /target-mode`
- `PUT /preview-url`
- `PUT /settings`

---

## End

This document captures the portal's process flow as of 2026-05-06. For changes after that date, the commit log is authoritative.

Companion docs:
- `ACCELERATOR_PORTAL_SYSTEM.md` — older system-architecture reference (pre-brownfield)
- `ACCELERATOR_PORTAL_FULL_DETAIL.md` — exhaustive component / endpoint reference
- `BPOS-Architecture.md` — the Business Process Operating System concept
