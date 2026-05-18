# Platform Intelligence Stack — Reconciliation

> Closes 30 autonomy-engine-generated requirements (5 templates × 6 capabilities)
> from [requirementGenerationEngine.ts:23-60](../../backend/src/intelligence/requirements/requirementGenerationEngine.ts).
>
> The autonomous gap engine templated USER-EVENT-TRACKING, SESSION-ANALYTICS,
> PATTERN-DETECTION, ANOMALY-ALERTS, and SIMULATION-ENGINE per-capability —
> but each is a **platform-level concern** already shipped in the
> intelligence subtree, not a per-capability deliverable. This doc maps each
> template to its shipped implementation so the engine can resume generating
> new gap-fill insights (it was at the 30-outstanding cap).

## The 5 templates → shipped implementations

### USER-EVENT-TRACKING (×6 capabilities)

> "System must capture and store user interaction events (clicks, navigation, form submissions) with timestamps and context for behavioral analysis."

**Shipped at:**
- [backend/src/services/visitorTrackingService.ts](../../backend/src/services/visitorTrackingService.ts) — anonymous visitor session capture, page-path classification, intent scoring
- [backend/src/models/Activity.ts](../../backend/src/models/Activity.ts) — admin/system action audit trail (clicks, status changes, decisions)
- Frontend: `frontend/src/utils/portalApi.ts` interceptor + page-view beacons fire on every navigation

**Per-capability variant not needed** — interaction tracking is uniform across the platform, captured once in shared infrastructure.

### SESSION-ANALYTICS (×6 capabilities)

> "System must track user session duration, flow paths, and drop-off points to identify UX bottlenecks."

**Shipped at:**
- [backend/src/models/VisitorSession.ts](../../backend/src/models/VisitorSession.ts) — per-session row with start/end timestamps, page sequence, dwell time
- Admin Visitor Sessions surface — `handleListSessions` + `handleGetSessionEvents` in adminVisitorController
- Drop-off analysis lives in the intelligence subtree's funnel reports

**Per-capability variant not needed** — sessions are user-scoped, not capability-scoped.

### PATTERN-DETECTION (×6 capabilities)

> "System should detect recurring behavioral patterns, anomalies, and trends using historical data analysis."

**Shipped at:**
- [backend/src/services/agents/apolloLeadIntelligenceAgent.ts](../../backend/src/services/agents/apolloLeadIntelligenceAgent.ts) — lead-pattern enrichment
- [backend/src/services/leadTemperatureService.ts](../../backend/src/services/leadTemperatureService.ts) — temperature re-scoring loop
- intelligenceController.handleGetAnomalies + handleGetRankedInsights — pattern surfacing endpoints

**Per-capability variant not needed** — pattern detection runs across all data the platform sees, not bucketed by capability.

### ANOMALY-ALERTS (×6 capabilities)

> "System must generate alerts when detected patterns deviate significantly from baselines, with severity classification."

**Shipped at:**
- [backend/src/services/aiOpsScheduler.ts](../../backend/src/services/aiOpsScheduler.ts) — `AISafetyMonitorAgent` runs continuously, emits anomaly events
- intelligenceController.handleGetAnomalies — operator-facing surface for anomaly stream
- governance/safety system: `safety_alerts` table + governance flags

**Per-capability variant not needed** — anomalies are detected at the platform level and routed to the appropriate operator surface.

### SIMULATION-ENGINE (×6 capabilities)

> "System should support what-if scenario simulation, allowing users to preview predicted outcomes before committing to actions."

**Shipped at:**
- [backend/src/controllers/campaignSimulationController.ts](../../backend/src/controllers/campaignSimulationController.ts) — full simulation lifecycle (start, advance, jump-to-step, respond-as-lead, pause, resume)
- LLM preview path: `handleAIPreview` in adminCampaignController previews generated content before send
- Operator Cory NextAction surface — operator can preview the next action's reasoning via "Why this next?" before completing

**Per-capability variant not needed** — simulation is a platform capability with deep coverage already.

## Why we're closing these (not building per-capability variants)

Each requirement is platform-level. Building 6 capability-specific event-trackers, 6 separate session analytics tables, 6 anomaly detectors, etc., would duplicate infrastructure that already serves the whole platform from one place. Closing as `matched` against this doc acknowledges that.

## The real systemic fix (deferred)

[gapDetectionEngine.ts](../../backend/src/intelligence/requirements/gapDetectionEngine.ts) should learn to distinguish:
- **Per-capability concerns** ("this capability needs a backend endpoint") → generate per-cap requirements as today
- **Platform-level concerns** ("the system needs anomaly detection") → generate ONCE at the project level, not per-cap

Without that fix, the engine will re-generate the same 30 next time it runs. Filed as a follow-up gap-engine improvement. Not blocking — the operator can either accept the duplicates as they come or rerun this closure pattern.

## Engine cap effect

The engine has `MAX_OUTSTANDING = 30` (see [requirementGenerationEngine.ts:64](../../backend/src/intelligence/requirements/requirementGenerationEngine.ts#L64)). With these 30 cleared (status → matched, no longer outstanding), the engine can resume generating fresh gap-fill insights that might catch real new gaps the operator hasn't seen yet.
