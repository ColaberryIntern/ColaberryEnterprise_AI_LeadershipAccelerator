# Recommendations & Adaptive System — Implementation Reference

> Source build-guide sections: Chapter 5, "AI Recommendations" + "Adaptive System"
> ([Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md L481-525](../../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md))
>
> Closes requirements: REQ-103, REQ-104, REQ-116, REQ-146, REQ-148.

## Spec vs. shipped — what the build guide proposed vs. what exists

The build guide proposed a generic "personalized recommendations" engine
backed by a Python ML microservice + message broker. The shipped system
has **two different recommendation surfaces**, neither of which matches
the spec exactly — but together they cover the intent.

| Build-guide concept | Shipped equivalent | Status |
| --- | --- | --- |
| ML algorithms to analyze user behavior | `intelligence` subtree services (lead scoring, intent classification, visitor analysis) — JS/TS, not Python microservice | Implemented in a different shape |
| API to fetch recommendations | `/api/admin/lead-recommendations/*` (leadRecommendationController) + `/api/admin/icp-profile/:id/recommendations` (profile-driven) | Implemented |
| Feedback loop on user satisfaction | `interaction_outcomes` table + `temperature_history` + `lead_temperature_service` re-scoring loop | Implemented |
| User interaction logs (array of objects) | `activities` table (per-action audit) + `visitor_sessions` + `interaction_outcomes` (per-interaction signal capture) | Implemented |
| Adapted recommendations (array of objects) | `recommendation_queue` (queued LLM-suggested actions) + post-execution intelligence service | Implemented |

## REQ-103 — ML algorithms to analyze user behavior and preferences

**Shipped equivalent:** Lead intelligence + visitor intelligence stack.

- [backend/src/services/agents/apolloLeadIntelligenceAgent.ts](../../backend/src/services/agents/apolloLeadIntelligenceAgent.ts) — enriches lead profiles with public-signal analysis
- [backend/src/services/visitorTrackingService.ts](../../backend/src/services/visitorTrackingService.ts) — classifies visitor intent based on page-path + behavior signals
- [backend/src/services/leadTemperatureService.ts](../../backend/src/services/leadTemperatureService.ts) — re-scores lead temperature using observed engagement

**Difference from spec:** No Python microservice. The "ML" is rule-based + LLM-augmented heuristics, not a trained model. For our scale (single-cohort, ~hundreds of leads), this is the right tradeoff. A real trained model isn't justified yet.

## REQ-104 — API to fetch recommendations based on user data

**Shipped equivalent:** Two endpoint families.

- `GET /api/admin/lead-recommendations/*` — per-lead recommended next actions (sequences, outreach, demos). [backend/src/routes/admin/campaignRoutes.ts](../../backend/src/routes/admin/campaignRoutes.ts) (registered via campaignRoutes)
- `GET /api/admin/icp-profile/:id/recommendations` — ICP-driven recommendations of leads matching a profile

User-facing personalized recommendations (the build guide's intent) live in the **Cory NextAction** surface: `GET /api/portal/project/next-action` returns the one priority item Cory believes the operator should address next.

## REQ-116 — Feedback loop to adjust system responses based on user satisfaction

**Shipped equivalent:** Two loops, depending on user surface.

- **Lead engagement loop:** `interaction_outcomes` captures opens/clicks/replies. `leadTemperatureService` re-scores lead heat based on observed outcomes. Sequence enrollments adapt.
- **Operator loop:** Cory's NextAction surface accepts completion via `POST /api/portal/project/next-action/complete`. Completed actions move out of the queue; the action generator regenerates priorities. This is exactly the "system updates recommendations based on satisfaction" loop the spec described.

## REQ-146 — User interaction logs (array of objects)

**Shipped equivalent:** Three log surfaces.

- [activities table](../../backend/src/models/Activity.ts) — admin/system actions (audit trail)
- [visitor_sessions](../../backend/src/models/VisitorSession.ts) — pageviews, dwell time, scroll depth per anonymous session
- [interaction_outcomes](../../backend/src/models/InteractionOutcome.ts) — per-email/SMS/call outcome (opened, clicked, replied, bounced)

These are the canonical "user interaction logs." The build guide framed it as a single array; in practice it's three normalized tables aligned to the surface that produced the signal.

## REQ-148 — Adapted recommendations (array of objects)

**Shipped equivalent:** `recommendation_queue` table (LLM-suggested actions awaiting operator approval) + `postExecutionRecommendationService` (re-ranks recommendations after each completed action).

## Known gaps (real, tracked)

1. **No Python ML microservice.** The build guide proposed one; we ship rule-based + LLM heuristics. If/when scale demands a trained model, add a microservice. Not blocking.
2. **No public-user-facing recommendations endpoint.** The build guide implied end-users would fetch personalized recommendations; today only operators (admin plane) consume the recommendation surfaces. End-user-personalized recs would be a new build if we want them.
3. **Single-cohort feedback loop.** Loops re-score within a cohort run but don't carry signals across cohorts yet. Future work as we ship more cohorts.
