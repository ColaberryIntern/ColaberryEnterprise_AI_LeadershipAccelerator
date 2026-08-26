# Colaberry Enterprise AI Leadership Accelerator

A single platform that runs a 13-week enterprise AI leadership program **and** the business that sells it — the student portal, the admissions CRM, the marketing engine, and an autonomous AI operations layer that works the backlog alongside the humans.

One repository, one Postgres database, four running services. **~7,150 tracked files**: ~4,000 backend, ~1,800 frontend, ~940 docs.

---

## What problem this solves

Most training companies run four disconnected systems: an LMS for students, a CRM for admissions, a marketing automation tool, and a project tracker for the team. Data does not cross the seams, so nobody can answer "which marketing touch produced the student who is now falling behind in week 7?"

This repo collapses all four into one graph, then puts an AI operations layer on top that can read the whole graph and act on it under governance.

Three things run on that unified graph:

| Surface | Who uses it | What it does |
|---|---|---|
| **Participant portal** | Enrolled students | Weekly curriculum, build labs, capstone project pipeline, AI mentor, community rooms, live sessions, points and progression |
| **Admin console** | Colaberry staff | Admissions funnel, campaigns, cohort management, curriculum authoring, inbox triage, delivery ops, command centers |
| **AI operations layer** | Staff, supervised | Agents that detect problems, propose actions, execute approved ones, and verify the outcome |

---

## Architecture

### Runtime topology

Four containers, defined in [docker-compose.production.yml](docker-compose.production.yml):

```
                      nginx  :8888
                        |
          +-------------+-------------+
          |                           |
   CRA build (baked into        backend  :3001
   the nginx image)             Node 20 + Express + TS
                                      |
                        +-------------+-------------+
                        |                           |
                  postgres :5432              intelligence :5000
                  pgvector/pg15               Python + Flask
                                              (embeddings, ML,
                                               NL-to-SQL)
```

The frontend is **not** a separate running service. The CRA production build is baked into the nginx multi-stage image, which is why deploying a frontend change means rebuilding nginx, not the backend.

### Governance layers

The repo is organized around a four-layer model defined in [CLAUDE.md](CLAUDE.md). Core principle: **LLMs are probabilistic, production systems must be deterministic.** AI plans and validates; deterministic code executes.

| Layer | Role | Lives in |
|---|---|---|
| 1. Directives | What to do (SOPs) | [directives/](directives/) |
| 2. Orchestration | Planning and decisions | Claude Code + [backend/src/intelligence/](backend/src/intelligence/) |
| 3. Execution | Doing the work | [backend/src/](backend/src/), [frontend/src/](frontend/src/), [scripts/](scripts/) |
| 4. Verification | Proving it works | [tests/](tests/), colocated `__tests__/`, `tsc --noEmit` |

---

## Repository map

| Path | What's there | README |
|---|---|---|
| [backend/](backend/) | Node 20 + Express + TypeScript API. Sequelize over Postgres and MSSQL. | [backend/README.md](backend/README.md) |
| [frontend/](frontend/) | React 18 + CRA + TypeScript. Bootstrap 5, react-router v6. | [frontend/README.md](frontend/README.md) |
| [intelligence/](intelligence/) | Python + Flask AI engine: embeddings, pgvector, schema discovery, NL-to-SQL. | [intelligence/README.md](intelligence/README.md) |
| [scripts/](scripts/) | Operational scripts, screenshot capture, PR review automation, the CB System ops engine. | [scripts/README.md](scripts/README.md) |
| [docs/](docs/) | Architecture, agent catalog, phase reports, audits, sprint reviews, screenshots. | [docs/README.md](docs/README.md) |
| [directives/](directives/) | Standard operating procedures. Human-readable, verification-gated. | [directives/README.md](directives/README.md) |
| [tests/](tests/) | Browser E2E layer. Unit tests are colocated, not here. | [tests/README.md](tests/README.md) |
| [apps/](apps/) | Standalone brand microsites (`cpn-public`, `ai-flotation-public`, `refactored-public`), each staged for extraction to its own repo. | see each app's README |
| [packages/](packages/) | Shared single-file packages: `brand-system`, `tracking-sdk`, `app-build`. | |
| [system/](system/) | Portal-owned auto-generated state maps and contracts. **Never hand-edit.** | [system/README.md](system/README.md) |
| [nginx/](nginx/) | Nginx config and the multi-stage image that bakes the frontend build. | [nginx/README.md](nginx/README.md) |
| [gov-bid-builds/](gov-bid-builds/) | Government bid demo scaffolds, staged before extraction. | [gov-bid-builds/README.md](gov-bid-builds/README.md) |
| [evidence/](evidence/) | Point-in-time evidence artifacts captured during investigations. | |
| [preview-db-init/](preview-db-init/) | Postgres init SQL for ephemeral per-user preview stacks. | [preview-db-init/README.md](preview-db-init/README.md) |
| [execution/](execution/) | Retired pre-Node Python execution layer. Empty placeholder. | [execution/README.md](execution/README.md) |
| [.claude/](.claude/) | Claude Code configuration: skills, hooks, settings. | |

---

## Quick start

Full setup with prerequisites, env vars, and verification is in **[SETUP.md](SETUP.md)**. The short version:

```bash
cp backend/.env.example backend/.env.dev     # then fill in the values
docker compose -p colaberry-dev -f docker-compose.dev.yml up -d --build
curl http://localhost:3001/health            # liveness, no DB dependency
curl http://localhost:3001/health/ready      # readiness, probes Postgres
open http://localhost:8888
```

The `-p colaberry-dev` project flag is not optional. It isolates your containers from production.

Type-check before every push. CI runs the same gate:

```bash
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

---

## The subsystems worth knowing

The parts large enough, or unusual enough, to deserve their own mental model.

### System State Engine
`backend/src/intelligence/systemStateEngine/` — **405 files**, a single authoritative model of what the system is doing: telemetry ingestion, causality replay, autonomy governance, remediation planning, recovery foresight, operator continuity. It writes the state maps in [system/](system/), which is why those must never be hand-edited. Its build-out is documented across 32 `PHASE_*_VALIDATION_REPORT.md` files in [docs/](docs/).

### Agent fleet
**134 agents** across 9 categories, catalogued in [docs/agent-catalog/](docs/agent-catalog/README.md). Implementations live in `backend/src/services/agents/` (167 files) and `backend/src/intelligence/agents/`.

### Student Build Pipeline
`backend/src/services/sbp/` — **134 files** turning a student's capstone idea into a scoped, gated, materialized project: intake interview, decomposition, gating, repair, agent scoping, publish, task materialization, doc rendering, repo commit.

### CB System ops engine
`scripts/ops-engine/` — cron processes that work the Basecamp backlog: a worker executing hashtag-tagged recipes, an inbound dispatcher answering `@CB System` mentions, a backlog enforcer, plus quality audit and reply-sanitizer layers. This is what makes the AI operations layer real rather than architectural. See [scripts/README.md](scripts/README.md).

### Curriculum type system
Curriculum is not hardcoded. Card types are rows in `curriculum_type_definitions`, authored through the Experience Studio admin surface, each with its own render band, generation prompt, and I/O contract. Adding a card type is a data change plus seed files, not a deploy.

### CAPE and the timeline
`backend/src/services/cape/` (67 files) is the adaptive path engine; `backend/src/services/timeline/` (91 files) is the student-facing timeline runtime that renders from it.

### Preview stacks
The backend provisions ephemeral per-user Docker stacks on a port pool (10000-10999) so a student or reviewer gets an isolated running copy of their project. Governed by [directives/per-user-project-previews.md](directives/per-user-project-previews.md). This requires mounting the Docker socket into the backend container — an accepted risk documented at that directive's sign-off.

---

## Scale, by subsystem

Concrete numbers rather than adjectives.

| Area | Tracked files |
|---|---|
| `backend/src/services/` | 1,726 (378 top-level + 18 feature subtrees) |
| `backend/src/scripts/` | 531 operational scripts |
| `backend/src/intelligence/` | 529 (405 of which are the System State Engine) |
| `backend/src/models/` | 404 Sequelize models |
| `backend/src/routes/` | 167 (94 admin route modules) |
| `backend/src/controllers/` | 111 |
| `backend/src/seeds/` | 88 |
| `backend/src/db/` | 66 (schema-ensure migrations and their guards) |
| `frontend/src/pages/` | 474 |
| `frontend/src/components/` | 408 |
| `frontend/src/hooks/` | 176 |
| `docs/` | 937 (332 screenshots, 135 agent catalog, 79 session logs) |
| Test files repo-wide | 1,099 |

---

## Working in this repo

### Governance
[CLAUDE.md](CLAUDE.md) is the operating contract for humans and AI agents alike. It is long and binding. The parts that bite most often:

- **Idempotency is non-negotiable.** Every script, worker, and webhook handler must be safe to run twice. A script that works once and duplicates on the second run is a production defect, not a rough edge.
- **Build-Break-Harden.** A feature is not done when the happy path works. It is done after you have actively tried to break it and hardened what broke.
- **Failure-first design.** Every external boundary declares its timeout, retry policy, and recovery path in writing.
- **No secrets in source, history, logs, or error messages.** `scripts/secret-scan.js` and gitleaks enforce this.
- Subdirectory `CLAUDE.md` files add local conventions on top of the root file.

### Progress tracking
`PROGRESS.md` is the historical change log. It is very large — grep it by session ID or date rather than reading it whole. Sessions log to `docs/sessions/`, keyed on a Session ID of the form `CC-<YYYYMMDD>-<4 alnum>` so concurrent Claude Code instances never collide or mis-attribute entries.

### Deploys
Manual over SSH — see [MERGE_WORKFLOW.md](MERGE_WORKFLOW.md) for the branch-to-main path:

```bash
ssh root@95.216.199.47
cd /opt/colaberry-accelerator
git pull origin main
docker compose -f docker-compose.production.yml up -d --build
```

Two things that routinely cause false alarms:
- The backend takes **60-90 seconds** to bind port 3001 after a deploy. A 502 inside that window is timing, not failure.
- A dirty working tree on the prod VPS silently produces a **stale rebuild**. Confirm the tree is clean and matches `origin/main` before building.

Frontend-only changes: `up -d --build nginx`, because the CRA build lives in the nginx image.

---

## Where to read next

| You want to... | Read |
|---|---|
| Get the stack running locally | [SETUP.md](SETUP.md) |
| Understand conventions, gotchas, and the CB System | [docs/DEV_GUIDE.md](docs/DEV_GUIDE.md) |
| Know the rules that govern changes | [CLAUDE.md](CLAUDE.md) |
| Get a change from branch to production | [MERGE_WORKFLOW.md](MERGE_WORKFLOW.md) |
| See every agent and what it does | [docs/agent-catalog/README.md](docs/agent-catalog/README.md) |
| Understand the portal end to end | [docs/ACCELERATOR_PORTAL_SYSTEM.md](docs/ACCELERATOR_PORTAL_SYSTEM.md) |
| Understand the AI ops architecture | [docs/AI_OPERATIONS_ARCHITECTURE.md](docs/AI_OPERATIONS_ARCHITECTURE.md) |
| Find a specific doc among 937 | [docs/README.md](docs/README.md) |
| Learn the shared vocabulary | [docs/OPERATIONAL_VOCABULARY.md](docs/OPERATIONAL_VOCABULARY.md) |

---

## Honest caveats

Documentation is only useful if it says what is true rather than what was planned:

- **The browser E2E layer runs outside CI.** `tests/systemV2/` holds eight raw-Playwright scripts invoked by hand with `node`; there is no `@playwright/test` and no Playwright config in the repo, and they are not wired into `npm test`. The practical merge gate is `tsc --noEmit` plus the Jest suites. See [tests/README.md](tests/README.md).
- **Test distribution is not the pyramid CLAUDE.md describes.** 1,099 test files is a real number, but they are overwhelmingly service-level unit tests.
- **`execution/` is empty** (only `.gitkeep`), retired at the Node migration but kept so older doc references do not dangle.
- **Some subsystems carry `-Ali-AI` suffixed twins** (for example `aiOrchestrator-Ali-AI.ts`). These are parallel variants from an earlier split, not dead code, but they are a known source of confusion — check which is wired in `server.ts` before editing either.
- **`PROGRESS.md` is very large.** Do not read it whole.
