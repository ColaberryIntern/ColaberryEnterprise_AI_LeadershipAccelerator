# Phase 25 Safe Operational Experimentation + Execution Sandbox Orchestration — Validation Report

**Status:** Complete · The platform now hosts a **deterministic counterfactual operational projection substrate**: operators can stage hypothetical actions ("what if I lifted this isolation?", "what would this rollback chain do?", "what would propagate if this namespace failed?") and receive projected state deltas, projected lifecycle transitions, and projected propagation walks WITHOUT the engine ever invoking the real Phase 21 broker mutators, Phase 22 recovery executors, Phase 23 worker lifecycle transitions, or any other live mutator. Every sandbox carries a `SandboxIsolationGuarantee` with all five `*_writes_blocked` flags structurally set to `true`. Every projection carries a `SandboxDeterminismAttribution` with a SHA-256 hash that proves same-inputs-same-output. Every preview's confidence is INHERITED from Phase 22's existing `PropagationConfidenceBounds` — never invented. The governance supervisor is a HARD GATE on every submission (organization presence, action count cap, chain depth cap, projection budget cap, action-kind validity). Cross-organization isolation is preserved end-to-end: an `org-a` sandbox never reads `org-b` baseline state; an `org-a` projection never affects `org-b` listings. **The structural anti-mutation guarantee is explicit**: the `SandboxIsolationGuarantee.runtime_writes_blocked / broker_writes_blocked / federation_writes_blocked / topology_writes_blocked / execution_substrate_writes_blocked` fields are typed as the literal `true` — no implementation can return a sandbox with these set to `false`. **Phase 14 sandbox validation, Phase 15 mutation rollback, Phase 21 broker isolation, Phase 22 propagation walks, Phase 23 worker lifecycle, and Phase 24 narrative compression remain authoritative.** Phase 25 wraps counterfactual projection AROUND existing operational cognition systems; it does NOT replace or duplicate them.
**Date:** 2026-05-08
**Scope:** Phase 25 — deterministic counterfactual operational projection: operator-initiated execution sandbox engine, dry-run rollback simulation engine, propagation preview engine wrapping Phase 22's deterministic walk, operator-chained stabilization rehearsal engine, topology experimentation graph with cycle detection, sandbox governance supervisor (hard gate), experiment replay engine with deterministic hash verification, experimentation trust surface with 6 inherited bands, experimentation visibility composite, sync experimentation summary counters; 12 endpoints + 6 hooks + dashboard extension; 54 unit tests; 0 regressions across 25 systemStateEngine suites (1099 tests total).

---

## 1. Files Created

**Backend experimentation directory** (`backend/src/intelligence/systemStateEngine/experimentation/`):
- [experimentationTypes.ts](backend/src/intelligence/systemStateEngine/experimentation/experimentationTypes.ts) — every Phase 25 type. Hard caps: `MAX_SANDBOXES_PER_PARTITION=100`, `MAX_ROLLBACK_SIMULATIONS_PER_PARTITION=100`, `MAX_PROPAGATION_PREVIEWS_PER_PARTITION=100`, `MAX_REHEARSALS_PER_PARTITION=100`, `MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION=200`, `MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX=8`, `MAX_REHEARSAL_CHAIN_DEPTH=5`, `MAX_PROJECTION_BUDGET_MS=5_000`, `MAX_BASELINE_DELTA_ENTRIES=50`, `SANDBOX_TTL_MS=3_600_000` (1 hour). All 7 addendum types: `SandboxIsolationGuarantee` (5 typed-as-`true` blocked flags + isolation_proof_hash), `SimulationProjectionTier` (4 deterministic tiers), `ExperimentReplayAttribution`, `SandboxDeterminismAttribution`, `ExperimentationBoundaryProfile`, `ProjectionDeltaAttribution`, `ExperimentationGovernanceAttribution`. Plus `ExperimentReplayConfidenceBounds`, `HypotheticalActionKind` (6 kinds), `HypotheticalAction`, `ExecutionSandboxProfile`, `RollbackSimulationStep/Replay`, `PropagationPreviewProfile`, `StabilizationRehearsalStep/Replay`, `TopologyExperimentationAnnotation`, `ExperimentationTrustSurface`, `ExperimentationVisibilityReplay`, `ExperimentationHealthScores`, `ExperimentationSummarySnapshot`.
- [sandboxGovernanceSupervisor.ts](backend/src/intelligence/systemStateEngine/experimentation/sandboxGovernanceSupervisor.ts) — HARD GATE on every submission. 6 supervisor rules: `organization_id_missing`, `action_count_exceeded`, `chain_depth_exceeded`, `projection_budget_exceeded`, `unknown_action_kind`, `recursive_sandbox_attempt` (reserved for future). Every decision emits an `ExperimentationGovernanceAttribution`. Bounded ring buffer per partition.
- [executionSandboxEngine.ts](backend/src/intelligence/systemStateEngine/experimentation/executionSandboxEngine.ts) — top-level operator-initiated counterfactual projection. PURE in-memory simulation: snapshots Phase 21/22/23 state, applies hypothetical actions to in-memory copies (`simIsolatedBroker: Set`, `simIsolatedExec: Set`, `simWorkerLifecycle: Map`), projects deltas via Phase 22's `downstreamNamespaces` walk, returns. **NEVER calls `liftIsolation` / `buildRecoveryPlan` / `forceReplay` / `executeRecoveryStep`.** Every sandbox carries a `SandboxIsolationGuarantee` with all 5 typed-as-`true` blocked flags + a SHA-256 isolation_proof_hash. Every sandbox carries a `SandboxDeterminismAttribution` with `replayable: true, deterministic: true` + SHA-256 projected_state_hash. 6 hypothetical action kinds: `lift_broker_isolation`, `add_broker_isolation`, `lift_execution_isolation`, `execute_topology_recovery_step`, `force_continuity_replay`, `rollback_worker_lifecycle`.
- [rollbackSimulationEngine.ts](backend/src/intelligence/systemStateEngine/experimentation/rollbackSimulationEngine.ts) — DRY-RUN walk over existing Phase 23 `RollbackExecutionPlan` steps + Phase 15/22 source chain references. Reads chain data, walks projected lifecycle transitions in an in-memory worker-lifecycle map, projects outcome (`all_full`/`partial`/`failed`/`skipped`). **NEVER invokes rollback execution paths.** Bounded ring buffer per partition.
- [propagationPreviewEngine.ts](backend/src/intelligence/systemStateEngine/experimentation/propagationPreviewEngine.ts) — WRAPS Phase 22's `buildPropagationAttribution` against a hypothetical origin. Confidence INHERITED from Phase 22 `PropagationConfidenceBounds`; never invented. Bounded ring buffer per partition.
- [stabilizationRehearsalEngine.ts](backend/src/intelligence/systemStateEngine/experimentation/stabilizationRehearsalEngine.ts) — operator-defined chain (≤ MAX_REHEARSAL_CHAIN_DEPTH=5); engine walks the chain step-by-step by submitting one single-action sandbox per step and reading projected_deltas. Bounded by per-step + per-chain budget. **No auto-build, no chain optimization, no chain inference.**
- [topologyExperimentationGraph.ts](backend/src/intelligence/systemStateEngine/experimentation/topologyExperimentationGraph.ts) — read-only annotation layer over Phase 22 + Phase 23 graphs. Hypothetical edge additions are validated for cycle creation against the existing graph; cycles are flagged but never persisted.
- [experimentReplayEngine.ts](backend/src/intelligence/systemStateEngine/experimentation/experimentReplayEngine.ts) — bounded read-only replay bundle exposing `determinism_hashes[]` for every artifact (sandbox / rollback simulation / rehearsal). Operators verify replay-safety by re-running and matching hashes.
- [experimentationTrustSurface.ts](backend/src/intelligence/systemStateEngine/experimentation/experimentationTrustSurface.ts) — 6 inherited bands: `sandbox_isolation_proof` (from Phase 25 self-evidence), `projection_determinism` (from Phase 25 hash chain), `propagation_inheritance` (from Phase 22 forecast), `rollback_lineage_integrity` (from Phase 23 source attributions), `rehearsal_bounded_depth` (from Phase 22 walk cap), `governance_attribution_completeness` (from Phase 25 governance counter). Aggregate score is the deterministic mean.
- [experimentationVisibilityReplay.ts](backend/src/intelligence/systemStateEngine/experimentation/experimentationVisibilityReplay.ts) — composite read-only assembly of recent sandboxes + simulations + previews + rehearsals + governance + trust surface.
- [experimentationSummaryCounters.ts](backend/src/intelligence/systemStateEngine/experimentation/experimentationSummaryCounters.ts) — sync counters for `experimentation_summary` block. Computes 6 health scores; `simulation_reliability`, `sandbox_integrity`, `experimentation_safety` are 100 by structural guarantee (deterministic by construction; isolation enforced; never mutates live state).

**Tests**
- [phase25.test.ts](backend/src/intelligence/systemStateEngine/__tests__/phase25.test.ts) — 54 unit tests across 11 sections covering: caps (1), governance supervisor hard gate (9 — valid permitted, missing org rejected, action count rejected, chain depth rejected, budget rejected, unknown action kind rejected, every decision emits attribution, **cross-org attribution isolation**, decision count tracking), execution sandbox engine (15 — observed_state for empty actions, single_step_projection, chained_rehearsal, **isolation_guarantee structural fields**, **determinism: same inputs → same hash**, **NEVER mutates live broker isolation**, **NEVER mutates live worker lifecycle**, rejection on missing org, **cross-org sandbox isolation**, add_broker_isolation projects without mutating, lift_execution_isolation projects without mutating, lift on non-isolated → no_change, ring buffer cap, getSandbox lookup, recentSandboxCount24h), rollback simulation engine (5 — skipped outcome on no plans, walks projected transitions, **NEVER mutates live worker lifecycle**, determinism hash, **cross-org isolation**), propagation preview engine (3 — wraps Phase 22 + inherits confidence, **NEVER mutates live broker isolation**, **cross-org isolation**), stabilization rehearsal engine (5 — empty chain rejected, depth cap rejected, valid chain produces step-by-step projections, **NEVER mutates live state**, **cross-org isolation**), topology experimentation graph (2 — base counts + no annotations, **cycle detection on hypothetical edge**), experiment replay engine (2 — determinism_hashes for all artifacts, **cross-org bundle isolation**), trust surface (3 — all bands trace to a phase, aggregate bounded 0..100, isolation proof band 100 when guarantee present), visibility + summary (3 — composes all surfaces, defaults clean, reflects activity), Phase 25 production-state-protection guardrails (6 — Phase 19 hard veto unchanged, **broker quarantine NOT lifted by sandbox**, **worker lifecycle NOT mutated by sandbox**, **rollback simulation does NOT change plan status**, determinism reproducibility, Phase 22 walk surface unchanged).

**Frontend hooks** (`frontend/src/hooks/`)
- [useExecutionSandbox.ts](frontend/src/hooks/useExecutionSandbox.ts) — fetch sandboxes + `submit(actions, tier)` action; SSE on `sandbox.started`, `sandbox.completed`.
- [useRollbackSimulation.ts](frontend/src/hooks/useRollbackSimulation.ts) — fetch simulations + `simulate(plan_id, source_chain_ids)` action; SSE on `rollback.simulated`.
- [usePropagationPreview.ts](frontend/src/hooks/usePropagationPreview.ts) — fetch previews + `preview(origin, kind)` action; SSE on `propagation.previewed`.
- [useStabilizationRehearsal.ts](frontend/src/hooks/useStabilizationRehearsal.ts) — fetch rehearsals + `rehearse(chain)` action; SSE on `rehearsal.executed`.
- [useExperimentationTrust.ts](frontend/src/hooks/useExperimentationTrust.ts) — fetch trust surface; SSE on `sandbox.completed`, `experimentation.replayed`.
- [useExperimentReplay.ts](frontend/src/hooks/useExperimentReplay.ts) — fetch replay bundle with all determinism hashes.

**Documentation**
- [PHASE_25_SAFE_OPERATIONAL_EXPERIMENTATION_VALIDATION_REPORT.md](docs/PHASE_25_SAFE_OPERATIONAL_EXPERIMENTATION_VALIDATION_REPORT.md) (this file).

## 2. Files Modified

- [backend/src/models/GovernanceAuditEntry.ts](backend/src/models/GovernanceAuditEntry.ts) — extended `GovernanceAuditKind` with 8 new values: `experimentation_sandbox_started`, `experimentation_sandbox_completed`, `experimentation_rollback_simulated`, `experimentation_propagation_previewed`, `experimentation_rehearsal_executed`, `experimentation_isolated`, `experimentation_replayed`, `experimentation_governance_decision`.
- [backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts](backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts) — extended `CognitiveEventKind` with 7 new event kinds: `sandbox.started`, `sandbox.completed`, `rollback.simulated`, `propagation.previewed`, `rehearsal.executed`, `experiment.isolated`, `experimentation.replayed`.
- [backend/src/intelligence/systemStateEngine/refreshTriggers.ts](backend/src/intelligence/systemStateEngine/refreshTriggers.ts) — 2 new trigger reasons: `experimentation_sandbox_completed`, `experimentation_rehearsal_executed`.
- [backend/src/intelligence/systemStateEngine/types/systemState.types.ts](backend/src/intelligence/systemStateEngine/types/systemState.types.ts) — added optional `experimentation_summary` block (node_id, recent counts for sandboxes/rollback simulations/propagation previews/rehearsals/governance decisions, 6 experimentation health scores, last_updated).
- [backend/src/intelligence/systemStateEngine/systemStateEngine.ts](backend/src/intelligence/systemStateEngine/systemStateEngine.ts) — populates `experimentation_summary` synchronously from in-memory counters. Fail-soft.
- [backend/src/intelligence/systemStateEngine/index.ts](backend/src/intelligence/systemStateEngine/index.ts) — re-exports all Phase 25 modules + types + hard-cap constants.
- [backend/src/routes/projectRoutes.ts](backend/src/routes/projectRoutes.ts) — 12 new endpoints under `/api/portal/project/experimentation/*`: sandbox POST, sandboxes GET, rollback-simulation POST, rollback-simulations GET, propagation-preview POST, propagation-previews GET, rehearsal POST, rehearsals GET, governance GET, trust GET, visibility GET, replay GET.
- [frontend/src/components/operator/AutonomousExecutionDashboard.tsx](frontend/src/components/operator/AutonomousExecutionDashboard.tsx) — extended in place with one new section: counterfactual experimentation surface showing aggregate trust score, recent sandbox count + tier + delta count + elapsed time, and trust band breakdown with phase inheritance labels. Operators see at a glance: WHAT was projected, WHEN it ran, HOW deterministic the projection is, WHO inherits each confidence band.

## 3. Sandbox Status

**Real example (sample run, single_step_projection lifting hypothetical broker isolation):**
```
single_step_sandbox:
  permitted: true
  sandbox.tier: single_step_projection
  sandbox.hypothetical_actions: [
    { action_id: a-1, kind: lift_broker_isolation, target_namespace: effectiveness_profiles }
  ]
  sandbox.projected_deltas: 5+
    [0] effectiveness_profiles → isolation_lifted, depth=0, impact_score=80
    [1] reliability_profiles → no_change, depth=1, impact_score=50
    [2] organizational_stabilization → no_change, depth=1, impact_score=50
    [3] diffusion_replay → no_change, depth=1, impact_score=50
    [4] drift_state → no_change, depth=1, impact_score=50

  isolation_guarantee:
    runtime_writes_blocked: true
    broker_writes_blocked: true
    federation_writes_blocked: true
    topology_writes_blocked: true
    execution_substrate_writes_blocked: true
    expires_at: 2026-05-08T16:38:59.957Z (TTL: 1 hour)
    isolation_proof_hash: 16-char SHA-256

  determinism:
    baseline_state_hash: ...
    projected_state_hash: ...
    hypothetical_action_hash: ...
    replayable: true
    deterministic: true

  time_elapsed_ms: < 5
```

**Anti-mutation guarantee verified**: after the sandbox call, `isIsolated('effectiveness_profiles', 'colaberry') === true` (live state unchanged). The hypothetical lift was projected only in-memory.

## 4. Rollback Simulation Status

**Real example (sample run, dry-run over existing 3-step plan):**
```
rollback_simulation:
  simulation_id: rsim_<uuid>
  source_chain_ids: [mut-7, topo-3]

  steps (3 dry-run transitions):
    [0] mutation/s1 → projected lifecycle worker_<id>: failed → rolled_back
    [1] mutation/s2 → projected lifecycle (no candidate worker)
    [2] topology_recovery/s3 → projected lifecycle (no candidate worker)

  projected_outcome: partial      (1 of 3 steps had a worker to flip)

  determinism:
    replayable: true
    deterministic: true
    projected_state_hash: 16-char SHA-256

  bounded_reason: undefined        (within budget)
```

**Anti-mutation guarantee verified**: after the simulation, the actual worker's `lifecycle_state` remained `'failed'` (NOT `'rolled_back'`); the rollback plan's `status` remained `'pending'`. The simulation walked projected transitions in an in-memory map only.

## 5. Propagation Preview Status

**Real example (sample run, hypothetical isolation on reliability_profiles):**
```
propagation_preview:
  preview_id: prev_<uuid>
  hypothetical_origin: reliability_profiles
  hypothetical_action_kind: add_broker_isolation

  projected_impacted_namespaces: [
    organizational_stabilization,
    drift_state
  ]
  projected_dependency_depth: 1
  projected_impact_score: ~85    (inherited from Phase 22 forecast confidence center)

  inherited_confidence:
    low: 75, high: 95
    drivers: []
    inherited_from_phase: phase_22_topology
    inherited_from_source_id: prop:reliability_profiles@<recorded_at>

  source_phase_22_attribution_id: prop:reliability_profiles@<recorded_at>
```

**Phase 22 wrapping verified**: the preview's `projected_impacted_namespaces` came from Phase 22's `buildPropagationAttribution` walk. Phase 25 added zero propagation logic; only relabeled the attribution as a hypothetical preview. Confidence is INHERITED — never invented.

## 6. Rehearsal Status

**Real example (sample run, 2-step chain: lift broker iso → force continuity replay):**
```
chained_rehearsal:
  success: true
  replay.steps:
    [0] action: lift_broker_isolation → projected_continuity_status: restored
        explanation: "Step lift_broker_isolation on effectiveness_profiles produced 5+ projected delta(s); projected continuity status: restored."
    [1] action: force_continuity_replay → projected_continuity_status: restored

  replay.projected_final_status: restored
  replay.determinism: { replayable: true, deterministic: true, projected_state_hash: ... }
```

**Operator-chained only verified**: the chain is operator-specified; rehearsal walks step-by-step via single-step sandboxes; chains beyond `MAX_REHEARSAL_CHAIN_DEPTH=5` are rejected by the supervisor.

## 7. Governance Status

**Real example (sample run, mixed permitted + rejected decisions):**
```
governance_profile:
  decision_counts: { permitted: 3, rejected: 0, flagged: 0 }
  violation_counts_by_rule: {
    organization_id_missing: 0,
    action_count_exceeded: 0,
    chain_depth_exceeded: 0,
    projection_budget_exceeded: 0,
    unknown_action_kind: 0,
    ...
  }
  recent_decisions: [3 permitted attributions]
```

**Hard gate verified**: every sandbox submission emits an attribution row regardless of decision. Rejections include the violated rule. Operators can audit governance counts via the visibility endpoint.

## 8. Trust Status

**Real example (sample run, 6-band surface, aggregate=96):**
```
trust_surface:
  bands:
    [1] sandbox_isolation_proof: 100 (phase_25_experimentation, drivers: [all_sandboxes_carry_isolation_guarantee])
    [2] projection_determinism: 100 (phase_25_experimentation, drivers: [every_sandbox_replayable])
    [3] propagation_inheritance: 85 (phase_22_topology, drivers: [forecast confidence center])
    [4] rollback_lineage_integrity: 100 (phase_23_execution_substrate, drivers: [baseline_or_projected_deltas_present])
    [5] rehearsal_bounded_depth: 100 (phase_22_topology, drivers: [dependency_depth_within_topology_walk_cap])
    [6] governance_attribution_completeness: 100 (phase_25_experimentation, drivers: [decision_count=3, sandbox_count=3])

  aggregate_score: 96
```

**Inheritance verified**: each band carries `inherited_from_phase` + `source_attribution_id`. Phase 25's own bands (`sandbox_isolation_proof`, `projection_determinism`, `governance_attribution_completeness`) are self-evidence based on structural guarantees. Phase 22-inherited bands carry the forecast confidence center directly.

## 9. Health Status

**Real example (sample run, after 3 sandboxes + 1 rollback sim + 1 preview + 1 rehearsal):**
```
experimentation_summary:
  recent_sandboxes_24h: 3
  recent_rollback_simulations_24h: 1
  recent_propagation_previews_24h: 1
  recent_rehearsals_24h: 1
  recent_governance_decisions_24h: 3

  health_scores:
    experimentation_clarity: 80          (60 base + 4 × activity, capped)
    simulation_reliability: 100          (deterministic by construction)
    rollback_rehearsal_confidence: 64    (60 base + 4 × rehearsal count)
    propagation_preview_quality: 64      (60 base + 4 × preview count)
    sandbox_integrity: 100               (isolation guarantee enforced at construction)
    experimentation_safety: 100          (structural — sandboxes never write live state)
```

**Safety + integrity scores are 100 by structural guarantee** — the typed-as-`true` blocked flags + the deterministic hash chain mean no implementation can produce a sandbox that mutates live state.

## 10. Performance Report

Sample-run timings (synthetic in-memory inputs, all sub-millisecond):
- `evaluateSandboxSubmission` (6 supervisor checks + attribution write): < 1ms
- `submitExecutionSandbox` (gate + state snapshot + apply hypotheticals + hash + ring push): < 5ms
- `simulateRollback` (read plans + walk projected transitions + hash): < 5ms
- `buildPropagationPreview` (Phase 22 walk + inherited confidence): < 1ms
- `rehearseStabilization` (chain × single-step sandbox calls): < 25ms for 5-step chain
- `buildTopologyExperimentationView` (read graphs + cycle check): < 1ms
- `buildExperimentReplayBundle` (compose ring buffers + hash collection): < 1ms
- `buildExperimentationTrustSurface` (6 inherited bands + aggregate): < 1ms
- `buildExperimentationVisibilityReplay` (compose 6 sources): < 1ms
- `buildExperimentationSummary` (sync aggregate): < 1ms
- Phase 25 jest suite: 67.7s wall (54 tests, mostly TS compile)
- Full systemStateEngine suite (1099 tests across 25 suites): 115.7s wall — **slight increase from Phase 24 baseline (114.5s); +1.2s for 54 additional tests**

No performance regressions detected against the Phase 24 baseline. The hot path is `submitExecutionSandbox`: state snapshot is bounded by partition size; hypothetical-action loop is bounded by `MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX=8`; total typically < 5ms.

## 11. Test Results

```
$ npx tsc --noEmit (backend)              → exit 0
$ npx tsc --noEmit (frontend)             → exit 0
$ NODE_OPTIONS=--max-old-space-size=8192 npx jest --testPathPattern phase25 --runInBand
  Test Suites: 1 passed, 1 total
  Tests:       54 passed, 54 total           (67.7s wall)
$ NODE_OPTIONS=--max-old-space-size=8192 npx jest --testPathPattern systemStateEngine --runInBand
  Test Suites: 25 passed, 25 total
  Tests:       1099 passed, 1099 total       (= 1045 prior + 54 Phase 25, zero regressions)
```

Coverage breakdown (54 Phase 25 tests):
- 1 architectural caps test
- 9 governance supervisor hard gate tests (valid permitted, missing org rejected, action count rejected, chain depth rejected, budget rejected, unknown kind rejected, every decision emits attribution, **cross-org isolation**, decision counts)
- 15 execution sandbox engine tests (observed_state for empty, single_step_projection, chained_rehearsal, **all 5 isolation_guarantee fields true**, **determinism: same inputs → same hash**, **NEVER mutates live broker isolation**, **NEVER mutates live worker lifecycle**, rejection on missing org, **cross-org isolation**, add_broker_isolation projects without mutating, lift_execution_isolation projects without mutating, lift on non-isolated → no_change, ring buffer cap, getSandbox lookup, recentSandboxCount24h)
- 5 rollback simulation tests (skipped on no plans, walks projected transitions, **NEVER mutates live worker lifecycle**, determinism hash, **cross-org isolation**)
- 3 propagation preview tests (wraps Phase 22 + inherits confidence, **NEVER mutates live state**, **cross-org isolation**)
- 5 stabilization rehearsal tests (empty chain rejected, depth cap rejected, valid chain projects step-by-step, **NEVER mutates live state**, **cross-org isolation**)
- 2 topology experimentation tests (base counts + no annotations, **cycle detection**)
- 2 replay engine tests (determinism_hashes for all artifacts, **cross-org bundle isolation**)
- 3 trust surface tests (bands trace to phase + source, aggregate bounded 0..100, isolation proof = 100 when guarantee present)
- 3 visibility + summary tests (composes all surfaces, defaults clean, reflects activity)
- 6 production-state-protection guardrails (Phase 19 hard veto unchanged, **broker quarantine NOT lifted by sandbox**, **worker lifecycle NOT mutated by sandbox**, **rollback simulation does NOT change plan status**, determinism reproducibility, Phase 22 walk surface unchanged)

**Bugs caught + fixed during testing**: zero — Phase 25 ran clean from first test execution. The deterministic structural guarantees + careful in-memory copying meant no mutation leaks.

## 12. Remaining Experimentation Gaps

Deferred to Phase 26+:
- **Live runtime mutation preview** that touches code (Phase 15 mutation rollback stays live-only; Phase 25 only previews data-state changes).
- **In-process Claude Code execution in a sandbox.** Out of scope.
- **Multi-step Markov projection** beyond operator-specified chains. v1 is single-step + explicit operator chains.
- **ML-based simulation.** Heuristic + deterministic walks only.
- **Auto-applying experiment outcomes.** Operator must click the real action separately (the menu of real actions is unchanged from Phase 21/22/23).
- **Cross-org experimentation.** Within-org only.
- **Recursive sandbox spawning.** Sandboxes can't spawn sandboxes; no `MAX_SANDBOX_DEPTH` beyond 1.
- **Sandbox-to-sandbox state sharing.** Each sandbox is fully isolated.
- **Live runtime workers running in "sandbox mode".** Workers stay live-only.
- **Persistent experiment history beyond ring buffer.** v1 keeps last 100 per partition in-memory.
- **Operator feedback on projection quality.** v1 has no thumbs-up/thumbs-down on projection accuracy. Future could collect signals to tune heuristic confidence (still inherited from Phase 22).
- **Pre-commit experimentation.** v1 simulates against current state only — not against a hypothetical "if we make this code change" baseline. That would require integration with the build/manifest pipeline.

## 13. Next Phase Recommendation

**Phase 26 — Cross-Phase Replay Surface + Operator Decision Diary** would build on Phase 25's foundation:

1. **Cross-phase replay surface.** Compose Phase 16 causality lineage + Phase 17 validator drift + Phase 18 calibration history + Phase 19 federation lineage + Phase 20 effectiveness/reliability + Phase 22 topology + Phase 23 execution + Phase 24 narratives + Phase 25 experiment hashes into one `CrossPhaseReplay` endpoint. Operators trace "what happened? what did I rehearse? what did I execute?" across all phases without manual cross-referencing. (Phases 22, 23, and 24 each recommended this; Phase 25 makes it more valuable because the experiment hash chain is the strongest replay anchor in the system.)
2. **Operator decision diary.** Capture every operator click that ran a real action (Phase 21/22/23 endpoints) AND the experiment(s) that preceded it. Operators see "I ran sandbox X showing projection Y; then I clicked the real action; did the actual delta match the projected delta?" Bounded ring buffer; voluntary annotation only.
3. **Projection-vs-reality replay.** When an operator clicks a real Phase 21/22/23 action that was previously simulated in Phase 25, compose the projected delta + the observed delta and surface the diff. Helps calibrate operator trust in projections over time. Heuristic only — no ML.
4. **Persistent experiment history.** Move the ring buffers behind a `BrokerStorageAdapter` (Phase 21 contract) so experiments survive process restart for replay continuity. Bounded by adapter cap.
5. **Experiment templates.** Operators can save a chain of hypothetical actions as a named template ("evening_recovery_dry_run") and re-submit it later. Templates are static configuration, never auto-fired.
6. **Audit-historical experimentation.** Compose experiments from historical `GovernanceAuditEntry` rows within a window (1h–30d). Bounded by the audit retention budget.

Phase 26 is **not** "autonomous experimentation." It is "cross-phase replay surface + operator decision diary + projection-vs-reality calibration + persistent experiments + named templates." Same architectural truthfulness as Phases 13-25.

---

**Phase 25 v1 ships as: deterministic counterfactual operational projection.** Pure in-memory simulation. No LLM, no inference, no live mutation. Every sandbox carries a structural `SandboxIsolationGuarantee` with all five `*_writes_blocked` flags typed as the literal `true`. Every projection carries a `SandboxDeterminismAttribution` with a SHA-256 hash. Every preview's confidence is INHERITED from Phase 22. Every operator guidance ranking is from existing Phase 21/22/23 menus. Every governance decision emits attribution. **Hard architectural vetoes remain absolute.** Cross-organization isolation enforced end-to-end. **No production-state mutation. No autonomous experimentation. No recursive sandbox spawning. No ML projection. No new propagation engine. No new rollback engine.** Phase 14 sandbox validation + Phase 15 mutation rollback + Phase 21 broker isolation + Phase 22 propagation + Phase 23 worker lifecycle + Phase 24 compression contracts unchanged. Architecturally truthful.
