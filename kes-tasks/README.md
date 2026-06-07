# Kes VPS Runbook — Anthropic Intelligence Layer

## SSH Access

```bash
ssh kes@95.216.199.47
```

No password. Uses `~/.ssh/id_ed25519`. Type `exit` to disconnect.

---

## First-time setup (run once after SSH)

```bash
# Clone the repo to your home dir
cd ~ && git clone https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator.git colaberry-accelerator

# Check out your branch
cd ~/colaberry-accelerator && git checkout kes/anthropic-intelligence-layer-l1
```

---

## Verify dev2 stack is running

```bash
docker ps | grep dev2
```

Expected: `accelerator-dev2-backend` and `accelerator-dev2-nginx` both Up.
Dev2 ports: `9998` (nginx) and `3013` (backend API).

---

## Post-merge deployment (run after Ali merges PR #1 and restarts dev2-backend)

```bash
# 1. Create anthropic_content_registry table (idempotent)
docker exec accelerator-dev2-backend npx ts-node backend/src/seeds/createAnthropicContentRegistry.ts

# 2. Create anthropic_change_events table (idempotent)
docker exec accelerator-dev2-backend npx ts-node backend/src/seeds/createAnthropicChangeEvents.ts

# 3. Seed 7 URLs (idempotent — upserts by url)
docker exec accelerator-dev2-backend npx ts-node backend/src/seeds/seedAnthropicContentRegistry.ts
```

---

## Baseline and verify (run after migrations + seed)

```bash
# L1: fetch all 7 URLs and populate content hashes (first run → changed=7)
POST http://95.216.199.47:3013/api/admin/sync/anthropic-content

# L1: confirm 7 rows in the registry
GET http://95.216.199.47:3013/api/admin/anthropic/registry

# L2: write first batch of change events from L1 flags
POST http://95.216.199.47:3013/api/admin/sync/anthropic-detect

# L2: view the change event log
GET http://95.216.199.47:3013/api/admin/anthropic/change-events

# Run both L1 + L2 unit test suites inside the container
docker exec accelerator-dev2-backend npx jest --testPathPattern=anthropicContent
```

---

## Check PR status (run from your local machine)

```bash
gh pr view 1 --repo ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator
```

---

## After 2026-06-12 — update partner portal URL

```sql
UPDATE anthropic_content_registry
SET url = '<real-url>', title = 'Anthropic Partner Portal'
WHERE content_type = 'partner-portal';
```
