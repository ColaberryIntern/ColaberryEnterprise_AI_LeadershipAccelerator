# Local Setup

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## 1. Install dependencies

```bash
npm install
cd app/client && npm install && cd ../..
```

## 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and generate ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Create the database and run migrations

```bash
createdb detroit_voter_education
npm run db:migrate
```

## 4. Seed test data

```bash
npm run seed
```

## 5. Start the server

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — frontend (dev mode with hot reload)
npm run dev:client
```

Open http://localhost:5173 in your browser.

## Acceptance test (STORY-001)

1. Open the app. Enter ZIP `48201` and select `Healthcare` + `Education`.
2. Click **Save My Preferences**.
3. The WebSocket status updates to `saved` and the confirmation block appears.
4. Verify in the database:

```sql
SELECT session_id, updated_at FROM user_preferences;
SELECT action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 1;
```

Both rows should exist. Loop stop: all acceptance scenarios pass.
