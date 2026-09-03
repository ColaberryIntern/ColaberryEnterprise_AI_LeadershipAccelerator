# Billing Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

## 1. What exists

**`services/paysimpleService.ts`** — the ecosystem's payment provider. Surface:
`createCustomer`, `findCustomerByEmail`, `findOrCreateCustomer`, `createPaymentLink`
(hosted), `deletePaymentLink`, `getPayment`.

**No recurring, subscription, schedule or plan function exists.** It is hosted one-time
payment links, card and ACH.

**`services/billing/`** — `billingGatewayState.ts` (read-only PaySimple state for a
watchdog, explicitly never mutating), `billingHealthCheck.ts`, `billingHealthReport.ts`.

**`models/Subscription.ts`** — and this is the important one, because it is the pattern to
copy. Its own header:

> *"V1 uses PaySimple's one-time hosted checkout (card + ACH): each paid term is a discrete
> payment that extends `current_period_end`. True auto-charging recurs once PaySimple
> recurring is enabled; this schema already carries the period so that upgrade is additive
> (no data migration)."*

Fields: `plan` (`annual | monthly | comp`), `status`
(`pending | active | canceled | failed | past_due`), `amount_cents`,
`applied_credit_cents`, `paysimple_customer_id`, `paysimple_payment_id`,
**`paysimple_schedule_id`** (reserved for real recurring), `current_period_end`.

## 2. The two gaps

**Gap A — it is a student's subscription.** `enrollment_id` is required. A commercial AI
Flotation client has no enrollment. Third instance of the enrollment coupling described in
`CURRENT_STATE.md` and `REPO_OWNERSHIP_MAP.md`.

**Gap B — nothing auto-charges.** Term extension is driven by discrete payments today.
§25's "membership controls active build lanes" works fine on that model — a term either is
or is not current — but it means renewal is an operational act until PaySimple recurring
is enabled or another provider is approved.

→ **ESCALATION-1** remains open, but is *narrower* than first recorded: the platform has a
working term-subscription pattern. The decision is only whether to (a) reuse it for
commercial clients, accepting manual renewal, or (b) introduce an auto-charging provider.

## 3. Pricing — business configuration, supplied by the DRI

§25 forbids Claude inventing prices. These were given by Ali on 2026-09-03 and are recorded
here as configuration input, not as a Claude decision:

| Tier | Price | Scope |
|---|---|---|
| Founding | **$1,995** | one active build |
| Standard | **$2,495** | one active build |
| Accelerate | **$4,995** | |
| Multi-project / high capacity | **$8,995+** | |

Explicitly rejected: launching with **$4,900 as the lowest plan**.

Implementation rule from §25 stands: these live in versioned plan configuration resolved
server-side, never hardcoded in a UI component, and never trusted from the browser.

## 4. The Delivery Economics Engine

Required by the DRI, in his words: *"Don't guess the economics. Make Refactored measure
them project by project"* — an engine that says exactly what each free prospect and each
paying project costs to service.

**The commercial test it must answer:** does $2,495 of revenue cost **$300–$800** to
fulfil, or **$2,000**? The first is a business. The second means the model changes. Nothing
in the plan should be treated as settled until this measures it.

### It is an EXTEND, not a NEW build

`services/delivery/factoryEconomics.ts` already exists and is pure, with no I/O. It holds
`EconomicMeasure`, `MEASURE_MEANING`, `computeThroughputRatio()`, and — the part that
matters — **`THROUGHPUT_RATIO_VALIDATION: 'unvalidated'`** plus a `PublicationRefusal`
type and `MIN_THROUGHPUT_FOR_INTERPRETATION = 10`.

Its header explains why the validation state is a value rather than a sentence:

> *"The ratio, once it exists and produces a flattering number, will be put on a slide by
> someone who never read the plan — that is not cynicism, it is how every internal metric
> escapes."*

That discipline is exactly right for a cost-to-fulfil number, which is the most tempting
figure in the company to quote early.

Also present: `intelligence/systemStateEngine/realtime/operationalCostGovernance.ts` and
`db/ensureWorkLedgerSchema.ts`.

### What is actually missing

Not the maths — the **capture**. Per §91:

*Per free session:* AI cost, voice cost (Synthflow minutes), UI generation cost, preview
runtime.
*Per paid project:* AI execution cost, PM minutes, architect/QA minutes, rework,
preview/runtime cost, third-party usage.

Every one of those has a producer already in the system (execution runs, Synthflow calls,
preview stacks, delivery events). None of them currently writes a costed row against a
project or a free session. **That ledger is the build.**

### Design constraints

- Attribute to **both** a free session and, after conversion, the project it became — or the funnel cost disappears at exactly the moment it becomes interesting.
- Cost is **internal by default** (§91). It must never reach the client-safe projection; `clientVisibility.ts` is allowlist-based and fails closed, so this is enforceable rather than hoped for.
- Emit cost at the boundary that spends it, with the correlation id already required by §102 — not reconstructed later from logs.
- Keep `factoryEconomics`'s refusal-to-publish discipline: an unvalidated cost-per-project must be unable to leave the building by accident.
