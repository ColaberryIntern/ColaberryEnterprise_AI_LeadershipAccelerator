# REFACTORED_INTEGRATION_MAP (Gate 0 · plan §2.7, §18, §41)

## Finding

**The Refactored Experience Ledger does not exist on `origin/main`.**

Searched: `backend/src/models/` for `delivery|refactor|ledger`. Hits were `DocumentDeliveryLog`
(email/document delivery), `EventLedger` and `WorkLedgerEvent` (ops/work tracking). None is a
learner delivery-experience ledger. There is no `DeliveryProject`, `DeliveryDecision`,
`ExecutionRun`, or `ClientAcceptance` model.

## Consequence for the evidence model

Plan §9 defines three evidence levels. Two have live sources; one does not:

| Level | Source | Live? |
|---|---|---|
| Resume Experience | `ResumeSkillClaim` / CAPE `claim` band | yes |
| Colaberry Verified | CAPE `knowledge` / `application` / `judgment` bands | yes |
| **Delivery Verified** | Refactored / internship / client delivery | **no source** |

## Decision

Model the level in the contract now; resolve it to an empty source.

- `CareerEvidenceLevel` includes `'delivery_verified'` as a valid value.
- `deliveryAdapter` exists, returns `[]`, and says why in its header comment.
- The Studio renders no "Delivery Verified" badge today because nothing can earn one.

This is preferable to either (a) omitting the level and having to widen a shipped public type
later, or (b) faking it by promoting internship-tagged classroom artifacts, which would make the
platform assert client delivery that never happened — precisely what plan §57 forbids.

## When Refactored lands

One file changes: `deliveryAdapter`. It reads the new ledger, maps accepted releases / client
acceptances / production incidents to skills, and the level starts resolving. Nothing in the
Studio UI or the API contract needs to move.
