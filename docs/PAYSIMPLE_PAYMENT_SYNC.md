# PaySimple Payment Sync + Revenue

**What it does:** keeps the admin Dashboard **Revenue** and per-participant paid
amounts equal to **actual money collected through our PaySimple checkout** —
payments count when they go through, and are **subtracted when they fail or
reverse**.

## Revenue definition

`Revenue = SUM(enrollments.amount_paid) WHERE payment_status = 'paid'`
(`cohortService.getDashboardStats`). A real payment is revenue regardless of the
enrollment's explorer tag; explorers who never paid have `amount_paid = null`
(contribute 0). Replaces the retired `paid_count × $4,500` estimate.

## How payment state stays accurate

| Path | When | Effect |
|---|---|---|
| Webhook (`payment_created`) | real-time | `markEnrollmentPaid` / subscription `activateByRef` → `paid` + `amount_paid`, and records `paysimple_payment_id` |
| Webhook (`payment_failed`) | real-time | `markEnrollmentFailed` → `failed` (won't override an already-`paid` row) |
| **`paymentSyncService` (reconcile)** | every 30 min + CLI | re-reads each recorded payment from the PaySimple API and reconciles — the reversal safety-net |

### Why the reconcile is scoped to *our* payments (important)

The sync reconciles **only the `paysimple_payment_id`s we recorded** through our
own checkout — the ids stored on `subscriptions` (set by `activateByRef`) and on
`enrollments` (set by `markEnrollmentPaid`). For each, it calls `getPayment(id)`
and reads the **current** status:

- settled / authorized / posted → `payment_status='paid'`, `amount_paid=amount`
- failed / returned / voided / chargeback / refunded → `payment_status='failed'` (drops out of Revenue)
- pending / unknown → left untouched

It **never matches by email or customer id.** That was a deliberate change: a
broad pull matched by email counted years of unrelated Colaberry charges (old
bootcamp tuition, retired $4,500-accelerator payments) for anyone who now also
has a platform enrollment — a dry-run showed it would falsely mark 46 paid vs the
1 real membership. Reconciling only our recorded payment ids gives **zero
false positives**.

The enrollment's most-recent recorded payment governs (decline-then-settle → paid;
settle-then-chargeback → failed). Idempotent (writes only on a real change),
failure-first (a `getPayment` error skips that one payment), safe to re-run.

**Scope note:** this catches **reversals** of known payments and keeps recorded
amounts accurate. It does **not** discover a brand-new payment the webhook
*missed* (there's no safe way to attribute an arbitrary PaySimple payment to an
enrollment without our order id, which settled-payment records don't carry). The
webhook is the record path; the reconcile is the safety-net.

## Files

| Concern | File |
|---|---|
| Read API | `backend/src/services/paysimpleService.ts` — `getPayment(id)` (already present for refunds) |
| Reconcile | `backend/src/services/paymentSyncService.ts` — `syncPaySimplePayments()` + pure helpers |
| Revenue | `backend/src/services/cohortService.ts` → `getDashboardStats()` |
| Per-participant | `backend/src/services/acceleratorService.ts` + `frontend/src/pages/admin/AdminAcceleratorPage.tsx` |
| Scheduled job | `backend/src/services/schedulerService.ts` — `PaySimplePaymentSync` (`*/30 * * * *`, gated by `PAYSIMPLE_SYNC_ENABLED`) |
| CLI | `backend/src/scripts/syncPaysimplePayments.ts` (`--dry-run`) |
| Tests | `backend/src/__tests__/services/paymentSyncService.test.ts` |

## Activation (prod)

1. Live read creds already on the host `.env` (`PAYSIMPLE_API_USER`/`KEY`, `PAYSIMPLE_ENV=live`).
2. Dry-run to preview: `cd backend && node dist/scripts/syncPaysimplePayments.js --dry-run` (should reconcile only our recorded payments).
3. Set `PAYSIMPLE_SYNC_ENABLED=true` and restart the backend for the 30-min job.

## Known limitation

`amount_paid` is one field per enrollment → tracks the latest payment (fits the
current V1 one-payment-per-term subscription model). True recurring accumulation
would want a per-payment ledger — a future enhancement.
