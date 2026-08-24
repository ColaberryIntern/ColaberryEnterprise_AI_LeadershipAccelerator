# REFACTORED_INTEGRATION_MAP (Gate 0 · plan §2.7, §18, §41)

> **Corrected 2026-08-23, same session.** An earlier draft of this file said the Refactored
> Experience Ledger "does not exist on main". That was true when Gate 0 discovery ran against
> `dead58d6`, and became false while this increment was being built: merging `origin/main`
> before pushing brought in the delivery schema. The accurate position is below.

## What actually exists on main now

Landed 2026-08-23 (arrived mid-session, after Gate 0 discovery):

| Model | Table |
|---|---|
| `DeliveryEngagement` | `delivery_engagements` |
| `DeliveryProject` | `delivery_projects` |
| `DeliveryProjectMember` | `delivery_project_members` |
| `DeliveryProjectSourceLink` | `delivery_project_source_links` |
| `DeliveryContract` | `delivery_contracts` |
| `DeliveryDecision` | `delivery_decisions` |
| `DeliveryEvent` | `delivery_events` |

Plus `backend/src/db/ensureRefactoredDeliverySchema.ts`, invoked at boot
(`backend/src/server.ts:2435`), so the tables are really created.

## Why `delivery_verified` still resolves to nothing

The schema exists. **The data does not, and cannot yet.**

`git grep` for writers of `DeliveryProjectMember` and `DeliveryDecision` outside
`models/` and tests returns **nothing**. No service creates a delivery project, admits a
member, or records a decision. The tables ship empty and stay empty until the Refactored
services that populate them land.

There is also an unresolved mapping question that must be answered before the adapter can be
written honestly rather than guessed:

```
DeliveryProjectMember.platform_identity_id     ← delivery membership is keyed on IDENTITY
                    ↕  PlatformIdentityLink (platform_identity_id ↔ linked_entity_id, by link_type)
Enrollment.id                                   ← the Career Studio's subject is an ENROLLMENT
```

Bridging those requires knowing which `link_type` represents an enrollment and whether the
link is guaranteed unique — and then a second mapping from delivery evidence
(`DeliveryDecision`, accepted releases, `DeliveryEvent`) onto the 10 CAPE architecture skills.
Neither is documented yet.

## Decision (unchanged, better justified)

`deliveryAdapter` stays the seam and keeps returning `[]`.

Guessing a `link_type` and inventing a delivery-evidence → skill mapping would produce a
"Delivery Verified" badge derived from assumptions rather than from delivery. That is the
precise failure mode plan §57 forbids: the platform asserting client delivery it cannot
substantiate. An empty adapter is the honest state while the tables are empty.

## What changes when Refactored's services land

One file: `careerEvidenceAdapters.ts::deliveryAdapter`. It gains

1. enrollment → `platform_identity_id` via `PlatformIdentityLink`,
2. `DeliveryProjectMember` → the person's delivery projects,
3. `DeliveryDecision` / `DeliveryEvent` / accepted releases → skill evidence,

and `deriveEvidenceLevel` starts returning `delivery_verified`. Nothing in the API contract,
the readiness policy, or the Studio UI needs to move — all three already model the level.
