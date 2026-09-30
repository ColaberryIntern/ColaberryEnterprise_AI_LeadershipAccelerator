# Free → Paid Contract — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§26 draws the line: free buys **understanding**, paid buys **execution**.

| Free | Paid |
|---|---|
| idea intake, Project AI interview, workflow map | delivery entitlement, human PM |
| Build Blueprint, Trust Blueprint | DeliveryProject, canonical repo connection |
| initial requirements + architecture direction | full requirements, governed architecture |
| live UI concepts, design selection | release/story graph, agentic repo execution |
| | testing/evidence, previews, release/acceptance, operate |

The hard rule from §5: **canonical code execution must refuse to start until a paid
DeliveryProject has a verified repo connected.** Free may produce drafts and temporary
interactive previews; it may not produce canonical code.

## What must survive the boundary (§23, §111)

```
one visitor/session → one identified lead → one PlatformIdentity
```

Nothing may be lost or duplicated across identification and payment:

- chat and voice transcript
- Build Blueprint and Trust Blueprint
- design concepts and the **selected** design
- assumptions and their provenance
- campaign attribution

**Do not create a duplicate `Lead` because the user made an account.**

## The one unresolved contract question

An anonymous visitor who chats before giving an email has a `Visitor`/`VisitorSession` and
**no `Lead`**. Attribution from `Lead` onward is solved — `delivery_engagements.source_lead_id`
carries it through conversion by construction (see `CRM_ATTRIBUTION_MAP.md`).

So the free build session must be **keyed on the visitor and rekeyed to the lead at
identification**, never created fresh at identification. Anything else loses the pre-email
half of the funnel at the exact moment it becomes valuable.

Gate 0 question 1 — *what existing model should own anonymous pre-payment build sessions?*
— has **no clean existing owner**:

- `ChatConversation` is visitor-keyed but is a marketing-site conversation with no project dimension
- `services/sbp/*` holds intake contracts but is enrollment-shaped
- `DeliveryProject` must not exist before payment (§127 requires proving it does not)

**Recommendation:** a free-session model owned by the visitor, holding structured intake +
blueprint + design selection, with a nullable `lead_id` filled at identification and a
nullable `delivery_project_id` filled at activation. It is a bridge, not a second CRM and
not a second project — which keeps it clear of §150's stop conditions.

## Provenance is part of the contract

§16 requires every extracted item to carry provenance — `client_confirmed`,
`source_message`, `source_document`, `voice_transcript`, `ai_inferred`, `pm_confirmed` —
and to be classified `FACT | ASSUMPTION | RECOMMENDATION | QUESTION | DECISION`, with the
rule: **do not merge assumptions into facts.**

This survives into paid delivery. An assumption imported into a governed requirement
without its provenance becomes an unattributed fact, and the client is then held to
something they never said. The import step at activation (§29, §113) is where this is most
likely to be flattened, and it is the thing to test there.

## Cost control on the free side (§90)

The free experience must be bounded and configurable: max messages, voice minutes,
blueprint runs, UI concepts, regenerations, preview TTL, AI cost, per-session and
per-identity rate limits. Thresholds are not published.

`previewStackReaper.ts` already implies TTL discipline for preview environments. The free
budget itself has no owner yet, and it is the input the **Delivery Economics Engine** needs
in order to answer what a free prospect costs (see `BILLING_MAP.md` §4).

Boundary message when the budget is reached, per §90 — an invitation, not an error:

> *"We've created enough to show you the direction. Activate your project to keep building."*

## Activation import (Gate 8's remaining work)

The conversion chain already exists and is idempotent. What Gate 8 still owes:

1. import the free structured project truth into the activated project, with provenance intact
2. assign a human PM using the canonical delivery role (§4, §54) — not a parallel role
3. set the delivery-ready state so §32's gate can refuse execution until the repo is connected

Replay safety is already proved: a webhook retry or double click cannot create a second
organization, engagement, identity, project or membership.
