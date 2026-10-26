# Campus e2e: the local stack

`campus.e2e.js` runs against a stack on this machine only. Never production: the script and the seed both refuse anything else
(`lib/localOnly.js`, `backend/src/scripts/lib/campusE2EGuard.ts`).

## 1. Throwaway Postgres

```
docker run -d --name campus-e2e-pg -e POSTGRES_USER=campus -e POSTGRES_PASSWORD=campus -e POSTGRES_DB=campus_e2e -p 127.0.0.1:55452:5432 postgres:16
```

## 2. Backend, booted twice

Env (no external keys on purpose; nothing reaches Mandrill, OpenAI, GHL, GitHub, Apollo or Basecamp):

```
DATABASE_URL=postgres://campus:campus@127.0.0.1:55452/campus_e2e
NODE_ENV=development  PORT=3101  DB_BOOT_SYNC=true  FRONTEND_URL=http://localhost:3150
CAMPUS_ENABLED=all  PEOPLE_PANEL_ROLES_ENABLED=true  ENABLE_CHAT=true
GROWTH_JOURNEY_ENABLED=true  GROWTH_JOURNEY_HANDOFFS_ENABLED=true  CAPE_TODAY_PLAN_ENABLED=true
CAMPUS_CALENDAR_STUB=1  COMMUNITY_ROOMS_ENABLED=true
```

`CAMPUS_CALENDAR_STUB=1` lets the admissions-call step (C20) book against a fake calendar instead of Google; `COMMUNITY_ROOMS_ENABLED`
turns on room creation for the Meeting Rooms step (C29). Leave `CAMPUS_WEATHER_ENABLED` unset: the campus then never calls Open-Meteo
and the weather step expects the clock-only answer (C37).

From `backend/`: `npx ts-node --transpile-only src/server.ts`. Wait for `Server running on port 3101`, stop it, start it again.
The first boot creates the tables through `sequelize.sync`; the boot-time schema patches run before sync, so they need the second boot.
Known and harmless for the campus: plain `postgres:16` has no `vector` type, so the intelligence tables that use it are not created.

### Boot errors you will see, and why they do not matter here (C23, round-1 leftover)

A fresh throwaway database logs these on every boot. None of them touch a campus table, and the e2e passes with all of them present
(checked 2026-10-25 on the C35 boot). The earlier "seed FK errors" no longer occur: the boot-time patches that add foreign keys
(`lead_view_preferences`, `scholarship_interviews`, `work_ledger_events`) run cleanly on the second boot.

| Log line | Cause | Campus impact |
|---|---|---|
| `[DB] sync({ alter: true }) failed ... default for column "state" cannot be cast`, then `fallback sync also failed: type "vector" does not exist` | the alter pass trips on one enum default; the create-only fallback stops at the first `vector` table, so the second boot is what creates the rest | none after the second boot |
| `[Intelligence] Failed to sync intelligence_memory: type "vector" does not exist` | no pgvector in plain `postgres:16` | none |
| `[Seed] Missed Opportunities Report registration failed: relation "automated_reports" does not exist` | that table is created by a migration this stack does not run | none |
| `[Seed] curriculum/departments seed failed (non-fatal): null value in column "id" of relation "curriculum_course_links"` | the seed inserts without an id where production has a sequence default | none (the campus reads no curriculum links) |
| `project_lifecycle_schema_invariant_violated` (SchemaInvariantViolation) | a production check constraint is missing in a synced database | none |
| `[peoplePanel] businesses unavailable, omitting: column Sponsor.created_at does not exist` | the synced `sponsors` table lacks a timestamp production has | the people panel leaves businesses out, as it does on any outage |
| `MSSQL connection not configured`, `[OpsBcSync] completed with 1 errors` | no CCPP or Basecamp credentials, on purpose | none |
| event-queue lines `reclaimed after a worker left this event in processing` / `dead-lettered` | the queue sweeper on an empty queue | none |

If a NEW error appears that is not in this table, treat it as a real failure until it is explained here.

## 3. Seed the four audiences (safe to run again)

From `backend/`, with the same `DATABASE_URL`:

```
npx ts-node --transpile-only src/scripts/seedCampusE2E.ts --out ../tmp/campus-e2e-tokens.json
```

Creates member, Explorer, business and staff in the cohort `campus-e2e-marker`, seeds the agent registry (Reese and Dara
desks, both switched on in this database only), and writes their portal JWTs (gitignored). **Restart the backend after the
first seed**: it caches the desk identities, so a backend started before the seed shows Reese and Dara as "Back soon".

## 4. Frontend (built, served like production)

From `frontend/`: `CI=true npx react-scripts build`. Then from the repo root:
`SERVE_PORT=3150 API_URL=http://127.0.0.1:3101 node tests/systemV2/lib/localServe.js`
It serves `frontend/build` and proxies `/api` to the backend on the same origin, as production nginx does (several portal
calls use relative `/api` URLs, and the dev server has no proxy configured). It binds 127.0.0.1 only.

## 5. Run

`BASE_URL=http://localhost:3150 API_URL=http://127.0.0.1:3101 node tests/systemV2/campus.e2e.js`

## Tear down

`docker rm -f campus-e2e-pg`
