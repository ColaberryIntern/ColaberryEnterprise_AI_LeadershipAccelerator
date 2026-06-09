# Local Development Setup

## Prerequisites

- Node.js 20+
- Docker (for Postgres + storage)
- A Colaberry GitHub access (the cloned repo is private)

## First-time setup

```bash
# 1. Install deps
npm install

# 2. Boot the local stack (Postgres + S3-compatible MinIO)
docker compose up -d

# 3. Copy and fill the env file
cp .env.example .env

# 4. Run migrations
npm run db:migrate

# 5. Seed fake data
npm run seed

# 6. Boot the dev server
npm run dev
```

The app should be live at http://localhost:3000.

## Env vars

See `.env.example` for the full list. Critical ones:

- `DATABASE_URL` — Postgres connection string (default points at the local docker-compose Postgres)
- `S3_*` — object storage (default points at local MinIO)
- `AUTH_SECRET` — random string, any 32+ char value works locally

## Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Boot the dev server with hot reload |
| `npm run build` | Build for production |
| `npm run seed` | Wipe + reseed fake data |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:rollback` | Roll back the last migration |
| `npm run lint` | Run linting |
| `npm run test` | Run unit tests |

## If something breaks

Open a Slack thread in `#gov-contracts`. Tag `@CB System` and describe what you tried.
