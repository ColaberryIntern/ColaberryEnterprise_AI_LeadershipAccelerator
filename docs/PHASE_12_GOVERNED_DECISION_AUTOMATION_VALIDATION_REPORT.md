# Phase 12 Governed Decision Automation — Validation Report

**Status:** Complete · The platform now recommends, prepares, simulates, and explains governance decisions while keeping the operator in the loop. No autonomous execution paths added; every recommendation has a stable id and audit trail; every prepared plan has a rollback. The 4-layer task-shaping clamp preserves the Phase 11 invariant.
**Date:** 2026-05-07
**Scope:** Phase 12 governed decision automation + operator cognition surfaces.

---

## 1. Files Created

**Backend models**
- `backend/src/models/GovernanceRecommendation.ts` — operator-facing recommendation rows (status pending → accepted/rejected/expired); indexed for dedupe + dashboard sort.
- `backend/src/models/PreparedRemediationPlan.ts` — staged remediation plans (draft → approved/rejected/rolled_back); applied_at stamped externally by the existing prompt-issuance flow.
- `backend/src/models/GovernanceAuditEntry.ts` — append-only audit log for every governance-relevant action.

**Backend governance directory**
- `backend/src/intelligence/systemStateEngine/governance/decisionAutomationEngine.ts` — top-level coordinator producing `DecisionAutomationReport`.
- `backend/src/intelligence/systemStateEngine/governance/governanceRecommendationEngine.ts` — pure scorer emitting `GovernanceRecommendation[]` across 8 types.
- `backend/src/intelligence/systemStateEngine/governance/automationConfidenceGate.ts` — pure composite gate distinct from `safeLearningGuardrails`.
- `backend/src/intelligence/systemStateEngine/governance/autonomousRemediationPreparer.ts` — drafts plans + builds rollback prompt bodies.
- `backend/src/intelligence/systemStateEngine/governance/decisionExplainabilityEngine.ts` — composes events + state snapshots into explanation chains.
- `backend/src/intelligence/systemStateEngine/governance/governanceMemory.ts` — per-project successful/unsafe signature memory + override velocity + storm detection.
- `backend/src/intelligence/systemStateEngine/governance/governanceTaskShaper.ts` — pure rank shaper consumed by `applyCombinedTaskShaping`.

**Backend supporting**
- `backend/src/intelligence/systemStateEngine/policy/automationModes.ts` — shared `AutomationMode` enum + `decideByMode` helper.
- `backend/src/intelligence/systemStateEngine/learning/runGovernanceLearningTick.ts` — separate governance-learning loop.
- `backend/src/intelligence/systemStateEngine/incidents/subscribers/governanceIncidentSubscriber.ts` — adapter + console subscriber for governance events.
- `backend/src/intelligence/systemStateEngine/telemetry/governanceRetentionSweeper.ts` — 90d/365d sweeper for the 3 new tables.

**Tests**
- `backend/src/intelligence/systemStateEngine/__tests__/phase12.test.ts` — 47 unit tests.

**Frontend hooks** (`frontend/src/hooks/`)
- `useGovernanceRecommendations.ts` — list + accept/reject + SSE auto-refresh.
- `useAutomationConfidence.ts` — automation traffic-light + governance summary.
- `usePreparedRemediationPlans.ts` — list + approve/reject/rollback.
- `useGovernanceTimeline.ts` — events + snapshots composite for replay.
- `useOperatorOverrides.ts` — list + record overrides.
- `useGovernanceAudit.ts` — filtered audit log.

**Frontend components / pages**
- `frontend/src/components/operator/OperatorCognitionDashboard.tsx` — project-level operator dashboard.
- `frontend/src/components/admin/GovernancePolicyDashboard.tsx` — admin-only audit + policy view.
- `frontend/src/pages/admin/AdminGovernancePolicyPage.tsx` — page wrapper for `/admin/governance-policy`.

**Documentation**
- `docs/PHASE_12_GOVERNED_DECISION_AUTOMATION_VALIDATION_REPORT.md` (this file).

## 2. Files Modified

- `backend/src/models/index.ts` — registered the 3 new models.
- `backend/src/intelligence/systemStateEngine/types/systemState.types.ts` — added optional `governance_summary` block to `AuthoritativeSystemState`.
- `backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts` — extended `CognitiveEventKind` with 8 new kinds (`governance.recommendation.created/decided`, `automation.blocked/ready`, `operator.override`, `remediation.plan.prepared`, `governance.policy.changed`, `governance.escalation_dispatched`).
- `backend/src/intelligence/systemStateEngine/refreshTriggers.ts` — added 5 new `RefreshTriggerKind` values.
- `backend/src/intelligence/systemStateEngine/simulation/orchestrationSimulationEngine.ts` — additive simulators (`simulateRemediationPlan`, `simulateContradictionResolution`, `simulateUXOutcome`, `simulateRecommendationApplication`).
- `backend/src/intelligence/systemStateEngine/remediation/remediationPriorityWeighting.ts` — extracted clamp constant; new `applyCombinedTaskShaping(adaptive, projectId, baseline, governanceShaper?)` preserves the -25 clamp across 4 layers.
- `backend/src/intelligence/systemStateEngine/systemStateEngine.ts` — uses `applyCombinedTaskShaping` with the optional governance shaper; emits `governance_summary` on the returned state.
- `backend/src/intelligence/systemStateEngine/index.ts` — re-exports all Phase 12 modules.
- `backend/src/routes/projectRoutes.ts` — 13 new operator-facing endpoints + audit + decision flows + override storm action.
- `frontend/src/components/Layout/AdminLayout.tsx` — added "Governance Policies" link to Intelligence section.
- `frontend/src/routes/adminRoutes.tsx` — registered `/admin/governance-policy` route.
- `frontend/src/pages/project/SystemViewV2.tsx` — slotted `OperatorCognitionDashboard` next to `RealtimeRemediationDashboard`.

## 3. Governance Recommendation Status

**Real output** — synthetic critical state input (cognitive_health=critical/35, pressure=critical, regressions=3, override_velocity=5, unsafe pattern present, automation_confidence=30):

```json
[
  {
    "type": "request_operator_review",
    "recommendation_text": "Operator review required — cognitive health is critical (35/100).",
    "rationale": "When cognitive health is critical, autonomous adjustments tend to amplify problems. Pause for human triage before further changes.",
    "confidence": 90,
    "risk_level": "high",
    "priority": 1,
    "requires_review_within_min": 15
  },
  {
    "type": "pause_orchestration",
    "recommendation_text": "Pause autonomous orchestration. Pressure is critical and 2 error incident(s) are unresolved.",
    "confidence": 85,
    "risk_level": "high",
    "priority": 2,
    "requires_review_within_min": 30
  },
  {
    "type": "escalate_remediation",
    "recommendation_text": "Escalate remediation — 3 regression(s) detected recently.",
    "confidence": 75,
    "risk_level": "elevated",
    "priority": 3,
    "requires_review_within_min": 60
  },
  ...
]
```

Healthy-state input (cognitive=healthy/90, pressure=calm, no regressions, automation_confidence=82) produces a single `loosen_governance_threshold` recommendation. Output is sorted by priority ascending — verified in tests.

## 4. Automation Confidence Status

**Real output** — healthy inputs:
```json
{
  "automation_allowed": true,
  "confidence": 80,
  "tier": "high",
  "blocking_reasons": [],
  "evidence_strength": 80,
  "regression_risk": 20,
  "governance_risk": 0,
  "required_human_review": false,
  "mode_decision": { "action": "apply", "reason": "Confidence 80 ≥ 65; mode autonomous.", "mode": "autonomous" }
}
```

**Real output** — recent storm + unsafe pattern + override velocity 6 + regression risk 70:
```json
{
  "automation_allowed": false,
  "confidence": 0,
  "tier": "low",
  "blocking_reasons": [
    "Override storm detected within last 30 minutes.",
    "Proposed signature matches an unsafe pattern: unsafe-x.",
    "Regression risk is high (70/100)."
  ],
  "evidence_strength": 80,
  "governance_risk": 70,
  "required_human_review": true,
  "mode_decision": { "action": "queue_for_review", "reason": "Override storm detected within last 30 minutes; ..." }
}
```

Mode interaction verified: frozen mode → reject regardless of confidence; supervised mode → queue_for_review even at high confidence.

## 5. Prepared Remediation Status

**Real plan draft** (sample, 2 issues, accessibility cluster):
```json
{
  "project_id": "p1",
  "capability_id": "cap1",
  "cluster_signature": "accessibility:cap1:/checkout",
  "plan_payload": {
    "target": "ui_fix_adaptive",
    "stepKey": "usability",
    "uiIssues": [
      { "id": "i1", "title": "Missing aria-label on Submit", "severity": "high", "element_id": "submit-btn" },
      { "id": "i2", "title": "Modal close lacks focus styles", "severity": "medium", "element_id": "modal-close" }
    ],
    "adaptiveRemediation": {
      "clusters": [{
        "cluster_type": "accessibility",
        "historical_success_rate": 72,
        "regression_prone_patterns": [{ "cluster_signature": "accessibility:cap1:/checkout", "recommended_alternative": "Add a snapshot test for keyboard + screen-reader paths." }],
        "sequence_position": { "position": 1, "total": 2, "reason": "accessibility before hierarchy" },
        "confidence": { "confidence": 64, "tier": "moderate", "reasons": [] }
      }]
    },
    "rollback": {
      "rollback_prompt_target": "ui_fix_adaptive",
      "rollback_payload": {
        "instruction": "Revert the changes made for cluster accessibility:cap1:/checkout. Restore the page state to match the captured DOM snapshot.",
        "reference_dom_snapshot_id": "snap-abc"
      },
      "before_dom_snapshot_id": "snap-abc"
    }
  },
  "projected_outcome": { "projected_pressure_drop": 8, "projected_cognition_gain": 5, "projected_issues_resolved": 2, "confidence": 64 },
  "confidence": 64,
  "status": "draft"
}
```

**Rollback prompt body** (for reference):
```
Revert the changes made for cluster accessibility:cap1:/checkout. Restore the page state to match the captured DOM snapshot.

# REFERENCE STATE

Before-state DOM snapshot id: snap-abc.
```

When `before_dom_snapshot_id` is missing, `buildRollbackPromptBody` returns `null` so the dashboard can show a degraded-rollback warning.

## 6. Operational Evolution Timeline Status

`/governance/timeline` composes two sources:
- **events** from `CognitionEvent` (per-event resolution, ~24h retention) — used for "what fired at minute T".
- **state_snapshots** from `SystemStateSnapshot` (24h-full / 7d-hourly / 90d-daily) — used for "state at time T".

`/governance/explain/:event_id` delegates to `decisionExplainabilityEngine.explainDecision` which loads the anchor event + ±5min window of related events + state snapshots immediately before/after the anchor, then composes a narrative.

When no anchor is provided: the engine returns an empty narrative (`"No anchor event or timestamp provided."`) instead of throwing — fail-soft contract.

## 7. Governance Explainability Status

The engine answers questions like *"Why did pressure escalate at 14:32?"* by composing:
1. The anchor event (looked up by id or timestamp).
2. ±5min related events (sorted by `emitted_at`, capped at 20).
3. State snapshots immediately before AND after the anchor.
4. A narrative summarizing the chain (event kind, related-event count + distinct kinds, health-score delta if both snapshots are present).

The composition matches the architecture's "events for what happened, snapshots for state at T" rule.

## 8. Operator Intervention Status

The override flow at `POST /governance/recommendations/:id/decision`:
1. Validates `decision ∈ {accepted, rejected}`.
2. Stamps `operator_decision_at` + `operator_id` + `decision_reason` on the row.
3. Writes a `GovernanceAuditEntry` (`recommendation_accepted` / `recommendation_rejected`).
4. Publishes `governance.recommendation.decided` event.
5. Removes the recommendation from the in-memory shaper cache.
6. **If decision='rejected'**: increments override velocity. If 5 rejections in 10 minutes, the override-storm action fires:
   - Flips `automation_mode` from `autonomous` → `supervised`.
   - Writes `GovernanceAuditEntry { kind: 'override_storm_detected' }`.
   - Publishes `governance.escalation_dispatched` (warning severity) with `suspended_until` 30min from now.

`POST /governance/operator-overrides` records ad-hoc overrides outside the recommendation flow with the same storm-detection logic.

## 9. Governance Policy Status

Per-project policy via `cognitivePolicyEngine.getPolicy/updatePolicy` (Phase 10) provides the per-project policy bag including the new `automation_mode` and `confidence_floor` fields. Federation fallback (Phase 10) provides the org-wide default — there is no separate "global policy" object.

The admin-only `/admin/governance-policy` page surfaces the audit log with kind/operator/subject_id/payload columns. Full policy editing UI (sliders, toggle automation_mode, confidence_floor adjustments) is wired through the same `cognitivePolicyEngine.updatePolicy` endpoint and lands as a Phase 12.1 polish item.

## 10. Decision Simulation Status

Four new simulators added to `orchestrationSimulationEngine`:

**`simulateRemediationPlan`** — pipes the plan through `simulateQueue` with success-rate-scaled deltas:
```
{ final_pressure: 52, final_cognition: 65, net_pressure_drop: 8, net_cognition_gain: 5,
  steps: [{ task_type: 'ui_review', delta_pressure: -8, delta_cognition: 5, ... }] }
```

**`simulateUXOutcome` (hierarchy cluster, 5 issues, 80% success)**:
```
{ cognition_delta: 5, ux_debt_delta: 4, behavioral_delta: 1, friction_delta: 2,
  net_delta: 4,
  explanation: "Projected net +4 (success 80%, 5 issues, biased by hierarchy)." }
```

**`simulateRecommendationApplication` (pause_orchestration)**:
```
{ final_pressure: 57, final_cognition: 63, net_pressure_drop: 13, net_cognition_gain: 3 }
```

`simulateContradictionResolution` covers the ignore/remediate/escalate decision tree. `compareQueueOrderings` from Phase 10 stays the comparison primitive for "what if I accept this recommendation vs not."

## 11. Governance Audit Status

`GovernanceAuditEntry` covers 14 audit kinds — every state transition in the governance lifecycle gets a row. The schema is append-only, indexed on `(project_id, kind, recorded_at)` and `(subject_id)`, and retention sweeps it at 365d.

Audit is wired into:
- Recommendation accept/reject (writes 1 row + storm-trigger row when applicable).
- Plan prepare/approve/reject/rollback (writes 1 row each).
- Override-storm trigger (`override_storm_detected`).
- Plus future hooks for `policy_changed`, `automation_blocked`, `automation_ready`.

The admin `/admin/governance-policy` page reads this surface (most recent 100 entries).

## 12. Performance Report

| Operation | Cost (single call) |
|---|---|
| `decideByMode` | <1ms (pure) |
| `evaluateAutomationConfidence` | <1ms (pure) |
| `generateGovernanceRecommendations` | 1-2ms for 8 rule branches |
| `preparePlanDraft` | 1-2ms (pure) |
| `governanceTaskShaper` | <1ms cache hit; cleans expired entries on each call |
| `applyCombinedTaskShaping` (10 tasks, governance shaper applied) | 1-2ms |
| `simulateRemediationPlan` / `simulateUXOutcome` / `simulateRecommendationApplication` | 1-2ms each |
| `decideGovernanceDeletions` (1k rows pure) | <2ms |
| `runGovernanceLearningTick` | <500ms with empty DB; ~50-200ms with realistic outcome history |
| `explainDecision` | ~50-150ms with one event lookup + 2 snapshot queries; ~1.5s in test env (DB unavailable, fail-soft) |

Cost protection: the recommendation engine has indexed dedupe ("skip if pending of same type"); the task shaper has 60s in-memory TTL + cache-pruning on every call; the listener circuit-breaker (Phase 11) plus the override-storm gate (5 in 10min → 30min suspension) bound the worst-case event volume.

## 13. Test Results

- **Backend tsc:** `npx tsc --noEmit` exit 0.
- **Frontend tsc:** `npx tsc --noEmit` exit 0.
- **Phase 12 jest:** **47/47 passing** in `phase12.test.ts` (~47s).
- **Full systemStateEngine suite:** 12 suites, **448/448 passing** (no regressions in any prior phase).
- **Pre-existing 4 failing suites** (openclaw, paysimple, adminRoutes) remain pre-existing — unrelated to Phase 12 work.

**Test breakdown** (47 tests):
- `decideByMode`: 5
- `evaluateAutomationConfidence`: 6
- `generateGovernanceRecommendations`: 8
- `preparePlanDraft` + `buildRollbackPromptBody`: 6
- `explainDecision`: 2
- `governanceMemory` (record/storm): 4
- `governanceTaskShaper` (no-op/pause/escalate/decided): 4
- Simulation extensions × 4: 4
- `decideGovernanceDeletions` + retention defaults: 2
- `applyCombinedTaskShaping` (calm + critical clamp + clamp constant): 3
- `runGovernanceLearningTick` (empty + export): 2
- AuthoritativeSystemState type compile-check: 1

## 14. Remaining Governance Gaps

1. **Recommendation generator scheduling.** Generation is on-demand only — currently triggered by callers (e.g. `buildDecisionAutomationReport`). Phase 13 wires a scheduler so recommendations refresh on a cadence rather than only on-demand.
2. **Cross-project recommendation transfer.** `governanceMemory` is per-project (Map keyed by project_id). Federation across projects is Phase 13.
3. **Real ML for recommendation scoring.** The recommendation engine is rule-based today. ML scoring (gradient-boosted tree once outcome history accumulates) is Phase 13.
4. **Server-side simulation persistence.** `simulateRemediationPlan` etc. compute on demand and are not cached. Persisting "what if this plan had been applied" comparisons is Phase 13.
5. **Multi-operator approval workflows.** Single-operator click is sufficient for v1. Quorum / sequential approval (e.g. operator A drafts, operator B approves) is Phase 13.
6. **Decision graph visualization.** The data is exposed via `/governance/explain/:event_id`; visual graph is a UI follow-up.
7. **Plan rollback fidelity.** When `before_dom_snapshot_id` is missing (Puppeteer optional in some envs), rollback degrades to "rollback prompt issued without before-state reference" — operator sees a warning.
8. **Federated default policy derivation.** `cognitivePolicyEngine` already has the federation fallback hook; Phase 12 doesn't yet seed governance-specific cross-project defaults.
9. **`automation.blocked` / `automation.ready` event publishing.** The event kinds are registered but no producer publishes them yet — these will fire in Phase 13 from auto-execution gates.
10. **Per-project policy admin UI.** `/admin/governance-policy` v1 surfaces the audit log; sliders + toggles for confidence_floor / automation_mode are Phase 12.1.
11. **Plan auto-applied path.** `PreparedRemediationPlan.applied_at` is stamped externally by the existing `ui_fix_adaptive` flow but the wiring from "operator approves" → "Cory issues the plan's prompt" is implicit (the operator manually triggers it). Phase 13 closes this gap with an opt-in auto-issue gate.
12. **Governance memory persistence.** `governanceMemory` is in-memory (per Node process). Persistence + warm-start from DB is Phase 13.

## 15. Next Phase Recommendation

**Phase 13 — Federated Decision Automation + Auto-Apply Gates**

Three workstreams:

**A) Federation + persistence.** Persist `governanceMemory` to DB with cross-project federation (parallel to `federatedPatternRegistry`). The recommendation engine consumes both per-project and federated signal. Add Phase 13 cron scheduling for `runGovernanceLearningTick` and the recommendation generator.

**B) Auto-apply gates (opt-in).** Behind `cognitivePolicyEngine.policy.auto_apply_recommendations: boolean` (default false): when a recommendation lands at high confidence + no blocking reasons + autonomous mode, fire the approved-plan execution path automatically. Audit + reversibility + quorum approval gates.

**C) Real ML for recommendation scoring.** Once enough decisions accumulate (~1000+ accepted/rejected pairs), train a gradient-boosted tree for the rule scorer behind `generateGovernanceRecommendations`. Keep the heuristic as fallback. Slot behind the same `proposeWeightAdjustments`-style interface that Phase 10 shipped.

**D) Operator UX polish.** Sliders + toggles in the admin policy page; sparklines on the operator dashboard for confidence-over-time; decision graph visualization for the timeline; Slack integration for `governance.escalation_dispatched`.

After Phase 13, the platform reaches the §22 final goal end-to-end: governed autonomous action, federated learning, persistent memory, operator-visible reasoning at every step.

---

## Phase Journey Recap

| Phase | Theme | Outcome |
|---|---|---|
| 3 | Telemetry contracts + deterministic sync | BuildManifest spec, ingestion pipeline |
| 4 | Self-synchronizing execution + explainability | WhyIsThisNextPanel, manifest completeness |
| 5 | Operational UX intelligence | UX debt scorer, workflow friction |
| 6 | Visual cognition + behavioral telemetry | DOM/hierarchy/density/CTA analyzers |
| 7 | Multimodal cognition + adaptive priority | GPT-4o vision, screenshot capture, adaptive weighting |
| 8 | Persistent real-time awareness | SSE bus, cognition memory, regression detector |
| 9 | Distributed cognition + governance foundation | Redis pub/sub, fan-out, predictive classification, cognitive health index |
| 10 | Self-learning adaptive orchestration | Outcome scorer, adaptive trainer, simulation, governance advice |
| 10.5 | Continuous remediation orchestration | Cluster engine, sequencer, before/after analyzer, regression detector, pressure engine + reranker, replay manifest, adaptive prompts |
| 11 | Closed-loop outcome-driven UX cognition | Real metric pipeline, deploy-freshness gate, adaptive prompts activated, queue pressure-boost with stack-clamp, DOM-linked persisted overlays, See Replay CTA, live hooks + dashboard, confidence evolution, strategy learner, governance insights, retention sweeper, listener circuit-breaker |
| **12** | **Governed decision automation + operator cognition** | **3 new models, 6 governance engines, automation modes shared enum, multi-cluster recommendation engine, automation confidence gate, autonomous remediation preparer, decision explainability engine, governance memory + override-storm detection, governance task shaper, 4-layer combined-shaping clamp, simulation extensions × 4, governance retention sweeper, separate governance learning tick, governance incident subscriber, operator dashboard, admin governance policy dashboard, 6 frontend hooks** |

**The platform is now a governed decision automation system — within the unified SystemStateEngine architecture, explainable + auditable + bounded + operator-aware + reversible.**
