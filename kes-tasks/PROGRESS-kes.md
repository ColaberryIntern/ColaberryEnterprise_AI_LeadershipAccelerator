# PROGRESS.md — AI Systems Architect Accelerator

## Current State (as of 2026-06-05)

**Platform:** `enterprise.colaberry.ai`
**Stack:** Node.js · Express · TypeScript · Sequelize · PostgreSQL · node-cron (confirmed — `schedulerService.ts` uses `node-cron`; native `fetch` for HTTP)
**Launch date:** 2026-07-10
**Anthropic partner deadline:** 2026-06-12 (hard gate — partner portal URL and CCA-F branding both depend on this)

---

## Phase L1 — Anthropic Intelligence Layer: ContentRegistry + Nightly Cron

**Target:** Week 2 (2026-06-20)
**Owner:** Kes Delele
**Purpose:** Track content changes across Anthropic Skilljar courses, docs, news, and partner portal. Feeds L2 (Change Detection Engine) and L3 (AI Curriculum Impact Agent) in subsequent weeks.

### Tasks

- [x] T1 — Create PROGRESS.md
  - Date: 2026-06-04
  - Session: CC-20260604-init
  - What changed: Created PROGRESS.md for this project.
  - Verification: File exists at repo root.

- [x] T2 — Sequelize model: `AnthropicContentRegistry`
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/models/AnthropicContentRegistry.ts`. Interface + Model.init() with columns: id (UUID PK), content_type (ENUM), title, url (UNIQUE), last_checked, last_modified, change_detected, change_summary (JSONB), etag, content_hash. Added import + export to `models/index.ts`. Assumption: added `etag` and `content_hash` columns beyond spec minimum — required for reliable change detection per B6 (CDN-served pages without Last-Modified).
  - Verification: `tsc --noEmit` passes — zero errors in new Anthropic files.

- [x] T3 — Database migration / table creation script
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/seeds/createAnthropicContentRegistry.ts`. Idempotent: `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` for etag/content_hash. Creates ENUM type with `DO $$ ... EXCEPTION WHEN duplicate_object`. Safe to run twice.
  - Verification: `tsc --noEmit` passes. Full run requires Docker stack (DB connection needed).

- [x] T4 — Seed data script
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/seeds/seedAnthropicContentRegistry.ts`. Upserts 7 rows by URL (ON CONFLICT DO UPDATE): 4 confirmed Skilljar courses, docs.anthropic.com, anthropic.com/news, partner portal placeholder. B3 handled: placeholder row seeded with URL `https://partners.anthropic.com/PLACEHOLDER` — update url column after 2026-06-12.
  - Verification: `tsc --noEmit` passes. Full run requires Docker stack.

- [x] T5 — Content watcher service
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/services/anthropicContentWatcher.ts`. Exports `runContentWatcher()`. Fetches all registry rows; per row: native `fetch` with 15s AbortController timeout. Change detection in priority order: (1) Last-Modified header, (2) ETag, (3) SHA-256 content hash. Updates last_checked on every run. Structured JSON logs (timestamp, level, service, event, outcome). No silent catch blocks — all errors classified (TimeoutError, NetworkError, UpstreamUnavailable). B4 resolved: Skilljar landing pages publicly accessible — content-hash approach works for all 6 URLs.
  - Verification: `tsc --noEmit` passes (zero errors in new files). Unit tests written (T8).

- [x] T6 — Nightly cron registration
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Added `cron.schedule('0 2 * * *', ...)` to `startScheduler()` in `backend/src/services/schedulerService.ts`. Uses existing `instrumentCronJob` wrapper (same pattern as all other jobs in the file). Lazy-requires `anthropicContentWatcher` to avoid circular import risk.
  - Verification: `tsc --noEmit` passes. Dev-environment fire test requires Docker stack.

- [x] T7 — Admin endpoints
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/routes/admin/anthropicRoutes.ts`. `POST /api/admin/sync/anthropic-content` — manual trigger, returns checked/changed/errors summary. `GET /api/admin/anthropic/registry` — returns all rows ordered by content_type, title. Both gated by `requireAdmin`. Imported and mounted in `adminRoutes.ts`.
  - Verification: `tsc --noEmit` passes.

- [x] T8 — Unit tests
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/__tests__/services/anthropicContentWatcher.test.ts`. 10 tests across 4 suites: happy paths (Last-Modified change, ETag change, content-hash change, Last-Modified unchanged), failure paths (5xx, AbortError/timeout, NetworkError, continues after one row errors), boundary (empty registry), idempotency (two runs on stable URL = no duplicate change flag). Mocks: `jest.mock` on AnthropicContentRegistry + `global.fetch`. No live network calls.
  - Verification: `tsc --noEmit` passes. Jest run requires Docker stack (`jest` binary in Docker node_modules; not installed in local-only npm install which has only TypeScript + ESLint).

- [x] T9 — PROGRESS.md entries per completed task
  - Gate: Each task above gets a date + verification line before it is marked `[x]`. ← done for all T1–T8 above.

---

## Phase L2 — Anthropic Intelligence Layer: Change Detection Engine

**Target:** Week 2 (2026-06-20)
**Owner:** Kes Delele
**Purpose:** Materialize L1-flagged rows into `anthropic_change_events` audit table. Feeds L3 (AI Curriculum Impact Agent).

### Tasks

- [x] T10 — Sequelize model: `AnthropicChangeEvent`
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/models/AnthropicChangeEvent.ts`. Columns: id (UUID PK), registry_id (UUID), url, content_type, detected_at, detection_method (VARCHAR 50), previous_value (TEXT nullable), current_value (TEXT), severity (VARCHAR 20, default 'unknown' — L3 slot), processed_at. Registered in `models/index.ts`.
  - Verification: `tsc --noEmit` passes — zero errors in new file.

- [x] T11 — Database migration script
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/seeds/createAnthropicChangeEvents.ts`. Idempotent `CREATE TABLE IF NOT EXISTS`. Includes `UNIQUE (registry_id, detected_at)` constraint — prevents duplicate events even on concurrent runs.
  - Verification: `tsc --noEmit` passes. Full run requires Docker stack.

- [x] T12 — Change detector service
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/services/anthropicChangeDetector.ts`. Exports `runChangeDetector()`. Reads `anthropic_content_registry WHERE change_detected = true`. For each flagged row: wraps `AnthropicChangeEvent.create` + `row.update({change_detected: false, change_summary: null})` in a Sequelize transaction — atomic, crash-safe (flag stays set if transaction rolls back, so next run retries). Skips rows with null `change_summary`. Error classes: DatabaseError, DuplicateEventError. Structured JSON logs.
  - Verification: `tsc --noEmit` passes. Unit tests written (T14).

- [x] T13 — Nightly cron registration
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Added `cron.schedule('30 2 * * *', ...)` to `startScheduler()` in `schedulerService.ts`. Runs 30 min after L1 (02:00 UTC) — guarantees L1 completes before L2 reads flagged rows.
  - Verification: `tsc --noEmit` passes.

- [x] T14 — Admin endpoints
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Added to `backend/src/routes/admin/anthropicRoutes.ts`: `POST /api/admin/sync/anthropic-detect` (manual L2 trigger, returns processed/skipped/errors) + `GET /api/admin/anthropic/change-events` (list events, optional `?content_type=` and `?limit=` filters). Both `requireAdmin`-gated.
  - Verification: `tsc --noEmit` passes.

- [x] T15 — Unit tests
  - Date: 2026-06-05
  - Session: CC-20260605-k3x9
  - What changed: Created `backend/src/__tests__/services/anthropicChangeDetector.test.ts`. 8 tests across 4 suites: happy paths (single row processed + flag cleared, empty registry, multiple rows), failure paths (continues after one error, DuplicateEventError classification), boundary (null change_summary skipped + cleared), idempotency (second run with no flagged rows → zero events, create called once). Mocks: `jest.mock` on both Anthropic models + `sequelize.transaction`.
  - Verification: `tsc --noEmit` passes. Jest run requires Docker stack.

---

## Blockers — updated 2026-06-05

| ID | Severity | Status | Description | Unblocks |
|---|---|---|---|---|
| B1 | CRITICAL | **RESOLVED** | Codebase is present — this IS the enterprise.colaberry.ai repo. | T2–T8 |
| B2 | HIGH | **RESOLVED** | 6 confirmed URLs provided by Ali 2026-06-05. | T4 |
| B3 | HIGH | **OPEN** | Partner portal URL unknown until 2026-06-12. Seed script inserts placeholder row. | T4 (partial) |
| B4 | HIGH | **RESOLVED** | Skilljar landing pages publicly accessible; content-hash approach sufficient. | T5 |
| B5 | MEDIUM | **RESOLVED** | Stack is TypeScript; implemented in TypeScript. | T5 |
| B6 | MEDIUM | **RESOLVED** | ETag + content-hash fallback implemented in T5 (three-tier detection). | T5 |
| B7 | MEDIUM | **RESOLVED** | L2 schema defined: `anthropic_change_events` table with UNIQUE constraint + `severity` column reserved for L3. | T10–T15 |
| B8 | LOW | **RESOLVED** | HTTP client: native `fetch` (confirmed from `dailyInternNudges.js`). Cron: `node-cron` in `schedulerService.ts`. | T5, T6 |

---

## Prod deploy — 2026-06-06 (COMPLETE)

Session: CC-20260606-m7w2

Ali deployed to `accelerator_prod`:
- `git pull origin main && docker compose -f docker-compose.production.yml up -d --build backend`
- Seed sequence run against prod backend container:
  1. `node /app/dist/seeds/createAnthropicContentRegistry.js` ✓
  2. `node /app/dist/seeds/createAnthropicChangeEvents.js` ✓
  3. `node /app/dist/seeds/seedAnthropicContentRegistry.js` ✓ (7 rows)
- psql verified: 4 course / 1 document / 1 news / 1 partner-portal = 7 total
- L1 nightly cron: 02:00 UTC starting 2026-06-07
- L2 nightly cron: 02:30 UTC starting 2026-06-07

**Morning-after check (run after 02:30 UTC 2026-06-07):**
```sql
SELECT url, last_checked, content_hash IS NOT NULL AS hashed
FROM anthropic_content_registry
ORDER BY content_type, title;
```
Expect: 6 rows hashed=true, partner-portal row hashed=false (placeholder URL won't resolve).

---

---

## Phase L3 — Curriculum Impact Agent

**Target:** Week 3 (2026-06-27) — shipped early 2026-06-07
**Owner:** Kes Delele

### Tasks

- [x] T16 — Curriculum impact service (`anthropicCurriculumImpactAgent.ts`)
  - Date: 2026-06-07
  - Session: CC-20260606-m7w2
  - What changed: Created `backend/src/services/anthropicCurriculumImpactAgent.ts`. Queries `anthropic_change_events WHERE severity = 'unknown'`, calls gpt-4o-mini with 30s timeout per event, maps 1–10 score to severity label, updates row. Batches events scoring ≥7 into one digest email. Error classes: ScoringError, ParseError. Retry via next nightly cron.
  - Verification: `tsc --noEmit` passes — zero errors in new file.

- [x] T17 — Email digest (`sendCurriculumImpactDigest` in emailService.ts)
  - Date: 2026-06-07
  - Session: CC-20260606-m7w2
  - What changed: Added `sendCurriculumImpactDigest(to, items)` to `backend/src/services/emailService.ts`. Single HTML email with severity-coded score badges. Uses existing transporter + `resolveEmailRecipient` + `htmlToPlainText`.
  - Verification: `tsc --noEmit` passes.

- [x] T18 — Nightly cron at 03:00 UTC
  - Date: 2026-06-07
  - Session: CC-20260606-m7w2
  - What changed: Added `cron.schedule('0 3 * * *', ...)` to `schedulerService.ts`. Fires 30 min after L2, guarantees flagged rows are cleared before L3 reads.
  - Verification: `tsc --noEmit` passes.

- [x] T19 — Admin endpoint `POST /api/admin/sync/anthropic-impact`
  - Date: 2026-06-07
  - Session: CC-20260606-m7w2
  - What changed: Added manual L3 trigger to `anthropicRoutes.ts`. `requireAdmin`-gated.
  - Verification: `tsc --noEmit` passes.

- [x] T20 — Unit tests (10 tests, 5 suites)
  - Date: 2026-06-07
  - Session: CC-20260606-m7w2
  - What changed: Created `backend/src/__tests__/services/anthropicCurriculumImpactAgent.test.ts`. 10 tests: happy paths, severity thresholds (7→high+alert, 9→critical, 6→no alert), failure paths (null OAI client → ScoringError, ParseError), baseline events, idempotency. Mocks: `AnthropicChangeEvent`, `getOpenAIClient`, `sendCurriculumImpactDigest`, `getSetting`.
  - Verification: `tsc --noEmit` passes. Jest gate in Docker.

---

## enterprise.colaberry.ai migrated + 3 sessions planned in advance

**Original deadline:** 2026-06-07 (overdue as of today)
**Status:** BLOCKED — waiting on Ali's DNS cutover action.

### What this deliverable actually is

**Part 1 — "migrated" (Ali action, infrastructure):**
`enterprise.colaberry.ai` currently serves a different product ("AI Workforce Designer") via Cloudflare pointing to a separate server. The accelerator platform runs at `95.216.199.47:8888` and is NOT reachable at that domain yet. Three things needed:
1. **Cloudflare DNS** — update A record for `enterprise.colaberry.ai` → `95.216.199.47` (Ali owns the Cloudflare zone)
2. **Host nginx config** — add `/etc/nginx/sites-available/enterprise-accelerator` on the VPS routing to `accelerator-nginx` on port 8888 (same pattern as `advisor.colaberry.ai` → port 8000)
3. **SSL cert** — `certbot certonly --nginx -d enterprise.colaberry.ai` on the VPS

**Part 2 — "3 sessions planned in advance" (Kes action, data):**
`live_sessions` table exists (`LiveSession` model). Once domain is live, INSERT 3 rows for Cohort 1 (kickoff 2026-07-13):

| # | session_date | session_type | title |
|---|---|---|---|
| 1 | 2026-07-13 | core | Build Your AI Foundation: Architecture Day 1 |
| 2 | 2026-07-16 | core | Build Your AI Foundation: Build Day 1 |
| 3 | 2026-07-20 | core | Build Your AI Foundation: Architecture Day 2 |

Prereq: confirm a `cohorts` row for Cohort 1 exists first:
```bash
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c \
  "SELECT id, name, status FROM cohorts ORDER BY created_at;"
```

**Part 2 is NOT ticketed** — no Basecamp ticket exists for the session inserts. Check BC before doing it; Ali may want to enter them himself.

### ⚠ REMINDER — 2026-06-05 (2 days before original deadline, now overdue)
Task is already past due. Raise with Ali at next sync. Steps to implement once Ali confirms he's ready:

**Step 1 — Ali: Cloudflare DNS**
In the Cloudflare dashboard for `colaberry.ai`, update:
- Type: A | Name: `enterprise` | Value: `95.216.199.47` | Proxy: DNS only (orange cloud OFF while cert is being issued)

**Step 2 — Kes: VPS nginx config (run on `ssh kes@95.216.199.47`)**
```bash
sudo tee /etc/nginx/sites-available/enterprise-accelerator > /dev/null <<'EOF'
server {
    listen 80;
    server_name enterprise.colaberry.ai;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name enterprise.colaberry.ai;

    ssl_certificate     /etc/letsencrypt/live/enterprise.colaberry.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/enterprise.colaberry.ai/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/enterprise-accelerator /etc/nginx/sites-enabled/enterprise-accelerator
sudo nginx -t && sudo nginx -s reload
```

**Step 3 — Kes: SSL certificate**
```bash
# Issue cert (DNS must be resolving to this VPS first)
sudo certbot --nginx -d enterprise.colaberry.ai

# Verify renewal works
sudo certbot renew --dry-run
```

**Step 4 — Ali: re-enable Cloudflare proxy (optional)**
After cert is live, can turn the orange cloud back ON in Cloudflare for DDoS protection.

**Step 5 — Kes: verify**
```bash
curl -I https://enterprise.colaberry.ai/api/health
# expect: HTTP/2 200
```

**Step 6 — Kes: 3 session inserts (only after Step 5 passes)**
```bash
# First confirm cohort row exists and grab its ID
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c \
  "SELECT id, name FROM cohorts ORDER BY created_at;"

# Then insert 3 sessions (replace <COHORT_ID> with result above)
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c "
INSERT INTO live_sessions (id, cohort_id, session_number, title, session_date, start_time, end_time, session_type, status)
VALUES
  (gen_random_uuid(), '<COHORT_ID>', 1, 'Build Your AI Foundation: Architecture Day 1', '2026-07-13', '10:00', '12:00', 'core', 'scheduled'),
  (gen_random_uuid(), '<COHORT_ID>', 2, 'Build Your AI Foundation: Build Day 1',         '2026-07-16', '10:00', '12:00', 'core', 'scheduled'),
  (gen_random_uuid(), '<COHORT_ID>', 3, 'Build Your AI Foundation: Architecture Day 2',  '2026-07-20', '10:00', '12:00', 'core', 'scheduled')
ON CONFLICT DO NOTHING;
"
```

> **Do not build Part 2 (sessions) until Part 1 (DNS + cert) is confirmed live.**

---

## Pending items

- **PR #2 review + merge**: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/2 — L2 + L3, awaiting Ali's review.
- **Partner portal URL** (B3 — OPEN until 2026-06-12): once Anthropic confirms partner status, run:
  ```sql
  UPDATE anthropic_content_registry
  SET url = '<real-url>', title = 'Anthropic Partner Portal'
  WHERE content_type = 'partner-portal';
  ```
  Run inside prod backend container: `docker exec accelerator-backend psql $DATABASE_URL -c "UPDATE ..."`
- **5th Skilljar course** (Claude 101 / Intro to Subagents): Ali to confirm URL — add via the same upsert seed script.
- **Jest gate**: `docker exec accelerator-dev2-backend npx jest --testPathPattern=anthropicContent` — run both L1 + L2 suites to confirm 18 tests pass. Can run anytime on dev2.

---

## Prod Database Access

DB credentials live in `accelerator-backend` container env (`DATABASE_URL`). The DB container is `accelerator-db`, user is `accelerator`, database is `accelerator_prod`.

```bash
# Confirm DB user (run once if unsure)
docker exec accelerator-backend printenv | grep -i database

# Check all 7 registry rows + hash status
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c "SELECT url, last_checked, content_hash IS NOT NULL AS hashed FROM anthropic_content_registry ORDER BY content_type, title;"

# Count change events (should be 0 before first L1 run, 6 after)
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c "SELECT COUNT(*) FROM anthropic_change_events;"

# View change events after L2 runs
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c "SELECT content_type, detection_method, detected_at FROM anthropic_change_events ORDER BY detected_at;"
```

Run all of the above from `ssh kes@95.216.199.47`. No password — ed25519 key.

---

## Dev2 Admin JWT (dev-only — do not use in prod)

`JWT_SECRET` is not set in the dev2 container so the app falls back to `'dev-secret-change-me'`. Use this to mint a short-lived admin token for manual curl commands on dev2:

```bash
TOKEN=$(docker exec 18af8ecc98a2_accelerator-dev2-backend node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: 'kes-baseline', email: 'kes@colaberry.com', role: 'super_admin' },
  'dev-secret-change-me',
  { expiresIn: '1h' }
);
console.log(token);
")
echo $TOKEN
```

Note: container name `18af8ecc98a2_accelerator-dev2-backend` has a hash prefix from the recreate on 2026-06-05. Will revert to `accelerator-dev2-backend` on the next normal rebuild — update the command then.
