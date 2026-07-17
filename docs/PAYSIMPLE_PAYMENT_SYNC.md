# PaySimple Payment Sync + Revenue

**What it does:** keeps the admin Dashboard **Revenue** and per-participant paid
amounts equal to **actual money collected through PaySimple** — payments count
when they go through, and are **subtracted when they fail or reverse**.

## Revenue definition

`Revenue = SUM(enrollments.amount_paid) WHERE payment_status = 'paid'`
(`cohortService.getDashboardStats`). A real payment is revenue regardless of the
enrollment's explorer tag; explorers who never paid have `amount_paid = null`
(contribute 0). Replaces the retired `paid_count × $4,500` estimate.

## How payment state stays accurate

Three writers set `enrollments.amount_paid` / `payment_status`:

| Path | When | Effect |
|---|---|---|
| Webhook (`payment_created`) | real-time, if PaySimple calls us | `markEnrollmentPaid` / subscription `activateByRef` → `paid` + `amount_paid` |
| Webhook (`payment_failed`) | real-time | `markEnrollmentFailed` → `failed` (but it will NOT override an already-`paid` row) |
| **`paymentSyncService` (pull)** | every 30 min + CLI | reconciles from the PaySimple **API** — the authoritative source |

The **pull sync is the key addition**: it catches missed webhooks AND handles
**reversals the webhook can't** (a settled-then-returned/charged-back payment).
It pulls `GET /v4/payment`, matches each payment to an enrollment (our order
external id → stored PaySimple customer id → payer email), takes each
enrollment's **most recent** matched payment, and sets:

- latest is **settled/authorized/posted/…** → `payment_status='paid'`, `amount_paid=amount`
- latest is **failed/returned/voided/chargeback/refunded/…** → `payment_status='failed'` (drops out of Revenue)
- latest is **pending/unknown** → left untouched

Idempotent (writes only on an actual change), safe to re-run, and bounded
(timeout + capped retries on the API; hard `maxPages` cap).

## Files

| Concern | File |
|---|---|
| PaySimple read API | `backend/src/services/paysimpleService.ts` — `listPayments()` (paged `GET /v4/payment`), `getCustomerById()` |
| Reconcile sync | `backend/src/services/paymentSyncService.ts` — `syncPaySimplePayments()` + pure helpers |
| Revenue | `backend/src/services/cohortService.ts` → `getDashboardStats()` |
| Per-participant | `backend/src/services/acceleratorService.ts` (returns `amount_paid`) + `frontend/src/pages/admin/AdminAcceleratorPage.tsx` |
| Scheduled job | `backend/src/services/schedulerService.ts` — `PaySimplePaymentSync` (`*/30 * * * *`, gated by `PAYSIMPLE_SYNC_ENABLED`) |
| CLI backfill | `backend/src/scripts/syncPaysimplePayments.ts` |
| Tests | `backend/src/__tests__/services/paymentSyncService.test.ts` |

## Activation (prod)

1. Set live read creds on the prod host `.env`: `PAYSIMPLE_API_USER`, `PAYSIMPLE_API_KEY`, `PAYSIMPLE_ENV=live`.
2. Backfill: `cd backend && npx ts-node src/scripts/syncPaysimplePayments.ts --since-days=365` (add `--dry-run` first to preview matched/paid/reversed counts).
3. Set `PAYSIMPLE_SYNC_ENABLED=true` and restart the backend so the 30-min job runs.

Until then it ships dark: the sync no-ops (`missing_credentials`) and Revenue
simply reflects whatever `amount_paid` the webhook flow has already recorded.

## Known limitation

`amount_paid` is a single field per enrollment, so it tracks the latest payment
(fits the current V1 one-payment-per-term subscription model). True recurring
accumulation would want a per-payment ledger table — a future enhancement.
