# Phase 16 Causality Replay + Distributed Validation Cognition — Validation Report

**Status:** Complete · The platform now performs **causal operational reasoning**: it builds a lineage DAG over historical mutations + contradictions + rollbacks, propagates trust decay across ancestry (depth-capped at 5, decay 0.5/gen), runs 5 distributed-cognition validators (pure scoring algorithms, NOT separate processes/agents) over each envelope with explainable rationale, arbitrates them into a consensus with confidence ranges + minority warnings + escalation flags, identifies originating root causes with first-class `CausalConfidenceAttribution` payloads, classifies operational spread (localized / branching / cascading / recurrent / isolated / suppressed) without faking SIR epidemiology, and surfaces a structured replay trace the dashboard can render. **Phase 16 explicitly does NOT spawn agent processes, run real epidemiology models, or autonomously roll back ancestors** — all three are deferred to later phases per the stress-test contract.
**Date:** 2026-05-07
**Scope:** Phase 16 — operational lineage graph, contradiction propagation tracker, causal trust propagation, distributed validation harness (5 validators), arbitration engine with confidence ranges, validator trust calibrator with disagreement profiles, root-cause analyzer with confidence attribution, causal stabilization engine with priority scoring, operational epidemiology classifier, recursion-safe replay engine, causality summary surface, frontend hooks + dashboard sections + 5 endpoints.

---

## 1. Files Created

**Backend causality directory** (`backend/src/intelligence/systemStateEngine/causality/`):
- `causalityTypes.ts` — every Phase 16 type. Hard caps exported as constants: `MAX_LINEAGE_DEPTH=5`, `TRUST_DECAY_PER_GENERATION=0.5`, `MAX_PROPAGATION_HOPS=5`, `MAX_REPLAY_TRACE_NODES=200`, `PROPAGATION_TEMPORAL_WINDOW_MS=30min`. Includes `MutationEnvelope`, `LineageNode/Edge`, `CausalConfidenceAttribution`, `ValidatorVerdict`, `ValidationArbitrationResult`, `ValidatorDisagreementProfile`, `ValidatorTrustProfile`, `RootCauseAnalysis`, `StabilizationPriorityScore`, `CausalStabilizationPlan`, `OperationalSpreadClassification` (6 classes), `OperationalEpidemiologyMap`, `CausalityReplayTrace`, `CausalitySummarySnapshot`.
- `mutationLineageGraph.ts` — DAG builder + `ancestorsOf` / `descendantsOf` / `depthOf`, all depth-capped at 5. Three edge-discovery passes: explicit provenance source_id (confidence 80, relation `caused`), rollback nodes targeting their subject mutation (confidence 100, relation `rolled_back`), and temporal+spatial co-occurrence within 30 min (confidence 50-65). Cycle-broken via topo-order DP.
- `contradictionPropagationTracker.ts` — `buildContradictionPropagationProfile` clusters contradictions by subject + kind within the temporal window, surfaces hotspots ranked by count, computes density. `isRecurrent` flags subjects appearing in successive windows.
- `causalTrustPropagation.ts` — `buildTrustPropagationMap` walks ancestors per node, accumulates `inherited_trust_decay = Σ (100 - ancestor_trust) × 0.5^generation` capped at depth 5, computes `effective_trust = own_trust × (1 - decay/100)`. Explicit cap means a single-bad-ancestor 5 generations back contributes ≤ 1/32 of its weakness.
- `distributedValidationHarness.ts` — 5 pure-function validator roles, each returning `ValidatorVerdict { confidence, recommendation, rationale, evidence, disagreement_flags, propagation_concerns, stabilization_recommendations }`: `mutation_validator`, `rollback_validator`, `trust_validator`, `containment_validator`, `blast_radius_validator`. `runAllValidators(ctx)` runs all five.
- `validationArbitrationEngine.ts` — `arbitrate({mutation_id, verdicts})` → `ValidationArbitrationResult { consensus_recommendation, consensus_confidence, confidence_range:{min,max}, minority_warning, arbitration_risk, escalation_required }`. Per-role weights (containment + blast = 1.5, others = 1.0). **Hard veto rule**: when `containment_validator` returns `reject` with confidence ≤ 20 (frozen / hard-contained intent), consensus becomes `reject` regardless of vote weights — frozen state is an architectural block, not a vote.
- `validatorTrustCalibrator.ts` — `recordArbitration` updates per-validator agreement counters AND per-validator-pair `ValidatorDisagreementProfile { disagreement_rate, disagreement_topics, confidence_divergence, arbitration_frequency, escalation_rate }`. Drift signal classifies validators as `stable`, `over_triggering`, `under_detecting`, `inconsistent`. `persistDisagreementAudit` writes a `validator_disagreement` audit row when consensus has dissenters.
- `rootCauseAnalyzer.ts` — `analyzeRootCauses` walks ancestry, scores each candidate with `CausalConfidenceAttribution` (composite of propagation_strength × 0.35 + contradiction_density × 0.30 + validator_agreement × 0.25 + severity bonus, minus depth_penalty = generations × 8), filters at confidence floor 25, surfaces top 5 with `stabilization_recommendation` + `rollback_targeting_suggestion` strings.
- `causalStabilizationEngine.ts` — `buildStabilizationPlan` produces `StabilizationPriorityScore` per node (`propagation_risk × 0.30 + contradiction_density × 0.25 + validator_consensus × 0.20 + trust_decay_impact × 0.25`), classifies via `OperationalSpreadClassification`, recommends actions: `contain_root` (≥70 score AND root) | `contain_descendants` (≥70) | `monitor` (≥45) | `noop`.
- `operationalEpidemiologyEngine.ts` — `buildOperationalEpidemiologyMap` per-subject `OperationalSpreadClassification` based on descendant subject count + containment/freeze flags + recurrent flag. Diffusion score = ratio of subjects touched in window.
- `causalityReplayEngine.ts` — `buildCausalityReplayTrace` produces ordered origin → target steps with deterministic annotations; recursion-safe via `MAX_REPLAY_TRACE_NODES=200` truncation flag.
- `causalitySummaryCounters.ts` — sync, in-memory rolling counters for the engine state's `causality_summary` block. `noteRootCauseDetected`, `noteUnstableBranch`, `noteValidatorConflict`, `noteTrustPropagationAlert`, `noteContradictionCluster`.

**Tests**
- `backend/src/intelligence/systemStateEngine/__tests__/phase16.test.ts` — 56 unit tests covering lineage DAG construction, edge inference rules, ancestry/descendants traversal, depth caps; contradiction temporal+spatial clustering, hotspot ranking, recurrent detection; trust decay math (specifically the 0.5/gen factor), depth-cap enforcement, worst_inherited_decay; all 5 validators with rationale + disagreement flags; arbitration consensus / confidence range / frozen veto / escalation; validator trust profile + disagreement profiles + drift signals; root-cause analyzer single-node + ancestry-with-penalty + rollback_targeting suggestion; stabilization classification + priority + actions; epidemiology classification + diffusion bound; replay trace ordering + bounded truncation; engine `causality_summary` surface presence + zero state + per-project isolation.

**Frontend hooks** (`frontend/src/hooks/`)
- `useOperationalLineage.ts` — fetches `/causality/lineage`; SSE auto-refresh on `causality.lineage.updated`, `mutation.execution.started`, `mutation.rollback.completed`.
- `useContradictionPropagation.ts` — fetches `/causality/propagation`; SSE refresh on `contradiction.propagation.detected`, `mutation.execution.failed`.
- `useCausalTrust.ts` — stream-only; subscribes to `trust.propagation.shifted`, surfaces history + max-decay summary.
- `useValidatorArbitration.ts` — action hook: `arbitrate(mutationId)` → fetches `/causality/validators/:mutation_id`, returns verdicts + arbitration + per-validator trust profile.
- `useRootCauseAnalysis.ts` — action hook: `analyze(mutationId)` → fetches `/causality/root-cause/:mutation_id`.
- `useCausalityReplay.ts` — composes `useOperationalLineage` with a client-side BFS ancestor walk (also depth-capped at 5) so the dashboard can render a replay timeline without a separate API call.

**Documentation**
- `docs/PHASE_16_CAUSALITY_REPLAY_DISTRIBUTED_VALIDATION_VALIDATION_REPORT.md` (this file).

## 2. Files Modified

- `backend/src/models/GovernanceAuditEntry.ts` — extended `GovernanceAuditKind` union with 5 new values: `causal_root_cause_detected`, `validator_disagreement`, `arbitration_completed`, `stabilization_branch_isolated`, `causality_lineage_updated`.
- `backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts` — extended `CognitiveEventKind` with 7 new event kinds: `causality.lineage.updated`, `contradiction.propagation.detected`, `trust.propagation.shifted`, `root_cause.detected`, `validation.disagreement`, `arbitration.completed`, `stabilization.branch_isolated`.
- `backend/src/intelligence/systemStateEngine/refreshTriggers.ts` — 2 new trigger reasons: `root_cause_detected`, `arbitration_completed`.
- `backend/src/intelligence/systemStateEngine/types/systemState.types.ts` — added optional `causality_summary` block on `AuthoritativeSystemState` (`active_root_causes`, `unstable_branches`, `validator_conflicts`, `trust_propagation_alerts`, `contradiction_clusters`, `last_updated`).
- `backend/src/intelligence/systemStateEngine/systemStateEngine.ts` — populates `causality_summary` synchronously in `buildAuthoritativeStateFromInputs` from `causalitySummaryCounters.readCausalitySummary`. Fail-soft try/catch.
- `backend/src/intelligence/systemStateEngine/index.ts` — re-exports all Phase 16 modules + types + the 5 hard architectural caps.
- `backend/src/routes/projectRoutes.ts` — 5 new endpoints (lineage, root-cause, propagation, validators, epidemiology) + an inline helper `buildProjectLineageGraph` that translates audit rows into lineage nodes.
- `frontend/src/components/operator/AutonomousExecutionDashboard.tsx` — extended in place with three new sections: Causal lineage (root/leaf badges + max-depth), Contradiction propagation hotspots (top 5 ranked by count), Causal trust propagation alerts (latest decay events).

## 3. Operational Lineage Status

`OperationalLineageGraph` is built from up to 7 days of audit rows (mutation envelopes, contradiction flags, rollback completions). Edges are heuristic with confidence scores:

| Edge type | When | Confidence |
|---|---|---|
| `caused` | provenance entry's `source_id` references another node's `node_id` | 80 |
| `rolled_back` | rollback node's `subject_id` matches a mutation's `mutation_id` | 100 |
| `caused` (inferred) | contradiction → mutation, same subject, within 30 min | 65 |
| `remediated` | mutation → remediation, same subject, within 30 min | 65 |
| `amplified` | mutation → contradiction, same subject, within 30 min | 65 |
| `contained` | mutation → stabilization, same subject, within 30 min | 65 |
| `co_occurred` | same subject, within 30 min, no specific kind match | 50 |

**Real example (sample run, 4 nodes, 25-min spacing)**:
```
graph: 4 nodes, 3 edges, root: c1 (contradiction), leaf: m3 (mutation), max_observed_depth: 3
edges:
  c1→m1   relation=caused      confidence=65   evidence=same subject cap-dashboard within 1500s
  m1→m2   relation=co_occurred confidence=50   evidence=same subject cap-dashboard within 1500s
  m2→m3   relation=co_occurred confidence=50   evidence=same subject cap-dashboard within 1500s

ancestorsOf(m3)   = [m2, m1, c1]
descendantsOf(c1) = [m1, m2, m3]
```

## 4. Contradiction Propagation Status

`ContradictionPropagationProfile` clusters contradictions by `(capability_id|task_id|'project') × kind` within a 30 min temporal window. Hotspots are ranked by count + worst severity.

**Real example (sample run, 3 contradictions on 2 subjects):**
```
clusters:
  cluster-cap-dashboard-telemetry_drift: 2 members (warning + error), density 0.67
  cluster-cap-leads-orphan_route:        1 member (info),             density 0.33

hotspots:
  cap-dashboard: 2 flags · worst=error
  cap-leads:     1 flag  · worst=info

total_contradictions_in_window: 3
```

## 5. Causal Trust Status

`CausalTrustPropagationMap` walks each node's ancestors up to depth 5, applying decay 0.5/gen.

**Real example (sample run, m1 trust = 0, others = 80):**
```
m1: own=0,  inherited_decay=10,  effective=0,  depth=1     // m1 inherits 10% decay from c1 (1 ancestor)
m2: own=80, inherited_decay=55,  effective=36, depth=2     // m2 inherits decay from m1 (weak parent) + c1
m3: own=80, inherited_decay=38,  effective=50, depth=3     // m3 further dampened by depth
worst_inherited_decay: 55
```

**Hard caps in action:**
- Single weak ancestor 5 gen back contributes ≤ (100-trust) × 0.5^5 = 1/32
- Ancestry traversal stops at depth 5 — even a 100-node chain is bounded

## 6. Root-Cause Analysis Status

`analyzeRootCauses` walks ancestors, scores each with `CausalConfidenceAttribution`, filters at confidence floor 25, returns top 5.

**`CausalConfidenceAttribution` shape (per the addendum):**
```
{
  node_id: "c1",
  root_cause_confidence: 0..100,
  supporting_evidence: ["3 descendants (1 error, 1 warning).", "Hotspot cap-dashboard carries 2 contradictions."],
  propagation_strength: 0..100,
  contradiction_density: 0..100,
  validator_agreement: 0..100,
  lineage_depth_penalty: gen * 8,
}
```

Each surfaced root carries a `stabilization_recommendation` ("Contain root + descendants via containMutationCascade(intent)" when confidence ≥ 70) and a `rollback_targeting_suggestion` (`POST /api/portal/project/governance/mutation/<id>/rollback (operator-confirmed)` for mutation roots).

## 7. Distributed Validation Status

5 validators, each pure functions returning explainable verdicts.

**Real example (sample run, healthy envelope):**
```
mutation_validator        confidence=75 → apply  flags=[no_scope_limits]
rollback_validator        confidence=80 → apply
trust_validator           confidence=90 → apply
containment_validator     confidence=90 → apply
blast_radius_validator    confidence=75 → apply
```

**Frozen-intent veto example (containment_validator detects frozen):**
```
containment_validator     confidence=5  → reject  flags=[intent_class_frozen]
[other 4 validators]      confidence=75-90 → apply
→ HARD VETO TRIGGERED → consensus = reject
```

## 8. Arbitration Status

`ValidationArbitrationResult` exposes the **confidence range**, not just a point value (per the addendum).

**Healthy arbitration:**
```
consensus_recommendation: apply
consensus_confidence: 82
confidence_range: { min: 75, max: 90 }
minority_warning: null
arbitration_risk: 9
escalation_required: false
```

**Frozen-veto arbitration (4 dissenters across the spread):**
```
consensus_recommendation: reject     (forced by hard veto)
consensus_confidence: 61
confidence_range: { min: 5, max: 90 }   // wide spread → high arbitration_risk
minority_warning: "Minority: mutation_validator→apply, rollback_validator→apply, trust_validator→apply, blast_radius_validator→apply"
arbitration_risk: 100
escalation_required: true
```

The wide confidence_range (5-90) tells a different story than the consensus (61) alone — operators see the full spread.

## 9. Operational Epidemiology Status

Classifications (per the addendum):

| Classification | Trigger |
|---|---|
| `localized`  | No descendants in lineage |
| `branching`  | 1-2 descendant subjects |
| `cascading`  | ≥3 descendant subjects |
| `recurrent`  | Subject appeared in prior window |
| `isolated`   | Subject in `already_contained_subjects` (Phase 15) |
| `suppressed` | Subject in `frozen_subjects` (Phase 15) |

Plus `diffusion_score` = ratio of subjects touched in the temporal window (0-100).

**Architectural truthfulness:** this is honest temporal+spatial clustering. There is **no SIR model**, no contagion-rate math, no actual epidemiology. The naming reflects the intuition (instability spreads); the implementation respects what data the platform actually has.

## 10. Causal Replay Status

`buildCausalityReplayTrace` produces a deterministic origin → target ordered list with bounded depth.

**Real example (target = m3):**
```
steps:
  [0] origin · contradiction · ⚠ warning · contradiction c1
  [1] step 1 · mutation     · info       · mutation m1
  [2] step 2 · mutation     · info       · mutation m2
  [3] target · mutation     · ⚠ warning  · mutation m3
truncated: false
```

Hard caps: `MAX_REPLAY_TRACE_NODES=200` truncates gracefully; `MAX_LINEAGE_DEPTH=5` bounds depth values.

## 11. Performance Report

Sample-run timings (synthetic in-memory inputs):
- Lineage graph construction (4 nodes, 3 edges): < 1ms
- Ancestor traversal (depth 5, 3 ancestors): < 1ms
- Trust propagation map (4 nodes): < 1ms
- 5-validator harness: < 2ms
- Arbitration: < 1ms
- Root-cause analysis: < 2ms
- Stabilization plan: < 2ms
- Epidemiology map: < 2ms
- Replay trace: < 1ms
- Validator trust profile read (after 3 arbitrations): < 1ms

Jest suite timings:
- 56 Phase 16 unit tests: ~63s wall (most time is Jest TS compile)
- Full systemStateEngine suite (646 tests across 16 suites): ~110s

No performance regressions detected against the Phase 15 baseline. All hot paths are sync, in-memory, and bounded by the architectural caps (`MAX_LINEAGE_DEPTH`, `MAX_REPLAY_TRACE_NODES`).

## 12. Test Results

```
$ npx tsc --noEmit (backend)        → exit 0
$ npx tsc --noEmit (frontend)       → exit 0
$ npx jest --testPathPattern phase16 --maxWorkers=1
  Test Suites: 1 passed, 1 total
  Tests:       56 passed, 56 total
$ npx jest --testPathPattern systemStateEngine --maxWorkers=1
  Test Suites: 16 passed, 16 total
  Tests:       646 passed, 646 total   (= 590 prior + 56 Phase 16, zero regressions)
```

Coverage breakdown (56 Phase 16 tests):
- 8 tests on `mutationLineageGraph` (empty / temporal / out-of-window / cross-subject / explicit provenance / depth-cap-ancestors / depth-cap-descendants / rollback edge / depth-of-root / depth_cap_constant)
- 5 tests on `contradictionPropagationTracker` (clustering / hotspot order / severity bubble / window cutoff / recurrent)
- 4 tests on `causalTrustPropagation` (decay constant / single root / 1-gen halving math / depth cap / worst tracking)
- 7 tests on `distributedValidationHarness` (runAll / mutation flags / rollback noop-only / rollback verification-failed / trust below floor / containment frozen / blast high)
- 6 tests on `validationArbitrationEngine` (healthy → apply / confidence_range / frozen veto / blast risk / escalation threshold / empty defensive)
- 5 tests on `validatorTrustCalibrator` (cold-start / agreement raises trust / disagreement profiles / extractDisagreements / drift over_triggering)
- 5 tests on `rootCauseAnalyzer` (target-as-root / depth penalty / rollback_targeting suggestion / supporting_evidence / floor sanity)
- 3 tests on `causalStabilizationEngine` (isolated classification / cascading classification / threshold sanity)
- 3 tests on `operationalEpidemiologyEngine` (localized / suppressed / diffusion bounds)
- 4 tests on `causalityReplayEngine` (empty target / origin→target ordering / annotation tags / cap constant)
- 3 tests on `AuthoritativeSystemState.causality_summary` (counter reflection / zero state / per-project isolation)
- 3 tests on `causalitySummaryCounters` increments

Each surface is exercised on both the happy path and at least one failure / edge case.

## 13. Remaining Causality Gaps

Deferred to Phase 17+:
- **Process-isolated validator agents.** v1 validators are pure scoring algorithms inside the engine. Spawning them as separate processes / sub-Claudes / sub-tasks needs different infrastructure (Agent SDK harness, queue contract, retry semantics).
- **Real epidemiology models (SIR / contagion / diffusion equations).** v1 is honest temporal+spatial clustering. Real models need labeled spread data we don't have yet.
- **Interactive graph visualization.** Backend produces structured `OperationalLineageGraph` + `CausalityReplayTrace` payloads; v1 frontend renders root/leaf badges + indented step lists. Force-directed graph rendering, zoom/pan, branch highlighting belong to Phase 17+.
- **Autonomous root-cause REVERSING.** Phase 16 ships root-cause TARGETING + recommendations. The actual ancestor rollback remains operator-driven via the existing `/mutation/:id/rollback` endpoint — the engine surfaces "this is the root, here's the path to roll it back if you want," but does not autonomously walk back through ancestors. Cross-causal rollback ordering (which ancestor first?) needs Phase 17+ design.
- **Cross-project causality.** Each project's lineage stays local. Federated trust + cross-project root-cause inference is Phase 18+.
- **Persistent lineage tables.** v1 reuses `GovernanceAuditEntry` rows. If query patterns demand it, Phase 17 can add a dedicated table.
- **Validator confidence calibration learning.** v1 tracks per-validator trust + disagreement profiles. Using those to dynamically adjust `ROLE_WEIGHTS` (so a validator with poor track record loses voting weight) is Phase 17+.

## 14. Next Phase Recommendation

**Phase 17 — Adaptive Validator Calibration + Causal Rollback Planning**, building on Phase 16's foundation:

1. **Adaptive validator weights.** Phase 16 captures per-validator trust + per-pair disagreement. Phase 17 closes the loop: validators with degraded trust lose voting weight; recurring high-conflict pairs get arbitration-time confidence haircuts. The plumbing is shipped — Phase 17 wires it.
2. **Operator-assisted ancestry rollback.** Phase 16 surfaces "the root is N generations back; here's the rollback target." Phase 17 ships the workflow: operator clicks "roll back ancestry," the engine plans the ordered rollback chain (deepest ancestor first or root-first depending on type), executes via the existing `mutationRollbackCoordinator`, and verifies with the existing causality stack. Bounded, operator-confirmed, fully audited.
3. **Validator confidence calibration learner.** Phase 16's `validatorTrustCalibrator` tracks agreement_rate over time. Phase 17 adds a learner that detects validators consistently mispredicting and either adjusts their internal thresholds (auto-recalibration with operator confirmation) or surfaces a "this validator is drifting" dashboard alert.
4. **Lineage replay UI v1.** Take the Phase 16 backend `CausalityReplayTrace` + frontend `useCausalityReplay` and build a proper indented timeline component (not just badges) — node icons, severity styling, click-to-pin, link to mutation envelope detail. No graph viz library; just a styled vertical list.

Phase 17 is **not** "agents take over." It is "the platform's existing causal reasoning gets sharper + the operator surfaces gain depth." Same architectural truthfulness as Phases 13-16.

---

**Phase 16 v1 ships as: causally aware distributed operational cognition.** The platform reasons over operational lineage, propagates trust causally with bounded depth + decay, runs 5 distributed-cognition validators with explainable rationale + confidence ranges + minority warnings + hard architectural vetoes, identifies originating root causes with first-class confidence attribution, classifies operational spread without faking epidemiology, and surfaces a structured replay trace — all bounded, replayable, trust-governed, operator-visible, and stabilization-aware. No agent swarms, no fake epidemiology, no autonomous ancestor rollback. Architecturally truthful.
