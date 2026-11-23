# Session CC-20261122-sn4k - SNACK-2, ask for the naming consent where the signups actually are

**Date:** 2026-11-22
**Ticket:** SNACK-2 (Basecamp todo 10520570248)
**Decided by Ali:** 2026-11-22, on the measurement below - add the box to Open House too.

## Why

SNACK-2 shipped the snack-bar naming consent on 18 Nov, on `/portal/signup` only. Measured
on production 2026-11-22:

| | |
|---|---|
| `leads` rows | 25,701 |
| Opted in | **0** |
| Leads since the deploy (18 Nov 06:05 UTC) | 123 |
| ...from `open_house` | **118** |
| ...from `free_signup` (the form that had the box) | 3 |
| ...from `catalog_request` | 2 |

The consent was being asked for on the path behind 3 of 123 signups. The snack bar exists to
name recent signups, so the feature was complete on both sides and structurally unused.

## What changed

| File | Change |
|---|---|
| `schemas/openHouseSchema.ts` | `social_proof_opt_in` declared on `openHousePublicSignupSchema` |
| `services/consent/captureSignupConsent.ts` | `isAffirmative` exported, so one rule decides what a tick is |
| `services/enrollmentService.ts` | `socialProofOptIn` input; written to the Lead in `defaults` |
| `controllers/openHouseController.ts` | passes it through, normalised with `isAffirmative` |
| `services/openHouseApi.ts` | `social_proof_opt_in` on the body type, plus `phone_consent` which was missing |
| `pages/OpenHouseSignupPage.tsx` | the checkbox, under the name field, unticked |

Two new test files: the schema contract and the page behaviour.

## Three traps this had to avoid

1. **`.strict()`.** An undeclared key is a 400 for the WHOLE signup, not an ignored field. So
   backend and frontend must ship together, and the page sends the key only when ticked. The
   schema test pins the declaration and keeps a control that an undeclared key is still refused -
   otherwise someone could "fix" a future 400 by dropping `.strict()` and silently allow forged
   `ip_address` provenance, which that schema's own comment forbids.
2. **Two truthiness rules.** A checkbox can arrive as `true`, `"true"` or `"on"`.
   `captureSignupConsent` already had `isAffirmative`; it is now exported and reused rather than
   a second definition being written beside it.
3. **Recording a "no" nobody said.** An unticked box sends no key, exactly like `phone_consent`.
   A `false` would be a stored answer the person never gave. The page test pins the absence,
   with a control asserting the signup really was submitted so "key absent" cannot mean
   "nothing happened".

## Also corrected

`OpenHouseSignupBody` claimed to mirror the schema and omitted `phone_consent`, which the page
has been sending all along: `person` is built as a const and then spread, so TypeScript's
excess-property check never saw it. One line, declared now.

## Not done, deliberately

`openHouseRegisterSchema` - the service-authed door used by training.colaberry.com - was left
alone. Adding the key there without the training site sending it would be dead surface, and that
site is a separate repo and a separate deploy.

## Verification

CI is the gate: there is no local jest or tsc here. What the tests would catch is stated above
rather than asserted as passing. **The ticket's own acceptance - a real opted-in lead rendering
by first name - is still not met**, and will not be until somebody ticks the box on a real
signup. This change is what makes that likely rather than near-impossible; it is not the proof.
