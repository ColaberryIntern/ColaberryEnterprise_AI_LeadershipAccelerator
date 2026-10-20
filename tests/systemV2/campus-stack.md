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
```

From `backend/`: `npx ts-node --transpile-only src/server.ts`. Wait for `Server running on port 3101`, stop it, start it again.
The first boot creates the tables through `sequelize.sync`; the boot-time schema patches run before sync, so they need the second boot.
Known and harmless for the campus: plain `postgres:16` has no `vector` type, so the intelligence tables that use it are not created.

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
