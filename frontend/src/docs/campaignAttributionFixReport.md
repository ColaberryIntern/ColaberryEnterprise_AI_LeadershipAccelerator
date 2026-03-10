# Campaign Attribution Fix — Validation Report

**Date:** 2026-03-10
**Branch:** workstream/marketing
**Scope:** End-to-end campaign_id attribution for anonymous visitors

---

## Problem

Visitors arriving via `?campaign_id=X` URLs had the campaign_id captured in browser localStorage but it never reached the Visitor database record. The backend tracking controller did not extract `campaign_id` from the payload, and the Visitor model had no `campaign_id` column.

**Impact:** Admin → Visitors page could not show which campaign brought a visitor. Attribution was lost for anonymous visitors who never submitted a form.

---

## Changes Made

### 1. Frontend: tracker.ts — Send campaign_id as top-level field

- `flush()` now reads `cb_campaign_id` from localStorage and includes `campaign_id` as a top-level field in all payload paths (beacon, single-event, batch)
- Previously campaign_id was only embedded in individual event props and never extracted server-side

### 2. Backend: Visitor.ts — Add campaign_id column

- Added `campaign_id: DataTypes.STRING(100), allowNull: true` to Visitor model
- Added to VisitorAttributes interface and class declaration
- Column auto-syncs via Sequelize `alter: true`

### 3. Backend: trackingController.ts — Extract campaign_id from request

- `handleTrackEvent`: Added `campaign_id` to destructured fields, passed to `findOrCreateVisitor()`
- `handleTrackBatch`: Added `campaign_id` to destructured fields, passed to `findOrCreateVisitor()`

### 4. Backend: visitorTrackingService.ts — Store campaign_id (first-touch)

- `findOrCreateVisitor()` data parameter now accepts `campaign_id?: string`
- On **create**: sets `campaign_id` in defaults
- On **update**: sets `campaign_id` only if `visitor.campaign_id` is currently null (first-touch attribution — does not overwrite)

### 5. Frontend: AdminVisitorsPage.tsx — Display Campaign column

- Added `campaign_id` to Visitor interface
- Added "Campaign" column header and data cell to All Visitors table
- Added "Campaign" field to visitor detail modal
- Updated empty-state colSpan from 8 to 9

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/utils/tracker.ts` | campaign_id as top-level flush payload field |
| `backend/src/models/Visitor.ts` | campaign_id column definition |
| `backend/src/controllers/trackingController.ts` | Extract campaign_id in event + batch handlers |
| `backend/src/services/visitorTrackingService.ts` | Store campaign_id with first-touch attribution |
| `frontend/src/pages/admin/AdminVisitorsPage.tsx` | Campaign column in table + detail modal |

---

## Verification Steps

1. Clear browser localStorage (`cb_visitor_fp`, `cb_campaign_id`)
2. Visit `https://enterprise.colaberry.ai/alumni-ai-champion?campaign_id=alumni_test_linkedin`
3. Navigate to 1-2 other pages
4. Go to Admin → Visitors
5. **Expected:** Anonymous visitor row shows `campaign_id = alumni_test_linkedin`
6. Revisit with `?campaign_id=different_campaign`
7. **Expected:** campaign_id remains `alumni_test_linkedin` (first-touch preserved)

---

## Architecture Notes

- **No orchestration engine changes** — tracking layer only
- **No cold outbound / Apollo changes** — visitor attribution only
- **First-touch attribution model** — campaign_id is set once and never overwritten
- **Backwards compatible** — existing visitors without campaign_id show "-" in admin UI
