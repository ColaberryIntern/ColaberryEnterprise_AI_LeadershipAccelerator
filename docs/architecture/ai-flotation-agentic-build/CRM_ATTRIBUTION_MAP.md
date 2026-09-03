# CRM & Attribution Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§76 is blunt: **do not build a second CRM.** §150 makes `AIFlotationLead duplicating Lead`
a stop condition.

## What exists

| Model | Role |
|---|---|
| `Visitor.ts` | anonymous site movement |
| `PageEvent.ts` | page-level events |
| `Lead.ts` | identified marketing record |
| `LeadSource.ts` | source registry — resolves `sourceSlug` to tenant + brand |
| `LeadTenantContext.ts` | tenant/brand context for a lead |
| `LeadTemperatureHistory.ts`, `LeadRecommendation.ts` | scoring/recommendation |

The AI Flotation app publishes **slugs only** — `sourceSlug: 'ai-flotation'`,
`brandSlug: 'ai-flotation'` — and the server resolves them through `lead_sources`. Its
config comments explain why: *"Shipping an ID here would put it in the browser, where
anyone could read it and claim it in a hand-crafted request. Naming a source grants no
access to it, which is why a slug is safe to publish."*

That is the attribution contract's foundation and must not be weakened for convenience.

## The ownership chain (§78)

```
Visitor / PageEvent            anonymous movement
Lead + LeadTenantContext       identified acquisition context
DeliveryEngagement.source_lead_id   marketing → commercial bridge
DeliveryProject                delivery truth
billing link                   revenue / entitlement
```

**The bridge is live.** `delivery_engagements.source_lead_id` is populated by
`leadConversion.ts` (PR #2043) and is one of the two idempotency anchors for conversion —
the other being `organizations.lead_id`. So attribution survives conversion by
construction, not by a copy step that can be forgotten.

§78's rule stands: **do not copy campaign/source into unrelated tables** without a
documented projection reason. The chain above is the reason; anything else is duplication.

## The gap that breaks the funnel before it starts

`controllers/leadIngestionController.ts` stores the lead and **notifies nobody**. Every
funnel event in §77 assumes an inbound is noticed by someone. See `CURRENT_STATE.md` §3.

Production evidence: the only two `ai-flotation` leads are the site's own verification
submissions (`@colaberry-test.local`), so the silent path has not yet cost a real customer.
It would.

## Funnel events (§77)

None of the 25 named events are emitted today. They span surfaces that do not exist yet
(`blueprint_ready`, `ui_design_selected`) and surfaces that do (`payment_succeeded`,
`project_activated`, `repo_connected`).

Design constraints for when they land:

- every event carries tenant, brand, source/campaign, visitor, lead when known, identity when known, project when known, and a correlation id (§77, §102)
- the correlation id is the same one §102 requires on every workflow log line — one id, not two schemes
- **events are a projection of truth, never the truth itself.** A funnel row that says `payment_succeeded` when no `Subscription` row exists is a reporting bug that will be believed

## Free-session attribution (Gate 0 question 21)

*How will free-session attribution survive into Lead → DeliveryProject → billing?*

The mechanism exists for the identified half: once a `Lead` exists, `source_lead_id`
carries it all the way to the engagement.

**The anonymous half is the open question.** A visitor who chats before giving an email
has a `Visitor`/`VisitorSession` but no `Lead`, and §23 requires that the free project
survive identity creation without creating a duplicate lead or losing the blueprint,
transcript, design selection or campaign attribution.

That implies free build sessions must be keyed on the **visitor** and rekeyed to the lead
at identification — not created fresh at identification. Recorded as the central contract
question for `FREE_TO_PAID_CONTRACT.md`, and the answer belongs to Gate 2, not Gate 0.
