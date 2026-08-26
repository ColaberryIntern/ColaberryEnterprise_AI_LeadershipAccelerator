# Backend

Node 20 + Express + TypeScript API. Serves the participant portal, the admin console, the public marketing endpoints, the webhook receivers, the delivery-client surfaces, and the AI operations layer. **~4,000 tracked files.**

Rules for changing code here are in [CLAUDE.md](CLAUDE.md) (local conventions) layered on [../CLAUDE.md](../CLAUDE.md) (repo-wide contract). This README explains what exists and how it fits together.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node 20, TypeScript strict mode |
| HTTP | Express 4 |
| ORM | Sequelize 6 — Postgres (primary) and MSSQL (CCPP, read-mostly) |
| Runtime validation | Zod 4 (errors are `err.issues`, not `err.errors`) |
| Tests | Jest + ts-jest, supertest for route tests |
| LLM | OpenAI SDK |
| Scheduling | node-cron |
| Cache / queue | ioredis |

Entry point: [src/server.ts](src/server.ts).

```bash
npm run dev          # ts-node-dev, respawns on change
npm run build        # tsc -> dist/
npm start            # node dist/server.js
npx tsc --noEmit     # the gate. Must pass before any PR.
npx jest             # tests
```

> **Gotcha:** bare `npx tsc` can resolve a stale TypeScript 4.9.5 and report a false clean. Run it from `backend/` so it resolves the local 5.x.
>
> **Gotcha:** `.js` files under `src/` are never compiled (`allowJs` is off), so they never reach `dist/`. Plain-JS scripts run with `node` against the source tree. On production that means `docker cp` into the container and run from source.

---

## Directory map

| Path | Files | Purpose |
|---|---|---|
| [src/services/](src/services/README.md) | 1,726 | Business logic. The bulk of the system. |
| [src/scripts/](src/scripts/README.md) | 531 | One-off operational scripts. See [src/scripts/CLAUDE.md](src/scripts/CLAUDE.md). |
| [src/intelligence/](src/intelligence/README.md) | 529 | Planning, decision engines, and the System State Engine. |
| [src/models/](src/models/README.md) | 404 | Sequelize models. Each model is the contract for its table. |
| [src/__tests__/](src/__tests__/) | 185 | Backend test suite. |
| [src/routes/](src/routes/README.md) | 167 | Express route registration, grouped by audience. |
| [src/controllers/](src/controllers/) | 111 | Thin request handlers. Validate, call a service, return JSON. |
| [src/seeds/](src/seeds/) | 88 | Seed data, backfills, and SQL migrations. |
| `src/db/` | 66 | Schema-ensure migrations and their guard tests. |
| `src/data/` | 48 | Static reference data: canonical course, ontology, skill maps. |
| `src/modules/` | 39 | Vertical-slice modules: `attribution/`, `communications/`, `delivery/`. |
| `src/schemas/` | 27 | Zod request/response schemas. |
| `src/middlewares/` | 25 | Auth, RBAC, audit, tracing, error handling, preview proxy. |
| `src/utils/` | 21 | `AppError`, `hmac`, `cronNextRun`, `docGenerator`, `routeAudit`, and friends. |
| `src/types/` | 14 | Ambient type declarations. |
| `src/config/` | 10 | `env`, `database`, `featureFlags`, `agentModeProfiles`, `emailSignature`, `upload`. |
| `src/constants/` | 4 | Shared constants. |
| `src/mcp/` | 2 | MCP servers (`portalApiServer.js`, `postgresAnalyticsServer.js`). |
| `src/jobs/` | 1 | `autonomousIngestInsights.ts`. |

> The directory is `src/middlewares/` (plural). [CLAUDE.md](CLAUDE.md) writes it singular; the plural form on disk is correct.

### `src/db/` deserves a mention

Each `ensure*Schema.ts` idempotently brings a table up to the shape the code expects, and each has a matching `__tests__/ensure*Schema.test.ts`. That pairing means **schema drift fails a test instead of surfacing in production** — one of the stronger safety properties in this codebase.

---

## Request flow

The dependency arrow goes one way. Violating it is a review-blocking defect.

```
HTTP request
   |
   v
middlewares/         helmet -> cors -> trace -> [webhooks: raw body] -> json ->
                     intelligenceMiddleware -> auth / rbac / audit
   |
   v
routes/              mount by audience (public, portal, delivery, admin, v1, webhooks)
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

### Mount order is load-bearing

Two rules in [src/server.ts](src/server.ts), both learned the hard way:

**1. Webhooks and the preview proxy mount before `express.json()`.** Webhook signature verification needs the raw body. Move them below the parser and every signature check silently fails.

**2. Public routes MUST stay mounted before `adminRoutes`.** `adminRoutes` mounts with no path prefix and chains many sub-routers that call `router.use(requireAdmin)` with no path scope. Any request not matching an earlier route falls into `adminRoutes` and is 401'd before it can reach a public handler.

This caused the strategy-call booking 401 bug. It is now pinned by a test rather than a comment: `publicCaseStudyRoutes.test.ts` builds both mount orders against an `adminRoutes`-shaped stand-in and asserts 200 above / 401 below. The public case-study library serves anonymous readers at `/stories`, so mounting it below `adminRoutes` would 401 every real visitor while authenticated smoke tests kept passing.

---

## Route surface

31 top-level routers plus 94 admin sub-routers. Mounted in [src/server.ts](src/server.ts):

| Group | Routers |
|---|---|
| **External** | `webhookRoutes`, `unsubscribeRoutes` (both pre-JSON) |
| **Infra** | `healthRoutes` |
| **Delivery clients** | `deliveryClientAuthRoutes`, `deliveryClientRoutes` |
| **Public / marketing** | `leadRoutes`, `enrollmentRoutes`, `calendarRoutes`, `strategyPrepRoutes`, `trackingRoutes`, `qrRedirectRoutes`, `publicCaseStudyRoutes`, `publicPortfolioRoutes` |
| **Participant portal** | `participantRoutes`, `capePortalRoutes`, `careerPortfolioRoutes`, `projectsPortalRoutes`, `communityRoomsRoutes`, `showcaseArtifactRoutes`, `buildArtifactRoutes`, `buildLogDraftRoutes`, `explorerSignalRoutes`, `consentPromptRoutes`, `studentOpsRoutes`, `workspaceRoutes`, `sbpRoutes` |
| **Alumni / advisor** | `alumniReferralRoutes`, `advisorRoutes` |
| **Service-to-service** | `v1Routes` |
| **Staff** | `adminRoutes` (mounted last, aggregating 94 sub-routers) |

Health endpoints are deliberately split: `/health` never touches the database, so a Postgres blip cannot mark the container unhealthy and trigger the `restart: always` policy on an otherwise fine backend. `/health/ready` probes Postgres; `/health/full` requires an admin token.

---

## Required patterns

Enforced in review. Full detail in [CLAUDE.md](CLAUDE.md).

- **Zod-validate every inbound payload** before it reaches a service. Malformed input returns 400 and travels no further.
- **Every database read/write goes through a model.** Raw `sql.query` only where no model exists, typed at the call site.
- **No `any`** without a written justification comment.
- **No unstructured `console.log`.** Logs are single-line JSON to stdout with `event`, `service`, `correlation_id`, `outcome`, `duration_ms`.
- **Every external call** (OpenAI, Mandrill, Basecamp, Apollo, Skool, CCPP, Postgres) declares an explicit timeout, a capped retry policy, and a stable `error_class`. Never swallow an exception.
- **Idempotency is mandatory** for anything with a side effect. Same input, run twice, same end state.
- **No hardcoded URLs, ports, hostnames, or credentials** under `src/`. They live in env vars or `src/config/env.ts`.

### Changing a model's columns

Three edits or the model is broken:

1. A schema-ensure migration in `src/db/` (or SQL in `src/seeds/`), with its guard test.
2. The attribute interface in the model file.
3. The Sequelize column definition **and** the matching `declare` line.

Missing any one produces a model that type-checks and fails at runtime.

---

## Testing

The backend holds most of the repo's 1,099 test files — 537 in `services/`, 185 in `src/__tests__/`, 41 in `routes/`, 24 schema guards in `db/`.

```bash
npx jest                                    # all
npx jest src/services/__tests__/foo.test.ts # one file
```

- New logic in `services/` or `intelligence/` ships with at least a happy-path unit test.
- Controllers are tested with supertest against a real Express instance and mocked services.
- Integration tests may use a dev sandbox database. **Never production**, and they require an explicit opt-in flag.
- Workers and scheduled jobs are tested as routing logic: correct script selection, retry, idempotency, error handling. They must never send real email during a test.

---

## Deploy notes

Built from [backend/Dockerfile](Dockerfile) with the repo root as build context. Production runs with `NODE_OPTIONS=--max-old-space-size=512`, low enough that batch LLM generation loops have OOM'd around ~34 items. Batch carefully.

Boot is deliberately conservative: **no global Sequelize sync at startup.** An ungated `sync({ alter: true })` has previously produced duplicate indexes and OOM'd the container. Schema changes go through `src/db/` ensure-migrations.

Some seeds run at boot and **overwrite direct database edits**. If a row keeps reverting after a restart, find the seed that owns it.
