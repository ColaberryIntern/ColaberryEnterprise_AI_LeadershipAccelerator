# Visitor Intelligence System Stabilization Report

**Date:** 2026-03-10
**Branch:** main
**Severity:** Critical — all visitor tracking broken in production

---

## Root Cause

The campaign attribution fix (commit `2e5d9ff`) added a `campaign_id` column to the Sequelize Visitor model but the production database schema was never updated. Production used `sequelize.sync()` without `alter: true`, so the column was never created.

Every query touching the `visitors` table failed with PostgreSQL error `42703` ("column campaign_id does not exist"). The tracking controller's catch block silently returned HTTP 204, masking the failure completely.

**Result:** Zero visitors recorded, zero sessions created, empty admin dashboard.

---

## Changes Made

### 1. Production Database Fix (Manual)

Added the missing column directly on VPS:
```sql
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS campaign_id VARCHAR(100);
```

### 2. backend/src/server.ts — Use alter:true in all environments

Changed production sync from `sequelize.sync()` to `sequelize.sync({ alter: true })`. This ensures future model column additions automatically apply to the database schema. Sequelize `alter: true` only adds missing columns — it does not drop or rename existing ones.

### 3. backend/src/controllers/adminVisitorController.ts — Add sessions list endpoint

Added `handleListSessions` handler that queries `VisitorSession` with pagination, ordered by `started_at DESC`, including visitor and lead info. Returns `{ sessions, total, page, totalPages }`.

### 4. backend/src/routes/admin/insightRoutes.ts — Wire sessions route

Added `GET /api/admin/sessions` route mapped to `handleListSessions`. Previously this route didn't exist, causing the Sessions tab to always show empty.

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/server.ts` | `sequelize.sync({ alter: true })` for all environments |
| `backend/src/controllers/adminVisitorController.ts` | Added `handleListSessions` handler |
| `backend/src/routes/admin/insightRoutes.ts` | Added `GET /api/admin/sessions` route |

---

## Verification Steps

1. Confirm `campaign_id` column exists: `SELECT column_name FROM information_schema.columns WHERE table_name='visitors';`
2. Visit `https://enterprise.colaberry.ai/` in incognito
3. Check Admin -> Visitors -> All Visitors — new visitor record should appear
4. Check Sessions tab — should load without error
5. Check Chat tab — should load (empty is OK if no chats)
6. Check backend logs: `docker logs accelerator-backend --tail 20` — no `errorMissingColumn`
