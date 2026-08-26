# Colaberry Enterprise AI Leadership Accelerator

A single platform that runs a 13-week enterprise AI leadership program **and** the business that sells it — the student portal, the admissions CRM, the marketing engine, and an autonomous AI operations layer that works the backlog alongside the humans.

It is one repository, one Postgres database, and four running services. Roughly **3,500 tracked files**: ~1,850 backend, ~760 frontend, ~580 docs.

---

## What problem this solves

Most training companies run four disconnected systems: an LMS for students, a CRM for admissions, a marketing automation tool, and a project tracker for the team. Data does not cross the seams, so nobody can answer "which marketing touch produced the student who is now falling behind in week 7?"

This repo collapses all four into one graph, then puts an AI operations layer on top of it that can read the whole graph and act on it under governance.

Three things run on top of that unified graph:

| Surface | Who uses it | What it does |
|---|---|---|
| **Participant portal** | Enrolled students | Weekly curriculum, build labs, capstone project pipeline, AI mentor, community feed, live sessions |
| **Admin console** | Colaberry staff | Admissions funnel, campaigns, cohort management, curriculum authoring, inbox triage, ops command center |
| **AI operations layer** | Staff, supervised | Autonomous agents that detect problems, propose actions, execute approved ones, and verify the outcome |

---

## Architecture

### Runtime topology

Four containers defined in [docker-compose.production.yml](docker-compose.production.yml):

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

The repo is organized around a four-layer model defined in [CLAUDE.md](CLAUDE.md). The core principle: **LLMs are probabilistic, production systems must be deterministic.** AI plans and validates; deterministic code executes.

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
| [scripts/](scripts/) | Repo-root operational scripts, screenshot capture, and the CB System ops engine. | [scripts/README.md](scripts/README.md) |
| [docs/](docs/) | Architecture notes, agent catalog, audits, sprint review docs, screenshots. | [docs/README.md](docs/README.md) |
| [directives/](directives/) | Standard operating procedures. Human-readable, verification-gated. | [directives/README.md](directives/README.md) |
| [tests/](tests/) | Intended home of the E2E/Playwright layer. Currently near-empty — see its README. | [tests/README.md](tests/README.md) |
| [system/](system/) | Portal-owned auto-generated state maps. **Never hand-edit.** | [system/README.md](system/README.md) |
| [nginx/](nginx/) | Nginx config and the multi-stage image that bakes the frontend build. | [nginx/README.md](nginx/README.md) |
| [gov-bid-builds/](gov-bid-builds/) | Scaffolds for government bid demo apps, staged before extraction to their own repos. | [gov-bid-builds/README.md](gov-bid-builds/README.md) |
| [preview-db-init/](preview-db-init/) | Postgres init SQL for ephemeral per-user preview stacks. | [preview-db-init/README.md](preview-db-init/README.md) |
| [execution/](execution/) | Retired pre-Node Python execution layer. Empty placeholder. | [execution/README.md](execution/README.md) |
| [config/](config/) | Runtime JSON settings read by scripts. Untracked — present on Ali's machine and the VPS only. | [config/README.md](config/README.md) |
| [.claude/](.claude/) | Claude Code configuration: skills, hooks, settings. |  |

---

## Quick start

Full setup with prerequisites, env vars, and verification steps is in **[SETUP.md](SETUP.md)**. The short version:

```bash
cp backend/.env.example backend/.env.dev     # then fill in the values
docker compose -p colaberry-dev -f docker-compose.dev.yml up -d --build
curl http://localhost:3001/health            # liveness, no DB dependency
curl http://localhost:3001/health/ready      # readiness, probes Postgres
open http://localhost:8888
```

The `-p colaberry-dev` project flag is not optional. It isolates your containers from the production stack.

Type-check before every push. CI runs the same gate:

```bash
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

---

## The subsystems worth knowing

These are the parts of the codebase that are large enough, or unusual enough, to deserve their own mental model.

### System State Engine
`backend/src/intelligence/systemStateEngine/` — **405 files**, the largest single subsystem in the repo. It maintains a live model of what the system is doing: telemetry ingestion, causality replay, autonomy governance, remediation planning, recovery foresight, and operator continuity. It writes the state maps in [system/](system/) and is the reason those files must never be hand-edited. Its build-up is documented across the `PHASE_*_VALIDATION_REPORT.md` files in [docs/](docs/).

### Agent fleet
**134 agents** across 9 categories, catalogued in [docs/agent-catalog/](docs/agent-catalog/README.md). Implementation lives in `backend/src/services/agents/` split into `openclaw/` (outbound social engagement), `departments/`, `admissions/`, `reporting/`, `security/`, `skool/`, and `strategy/` subtrees.

### CB System ops engine
`scripts/ops-engine/` — three cron processes that work the Basecamp backlog: a worker that executes hashtag-tagged recipes, an inbound dispatcher that answers `@CB System` mentions, and a backlog enforcer. This is the piece that makes the AI operations layer real rather than theoretical. See [scripts/README.md](scripts/README.md).

### Curriculum type system
Curriculum is not hardcoded. Card types are rows in `curriculum_type_definitions`, authored through the Experience Studio admin surface, each with its own render band, generation prompt, and I/O contract. `CurriculumTypeDefinition.ts` is the model; `curriculumTypeService.ts` is the service.

### Preview stacks
The backend can provision ephemeral, per-user Docker stacks on a port pool (10000-10999) so a student or reviewer gets an isolated running copy of their project. Governed by [directives/per-user-project-previews.md](directives/per-user-project-previews.md). Note that this requires mounting the Docker socket into the backend container, an accepted risk documented at that directive's sign-off.

---

## Scale, by subsystem

Useful when you need concrete numbers rather than adjectives.

| Area | Tracked files |
|---|---|
| `backend/src/services/` | 518 (266 top-level services + agent subtrees) |
| `backend/src/intelligence/` | 510 (405 of which are the System State Engine) |
| `backend/src/scripts/` | 323 one-off operational scripts |
| `backend/src/models/` | 225 Sequelize models |
| `backend/src/routes/admin/` | 67 admin route modules |
| `backend/src/controllers/` | 60 |
| `frontend/src/components/` | 274 |
| `frontend/src/pages/` | 179 (123 admin, 27 public, 14 portal, 13 project) |
| `frontend/src/hooks/` | 177 |
| `docs/` | 577 (249 screenshots, 135 agent catalog entries) |

---

## Working in this repo

### Governance
[CLAUDE.md](CLAUDE.md) is the operating contract for both humans and AI agents. It is long, and it is binding. The parts that bite most often:

- **Idempotency is non-negotiable.** Every script, worker, and webhook handler must be safe to run twice. A script that works once and duplicates on the second run is a production defect, not a rough edge.
- **Build-Break-Harden.** A feature is not done when the happy path works. It is done after you have actively tried to break it and hardened what broke.
- **Failure-first design.** Every external boundary declares its timeout, retry policy, and recovery path in writing.
- **No secrets in source, history, logs, or error messages.**
- Subdirectory `CLAUDE.md` files add local conventions on top of the root file.

### Progress tracking
`PROGRESS.md` is the historical change log. It is very large and is treated as sealed; **current sessions log to `docs/sessions/<SessionID>.md`** instead. Each session mints an ID of the form `CC-<YYYYMMDD>-<4 alnum>` so that concurrent Claude Code instances do not collide or mis-attribute each other's entries.

### Deploys
There is no CI/CD pipeline. Deploys are manual over SSH:

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
| See every agent and what it does | [docs/agent-catalog/README.md](docs/agent-catalog/README.md) |
| Understand the portal end to end | [docs/ACCELERATOR_PORTAL_SYSTEM.md](docs/ACCELERATOR_PORTAL_SYSTEM.md) |
| Understand the AI ops architecture | [docs/AI_OPERATIONS_ARCHITECTURE.md](docs/AI_OPERATIONS_ARCHITECTURE.md) |
| Find a specific doc among 577 | [docs/README.md](docs/README.md) |
| Learn the shared vocabulary | [docs/OPERATIONAL_VOCABULARY.md](docs/OPERATIONAL_VOCABULARY.md) |

---

## Status and honest caveats

Documentation is only useful if it says what is true rather than what was planned. As of 2026-08-26:

- **The E2E test layer is aspirational.** `tests/` contains conventions and one run log, but no Playwright specs and no Playwright config are tracked in the repo. Real test coverage — 106 test files — lives colocated under `backend/src/__tests__/`, `backend/src/intelligence/`, and `frontend/src/__tests__/`. The test pyramid described in CLAUDE.md is a target, not a current measurement.
- **`execution/` is empty** (only `.gitkeep` is tracked) — a retired layer kept so older doc references do not dangle. **`config/` is untracked**: it holds live runtime settings that exist on Ali's machine and the VPS but not in a fresh clone, so scripts reading it will fail until the file is supplied.
- **Some subsystems carry `-Ali-AI` suffixed twins** (for example `aiOrchestrator-Ali-AI.ts`). These are parallel variants from an earlier split, not dead code, but they are a known source of confusion.
- **`PROGRESS.md` exceeds 1.5 MB.** Do not try to read it whole; grep it by session ID or date.
