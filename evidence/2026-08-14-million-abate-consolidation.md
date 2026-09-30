# Million Abate — duplicate account consolidation

**Date:** 2026-08-14 · **Decision:** Ali Muwwakkil · **Executed by:** Claude Code (prod, `accelerator-backend`)
**Prior state:** `evidence/2026-08-14-million-abate-prior-state.json` (captured before any write)

| | **A — KEPT** | **B — RETIRED** |
|---|---|---|
| id | `78f2c3e3-be12-43a2-b41f-be1a3ec224e5` | `c4399506-8b45-4b1a-b71f-066a9e2a850e` |
| name | Million Meshesha | Million Abate Meshesha |
| status after | `active` | `withdrawn` (soft-delete) |

Email `millionabate19@gmail.com` on both. **No rows were deleted anywhere.**

---

## What moved

### 1. Subscription `a8fdb70d-6387-475c-8ead-0b456e39449e` → A

```sql
UPDATE subscriptions SET enrollment_id = '78f2c3e3…', updated_at = NOW()
 WHERE id = 'a8fdb70d…' AND enrollment_id = 'c4399506…';   -- 1 row
```

Unchanged by design: `payment_ref`, `paysimple_customer_id` (43633732), `paysimple_payment_id` (155166568), `status` (active), `current_period_end` (2026-09-12T21:07:44Z), `amount_cents` (19900).

### 2. New $199.00 account credit on A

Granted through `accountCreditService.grantCredit()` — the codebase's own mechanism, idempotent on `source_event_id`.

| field | value |
|---|---|
| id | `9d6f198e-caea-4772-8f72-26916661b84e` |
| amount_cents | `19900` |
| status | `available` |
| reason | `duplicate_account_consolidation` |
| source_event_id | `consolidation-2026-08-14-c4399506` |
| granted_by | `ops-consolidation-2026-08-14` |

A **new** credit, not a transfer: there was only ever one $199 payment (PaySimple `155166568`), recorded on `A.paysimple_payment_id` *and* on B's subscription row. Nothing was debited from anywhere.

### 3. B retired

```sql
UPDATE enrollments SET status='withdrawn', notes = COALESCE(notes||' | ','') || '<note>'
 WHERE id = 'c4399506…' AND status='active';   -- 1 row
```

Same soft-delete the codebase's own `mergeShadowedAccount` uses (`duplicateAccountSweepService.ts:213`). No hard delete: a `DELETE` on B fails on 21 `NO ACTION` FKs and would orphan 751 rows.

---

## What was refused, and why

| Item on B | Count | Refused because |
|---|---|---|
| Points event | 1 (5 pts) | `event_key = card:948e737d…` — **A already holds the identical key**. The unique index is `(enrollment_id, event_key)`, so the move would violate it, and the only alternative is deleting a row. Left on B; retires with B. 5 points is not worth a destructive write. |
| Attendance record | 1 | Session `287d6486…` — **A already has this exact session** (as `absent`). A strict duplicate. |
| Timeline card progress | 692 | Its only `completed` card (`948e737d…`) is **already completed on A**. The other 691 are unstarted `available` rows that would collide on `(enrollment_id, card_id)`. Nothing of value. |
| Skill evidence | 6 | Tied to the same single card; A holds 184. |
| Refund row | 1 ($50, payment `154860612`) | A historical record of a refund issued against B. Moving it would misattribute the refund. Belongs with B. |

**The live subscription was the only thing of value on B.** Everything else was a strict duplicate of what A already held.

The codebase's automated sweep would have refused this case twice over — `mergeShadowedAccount` bails on an `event_key` collision *and* on `hasRealSubscriptionPayment` — which is why it was correct for this to be manual.

---

## PaySimple mapping verification

**The join key is `subscriptions.payment_ref` ↔ PaySimple `order_external_id`. It was not touched.**

`handlePaySimpleWebhook` (`webhookController.ts:59-86`) reads `event.data.order_external_id`, checks `isSubscriptionRef()` (a bare `SUB-` prefix test, `subscriptionService.ts:71`), then calls `activateByRef()`, which does `Subscription.findOne({ where: { payment_ref } })` (`:377`) and only then follows `sub.enrollment_id` to the enrollment (`:390`).

**Nothing parses an enrollment id out of the ref.** This matters because `payment_ref` is `SUB-c43995068b454b1ab71f066a9e2a850e-ms70vzf9` — it *embeds B's id* as a historical artifact of where the checkout started. That string is now cosmetically misleading but functionally inert.

Verified against live production through the real code path:

```
webhook lookup by payment_ref  → FOUND
resolves to enrollment          → 78f2c3e3…  (is_A = true)
attributed to                   → Million Meshesha | millionabate19@gmail.com
isSubscriptionRef(ref)          → true
```

`paysimple_customer_id` 43633732 on the subscription row was deliberately left alone — it identifies the PaySimple-side customer that owns the recurring schedule, and rewriting it is what *would* break the mapping.

---

## Before / after

| | A before | A after | B before | B after |
|---|---|---|---|---|
| status | active | **active** | active | **withdrawn** |
| points events / pts | 60 / 1880 | **60 / 1880** | 1 / 5 | 1 / 5 |
| xp events / XP | 51 / 1250 | **51 / 1250** | 0 / 0 | 0 / 0 |
| cards completed / total | 47 / 659 | **47 / 659** | 1 / 692 | 1 / 692 |
| subscriptions | 0 | **1 (active)** | 1 (active) | **0** |
| credits | $50 (void) | **$50 void + $199 available** | none | none |
| attendance | 7 | 7 | 1 | 1 |
| refunds | 0 | 0 | 1 | 1 |

Login resolution verified: `Enrollment.findAll({status:'active', portal_enabled:true})` for that email now returns **1 candidate**, and `pickBestEnrollment` picks **A**. A minted participant JWT for the picked enrollment returned `200` from `/api/portal/subscription`.

---

## Rollback

Every write is reversible from this file and the prior-state JSON.

```sql
-- 1. put the subscription back on B
UPDATE subscriptions SET enrollment_id = 'c4399506-8b45-4b1a-b71f-066a9e2a850e'
 WHERE id = 'a8fdb70d-6387-475c-8ead-0b456e39449e';

-- 2. remove the credit (or void it, to keep the ledger append-only)
UPDATE account_credits SET status = 'void'
 WHERE id = '9d6f198e-caea-4772-8f72-26916661b84e';

-- 3. reactivate B  (notes suffix added on 2026-08-14 may be trimmed by hand)
UPDATE enrollments SET status = 'active'
 WHERE id = 'c4399506-8b45-4b1a-b71f-066a9e2a850e';
```

---

## OPEN ITEM — the $199 credit will not auto-apply

**Verified against production**, not inferred:

```
planCreditPreview(A, 19900) → { available_cents: 19900, applied_cents: 0, charge_after_cents: 19900 }
```

`selectCreditsUpTo` (`accountCreditService.ts:30`) only ever consumes **whole** credit rows and skips any row that would push the charge below `MIN_CHARGE_CENTS` ($1.00, because PaySimple cannot process a $0 charge). The apply target for a $199 charge is therefore $198.00, and a single $199.00 row **overshoots it and is skipped entirely**.

| credit on A | applies | student pays |
|---|---|---|
| **$199.00 (current)** | **$0.00** | **$199.00** |
| $198.00 | $198.00 | $1.00 |

The credit was granted at the decided $199 rather than silently reduced — the amount is a money decision and the row is the honest record of what he is owed. But as it stands it is inert.

**To make it apply automatically, revalue it to $198.00:**

```sql
UPDATE account_credits SET amount_cents = 19800, updated_at = NOW()
 WHERE id = '9d6f198e-caea-4772-8f72-26916661b84e';
```

The alternative is to leave it at $199 and settle next month's invoice by hand.

## OPEN ITEM — PaySimple itself is unchanged

Nothing in this repo calls PaySimple to move, cancel, or re-point a recurring schedule. `cancelSubscription()` (`subscriptionService.ts:555`) updates our mirror row only.

The recurring schedule still lives under PaySimple customer **43633732**, which was minted by the hosted checkout page and matches neither enrollment's `paysimple_customer_id` (A: 43540872, B: 43552399). Our database now attributes that schedule to A, and the next `payment_created` webhook will be credited to A — but **the charge itself, and any decision to pause/cancel/refund it, has to be done in the PaySimple dashboard by hand.** That is not reachable from here.
