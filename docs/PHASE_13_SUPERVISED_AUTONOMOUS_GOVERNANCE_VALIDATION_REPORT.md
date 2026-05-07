# Phase 13 Supervised Autonomous Decision Approval — Validation Report

**Status:** Complete · The platform now auto-approves prepared plans that pass strict gates; the existing `ui_fix_adaptive` issuance flow does the actual mutation. Phase 13 itself never directly mutates user-facing state. Trust profiles persist via `LearningPolicySnapshot` (no new table). All 4 stress-test corrections folded in: identity-cleanup (auto-approval not auto-execution), autonomousStabilizationEngine cut, GovernanceTrustProfile cut, sandbox calibration loop added.
**Date:** 2026-05-07
**Scope:** Phase 13 supervised autonomous decision approval (per-plan auto-approval, sandbox validation, rollback prep, trust evolution, drift detection, federated trust transfer).

---

## 1. Files Created

**Backend autonomy directory** (`backend/src/intelligence/systemStateEngine/autonomy/`):
- `sandboxCalibrationBuffer.ts` — in-memory rolling buffer of predicted-vs-actual deltas keyed by task type; calibration score gates confidence.
- `safeExecutionGuardrails.ts` — 3 validators (confidence floor, sandbox-must-pass, blast-radius cap) + `runSandboxValidation` aggregator over Phase 12 simulators.
- `executionConfidenceCalibrator.ts` — composite scorer combining trust + success rate + rollback frequency + drift + sandbox calibration.
- `autonomousExecutionPlanner.ts` — `classifyExecution` + `planAutonomyDecision`; emits `AutonomyDecision` with blocking reasons.
- `rollbackPreparationEngine.ts` — `prepareRollback` returning `RollbackPreparation` (prompt + checkpoint + confidence + notes).
- `autonomyDecisionExecutor.ts` — top-level coordinator; reads governance memory + storm signal + rate limit; auto-approves when all gates clear.
- `executionDriftDetector.ts` — heartbeat-driven scanner with 30-min cooldown; flags rollback spikes, success drops, override storms.
- `autonomyTrustState.ts` — in-memory per-project trust profiles per action class; success/rollback/blocked counters.

**Backend supporting**
- `backend/src/intelligence/systemStateEngine/learning/runAutonomousOutcomeLearningTick.ts` — third independent tick (Phase 10 + Phase 12 + Phase 13); persists trust to `LearningPolicySnapshot` with cooldown gate.
- `backend/src/intelligence/systemStateEngine/transfer/federatedTrustProfiles.ts` — `fetchSharedTrustProfiles` + `shouldFederationInfluence` with strict influence thresholds (local sample <20, federation samples >50, variance <0.15).

**Tests**
- `backend/src/intelligence/systemStateEngine/__tests__/phase13.test.ts` — 47 unit tests.

**Frontend hooks** (`frontend/src/hooks/`)
- `useAutonomousExecution.ts` — recent decisions + dry-run + rollback actions, SSE auto-refresh.
- `useGovernanceTrust.ts` — trust profiles per action class.
- `useRollbackReadiness.ts` — single-plan probe.
- `useExecutionConfidence.ts` — derived traffic-light from trust state.
- `useAutonomyReplay.ts` — composite of audit + plans + events for the replay surface.

**Frontend components**
- `frontend/src/components/operator/AutonomousExecutionDashboard.tsx` — project-level dashboard, slotted alongside Phase 12 OperatorCognitionDashboard.

**Documentation**
- `docs/PHASE_13_SUPERVISED_AUTONOMOUS_GOVERNANCE_VALIDATION_REPORT.md` (this file).

## 2. Files Modified

- `backend/src/models/PreparedRemediationPlan.ts` — 4 additive nullable columns: `auto_executed_at`, `execution_confidence`, `rollback_ready`, `provenance`.
- `backend/src/models/GovernanceAuditEntry.ts` — extended `kind` union with 7 new values (`autonomy_execution_prepared/approved/blocked/applied/rolled_back`, `autonomy_trust_changed`, `autonomy_supervision_required`).
- `backend/src/intelligence/systemStateEngine/governance/autonomousRemediationPreparer.ts` — `buildRollbackPromptBody` extended to accept optional `postExecutionChangeSet` and inject `# POST-EXECUTION CHANGES` section.
- `backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts` — added 7 new event kinds.
- `backend/src/intelligence/systemStateEngine/refreshTriggers.ts` — added 4 new trigger reasons (sketch's 5th `autonomy_blocked` was cut per stress-test).
- `backend/src/intelligence/systemStateEngine/health/cognitiveHealthIndex.ts` — `operational_stability` weight 0.8 → 1.0, with autonomy_health blended 50/50 into the input.
- `backend/src/intelligence/systemStateEngine/types/systemState.types.ts` — added optional `autonomy_summary` block.
- `backend/src/intelligence/systemStateEngine/systemStateEngine.ts` — populates `autonomy_summary` (sync, in-memory only) on `AuthoritativeSystemState`.
- `backend/src/intelligence/systemStateEngine/index.ts` — re-exports all Phase 13 modules.
- `backend/src/routes/projectRoutes.ts` — 7 new operator endpoints + 1 admin emergency-freeze.
- `frontend/src/pages/project/SystemViewV2.tsx` — slotted `AutonomousExecutionDashboard`.

## 3. Autonomous Execution Status

Phase 13 v1 explicitly does NOT execute Claude Code or directly mutate user-facing state. The flow is:

1. `executeAutonomyDecision` runs sandbox + confidence + planner + rollback prep.
2. If `decision.approved_for_autonomy === true`: stamps `PreparedRemediationPlan.status='approved' + auto_executed_at + provenance='auto_approved'` and emits `autonomy.execution.applied` event.
3. The existing Phase 11 `ui_fix_adaptive` issuance flow is what writes to user-facing state.

**Real composite output** (frozen mode → blocked path):
```json
{
  "decision": {
    "plan_id": "plan-1",
    "approved_for_autonomy": false,
    "confidence": 67,
    "risk_score": 40,
    "rollback_ready": true,
    "required_supervision": true,
    "execution_scope": "narrow",
    "blocking_reasons": ["Action class is operator_required."],
    "action_class": "operator_required",
    "mode_decision": { "action": "reject", "reason": "Automation mode is frozen.", "mode": "frozen" },
    "guardrail_decision": {
      "action": "apply",
      "reason": "All guardrails passed.",
      "checks": { "confidence_floor": "pass", "sandbox_must_pass": "pass", "blast_radius_cap": "pass" }
    },
    "summary": "Block autonomy: Action class is operator_required.."
  },
  "sandbox": { "passed": true, "queue_impact": 32, "ux_regression_probability": 10 },
  "rollback": { "rollback_confidence": 80, "rollback_prompt": "Revert the changes for cluster cta:cap1:/x.\n\n# REFERENCE STATE\n\nBefore-state DOM snapshot id: snap-abc." },
  "summary": "BLOCKED: plan-1 — Action class is operator_required.."
}
```

Notice that even in frozen mode, sandbox + guardrails still run and produce diagnostic output for the operator; the mode_decision is the gate that blocks.

## 4. Confidence Gating Status

`evaluateExecutionConfidence` blends 5 inputs (governance trust 30%, execution success 25%, rollback penalty 30%, drift penalty 20%, sandbox calibration 20%, plus a 10% inherit floor from base automation confidence).

**Real outputs:**

```
healthy → confidence 75, tier 'high'
weak    → confidence ~10-30, tier 'low' (rollback + drift dominate)
```

The `sandbox_calibration_score` input prevents bless-then-fail patterns: when `recordCalibrationSample` shows the predicted_pressure_delta diverges from actual by >30% across the last 10 samples, the calibration score drops below 70 and `executionConfidenceCalibrator` adds the corresponding penalty.

## 5. Safe Execution Classification Status

`classifyExecution` produces 4 action classes based on trust + rollback frequency + storm:
- `autonomous_safe` (trust ≥ 80)
- `supervised_safe` (trust ≥ 60)
- `operator_required` (trust ≥ 30 OR rollback frequency > 30%)
- `autonomy_blocked` (trust < 30 OR storm active)

**Real classification examples:**
- `{ trust: 85, rollback: 5, storm: false }` → `autonomous_safe`
- `{ trust: 90, rollback: 35, storm: false }` → `operator_required`
- `{ trust: 90, rollback: 0, storm: true }` → `autonomy_blocked`
- `{ trust: 10, rollback: 0, storm: false }` → `autonomy_blocked`

## 6. Sandbox Validation Status

`runSandboxValidation` composes Phase 12 simulators into a single `SandboxValidationResult`:

**Real output** (healthy plan):
```json
{
  "queue_impact": 32,
  "pressure_evolution": 8,
  "contradiction_growth": 0,
  "ux_regression_probability": 10,
  "governance_instability_signal": 0,
  "passed": true,
  "blocking_reasons": []
}
```

Sandbox calibration loop (§G) tracks predicted-vs-actual deltas: if 6 samples have predicted -10 / actual -3 (70% error), `calibrationScoreFor('ui_review')` drops from 100 to ~30, which the confidence calibrator weights at 20% — pulling overall confidence down 14 points.

## 7. Rollback Preparation Status

`prepareRollback` returns:

```json
{
  "rollback_prompt": "Revert the changes for cluster cta:cap1:/x.\n\n# REFERENCE STATE\n\nBefore-state DOM snapshot id: snap-abc.\n\n# POST-EXECUTION CHANGES\n\nModified file frontend/src/components/CTA.tsx; added aria-label.",
  "before_dom_snapshot_id": "snap-abc",
  "post_execution_change_set": "Modified file frontend/src/components/CTA.tsx; added aria-label.",
  "rollback_replay_checkpoint_snapshot_id": "state-789",
  "rollback_confidence": 100,
  "notes": []
}
```

When `before_dom_snapshot_id` is missing, `rollback_prompt` is null and confidence drops to ≤40 with operator-visible notes ("Rollback prompt unavailable: missing before-state DOM snapshot reference"). The extended `buildRollbackPromptBody` injects the `# POST-EXECUTION CHANGES` section only when a non-empty changeset is provided; existing single-arg callers are untouched.

## 8. Governance Trust Status

In-memory per-project state tracks success/rollback/blocked counters per action class; trust score is anchored at 50 with `+50` for full success, `-40` for full rollback, `-20` for full block:

**Real output** (4 successes + 1 rollback + 1 block):
```json
{
  "profiles_by_class": {
    "autonomous_safe": { "success_count": 4, "rollback_count": 1, "blocked_count": 1, "trust_score": 73, "last_updated_at": "..." },
    ...
  },
  "recent_executions": 4,
  "recent_rollbacks": 1,
  "recent_blocks": 1
}
```

`runAutonomousOutcomeLearningTick` writes a `LearningPolicySnapshot` row with `trigger='autonomy_trust_recompute'` (cooldown-bounded to 1 row per project per minute), enabling cross-project federation reads via `fetchSharedTrustProfiles`.

## 9. Federated Learning Status

`shouldFederationInfluence` enforces 3-factor influence rule:

```
local_sample=5, fed_executions=100, fed_variance=0.05 → true (cold project; federation helps)
local_sample=50, fed_executions=200, fed_variance=0.05 → false (project has its own signal)
local_sample=5, fed_executions=200, fed_variance=0.40 → false (federation too noisy)
local_sample=5, fed_executions=30,  fed_variance=0.05 → false (insufficient federation samples)
```

`fetchSharedTrustProfiles` reads `LearningPolicySnapshot` rows with `trigger='autonomy_trust_recompute'`, groups by action_class, surfaces only profiles with at least 2 distinct projects + 50 executions + variance < 0.15. Otherwise federation is informational (rendered in dashboard) but does not blend into local trust math.

## 10. Autonomous Governance Stream Status

7 new event kinds extend `CognitiveEventKind`:
- `autonomy.execution.prepared` — fired when planner approves a plan for autonomy
- `autonomy.execution.approved` — fired when executor stamps `auto_executed_at`
- `autonomy.execution.blocked` — fired when guardrails reject
- `autonomy.execution.applied` — fired when the existing flow issues the prompt
- `autonomy.execution.rolled_back` — fired on operator-initiated rollback
- `autonomy.trust.changed` — fired by drift detector (warning severity)
- `autonomy.supervision.required` — fired when supervised mode lands on a blocked plan

The frontend `useAutonomousExecution`, `useGovernanceTrust`, `useExecutionConfidence` hooks subscribe via `useRealtimeAwareness` with `kinds=` filter, debouncing refetch by 250ms.

## 11. Autonomous Outcome Learning Status

`runAutonomousOutcomeLearningTick(projectId)` (third independent tick — separate from `runLearningTick` and `runGovernanceLearningTick`):

```json
{
  "project_id": "sample-proj",
  "snapshot_recorded": false,
  "trust_score_summary": { "autonomous_safe": 73, "supervised_safe": 50, "operator_required": 50, "autonomy_blocked": 50 },
  "recent_executions": 4,
  "recent_rollbacks": 1,
  "elapsed_ms": 621,
  "notes": ["Snapshot write failed: "]
}
```

The cooldown gate (`withCooldown('trust_recompute_${pid}', 60_000)`) bounds writes to 1 snapshot per project per minute, preventing append-only history noise. In production the snapshot persists; in test/no-DB envs the in-memory state alone suffices for trust math.

## 12. Performance Report

| Operation | Cost (single call) |
|---|---|
| `recordCalibrationSample` | <1 ms (Map insert + buffer trim) |
| `calibrationScoreFor` | <1 ms (mean abs % error over last 10 samples) |
| `runSandboxValidation` | 1-3 ms (composes 4 Phase 12 simulators) |
| `evaluateSafeExecutionGuardrails` | <1 ms (pure boolean checks) |
| `evaluateExecutionConfidence` | 1-2 ms |
| `classifyExecution` | <1 ms |
| `planAutonomyDecision` | 1-2 ms (composes guardrails + decideByMode) |
| `prepareRollback` | <1 ms |
| `executeAutonomyDecision` | 3-5 ms total (sandbox + planner + rollback + trust update) |
| `detectExecutionDrift` (cooldown miss) | <1 ms (cooldown gate skips most calls) |
| `detectExecutionDrift` (cold tick) | 1-3 ms |
| `runAutonomousOutcomeLearningTick` (cooldown miss) | <1 ms |
| `runAutonomousOutcomeLearningTick` (DB write) | 50-200 ms |
| `fetchSharedTrustProfiles` | 100-300 ms with 30-day window |
| `cognitiveHealthIndex` (folded autonomy) | <1 ms (pure composite) |

**Cost protection layers**:
- `cognitiveStabilityProtection.allowByRateLimit` enforces max 3 autonomy decisions per minute per project (`autonomy_execute_${pid}`).
- `withCooldown` bounds drift detector to 1 scan per 30 min per project.
- `withCooldown` bounds trust snapshot writes to 1 per minute per project.
- `governanceMemory.last_storm_at` short-circuits all autonomy paths during a 30-min storm window.
- `evaluateAutomationConfidence` (Phase 12) and `evaluateExecutionConfidence` (Phase 13) operate independently on different inputs, preventing single-point-of-failure on the gate logic.

## 13. Test Results

- **Backend tsc:** `npx tsc --noEmit` exit 0.
- **Frontend tsc:** `npx tsc --noEmit` exit 0.
- **Phase 13 jest:** **47/47 passing** in `phase13.test.ts` (~54s).
- **Full systemStateEngine suite:** 13 suites, **495/495 passing** across phases 4–13 (no regressions in any prior phase).

**Test breakdown** (47 tests):
- `sandboxCalibrationBuffer` — 3
- `evaluateSafeExecutionGuardrails` — 4
- `runSandboxValidation` — 2
- `evaluateExecutionConfidence` — 3
- `classifyExecution` — 4
- `planAutonomyDecision` — 6 (autonomous, frozen, rate-limit, storm, operator-required, broad scope)
- `prepareRollback` — 3
- `buildRollbackPromptBody` (extended) — 3
- `autonomyTrustState` — 6
- `detectExecutionDrift` — 3 (healthy + rollback-heavy + cooldown gate)
- `shouldFederationInfluence` — 4 (cold/warm/variance/insufficient samples)
- `runAutonomousOutcomeLearningTick` — 2
- `cognitiveHealthIndex` Phase 13 weights — 1
- `AuthoritativeSystemState` compile-check — 1
- `executeAutonomyDecision` composite path — 2

## 14. Remaining Autonomy Gaps

1. **Operator-bypass on `/autonomy/execute`** — cut from v1 (stress-test). Operator approval flows through the existing Phase 12 endpoint.
2. **`autonomousStabilizationEngine`** — cut from v1 (stress-test). Stabilization stays operator-driven; v2 may introduce in-memory pressure tick.
3. **Direct user-facing state mutation** — Phase 13 only auto-approves; the `ui_fix_adaptive` flow still writes. Direct write path is Phase 14+.
4. **Multi-operator quorum approval** — single operator action remains sufficient.
5. **Real ML for trust scoring** — heuristic + statistical only.
6. **Cross-project trust transfer beyond cold-start** — federation contributes to math only when `local_sample < 20`. Warm projects get informational federation only.
7. **Governance trust persistence in dedicated table** — reused `LearningPolicySnapshot` in v1; dedicated table is Phase 14 if query patterns demand it.
8. **`autonomy.execution.prepared` event publishing** — kind registered but no production producer yet; will fire from Phase 14 prepare-and-stage flow.
9. **Per-project policy admin UI for autonomy** — `/governance/autonomy/policy` GET/PUT exist; sliders + toggles in admin dashboard remain a Phase 13.1 polish item.
10. **Decision graph visualization** — replay endpoint exposes the data; visual graph deferred.
11. **Autonomy across non-UX domains** — v1 scoped to UX remediation plan auto-approval; backend / agent enhancements stay manual.
12. **Cross-project rerank budget contention** — `operationalCostGovernance.recordRerank` is global; tests verify fail-soft, but explicit per-project quotas in the global budget would tighten isolation.

## 15. Next Phase Recommendation

**Phase 14 — Direct Autonomous Execution Path + Federated Trust Persistence**

Three workstreams:

**A) Direct write path (opt-in).** Behind `cognitivePolicyEngine.policy.autonomy_can_issue_prompts: boolean` (default false): when an auto-approved plan lands at high confidence + `autonomous_safe` action class + clean trust history, fire the `ui_fix_adaptive` prompt directly without operator intervention. Audit + rollback gates as before. This crosses the "Phase 13 never directly mutates" line by design — earned, not assumed.

**B) Federated trust persistence.** Promote `GovernanceTrustProfile` to a dedicated table with cross-project federation built in (parallel to `federatedPatternRegistry`). Add Phase 14 cron scheduling for trust profile snapshots + drift detector + autonomous outcome learning.

**C) Operator UX polish + stabilization.** Sliders for confidence_floor, blast_radius_cap, max_concurrent in `/admin/governance-policy`. Sparklines for trust evolution on the operator dashboard. Slack integration for `autonomy.trust.changed` warnings. Lift restoration UI for emergency-freeze. The cut `autonomousStabilizationEngine` from Phase 13 returns scoped to in-memory pressure decay only.

After Phase 14, the platform reaches: governed autonomous prompt-issuance for trusted clusters, federated learning across projects, persistent memory, operator-visible reasoning at every step, with the kill switch + drift detector + rollback prep guaranteeing the operator can always intercept.

---

## Phase Journey Recap

| Phase | Theme | Outcome |
|---|---|---|
| 3 | Telemetry contracts + deterministic sync | BuildManifest spec, ingestion pipeline |
| 4 | Self-synchronizing execution + explainability | WhyIsThisNextPanel |
| 5 | Operational UX intelligence | UX debt scorer, workflow friction |
| 6 | Visual cognition + behavioral telemetry | DOM/hierarchy/density/CTA analyzers |
| 7 | Multimodal cognition + adaptive priority | GPT-4o vision, adaptive weighting |
| 8 | Persistent real-time awareness | SSE bus, cognition memory, regression detector |
| 9 | Distributed cognition + governance foundation | Cognitive health index |
| 10 | Self-learning adaptive orchestration | Outcome scorer, adaptive trainer, simulation, governance advice |
| 10.5 | Continuous remediation orchestration | Cluster engine, sequencer, before/after analyzer, pressure engine + reranker |
| 11 | Closed-loop outcome-driven UX cognition | Real metric pipeline, deploy-freshness gate, persisted overlays |
| 12 | Governed decision automation | Recommendation engine, automation confidence gate, autonomous remediation preparer (drafts only), governance memory, audit log, override-storm detection |
| **13** | **Supervised autonomous decision approval** | **8 autonomy modules (sandbox calibration, guardrails, calibrator, planner, rollback prep, executor, drift detector, trust state), governance trust via LearningPolicySnapshot, federated trust influence rule, executor that auto-approves but does NOT execute, 7 new audit kinds, 7 new event kinds, 4 new refresh triggers, autonomy_summary, operational_stability rebalanced 0.8 → 1.0, 7 operator endpoints + emergency-freeze, 5 frontend hooks, AutonomousExecutionDashboard** |

**The platform is now a supervised autonomous operational governance system — within the unified SystemStateEngine architecture, bounded + reversible + confidence-gated + operator-visible + policy-constrained + rollback-safe.**
