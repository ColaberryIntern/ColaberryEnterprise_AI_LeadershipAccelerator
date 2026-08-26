# Backend

Node 20 + Express + TypeScript API for the Colaberry Enterprise AI Leadership Accelerator. It serves the participant portal, the admin console, the public marketing endpoints, the webhook receivers, and the AI operations layer. ~1,850 tracked files.

Rules for changing code here are in [CLAUDE.md](CLAUDE.md) (local conventions) layered on top of [../CLAUDE.md](../CLAUDE.md) (repo-wide contract). This README explains what exists and how it fits together.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node 20, TypeScript strict mode |
| HTTP | Express 4 |
| ORM | Sequelize 6 — Postgres (primary) and MSSQL (CCPP, read-mostly) |
| Runtime validation | Zod 4 (note: errors are `err.issues`, not `err.errors`) |
| Tests | Jest 29 + ts-jest, supertest for route tests |
| LLM | OpenAI SDK |
| Scheduling | node-cron |
| Cache / queue | ioredis |

Entry point: [src/server.ts](src/server.ts) (773 lines) — Helmet, CORS, route registration, error handler.

```bash
npm run dev          # ts-node-dev, respawns on change
npm run build        # tsc -> dist/
npm start            # node dist/server.js
npx tsc --noEmit     # the gate. Must pass before any PR.
npx jest             # tests
```

> **Gotcha:** bare `npx tsc` can resolve a stale TypeScript 4.9.5 and report a false clean. Run it from `backend/` so it resolves the local 5.7.x.
>
> **Gotcha:** `.js` files under `src/` are never compiled (`allowJs` is off), so they never reach `dist/`. Scripts written in plain JS run via `node` against the source tree, not the build.

---

## Directory map

| Path | Files | Purpose |
|---|---|---|
| [src/services/](src/services/README.md) | 518 | Business logic. The bulk of the system. |
| [src/intelligence/](src/intelligence/README.md) | 510 | Planning, decision engines, and the System State Engine. |
| [src/scripts/](src/scripts/) | 323 | One-off operational scripts. See [src/scripts/CLAUDE.md](src/scripts/CLAUDE.md). |
| [src/models/](src/models/README.md) | 225 | Sequelize models. Each model is the contract for its table. |
| [src/routes/](src/routes/README.md) | 81 | Express route registration, grouped by audience. |
| [src/controllers/](src/controllers/) | 60 | Thin request handlers. Validate, call a service, return JSON. |
| [src/seeds/](src/seeds/) | 43 | Seed data, backfills, and SQL migrations. |
| [src/__tests__/](src/__tests__/) | 40 | Backend test suite. |
| `src/utils/` | 8 | `AppError`, `hmac`, `cronNextRun`, `docGenerator`, `routeAudit`, `preflightCheck`, `linkScanner`, `normalizeFields`. |
| `src/middlewares/` | 8 | Auth, RBAC, audit, error handling, preview proxy. |
| `src/schemas/` | 7 | Zod request/response schemas. |
| `src/config/` | 6 | `env`, `database`, `featureFlags`, `agentModeProfiles`, `emailSignature`, `upload`. |
| `src/data/` | 5 | Static reference data: canonical course, ontology, skill maps. |
| `src/types/` | 3 | Ambient type declarations. |
| `src/mcp/` | 2 | MCP servers (`portalApiServer.js`, `postgresAnalyticsServer.js`). |
| `src/jobs/` | 1 | `autonomousIngestInsights.ts`. |

> Note: the directory is `src/middlewares/` (plural). [CLAUDE.md](CLAUDE.md) writes it as `src/middleware/`; the plural form on disk is correct.

---

## Request flow

The dependency arrow goes one way. Violating it is a review-blocking defect.

```
HTTP request
   |
   v
middlewares/         helmet -> cors -> [webhooks: raw body] -> json ->
                     intelligenceMiddleware -> auth / rbac / audit
   |
   v
routes/              mount by audience (admin, portal, public, v1, webhooks)
   |
   v
controllers/         thin. Zod-parse input, call a service, shape the response.
   |
   v
services/            all business logic. Mockable, unit-tested.
   |
   v
models/              Sequelize. The only path to the database.
```

`services/` must not import from `controllers/`. `backend/` must never import from `frontend/`.

### Middleware ordering matters

In [src/server.ts](src/server.ts), `webhookRoutes` mounts **before** `express.json()` because webhook signature verification needs the raw body. The preview proxy also mounts before the JSON parser. Moving either below the parser silently breaks signature checks.

Route mounting order also carries an auth consequence: public routes registered *after* `adminRoutes` can inherit its auth guard and start returning 401. If a public endpoint unexpectedly requires auth, check its mount position first.

---

## Route surface

Mounted in `server.ts`, in order:

| Router | Audience | Notes |
|---|---|---|
| `webhookRoutes` | External | Mounted pre-JSON for raw-body signature verification. |
| `healthRoutes` | Infra | `/health` liveness (no DB), `/health/ready` readiness (probes Postgres, 2s timeout), `/health/full` (admin token required). |
| `leadRoutes` | Public | Lead capture from marketing surfaces. |
| `enrollmentRoutes` | Public | Enrollment and checkout. |
| `adminRoutes` | Staff | Aggregates **67** sub-routers from `routes/admin/`. |
| `calendarRoutes` | Public | Booking. |
| `strategyPrepRoutes` | Public | Strategy call prep. |
| `trackingRoutes` | Public | Visitor tracking beacon (pairs with `frontend/public/v1/track.js`). |
| `participantRoutes` | Students | 39 endpoints — the portal API. |
| `sponsorRoutes` | Sponsors | Employer/sponsor surfaces. |
| `alumniReferralRoutes` | Alumni | Referral program. |
| `qrRedirectRoutes` | Public | QR code redirects with analytics capture. |
| `v1Routes` | Service-to-service | `POST /api/v1/leads`, `POST /api/v1/request-callback`. Rate-limited and token-gated via `requireServiceToken`. Used by training.colaberry.com. |

Health endpoints are deliberately split: `/health` never touches the database, so a Postgres blip cannot mark the container unhealthy and trigger the `restart: always` policy on an otherwise fine backend.

---

## Required patterns

These are enforced in review. Full detail in [CLAUDE.md](CLAUDE.md).

- **Zod-validate every inbound payload** before it reaches a service. Malformed input returns 400 and never travels further.
- **Every database read/write goes through a model.** Raw `sql.query` only where no model exists, and the result is typed at the call site.
- **No `any`** without a written justification comment.
- **No unstructured `console.log`.** Logs are single-line JSON to stdout with `event`, `service`, `correlation_id`, `outcome`, `duration_ms`.
- **Every external call** (OpenAI, Mandrill, Basecamp, Apollo, Skool, CCPP, Postgres) declares an explicit timeout, a capped retry policy, and a stable `error_class` tag. Never swallow an exception.
- **Idempotency is mandatory** for anything with a side effect. Same input, run twice, same end state. See the idempotency table in [../CLAUDE.md](../CLAUDE.md).
- **No hardcoded URLs, ports, hostnames, or credentials** anywhere under `src/`. They live in env vars or `src/config/env.ts`.

### Changing a model's columns

Three edits or the model is broken:

1. SQL migration (run against prod via SSH + `docker exec`; mirror on dev).
2. The attribute interface in the model file.
3. The Sequelize column definition **and** the matching `declare` line.

Missing any one of the three produces a model that type-checks but fails at runtime.

---

## Testing

106 test files repo-wide; the backend holds most of them.

```bash
npx jest                                    # all
npx jest src/services/__tests__/foo.test.ts # one file
```

- New logic in `services/` or `intelligence/` ships with at least a happy-path unit test. Pre-existing untested code is grandfathered until touched.
- Controllers are tested with supertest against a real Express instance and mocked services.
- Integration tests may use a dev sandbox database. **Never production**, and they require an explicit opt-in flag.
- Workers and scheduled jobs are tested as routing logic: correct script selection, retry behavior, idempotency, error handling. They must never send real email during a test — use the Mandrill test-mode flag.

---

## Deploy notes

Built from [backend/Dockerfile](Dockerfile) with the repo root as build context. Production runs with `NODE_OPTIONS=--max-old-space-size=512`, which is low enough that batch LLM generation loops have OOM'd around ~34 items. Batch carefully.

Boot is deliberately conservative: **no global Sequelize sync at startup.** An ungated `sync({ alter: true })` has previously produced duplicate indexes and OOM'd the container. Schema changes go through explicit SQL migrations.

Seed scripts under `src/seeds/` run at boot for some card types, and they **overwrite direct database edits**. If a change keeps reverting after a restart, look for a seed that owns that row.
