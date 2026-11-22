# Session CC-20261121-enterprise-deal-value-write-path

**Date:** 2026-11-21 (Central)
**Ticket:** R23 — Revenue source: enterprise.colaberry.ai with three plans
https://app.basecamp.com/3945211/buckets/7463955/todos/10534796798
**PR:** https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4304
**Branch:** `workstream/r23-deal-value-write-path` off `2299fb7d8`
**Phase:** 3 of 3 — the write path

---

## What this phase was for

Phase 2 shipped `enterprise_deal_values` and `enterpriseDealValueService`, which is the only
sanctioned way into that table. **Nothing in the product could call that service.** So the
enterprise stream reported zero in production whether or not a deal had been signed, and the
ticket's own remaining item read: *"There is no write path. Nothing in the product can record a
deal value, so the stream reads zero in production regardless of the table being there."*

This is the same gap R16 left between shipping `gov_bid_values` and shipping its pricing
control, and it is closed the same way, on the same three layers.

| Layer | File | What it does |
|---|---|---|
| Read | `services/revenueFlow/enterpriseFlow.ts` | builds `deals[]`: company, plan, **shape**, stage, signed, live value |
| Type | `services/revenueFlow/revenueFlowTypes.ts` | `EnterpriseDeal`, and `deals?` on `RevenueStream` |
| Write | `controllers/revenueFlowController.ts` | `handleConfirmDealValue`, `handleGetDealValueHistory` |
| Route | `routes/admin/commercializationRoutes.ts` | `POST .../revenue-flow/deal-value` + the history read |
| UI | `components/admin/revenueFlow/DealPricingPanel.tsx` | the form, with the two entry modes |
| UI | `components/admin/revenueFlow/RevenueFlowDashboard.tsx` | mounts it |

---

## The decision that mattered: the retainer rail moved to the wire

The service's input has been a discriminated union since Phase 2, and TypeScript enforces it
for every in-process caller. **A request body is `any`**, so that protection stopped at the
controller door. A flat schema with the amount fields optional would have accepted:

```json
{ "valueKind": "monthly_retainer", "dealValueCents": 450000, "periodMonths": 12 }
```

and handed the service an object its own types say cannot exist. Middlesex would have been
filed at **$4,500 instead of $54,000**.

So `DealValueBody` is a `z.discriminatedUnion` with **`.strict()` on each member**:

- a retainer *requires* `monthlyFeeCents` and a positive term
- a total-contract deal cannot carry a monthly fee at all
- a mixed body is a 400, not a field silently stripped
- a body supplying `confirmedBy` is **refused rather than ignored** — the name comes from the
  session, and a caller that believes otherwise should find out

## The plan shape is what makes the form safe

Ali, 2026-11-21, on Plan A: *"we are looking at a retainer, a monthly fee."*

Each roster row carries its plan's `EngagementShape`, so a Plan A deal opens on the **monthly
fee** with a required term, and the panel renders the multiplication *before* the save:

> $4,500 per month over 12 months = $54,000 total contract value

A wrong term is therefore wrong on screen rather than wrong in the database. An unrecorded plan
opens on one total figure rather than guessing a retainer. The mode stays overridable, because a
Plan A deal genuinely sold as a fixed project exists.

---

## Two deliberate departures from the R16 precedent

**The panel renders when empty.** `BidPricingPanel` hides itself with no bids.
`enterprise_intakes` holds 0 rows in production, so a panel that hid itself would be
*indistinguishable from the state this phase exists to end*. Its empty state names why there is
nothing to price and what would make one appear. A roster of `undefined` (source unreadable) is
also kept distinct from `[]` (read, and empty), because `unmeasurable` and `measured_zero` are
different answers.

**There is now a test at the HTTP layer.** R16 shipped a tested service and a tested panel with
nothing between them, so every rail living in the controller was unverified — including its
dollars-to-cents conversion, which has never been asserted. 20 cases now cover this one.

`actorFrom` was extracted rather than copied. Two copies of the one rail that makes a
confirmation mean anything is two places for it to drift, and a drifted copy fails **open**: it
would accept an unattributed write rather than refuse one.

---

## BREAK and HARDEN: 14 of 14 mutations killed

Every mutation grep-confirmed as applied before its result was believed, and the revert
confirmed afterwards. Killed:

`.strict()` dropped · retainer term made optional · `actorFrom` falling back to a literal
instead of null · every deal reported as signed · the signed-first tiebreak removed from the
sort · a blank company passed through to the control · the plan shape defaulted to retainer ·
the monthly fee withheld when the term was known · **rounding moved after the multiplication** ·
the retainer term guard removed · an unrecorded plan opening on the retainer field · the
retainer payload also sending a total · a blank term sent as 0 instead of null.

### The one that survived was a test gap, not a bug

Replacing `z.discriminatedUnion('valueKind', [...])` with a plain `z.union([...])` of the same
two members passed all 18 cases.

Probed rather than assumed. With `.strict()` and a `z.literal` discriminator on each member,
**both schemas accept and reject exactly the same bodies** — a retainer carrying
`dealValueCents` is refused either way. That safety is real, and M1 pins it.

What a plain union loses is the ability to say *which* field is wrong:

```
discriminated, bad valueKind     -> fieldErrors: { valueKind: ["Invalid input"] }
plain union,   bad valueKind     -> formErrors: ["Invalid input"], fieldErrors: {}
discriminated, retainer-as-total -> names monthlyFeeCents AND the unrecognized dealValueCents
plain union,   retainer-as-total -> "Invalid input"
```

The controller returns `error.flatten()` as `details` and the panel surfaces the server's own
message, so that difference is the entire debugging experience of a failed save. Two tests now
pin the field-level detail, which kills M3.

Worth keeping: a surviving mutation is not automatically a defect. This one pointed at something
the tests were silent about that a caller would feel.

---

## Why the arithmetic is exported as pure functions

`@testing-library/react` is **not a dependency of this frontend**, and introducing one is
escalation-tier under the Autonomy Model rather than a step inside a feature. The precedent
panel was therefore tested only through `renderToStaticMarkup`, which runs no effects and no
handlers.

Rather than add a dependency or leave the money logic untested, `initialMode`,
`retainerTotalCents` and `dealValuePayload` are exported and tested directly. The
$4,500-versus-$54,000 decision is now a function with inputs and an output. One of those tests
pins that cents are rounded **before** the multiplication, because rounding after lets a
part-cent fee drift by the length of the term.

---

## Verified

- **171** backend revenueFlow / controller / schema tests across **10 suites**, green
- **63** frontend revenueFlow tests across **4 suites**, green
- The **TWC 40 TAC §807.172(d)** banned-word ratchet passes over all the new copy
- **14/14** mutations killed

## NOT verified, and why

**Local `tsc` is a confirmed false clean in this worktree.** A deliberately planted type error
(`const __control: number = "definitely not a number"` appended to `DealPricingPanel.tsx`, grep
count 1) was reported as **zero errors** by the frontend project's own `tsc --noEmit`. The
shared root `node_modules` carries a pre-existing `@types/d3-dispatch` breakage that aborts the
compile before it reaches any changed file. **CI is the only authority on types here**, and no
local typecheck pass is being claimed.

**The rendered card against production.** `/admin/revenue-flow` is auth-gated.

**Every populated branch.** Both `enterprise_intakes` and `enterprise_deal_values` hold 0 rows
in production, so the roster, the funnel stages, the plan breakdown, the priced headline and the
retainer round-trip are exercised only by tests. The first real inquiry is the first time
production runs those paths.

---

## Noted, not fixed

- **`src/__tests__/routes/adminRoutes.test.ts` fails to load locally**, on
  `handleAdminChangePassword` being undefined: the suite mocks `adminAuthController` with only
  `handleAdminLogin` and `handleAdminLogout`, and the real controller has grown a third
  handler. Pre-existing, unrelated to this diff, and already excluded from CI by name in
  `backend/jest.ci.config.ts` as a known red suite. Not touched here.
- **The W28 intake form still does not constrain its service field to the three plans.** So for
  a real inquiry `planKey` will be null and the form will open on one total figure rather than
  Plan A's retainer. That is a change to W28's own form, not to this surface. The panel names
  the gap on the row rather than hiding it.

---

## What CI caught that I had not run

First CI run: **9 pass, 1 fail.** Both typechecks passed, which was the real unknown given
the local false clean. The failure was `frontendTypographyLint.test.ts`, a tree-wide
shrink-only ratchet over `frontend/src` guarding em dashes, en dashes and emoji in **rendered
copy**. Three violations, all in the new panel:

```
L336  {valueBasis} - {confirmedBy}     ->  a middot, as the badge above it already uses
L437  ' - required'                     ->  ' (required)'
L524  'Good - this can be checked...'   ->  'Good. Someone else can check this.'
```

Two of the three were **inherited by copying `BidPricingPanel`**, which is grandfathered in
the frozen baseline. A new file has to be clean, which is the ratchet working as designed. The
dashes in this file's *comments* were correctly not counted; both scanners exempt comments.

**The process miss, recorded because it is the second of its kind today.** I ran the suites I
touched plus the TWC banned-word ratchet, and did not run the frontend typography ratchet,
which lives in the same directory and also scans a whole tree. Earlier today the same class of
oversight put `'free-text'` into CI. The rule that would have caught both: **a tree-scanning
ratchet is triggered by touching any file in its tree, not by touching the ratchet's own
area.** Adding frontend copy means running the frontend typography lint.

Saved to memory against the existing `frontendCopyLint` note, which had not recorded that a
second ratchet of the same family exists.

---

## Deployed and verified

Merged as `7cdbaeabb`, deployed 2026-11-22 01:05Z. **Both containers genuinely replaced:**

| | image before → after | started before → after |
|---|---|---|
| backend | `32db6cce143b` → `4896d7ffe697` | 2026-11-21T22:04:35Z → 2026-11-22T01:05:12Z |
| nginx | `d5bf425c2f56` → `3b85731fd7bc` | 2026-11-21T22:05:47Z → 2026-11-22T01:06:05Z |

Registry mode confirmed `:main` matched `sha-7cdbaeabb...` for both images before pulling.

Note for next time: compose printed **`backend Running`** rather than `Recreated`, which
yesterday was the signature of a genuine partial deploy. It was not one here — the image id
and `StartedAt` both moved. **That is exactly why the proof is the image id and the timestamp
and never the compose verb.**

### The build cascade happened again and was waited out

Four consecutive merges had their builds cancelled by the next: `88a74603f`, `478960c76`,
`c7ae23a26`, `afe1c288f`. The last successful build at that moment was `136909d41`, and
`git merge-base --is-ancestor` proved it does **not** contain this merge, with the reversed
direction confirming the check itself works. Deploying then would have served pre-merge code
and reported success.

### Evidence, with controls both ways

Backend container: deal-value route 1, confirmed event 1, revised event 1, no-identity refusal
1, `monthlyFeeCents` 3, roster builder 1; positive control 2, **negative control 0**.
Served nginx bundle: panel heading 2, multiplication line 2, basis hint 2, empty-state copy 2;
positive control 2, **negative control 0**. All four admin surfaces 200, `/health` 200 ok.

### One piece of evidence discarded as worthless

The unauthenticated `POST .../deal-value` returns 401 — but so does a negative control
(`POST .../deal-value-zzzz`, a route that does not exist), because `requireAdmin` runs before
route matching on that prefix. **The 401 proves the prefix is gated and nothing about whether
the route is mounted.** The mount rests on the compiled artifact instead.

### Two hours lost to a hostname I invented

I verified against `https://app.colaberry.ai/...`, which **does not exist**. Every URL returned
`000` from both the prod box and the laptop, which reads exactly like a total outage
immediately after a deploy. The real admin surface is **`enterprise.colaberry.ai`**, and the
public host is `www.refactored.ai`. Saved to memory, including the inverse trap: a Host header
matching no `server_name` still returns 200 from the default block.

The 5 backend errors in the window were unrelated `intel-card-content`
`IncompleteGeneration` noise from an AI content pipeline.

---

## The table is no longer empty, and it changes what this card reports

`enterprise_intakes` now holds **1 row**: *Acme Test Logistics*, blank service field, status
`interviewed`, created 2026-11-21 15:40Z. `enterprise_deal_values` still holds 0.

So the stream status flips `measured_zero` → `live`, and the headline moves from "no inquiries
yet" to "no signed deal yet". Both honest, different sentences. The blank service field
exercises the path built for it: the row renders with a *plan not recorded* flag rather than
being defaulted into Plan A.

### The gap this exposes, raised rather than built

That row looks like a **test record**. The government stream already solved this:
`suspectReasons()` flags a test row, a duplicate title or a missing delivery project, and the
pricing panel shows the flag so whoever is pricing can see which rows **not** to price. The
enterprise roster has no equivalent, so a test inquiry counts as a real one in a funnel on a
board Ram reads.

Not fixed here: flagging logic is new scope rather than part of the write path. Logged as the
recommended next piece per the scope-lock rule.

## Commits

- `8646de548` — R23 Phase 3: the write path
- `1855927a3` — pin the error diagnostics, because a mutation survived without them
- `09798fc17` — clear the frontend typography ratchet
