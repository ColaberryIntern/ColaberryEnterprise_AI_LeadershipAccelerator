# CC-20261109-k2w7 — the confirmation route AF11.0 shipped without

**Date:** 2026-11-17
**Branch:** `workstream/capability-confirmation-route` off `origin/main` @ `3d18e69e0`
**Ticket:** none. The `BASECAMP_ACCESS_TOKEN` in the prod backend is expired
(`OAuth token expired (old age)`, confirmed with a control query rather than inferred from
empty search results), so no ticket could be searched for or created. Owed.

> **Scope, chosen by Ali from three options:** backend route only. No frontend. Nothing is
> switched on, promoted, granted or enabled by this change.

## What was missing, measured

`recordCapabilityConfirmation` has existed in
`services/agentDomain/capabilityConfirmationService.ts` since AF11.0, with its pure contract,
its model, its table and `ensureCapabilityConfirmationSchema.ts`. Measured on `origin/main`
2026-11-17: **the function appeared in no route and no controller.** Nothing could call it.

The consequence is one step further on, which is why it survived this long:

| Step | State on `main` |
|---|---|
| 1. Capability recorded | works |
| 2. A Super Admin confirms it | **no HTTP path** |
| 3. Grant a tool for it | route works, and refuses **every** grant |

`agentToolGrantService.ts:191` reads `loadConfirmedCapabilityIds()`, finds an empty table, and
returns `capability_not_confirmed`. So the governance spine was complete and declined
everything, because the one step that puts a row in the table had no door. Maya's twelve filed
grant requests could never become grants, and her dashboard read "held without a grant"
truthfully.

**The gap was recorded nowhere.** Grepped all 19 `CC-20261109-k2w7-*` session records: no
mention. It existed only in a conversation, which is most of why this file exists.

## What was added

- `schemas/capabilityConfirmationSchema.ts`
- `controllers/capabilityConfirmationController.ts`
- `routes/admin/capabilityConfirmationRoutes.ts`
- one `router.use` in `adminRoutes.ts`
- one row in `mgmtSectionGate.ts`

```
POST /api/admin/agent-domain-capability-confirmations          requireAdmin
GET  /api/admin/agent-domain-capability-confirmations/:id      requireAdmin
```

## The four decisions

**1. Shape is validated here; judgement is not.** The schema deliberately does **not** require
the individual evidence fields. The contract already refuses incomplete evidence as
`evidence_incomplete`, naming all four fields in one sentence, and refuses machine-produced
evidence as `evidence_does_not_support_confirmation`. Requiring the fields in Zod would have
turned both into a generic 400 about a missing key and made the contract's own wording
unreachable over HTTP. Judgement lives in one place and it is not the schema.

The one exception is stated in the file: the `evidence` **key** is required, which pre-empts
the contract's `evidence_missing` as a 400. Shape first, judgement second, matching the house
ladder.

**2. Refusals are 409, including `confirmer_not_super_admin`.** Same call
`agentToolGrantController` makes, for the reason it records: the caller IS authorized to use
the endpoint, and what is refused is this particular confirmation standing. A 403 would send a
plain admin looking for a login problem instead of reading the rule about who may confirm. The
whole `issues` array is returned, because the error class exists "so a caller renders all of
them at once" and returning the first would make fixing a body a guessing game played one
round-trip at a time.

**3. Authorization stays two-layered.** `requireAdmin` admits `admin` and `super_admin`; the
service refuses anything but `super_admin` **by name**. Collapsing that into a route-level role
guard would have thrown the sentence away and hidden any second reason the confirmation would
not stand.

**4. The gate row is part of the change, not a follow-up.** `mgmtSectionGate` is
deny-by-default. An unmapped prefix 403s in production with nothing in the logs saying why,
while every unit test passes. `capabilityBoardRoutes.ts` warns about exactly this in its own
header. A test asserts the mapping through `pathToSection`, with a control proving the matcher
can return null.

## Verification

| Gate | Result |
|---|---|
| New access suite | 26 tests pass |
| Backend `tsc --noEmit` | clean, **proven** by a planted control error producing 3 errors in the new file and nothing after restore (hashes compared) |
| Test-file typecheck ratchet (8192MB) | baseline matched exactly, both directions |
| All 7 CI guard scripts | pass, including `lint-route-auth.js` |
| Mutation testing | **7 planted, 7 killed** |

### A mutant survived the first round, and it was the important one

Replacing `actor.email` with `req.body?.confirmed_by ?? actor.email` changed nothing any
request could observe, and the suite stayed green. The reason is that `.strict()` already 400s
any body carrying that key, so the two readings are indistinguishable over HTTP.

That is a real finding rather than a test gap to paper over: **the identity guarantee rested
entirely on `.strict()`.** If `.strict()` were relaxed one day for an unrelated reason, the body
read would quietly become reachable and every behavioural test would still pass. The property
is now asserted at the source, with a control proving the matcher can catch a planted body
read.

## What this does NOT do

- **Grants nothing.** A confirmation makes a capability *eligible* for a tool grant. A test
  asserts the controller never reaches for `grantToolToAgent`, `AiAgent`, `tools_granted`,
  `autonomy_level`, `enabled`, `promote` or `sendEmail`.
- **Switches nothing on.** No agent row, no `GROWTH_JOURNEY_EXECUTION_ENABLED`, no capability
  promoted live, nothing sent.
- **No frontend.** Nothing in `frontend/src` calls this endpoint. Confirmation works over the
  API only, which was the chosen scope. The admin UI still has no button.
- **Confirms no capability.** The table is still empty after this change. Filling it is a
  separate, deliberate act.
- **Touched no production data.** No production write of any kind in this work.
