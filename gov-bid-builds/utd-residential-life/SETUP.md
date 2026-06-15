# Local Development Setup

## Prerequisites

- Node.js 20+ (Node 24 recommended — uses built-in `node:sqlite`, no native compilation needed)
- No Docker required for local dev

## First-time setup

```bash
# 1. Install deps
npm install

# 2. Copy and fill the env file (optional — defaults work out of the box for local dev)
cp .env.example .env

# 3. Apply schema migrations (runs automatically on server start, but can be run standalone)
npm run db:migrate

# 4. Seed demo data
npm run seed

# 5. Start the dev server
npm run dev
```

The app will be live at http://localhost:3000.

Sign in using the role-picker on the login page (no password required — demo mode).

## Architecture note

The current implementation is a **server-rendered monolith**: Express 4 + express-handlebars + Node 24 built-in `node:sqlite`. There is no separate React frontend or Postgres database in the demo stack. This was a deliberate choice for the sprint — no native module compilation, no Docker process required to run locally.

If a Postgres + React production architecture is needed post-demo, that is scoped as a separate future task.

## Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the server (port 3000, hot-reload via nodemon if installed) |
| `npm run start` | Start the server (production mode) |
| `npm run seed` | Reseed demo data (users, reports, shifts) |
| `npm run db:migrate` | Apply schema (safe to re-run — all statements are CREATE TABLE IF NOT EXISTS) |
| `npm run db:rollback` | Not supported — delete `data/app.db` to reset the database |
| `npm run lint` | TODO |
| `npm run test` | TODO |

## Env vars

See `.env.example` for the full list. For local dev, defaults work without changes.

Critical vars if you customize:

- `PORT` — server port (default: 3000)
- `NODE_ENV` — `development` or `production`

The `DATABASE_URL`, `S3_*`, and `AUTH_SECRET` vars are present in `.env.example` for future production use but are not read by the current demo stack.

## If something breaks

Open a Slack thread in `#gov-contracts`. Tag `@CB System` and describe what you tried.
