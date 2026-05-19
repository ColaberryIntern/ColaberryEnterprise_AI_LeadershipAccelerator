# backend/CLAUDE.md
**Local conventions for the Node.js + Express + TypeScript backend.** Root rules in `/CLAUDE.md` apply additively. This file covers only what is specific to working inside `backend/`.

## Stack
- Node 20, TypeScript strict mode, Express, Sequelize (Postgres + MSSQL), Zod for runtime validation, Jest for tests.
- Entry point: `backend/src/server.ts`. Routes registered there via `app.use(...)`.
- Run dev: `npm run dev` (from `backend/`). Type-check: `npx tsc --noEmit`. Tests: `npx jest`.

## Directory map
| Path | Purpose |
|---|---|
| `src/controllers/` | Request handlers. Thin. Validate input, call services, return JSON. No business logic. |
| `src/services/` | Business logic. Pure functions or service classes. Mockable. Unit-tested. |
| `src/services/agents/` | Agent orchestration trees (openclaw, skool, intelligence, marketing). |
| `src/intelligence/` | Planning, prompt generation, decision engines. |
| `src/models/` | Sequelize model definitions. Each model is the contract for its table. |
| `src/routes/` | Express route registration. Group by feature (admin, portal, public). |
| `src/middleware/` | Auth, error handlers, request logging. |
| `src/config/` | Env loading, db connection setup. |
| `src/scripts/` | One-off operational scripts. See `src/scripts/CLAUDE.md` for naming. |
| `src/seeds/` | Seed data and migration scripts. |
| `src/schemas/` | Zod schemas for request/response validation. |

## Required patterns
- **Every route validates input with Zod.** No `req.body.foo` access without a Zod parse first. Failed parse returns 400; never let bad input reach a service.
- **Every Sequelize query goes through a model.** Raw `sql.query` only when no model exists; type the result at the call site.
- **Controllers return typed responses.** Define the response shape as a TypeScript type; in dev, validate the actual response against the shape and fail loud if it diverges.
- **No `any` without a written justification comment.** Reviewer enforces.
- **No `console.log` of unstructured strings.** Use the structured-log pattern (see root CLAUDE.md > Observability Framework): JSON line with `event`, `service`, `correlation_id`, `outcome`.
- **Every external call (Mandrill, Basecamp, OpenAI, Apollo, Skool, CCPP, Postgres) has an explicit timeout, a documented retry policy, and an `error_class` tag.** Never swallow exceptions.
- **Identity resolution lives in services, not controllers.** If a controller needs to link a visitor to a lead by email, it calls `resolveIdentity()` in `services/visitorTrackingService.ts`, not duplicates the lookup.

## Forbidden
- Hardcoded URLs, ports, hostnames, tokens, or credentials anywhere under `src/`. All of these live in env vars or `src/config/env.ts`.
- Catching `Error` generically without a more specific class. Tag every caught exception with a stable `error_class` string before logging.
- Cross-importing across feature boundaries (e.g., `agents/openclaw` importing from `agents/skool`). Lift shared logic into `services/` instead.
- New top-level subdirectories under `src/` without DRI sign-off. The above tree is the contract.

## Testing
- Any new function in `services/` or `intelligence/` ships with at least one unit test (happy path minimum). Existing untested code is grandfathered until touched.
- Integration tests may hit dev sandbox DB; never touch prod. Opt-in via env flag.
- Controllers tested via supertest against a real Express app instance, mocked services.
- Run `npx tsc --noEmit` before every commit.

## Models specifically
- New columns added via SQL migration (run on prod via SSH + docker exec; mirror in dev). Then update the model file's attribute interface AND the Sequelize column definition AND the `declare` line. All three or the model is broken.
- See recent `Visitor.ts` / `VisitorSession.ts` site_slug addition as the canonical pattern.

## Forbidden Imports
- `backend/src/` MUST NOT import from `frontend/src/`. Backend stands alone.
- `services/` should not import from `controllers/`. Dependency arrow goes one way: routes → controllers → services → models.

## Build manifests
This is the side of the codebase that emits `BuildManifest` to the portal after non-trivial changes. See root CLAUDE.md > Telemetry Synchronization Contract.
