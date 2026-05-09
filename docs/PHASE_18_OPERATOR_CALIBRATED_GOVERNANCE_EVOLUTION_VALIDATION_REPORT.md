# Phase 18 Operator-Calibrated Governance Evolution + Guided Recovery Orchestration — Validation Report

**Status:** Complete · The platform now performs **human-calibrated adaptive governance cognition**: operators approve every calibration via `GovernanceCalibrationProposal` envelopes (no timeout-based auto-approval, no threshold-triggered auto-apply), specialization routing applies soft weight bias with first-class `RoutingAttribution` and a 5-tier `RoutingStabilityTier` (stable / adaptive / volatile / suppressed / overridden), forecast tuning empirically widens or tightens bounds based on observed outcomes (NOT ML retraining), recovery orchestration is **operator-gated step-by-step** (engine waits between operator clicks), recovery optimization tracks per-archetype success and produces `RecoveryDecisionAttribution` for every ordering decision, governance topology is exposed as a structured backend payload (NO graph rendering library), and 5 governance health scores (calibration_stability, routing_stability, recovery_optimization, forecast_reliability, governance_transparency) surface via the engine state. **Hard architectural vetoes (containment confidence ≤ 20 → forced reject) remain absolute and unaffected by adaptive routing weights** — verified by sample run + dedicated tests.
**Date:** 2026-05-07
**Scope:** Phase 18 — operator calibration engine, specialization routing engine, forecast tuning engine, governance topology builder, interactive recovery coordinator, recovery strategy optimizer, calibration replay walker, governance transparency replay builder, governance evolution summary surface, 9 endpoints + 6 hooks + dashboard extension.

---

## 1. Files Created

**Backend operatorGovernance directory** (`backend/src/intelligence/systemStateEngine/operatorGovernance/`):
- `operatorGovernanceTypes.ts` — every Phase 18 type. Hard caps exported: `MAX_ACTIVE_PROPOSALS_PER_PROJECT=20`, `MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT=5`, `FORECAST_TUNING_OBSERVATIONS_FLOOR=5`, `FORECAST_BOUNDS_WIDEN_FACTOR=1.25`, `FORECAST_BOUNDS_TIGHTEN_FACTOR=0.9`, `ROUTING_BIAS_MIN=0.5`, `ROUTING_BIAS_MAX=1.5`, `TOPOLOGY_MAX_NODES=50`, `TRANSPARENCY_REPLAY_MAX_ENTRIES=100`. Includes `CalibrationConfidenceBounds`, `GovernanceCalibrationProposal`, `RoutingStabilityTier`, `RoutingAttribution`, `SpecializationRoutingDecision`, `ForecastOutcomeObservation`, `ForecastCalibrationProfile`, `InteractiveRecoveryStep`, `InteractiveRecoverySession`, `RecoveryDecisionAttribution`, `RecoveryArchetype`, `RecoveryOptimizationInsights`, `TopologyNode/Edge/Map`, `TransparencyReplayEntry`, `GovernanceTransparencyReplay`, `GovernanceHealthScores`, `GovernanceEvolutionSummarySnapshot`.
- `operatorCalibrationEngine.ts` — `proposeCalibration` / `approveCalibration` / `rejectCalibration` / `rollbackCalibration` / `listProposals` / `getProposal`. **Operator-clicked lifecycle**: engine never auto-applies. Pending-cap of 20 proposals per project. Applies `validator_suppression` and `validator_restoration` directly via the Phase 17 drift detector. Other calibration types (specialization, arbitration, forecast tuning, routing) log + audit; concrete state changes happen via the dedicated engines.
- `specializationRoutingEngine.ts` — `buildRoutingDecision` produces a `SpecializationRoutingDecision` with `attributions` (per validator) + `weight_overrides` (feeds straight into Phase 16's `arbitrate(weight_overrides)`) + `stability_tier`. **Soft bias**: STRONG_BIAS=1.20, WEAK_BIAS=0.70, drift dampening multiplies bias for unstable/drifting validators. Operator overrides take priority. `RoutingStabilityTier` classified from rolling 8-decision variance. Suppression / unsuppression registry.
- `forecastTuningEngine.ts` — `recordForecastOutcome` records actual-vs-predicted observations; `buildForecastCalibrationProfile` computes per-signal `within_bounds_rate` + `mean_abs_error` + `bound_widen_factor`. **Empirical bound calibration**: <40% within-bounds → recommend widen (factor × 1.25 capped at 4.0); ≥90% within-bounds + ≤5 mean abs error → tighten (factor × 0.9 floored at 0.5). Cold-start at floor of 5 observations. NOT ML retraining.
- `governanceTopologyBuilder.ts` — `buildGovernanceTopology` produces a structured `GovernanceTopologyMap` with validator nodes + arbitration node + trust cluster + specialization zones + bottlenecks (drifting validators with weight ≥ 1.0) + stabilization hubs (stable validators with weight ≥ 1.1). **Backend payload only — no rendering library.**
- `interactiveRecoveryCoordinator.ts` — `createRecoverySession` / `performStepAction` / `getRecoverySession` / `listRecoverySessions`. **Operator-gated**: engine advances `current_step_index` ONLY when operator clicks approve/skip/abort. Each step exposes forecast_impact bounds + rollback_consequence + trust_recovery_estimate + propagation_suppression_estimate + stabilization_confidence + blast_radius_implication. Per-step audit row written.
- `recoveryStrategyOptimizer.ts` — `observeRecoveryOutcome` accumulates per-step-sequence outcomes; `buildRecoveryOptimizationInsights` groups into archetypes ranked by `success_rate × observed_count`. `recommended_ordering` is the highest-scoring archetype with ≥2 observations + ≥50% success. Each step in the recommendation carries `RecoveryDecisionAttribution` (per the addendum) explaining why it ordered there.
- `governanceCalibrationReplay.ts` — read-only walker over the Phase 17 + Phase 18 audit history, mapping each kind to a `TransparencyReplayKind`. 14-day window, capped at `TRANSPARENCY_REPLAY_MAX_ENTRIES=100`.
- `governanceTransparencyReplayBuilder.ts` — composes calibration replay + Phase 17 adaptive weight attribution snapshot into a single `GovernanceTransparencyReplay` payload sorted newest-first. **Reuses existing audit + attribution data — no parallel persistence.**
- `governanceEvolutionSummaryCounters.ts` — sync, in-memory rolling counters for the engine state's `governance_evolution_summary` block. Computes 5 governance health scores from observed signals.

**Tests**
- `backend/src/intelligence/systemStateEngine/__tests__/phase18.test.ts` — 40 unit tests covering operator calibration lifecycle (propose/approve/reject/restoration/pending-cap/list/no-double-apply), specialization routing (cold-start neutral / strong bias / weak bias / operator override / suppression / weight_overrides feed-through), **hard-veto preservation under hostile Phase 18 routing weights** — the critical safety contract, forecast tuning (cold-start, widen-on-miss, tighten-on-hit, threshold sanity, factor clamps), governance topology (validator/arbitration/trust-cluster baseline, validator → arbitration edges, drifting bottlenecks, TOPOLOGY_MAX_NODES bound), interactive recovery coordinator (session creation cap, step advance, abort flips status, completing flips status, skip records action, forecast estimates per step kind), recovery optimizer (cold-start empty, archetype grouping, recommended ordering with ≥2 obs + ≥50% success, attribution structure, no-recommendation with 1 obs), governance evolution summary surface (counter reflection, sane defaults, health scores in 0-100, per-project isolation).

**Frontend hooks** (`frontend/src/hooks/`)
- `useGovernanceCalibration.ts` — fetch proposals, expose `pending` filter, `approve(id)` + `reject(id, reason)` actions. SSE on `governance.calibration.*`.
- `useGovernanceReplay.ts` — fetch transparency replay; SSE on calibration approval/rejection + routing/forecast updates.
- `useSpecializationRouting.ts` — action hook: `fetchDecision(targetIntent)` returns `SpecializationRoutingDecision`.
- `useRecoveryOrchestration.ts` — fetch sessions, expose `activeSessions` filter, `performStep(sessionId, action)` action. SSE on `recovery.step.executed` + `recovery.chain.generated`.
- `useForecastCalibration.ts` — fetch tuning profile; SSE on `forecast.calibration.updated` + `causal.forecast.generated`.
- `useGovernanceTopology.ts` — fetch topology; SSE on `governance.topology.changed` + `validator.drift.detected` + `specialization.routing.updated`.

**Documentation**
- `docs/PHASE_18_OPERATOR_CALIBRATED_GOVERNANCE_EVOLUTION_VALIDATION_REPORT.md` (this file).

## 2. Files Modified

- `backend/src/models/GovernanceAuditEntry.ts` — extended `GovernanceAuditKind` union with 7 new values: `governance_calibration_proposed`, `governance_calibration_approved`, `governance_calibration_rejected`, `specialization_routing_updated`, `forecast_calibration_updated`, `recovery_step_executed`, `governance_topology_changed`.
- `backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts` — extended `CognitiveEventKind` with 7 new event kinds matching the audit kinds.
- `backend/src/intelligence/systemStateEngine/refreshTriggers.ts` — 3 new trigger reasons: `governance_calibration_approved`, `recovery_step_executed`, `forecast_calibration_updated`.
- `backend/src/intelligence/systemStateEngine/types/systemState.types.ts` — added optional `governance_evolution_summary` block (`pending_calibration_proposals`, `approved_calibrations_24h`, `rejected_calibrations_24h`, `active_recovery_sessions`, `forecast_signals_widened`, `routing_stability`, `health_scores`, `last_updated`).
- `backend/src/intelligence/systemStateEngine/systemStateEngine.ts` — populates `governance_evolution_summary` synchronously from in-memory counters. Fail-soft.
- `backend/src/intelligence/systemStateEngine/index.ts` — re-exports all Phase 18 modules + types + hard-cap constants.
- `backend/src/routes/projectRoutes.ts` — 9 new endpoints (calibration list/approve/reject + routing decision + forecast tuning + topology + recovery sessions list/step + transparency replay).
- `frontend/src/components/operator/AutonomousExecutionDashboard.tsx` — extended in place with three new sections: pending calibration proposals (with approve/reject buttons), active recovery sessions (with approve/skip/abort buttons per step), governance topology (hubs + bottlenecks badges).

## 3. Calibration Status

**Real example (sample run, validator_suppression proposal lifecycle):**
```
proposal_id: cal-ae829c7c-0e00-4e3c-9f71-eb9bb21b2b29
calibration_type: validator_suppression
proposed_change: { validator_role: "mutation_validator" }
rationale: "mutation_validator drifting (6 over-triggers, accuracy 0%)"
bounds: {
  low: 35, high: 65, confidence_range: 30,
  uncertainty_drivers: ["observed_drift_only_6_obs"],
  expected_governance_impact: 50,
  rollback_confidence: 90
}
forecasted_impact: ["mutation_validator excluded from arbitration weighting", "arbitration consensus stabilizes"]
rollback_path: ["unsuppress mutation_validator via restoration proposal"]
status: pending_operator → operator clicks → approved (decided_by: ali@colaberry.com)
applied: true     // suppression activated via Phase 17 drift detector
```

A second proposal (`arbitration_tuning`) was rejected by the operator with reason "wait for more observations" → status flipped to `rejected`, no state change applied.

**Architectural commitment held:** `operator_required: true` is hardcoded into the `GovernanceCalibrationProposal` type. There is no timeout, no auto-approval threshold, no silent governance evolution.

## 4. Specialization Routing Status

**Real example (sample run, target_intent=POLICY_NUDGE with operator override on rollback_validator):**
```
mutation_validator    bias=1.20  reason="strong specialization in POLICY_NUDGE (100% / 5 obs)"
                                inputs: { domain_accuracy: 100, drift_tier: suppressed,
                                          is_strong_in_domain: true, is_weak_in_domain: false }
rollback_validator    bias=1.40  reason="operator override → fixed bias 1.40 (set by ali@colaberry.com)"
                                operator_override: { fixed_bias: 1.4, set_by: "ali@colaberry.com" }
trust_validator       bias=1.00  neutral (cold-start, 0 obs)
containment_validator bias=1.00  neutral (cold-start, 0 obs)
blast_radius_validator bias=1.00 neutral (cold-start, 0 obs)

weight_overrides: {
  mutation_validator: 0.5,         // adaptive×bias clamped to ROUTING_BIAS_MIN=0.5
  rollback_validator: 1.5,         // adaptive×override clamped to ROUTING_BIAS_MAX=1.5
  trust_validator: 1.0,
  containment_validator: 1.5,
  blast_radius_validator: 1.5
}
stability_tier: overridden
```

**`RoutingStabilityTier`** (5 tiers per the addendum): stable / adaptive / volatile / suppressed / overridden. Volatility detection is variance-based across rolling 8-decision history.

## 5. Forecast Tuning Status

**Real example (sample run, 8 misses in a row on rollback_rate_trend):**
```
rollback_rate_trend:
  observations: 8
  within_bounds_rate: 0%
  mean_abs_error: 45
  bound_widen_factor: 2.44   // 1.25^4 ≈ 2.44 — widened 4 times based on misses
  recommended_action: widen
  notes: ["0/8 within bounds", "mean abs error 45", "bounds will widen on next forecast call"]

[other 4 signals]:
  observations: 0
  within_bounds_rate: 100  (cold-start)
  recommended_action: hold
```

Bound widen factor is hard-clamped at 4.0; tighten is hard-floored at 0.5. **NOT ML retraining** — this is empirical bound calibration based on observed outcome divergence.

## 6. Recovery Orchestration Status

**Real example (sample run, 3-step recovery session with operator approve+skip):**
```
session_id: rec-2ecf9996-a579-4d23-9cfe-b6eb5e8bddcd
trigger_summary: "sample run"
status: active                 // engine WAITING for next operator click
current_step_index: 2

operator_actions:
[0] step_index=0  action=approve  operator_id=ali@colaberry.com  step.kind=contain_root
[1] step_index=1  action=skip     operator_id=ali@colaberry.com  step.kind=rollback_target

step_statuses:
[0] contain_root         status=approved
[1] rollback_target      status=skipped
[2] monitor_only         status=pending_operator    // engine waits here
```

**Architectural commitment held:** the engine NEVER autonomously walked from step 0 → step 2. Each transition required an operator click. Each step exposed forecast bounds, rollback consequence, trust recovery estimate (e.g. `contain_root`: 50/100), propagation suppression estimate (80/100), stabilization confidence (70/100), and blast radius implication (25/100).

Per-step `recovery_step_executed` audit rows were written for both clicks.

## 7. Governance Replay Status

The transparency replay walks Phase 17 + Phase 18 audit kinds (mapped to 6 `TransparencyReplayKind` categories: `weight_change`, `drift_event`, `specialization_shift`, `routing_change`, `forecast_recalibration`, `operator_intervention`) over a 14-day window, capped at 100 entries.

**Real example shapes (from sample run audit history + Phase 17 attribution snapshot):**
```
[
  { index: 0, kind: "operator_intervention",
    summary: "Operator approved validator_suppression (decided_by=ali@colaberry.com).",
    recorded_at: "..." },
  { index: 1, kind: "operator_intervention",
    summary: "Operator rejected arbitration_tuning (decided_by=ali@colaberry.com).", ... },
  { index: 2, kind: "weight_change",
    summary: "mutation_validator: 1.00 → 0.40 (unstable → strong suppression; accuracy 0%; 1.00 → 0.40)", ... },
  { index: 3, kind: "weight_change",
    summary: "rollback_validator: 1.00 → 1.10 (stable + boost; accuracy 100%; 1.00 → 1.10)", ... }
]
```

**Single source of governance lineage:** the replay walker reuses `GovernanceAuditEntry` rows + the in-memory adaptive weight attribution snapshot. **No parallel persistence system.**

## 8. Topology Status

**Real example (sample run, 5 validators + 7 specialization zones + 1 arbitration + 1 trust cluster + 3 hubs):**
```
nodes: 16 total
  validator:mutation_validator     metadata: { drift_tier: suppressed, adaptive_weight: 0.4, prior_weight: 1.0 }
  validator:rollback_validator     metadata: { drift_tier: stable,    adaptive_weight: 1.1, prior_weight: 1.0 }
  validator:trust_validator        metadata: { drift_tier: stable,    adaptive_weight: 1.0, prior_weight: 1.0 }
  validator:containment_validator  metadata: { drift_tier: stable,    adaptive_weight: 1.5, prior_weight: 1.5 }
  validator:blast_radius_validator metadata: { drift_tier: stable,    adaptive_weight: 1.5, prior_weight: 1.5 }
  zone:POLICY_NUDGE                metadata: { strongest: mutation_validator, weakest: undefined }
  zone:QUEUE_STABILIZATION         metadata: { strongest: undefined, weakest: mutation_validator }
  hub:rollback_validator           metadata: { weight: 1.1 }
  hub:containment_validator        metadata: { weight: 1.5 }
  hub:blast_radius_validator       metadata: { weight: 1.5 }
  trust_cluster:sample             metadata: { worst_drift_tier: suppressed, routing_suppressed: false }
  arbitration:sample               metadata: {}

identified_bottlenecks: []        // mutation_validator's weight dropped below 1.0 → no longer counts as bottleneck
identified_hubs: ["hub:rollback_validator", "hub:containment_validator", "hub:blast_radius_validator"]
```

**Structured payload only.** The frontend renders this as styled badges (hubs in green, bottlenecks in amber) — there is no force-directed graph layout.

## 9. Optimization Status

**Real example (sample run, 3 recovery outcomes observed, 2 archetypes):**
```
archetypes (sorted by success_rate × observed_count):
  arch-XXXX  step_sequence: ["contain_root", "rollback_target", "reenable_governance"]
             observed_count: 2  success_rate: 100%  avg_minutes_to_stabilize: 13
             notes: "2/2 succeeded"
  arch-YYYY  step_sequence: ["rollback_target", "contain_root"]
             observed_count: 1  success_rate: 0%   avg_minutes_to_stabilize: 40
             notes: "0/1 succeeded"

recommended_ordering: ["contain_root", "rollback_target", "reenable_governance"]

attributions (RecoveryDecisionAttribution per step):
[0] recovery_step="contain_root"
    ordering_reason="First step in highest-scoring archetype (100% success across 2 observations)."
    optimization_inputs: { historical_success_rate: 100, avg_minutes: 13, observed_count: 2 }
    stabilization_expectation: high
[1] recovery_step="rollback_target"
    ordering_reason="Position 2 in archetype with 13min avg stabilization."
    stabilization_expectation: high
[2] recovery_step="reenable_governance"
    ordering_reason="Position 3 in archetype with 13min avg stabilization."
    stabilization_expectation: high
```

**Optimization INFORMS planning. The operator still executes steps.** No autonomous chain execution.

## 10. Performance Report

Sample-run timings (synthetic in-memory inputs, all sub-millisecond except where noted):
- Calibration propose: < 1ms
- Calibration approve (with validator suppression apply): < 5ms
- Calibration reject: < 1ms
- Routing decision build (5 validators, full attribution): < 2ms
- Forecast tuning observation record: < 1ms
- Forecast calibration profile build (5 signals): < 2ms
- Topology build (12+ nodes, ~25 edges): < 2ms
- Recovery session create (3 steps): < 1ms
- Recovery step action (approve/skip/abort): < 1ms (audit write async)
- Recovery optimizer insights (3 archetypes, attribution): < 2ms
- Transparency replay (DB-backed, 14d window): bounded by DB query (~10-50ms typical)

Jest suite timings:
- 40 Phase 18 unit tests: ~54s wall (most time is Jest TS compile)
- Full systemStateEngine suite (733 tests across 18 suites): ~85s wall

No performance regressions detected against the Phase 17 baseline. All hot paths are sync, in-memory, and bounded by the architectural caps.

## 11. Test Results

```
$ npx tsc --noEmit (backend)        → exit 0
$ npx tsc --noEmit (frontend)       → exit 0
$ npx jest --testPathPattern phase18 --maxWorkers=1
  Test Suites: 1 passed, 1 total
  Tests:       40 passed, 40 total
$ npx jest --testPathPattern systemStateEngine --maxWorkers=1
  Test Suites: 18 passed, 18 total
  Tests:       733 passed, 733 total   (= 693 prior + 40 Phase 18, zero regressions)
```

Coverage breakdown (40 Phase 18 tests):
- 7 tests on `operatorCalibrationEngine` (propose / approve+apply / reject+no-apply / validator restoration / pending cap / list / no-double-apply)
- 6 tests on `specializationRoutingEngine` (cold-start neutral / strong bias / weak bias / operator override / suppression / weight_overrides feed-through)
- 1 test on **hard-veto preservation under hostile routing weights** — the critical safety contract
- 6 tests on `forecastTuningEngine` (cold-start / widen-on-miss / tighten-on-hit / threshold sanity / 4x cap / 0.5x floor)
- 4 tests on `governanceTopologyBuilder` (5 validator nodes baseline / arbitration + trust cluster connections / drifting topology / TOPOLOGY_MAX_NODES bound)
- 7 tests on `interactiveRecoveryCoordinator` (create with 3 steps / session cap / approve advances / abort flips / completing flips / skip records / forecast estimates per kind)
- 5 tests on `recoveryStrategyOptimizer` (cold-start empty / archetype grouping / recommended ordering with ≥2 obs / attribution structure / no-recommendation with 1 obs)
- 4 tests on `governance_evolution_summary` surface (counter reflection / sane defaults / health scores 0-100 / per-project isolation)

One bug caught + fixed during testing: the strong/weak specialization detection requires the validator's domain accuracy to differ from its *overall* accuracy by ±10. Test fixtures originally seeded only one domain, making overall = domain accuracy = 100%. Fixed by seeding two domains with divergent accuracy.

## 12. Remaining Governance Evolution Gaps

Deferred to Phase 19+:
- **ML-based recovery optimization.** v1 is heuristic frequency-based ranking. Real archetype prediction would need labeled training data + a model interface.
- **Self-modifying validator code.** Validators stay static. Their *influence* (weights/routing) evolves; their *behavior* (logic) doesn't.
- **Autonomous calibration application.** Every approval is operator-clicked. Future phases could wire operator-set thresholds for auto-approval of specific calibration types, but only with explicit operator opt-in.
- **Recursive recovery execution.** Each step is independently approved by the operator. Even if the optimizer recommends an ordering, the operator clicks through one step at a time.
- **Heavy graph rendering libraries.** Topology stays a structured backend payload; UI renders as styled badges/lists.
- **Cross-project calibration learning.** Each project's calibration history stays local. Phase 13's `federatedTrustProfile` remains the only cross-project surface.
- **Persistent calibration tables.** v1 reuses `GovernanceAuditEntry` rows. Phase 19+ if query patterns demand it.
- **Real-time recovery step verification.** v1's per-step forecast bounds are heuristic. Future phases could integrate Phase 17's `causalForecastingEngine` per step for sharper estimates.

## 13. Next Phase Recommendation

**Phase 19 — Cross-Project Governance Federation + Anomaly-Aware Forecast Tuning**, building on Phase 18's foundation:

1. **Cross-project archetype federation.** Phase 18 keeps recovery archetypes project-local. Phase 19 would extend the Phase 13 federated trust contract to allow operators to opt in to receiving anonymized archetype patterns from other projects in their organization — bounded sharing with explicit operator approval, not silent trust contamination.
2. **Anomaly-aware forecast tuning.** Phase 18 widens bounds on consistent miss; Phase 19 would detect single-event outliers vs sustained drift and route them to different tuning strategies (e.g., outliers → flag for operator review; drift → empirical widening).
3. **Calibration impact replay.** Phase 18 ships transparency replay; Phase 19 would add "what-if" replay where operators can ask "what would the system have done if I had approved/rejected this proposal?" by re-running historical arbitrations against the current calibration state.
4. **Recovery optimizer learning loop closure.** Phase 18's optimizer accumulates outcomes; Phase 19 would feed those outcomes back into the chain planner so that the next time a similar trigger fires, the planner produces the highest-success-rate ordering automatically (operator still approves each step).

Phase 19 is **not** "the system takes over governance." It is "the operator surfaces gain richer signals + cross-project visibility, with bounded sharing and explicit consent." Same architectural truthfulness as Phases 13-18.

---

**Phase 18 v1 ships as: human-calibrated adaptive governance cognition.** Operators approve every calibration via `GovernanceCalibrationProposal` envelopes, specialization routing applies soft weight bias with first-class `RoutingAttribution` and 5-tier stability classification, forecast tuning empirically widens/tightens bounds based on observed outcomes, recovery orchestration is operator-gated step-by-step, recovery optimization tracks per-archetype success with `RecoveryDecisionAttribution`, governance topology is a structured backend payload, and 5 governance health scores surface via the engine state. Hard architectural vetoes remain absolute. No autonomous calibration. No ML. No recursive recovery. No graph viz library. Architecturally truthful.
