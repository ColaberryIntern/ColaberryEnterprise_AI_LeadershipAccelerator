# DEV_GUIDE.md — deeper developer reference

For first-time setup, start with [SETUP.md](../SETUP.md) at the repo root. This guide is for ongoing work: architecture, conventions, where to put what, deploys, observability, and the patterns the engine relies on. The full project doctrine is in [CLAUDE.md](../CLAUDE.md) — read it once end-to-end; it explains why the codebase is structured the way it is.

---

## 1. Repo layout

| Top-level | What lives there |
|---|---|
| `/backend` | Node.js + Express + TypeScript backend. See section 2 below for the subdir map. |
| `/frontend` | React (CRA) + TypeScript frontend. Routes split into `publicRoutes.tsx`, `adminRoutes.tsx`, `portalRoutes.tsx`. |
| `/scripts` | Repo-root operational scripts (deploys, ad-hoc data pulls, full-inbox scans). Single responsibility per script. |
| `/scripts/ops-engine` | The CB System engine cron workers: `worker.js`, `inbound-dispatcher.js`, `backlog-enforcer.js`, `cb-system-handler.js`. |
| `/directives` | Human-readable SOPs / runbooks. Step-by-step. Each defines how success is verified. |
| `/tests` | Automated verification. Playwright flows live in `/tests/systemV2`. |
| `/docs` | In-repo documentation that ships with the codebase (this file, architecture notes, integration guides, screenshots). |
| `/nginx` | Production nginx config (multi-stage Docker build context). |
| `/tmp` | Scratch space. Always safe to delete. Never committed. |
| `/system` | **DO NOT MANUALLY EDIT.** Portal-owned auto-generated state maps. |

## 2. Backend subdirectory map

| Path | Purpose |
|---|---|
| `backend/src/routes/` | Express route definitions. Three trees: `public/`, `admin/`, `portal/`. New routes get registered in the corresponding `adminRoutes.ts` / `portalRoutes.ts` / etc. |
| `backend/src/models/` | Sequelize models. The contract for DB tables. |
| `backend/src/services/` | Business logic. Pure logic + side-effect orchestration. `services/agents/` holds agent personas (openclaw, intelligence, marketing). |
| `backend/src/intelligence/` | Planning, prompt generation, decision engines. |
| `backend/src/scripts/` | One-off operational scripts (`sendXxx.js`, `basecampXxx.js`, `fixXxx.js`). Disposable but auditable. |
| `backend/src/seeds/` | Seed data + migration scripts. |
| `backend/src/middlewares/` | `authMiddleware`, request validation, etc. |
| `backend/src/config/` | DB config, env wiring. |
| `backend/src/scripts/lib/` | Reusable script-side helpers: `sendWithBcAttach`, `reportRunRecorder`, `mandrillPreflight`, etc. |

## 3. Conventions you must follow

These come straight from CLAUDE.md and exist because they have prevented real production bugs. Skipping them costs more time than honoring them.

### 3a. Type checking is the gate

`npx tsc --noEmit` must pass on both `backend/` and `frontend/` before any PR. CI runs the same check. No `any` without a written justification comment.

### 3b. No em-dashes anywhere

The em-dash check is in Mandrill preflight and several other places. Use `-` or `,` instead. Yes really.

### 3c. Ali Personal: every outbound email + produced document attaches to its originating BC ticket

Use `backend/src/scripts/lib/sendWithBcAttach.js`. It requires `ticketId`. No opt-out. This is how every artifact stays traceable.

### 3d. Branded signature on every outbound email

`sendWithBcAttach` does not auto-append it — your send script must include the HTML signature block at the end of the HTML body and the plain-text signature at the end of the text body. Reference: `~/.claude/projects/.../memory/reference_email_signature.md` (or ask Ali for the canonical block).

### 3e. Every BC todo you create must have `due_on` set at creation

PUT to update a todo requires the full body (`content` + `description` + `due_on`); a body with only `due_on` is silently ignored. If you forget at creation, GET the current row first then PUT the full body back with `due_on`.

### 3f. No `// eslint-disable-line react-hooks/exhaustive-deps`

The production eslint config does not have the `react-hooks` plugin loaded, so the disable comment itself causes the build to fail. Use stable derived values in dependency arrays instead.

### 3g. Modular composition rule

File soft target ~300 lines, hard ceiling 500. Function soft target ~50, hard 100. Existing oversize files (`openclawContentResponseAgent.ts`, `openclawPlatformPostingService.ts`) are grandfathered until touched; each subsequent change is an opportunity to extract.

### 3h. Build-Break-Harden loop

For non-trivial features: BUILD the happy path, then actively BREAK it (5xx upstream, timeout, malformed input, idempotency, concurrency, time skew), then HARDEN with the fix that closes each break. A feature that has been BUILT but not BROKEN is not shipped.

### 3i. Idempotency is non-negotiable

Every script, worker, webhook handler, and side-effecting service must be safe to run twice. Side effects gated by an idempotency key. Mandrill sends dedup on `(recipient, subject, business_event_id)`. BC todo creates check existing first. DB writes use `ON CONFLICT DO NOTHING` or unique constraints.

### 3j. Logs are JSON to stdout

No `console.log` of unstructured strings in production paths. Use the project's structured-log helper if available, otherwise emit JSON with `timestamp`, `level`, `service`, `event`, `outcome`, `correlation_id`, `duration_ms`, and a `context` object.

### 3k. PROGRESS.md is a hard gate

Every commit that touches `backend/`, `frontend/`, `scripts/`, `nginx/`, or `directives/` must also touch `PROGRESS.md`. Format and rules are in CLAUDE.md "Logging, Reporting & Progress Tracking" section.

## 4. The CB System engine (you will work alongside it)

Three cron processes run continuously on prod. See `scripts/ops-engine/`:

| Process | Cadence | Purpose |
|---|---|---|
| `worker.js` | every 15 min | Picks one CB-System-assigned todo with a `#auto-*` recipe hashtag and executes the recipe. Posts result as a comment. Never auto-closes. |
| `inbound-dispatcher.js` | every 3 min | Polls Basecamp events for `@CB System` mentions in comments. LLM-classifies the request, runs a safe recipe, replies tagged to Ali. |
| `backlog-enforcer.js` | every 4 hr | Scans Ali Personal for open Ali-assigned todos. Posts backlog snapshot to a meta tracking todo. |

If your feature interacts with BC todos, decide upfront whether it should fire via one of these existing cron paths or as a separate cron. Reuse where possible.

## 5. Deploys

```
ssh root@95.216.199.47
cd /opt/colaberry-accelerator
git pull origin main
docker compose -f docker-compose.production.yml up -d --build
```

Services in the production compose: `postgres`, `backend`, `intelligence`, `nginx`. The frontend (CRA build) is baked into the `nginx` multi-stage image; to deploy frontend changes use `up -d --build nginx`.

After a deploy the backend takes 60–90 seconds to bind port 3001. `/api` returning 502 during that window is timing, not failure. Verify with `docker logs accelerator-backend --tail 50`.

There is no CI/CD. Deploys are manual via SSH. Production deploys happen after hours unless Ali explicitly greenlights mid-day.

## 6. Observability surfaces

- `/admin/ops` — the AI Ops Command Center: queue, workspace, run my day, stale review, skills, automation rules, system health drawer.
- `/admin/reports` — automated reports list with last-run status, recent runs, prompt editor.
- `/admin/inbox` — Inbox COS view with VIP list, hard rules, classification audit log.
- `/var/log/cb-worker.log`, `/var/log/cb-inbound.log`, `/var/log/cb-backlog.log` — engine logs on prod VPS.
- Cory daily brief at 6:45 AM CT — emailed to Ali; covers shipped work, tests, failures, risk flags, next milestones.

## 7. Memory and decision context

This codebase is operated alongside a persistent memory system (file-based, lives at `~/.claude/projects/c--Users-ali-m-OneDrive-Business-Colaberry-Novedea-AI-Projects-Colaberry-Enterprise-AI-Leadership-Accelerator/memory/MEMORY.md`). It records Ali's preferences (signature, em-dash rule, deploy timing) plus durable project context. When you start a Claude Code session in this repo, that memory loads automatically — anything inconsistent with it should be flagged before action.

## 8. When you are stuck

In order of preference:

1. Re-read CLAUDE.md — most "how should I structure this" questions are answered there.
2. Re-read this file.
3. Grep the codebase for prior art (`backend/src/scripts/sendDavidM4*.js` is a worked example of the sendWithBcAttach + branded-signature pattern).
4. Ask Ali on BC or Slack.

Do not silently invent a new pattern when there is a worked example three commits back.
