# SETUP.md — local dev quick start

Get the stack running on your machine in under 15 minutes. For deeper detail on directory layout, branching, deploys, and engine internals, see [docs/DEV_GUIDE.md](docs/DEV_GUIDE.md).

---

## 0. Prerequisites

- Node.js **20.x** (use nvm: `nvm install 20 && nvm use 20`)
- Docker Desktop (must be running before you start the stack)
- Git
- A code editor (VS Code recommended)
- An SSH key for prod access (ask Ali to add your public key — only needed when you start deploying)

## 1. Clone

```
git clone https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator.git
cd ColaberryEnterprise_AI_LeadershipAccelerator
```

## 2. Local env files

```
cp backend/.env.example backend/.env.dev
```

Then fill in the required values in `backend/.env.dev`. Minimum set to boot:

- `DATABASE_URL` (default in docker-compose handles this)
- `OPENAI_API_KEY` (ask Ali; needed for LLM-backed features)
- `BASECAMP_ACCESS_TOKEN` (ask Ali; pulled from CCPP `Basecamp_AuthInfo`, rotates every 2 weeks)
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` (ask Ali for the shared OAuth credentials)

Everything else in `.env.example` is feature-flagged off by default — fill in only what you touch.

## 3. Start the stack

```
docker compose -p colaberry-dev -f docker-compose.dev.yml up -d --build
```

The `-p colaberry-dev` flag isolates your containers from production. Always include it.

This brings up:
- `accelerator-dev-db` — Postgres on port `5432` (db name `accelerator_prod`, user `accelerator`, password `accelerator`)
- `accelerator-dev-backend` — Express + TypeScript backend on port `3001`
- `accelerator-dev-intelligence` — Python intelligence engine on port `5000`
- `accelerator-dev-nginx` — frontend served at `http://localhost:8888`

## 4. Verify

```
curl http://localhost:3001/health
# expect {"status":"ok"}

curl http://localhost:8888
# expect HTML
```

Open `http://localhost:8888` in your browser. Login with the seeded admin (ask Ali for credentials) or run `npm run seed:admin` from inside the backend container:

```
docker exec -it accelerator-dev-backend npm run seed:admin
```

## 5. Make changes

The dev backend uses `ts-node-dev` with `--respawn`, so code changes restart the server automatically. Frontend changes (in `frontend/src`) require a rebuild of the nginx image:

```
docker compose -p colaberry-dev -f docker-compose.dev.yml up -d --build nginx
```

## 6. Type-check before push

```
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
```

`tsc --noEmit` must pass before any PR. CI runs the same check.

## 7. Branch + PR workflow

```
git checkout -b workstream/your-feature-name
# make changes, commit
git push -u origin workstream/your-feature-name
gh pr create --base main
```

Ali reviews + merges. Deploys happen on his side via SSH to the prod VPS.

## 8. Production deploys (once you have SSH access)

```
ssh root@95.216.199.47
cd /opt/colaberry-accelerator
git pull origin main
docker compose -f docker-compose.production.yml up -d --build
```

Backend takes 60–90 seconds to bind port 3001 after a deploy. `/api` returning 502 during that window is timing, not failure.

---

## Need help

- Stack-specific questions → see [docs/DEV_GUIDE.md](docs/DEV_GUIDE.md) and [CLAUDE.md](CLAUDE.md)
- Env var meaning → see comments in [backend/.env.example](backend/.env.example)
- Ali: BC, Slack, or text

## What you should NOT do without confirmation

- Force-push to `main`
- Modify the production crontab on the VPS
- Run any DB migration in production without dry-running on dev first
- Commit secrets (use env files, not hardcoded keys)
- Skip the `tsc --noEmit` check before push
