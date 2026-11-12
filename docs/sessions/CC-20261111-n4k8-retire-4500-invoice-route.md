# CC-20261111-n4k8 — the public route that minted $4,500 payment links

- [x] Retire `POST /api/create-invoice` and remove the retired price it charged
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: the route now answers `410 Gone` with a logged refusal instead of
    minting a PaySimple payment link. `createEnrollmentInvoice`'s `amount` became
    required, removing the `|| 4500` fallback that was the actual behavior.
  - Verification: `tsc --noEmit` 0 errors; `checkTestTypecheck` baseline matched in
    both directions; full backend CI suite 2666 suites / 43,493 tests, 0 failures.
    The load-bearing guard mutation-tested (below).
  - Notes: authorized by Ali on 2026-11-11 after the findings below; option chosen
    was "switch it off" over repricing or putting it behind auth.

## How it was found

Victoria Spencer-Auber reported it on 11 Nov 2026 while building Vick's sales
capabilities, as question 1 of 14 she could not answer herself:

> *"The live /api/create-invoice route creates payment links for $4,500, not the plan
> price ($149/month annual or $199 monthly). Should it stay on, be switched off, or be
> changed to use the real plan price?"*

She was right. Verified rather than relayed:

- `paysimpleService.ts:404` was `const amount = params.amount || 4500;` and
  `handleCreateInvoice` passed no amount, so the fallback was not a default, it was
  the behavior.
- The route is **public**. `enrollmentRoutes` is mounted at `server.ts:260`, before the
  auth guard, and nginx proxies `/api/` straight through. No credentials required.
- Production runs `PAYMENT_MODE=live` and `PAYSIMPLE_ENV=live`, so the test-mode $0.01
  clamp that makes this harmless in development did not apply.
- $4,500 is a **retired** price. `admissionsKnowledgeGate.ts` carries a check
  specifically for "the retired $4,500 offer", and `marketingMetrics.ts` records that
  attributed revenue used to be derived from that hardcoded figure. This route was the
  last place still quoting it.

## Her second question, answered with a read-only check

She asked whether anyone had actually been sent one. Every enrollment that ever went
through the payment-link path:

| | |
|---|---|
| rows on that path, all time | 8 |
| charged $4,500 | **0** |
| actually paid | 2, both $199.00 |
| most recent use | 21 July 2026 |

The remainder are three duplicate pending attempts from one person, one other pending,
and two internal $0.00 rows. The exposure was prospective, not historical.

**Stated limit:** this covers enrollments *recorded*. A payment link minted in PaySimple
with no enrollment row would not appear, which is the gap her question anticipated.
Closing it needs a PaySimple API read, which was not done.

## Why 410 rather than deleting the route

A deleted route answers 404, which is indistinguishable from a bad deploy or a typo.
This is a deliberate retirement and should say so. It should also be **visible** if
anything still calls it: no frontend code referenced the route when it was retired, but
"no caller in this repo" is not "no caller", and a silent 404 is how you find out the
slow way. The refusal logs `create_invoice_route_retired` with the caller's email, and
that log is the evidence for whether it can eventually be deleted outright.

A malformed body still returns 400 rather than 410, because "this route is gone" and
"your request was wrong" are different answers and a caller migrating off needs to tell
them apart.

## Why `amount` became required

The route was the only production caller of `createEnrollmentInvoice`, so retiring it
made the `|| 4500` unreachable. Unreachable is not the same as gone: the next caller
would have re-inherited the retired price by saying nothing. Making `amount` required
means it is a compile error to omit it. A price that can be omitted is a price nobody
checks.

## The test that would catch a revival

The weak version of this test asserts the status code. It would pass just as well
against a handler that minted the payment link and *then* returned 410 — which was
confirmed by mutation: adding the mint back left "answers 410 Gone" green, and only
"never reaches PaySimple, and never writes an enrollment" went red. That assertion, not
the status code, is the one doing the work.

## Still open, and not mine to answer

The other 13 of Victoria's questions need Ali's or Roselyn's decisions: who approves
outbound batches, what happens to access and seats on a returned payment or a refund,
which refund-terms version is final, and a set of platform items she is willing to take
to Kes. She is holding Vick in explain-only mode until she hears back: it does not send,
approve, refund or change anything.
