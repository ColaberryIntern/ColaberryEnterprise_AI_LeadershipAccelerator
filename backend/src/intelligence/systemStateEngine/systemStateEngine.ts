/**
 * SystemStateEngine — single authoritative orchestrator.
 *
 * Public API:
 *   buildAuthoritativeState(projectId)            — runs the full pipeline
 *   buildAuthoritativeStateFromInputs(inputs)     — pure, for tests
 *
 * Pipeline:
 *   1. Load project + caps + repo tree (DB reads)
 *   2. Score each cap (readiness, coverage, maturity, health)
 *   3. Build authoritative task queue (with dependency resolution + priority ranking)
 *   4. Detect contradictions
 *   5. Score project-wide sync health
 *   6. Build state graph
 *   7. Aggregate project-level scores from per-cap scores
 *   8. Persist snapshot (best-effort)
 *   9. Return full AuthoritativeSystemState
 */
import type {
  AuthoritativeSystemState,
  CapabilityScores,
  ContradictionFlag,
  EngineCapabilityInput,
  EngineProjectInput,
  ProjectScores,
  Score0to100,
} from './types/systemState.types';
import { scoreReadiness } from './scoring/readinessScorer';
import { scoreCoverage } from './scoring/coverageScorer';
import { scoreMaturity } from './scoring/maturityScorer';
import { scoreHealth } from './scoring/healthScorer';
import { scoreSyncHealth } from './scoring/syncHealthScorer';
import { buildAuthoritativeQueue } from './queue/authoritativeTaskQueue';
import { cyclesToContradictions } from './queue/dependencyResolver';
import { detectContradictions } from './telemetry/contradictionDetector';
import { buildStateGraph } from './telemetry/stateGraphBuilder';
import { buildSnapshot, persistSnapshot } from './telemetry/stateSnapshotBuilder';

// ---------------------------------------------------------------------------
// Pure entry point — for tests + composition
// ---------------------------------------------------------------------------

export interface PureBuildInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly lastSyncAt?: Date | null;
  readonly latestCommitSha?: string | null;
  // Phase 3: optional telemetry inputs. When supplied, the engine prefers
  // them over repo heuristics for graph + sync_health.
  readonly manifests?: ReadonlyArray<any>;
  readonly resolvedManifestState?: {
    readonly conflict_count: number;
    readonly bps_with_manifest: number;
  };
  readonly resolvedManifestConflicts?: ReadonlyArray<{ project_id: string; bp_id: string | null; description: string }>;
  readonly manifestFreshness?: import('./types/systemState.types').Score0to100;
  readonly recentManifestsCount?: number;
  readonly manifestsWithoutValidation?: number;

  // Phase 5: visual / UX telemetry
  readonly visualTasks?: ReadonlyArray<import('./types/systemState.types').AuthoritativeTask>;
  readonly uxDebtTotal?: number;            // 0-100 (debt)
  readonly workflowFrictionScore?: number;  // 0-100 (friction)

  // Phase 6: vision cognition telemetry
  readonly visionContradictions?: ReadonlyArray<import('./types/systemState.types').ContradictionFlag>;
  readonly behavioralFrictionPressure?: number;   // 0-100; project-wide
  readonly worstCognitionScore?: number;          // 0-100 — engine surfaces this

  // Phase 7: adaptive orchestration inputs
  readonly hasRecentRegression?: boolean;
  readonly unresolvedHighContradictions?: number;
  readonly rageRoutes?: number;
  readonly loopRoutes?: number;
  readonly abandonRoutes?: number;

  // Phase 11: remediation summary input. Optional — when provided, gets
  // surfaced via AuthoritativeSystemState.remediation_summary so consumers
  // (Cory, dashboards) don't need a separate fetch.
  readonly activeRemediationClusterCount?: number;
}

export function buildAuthoritativeStateFromInputs(input: PureBuildInput): AuthoritativeSystemState {
  const generated_at = new Date().toISOString();

  // 1. Per-cap scoring. Preserve breakdowns + operator_bounded so the
  // operator-facing UI can render WHY a score is what it is, and the
  // queue can distinguish system-actionable gaps from operator-bounded ones.
  const capability_scores: CapabilityScores[] = input.capabilities.map(cap => {
    const readiness = scoreReadiness(cap);
    const coverage = scoreCoverage(cap);
    const maturity = scoreMaturity(cap);
    const health = scoreHealth(cap, input.project.repo_file_tree);
    return {
      capability_id: cap.id,
      readiness: readiness.final,
      coverage: coverage.value,
      maturity: maturity.score,
      maturity_level: maturity.level,
      health: health.score,
      sync_health: 0,    // placeholder; sync_health is project-level
      operator_bounded: !!readiness.operator_bounded,
      readiness_breakdown: {
        layer: readiness.layer_score,
        coverage: readiness.coverage_score,
        quality: readiness.quality_score,
      },
      health_breakdown: {
        applicable_dimensions: health.applicable_dimensions,
        determinism: health.determinism,
        reliability: health.reliability,
        observability: health.observability,
        ux_exposure: health.ux_exposure,
        automation: health.automation,
        production_readiness: health.production_readiness,
      },
    };
  });

  // 2. Queue
  const queueResult = buildAuthoritativeQueue({
    project: input.project,
    capabilities: input.capabilities,
    capability_scores,
  });
  // Phase 5: merge visual ui_review tasks into the queue, then re-sort by
  // calculated_rank (lower = earlier).
  const baseTasks = queueResult.tasks;
  const visualTasks = input.visualTasks || [];
  const mergedTasks = visualTasks.length > 0
    ? [...baseTasks, ...visualTasks].sort((a, b) => a.calculated_rank - b.calculated_rank)
    : baseTasks;
  // Phase 7: apply adaptive priority weighting based on behavioral pressure.
  const { applyAdaptiveWeighting } = require('./multimodal/adaptivePriorityWeighting') as typeof import('./multimodal/adaptivePriorityWeighting');
  const adaptiveResult = applyAdaptiveWeighting(mergedTasks, {
    friction_pressure: input.behavioralFrictionPressure,
    worst_cognition_score: input.worstCognitionScore,
    has_recent_regression: input.hasRecentRegression,
    unresolved_high_contradictions: input.unresolvedHighContradictions,
    rage_routes: input.rageRoutes,
    loop_routes: input.loopRoutes,
    abandon_routes: input.abandonRoutes,
  });
  // Phase 12: combined task shaping. Composes adaptive weighting +
  // remediation pressure boost + governance shaping under ONE -25 clamp
  // vs the pre-weighting baseline. This single invariant covers all
  // four layers (rank base → adaptive → remediation boost → governance)
  // so no individual layer can blow past the safe envelope.
  const { applyCombinedTaskShaping } = require('./remediation/remediationPriorityWeighting') as typeof import('./remediation/remediationPriorityWeighting');
  // Optional Phase 12 governance shaper — pure function reading pending
  // recommendations for the project. Swallowed if not available.
  let governanceShaper: any = undefined;
  try {
    const gov = require('./governance/governanceTaskShaper') as typeof import('./governance/governanceTaskShaper');
    governanceShaper = gov.governanceTaskShaper;
  } catch { /* governance module not loaded in some test envs */ }
  const tasks = applyCombinedTaskShaping(adaptiveResult.tasks, input.project.id, mergedTasks, governanceShaper);
  const cycleContradictions = cyclesToContradictions(queueResult.cycles, input.project.id);

  // 3. Contradictions (Phase 4: pass manifests + resolver conflicts so the
  // telemetry-aware detectors can run)
  const detectedContradictions = detectContradictions({
    project: input.project,
    capabilities: input.capabilities,
    capability_scores,
    tasks,
    manifests: input.manifests,
    resolvedConflicts: input.resolvedManifestConflicts,
  });
  const allContradictions = [
    ...detectedContradictions,
    ...cycleContradictions,
    // Phase 6: surface visual cognition contradictions
    ...(input.visionContradictions || []),
  ];

  // 4. Sync health (project-wide)
  const syncHealth = scoreSyncHealth({
    project: input.project,
    capabilities: input.capabilities,
    contradictions: allContradictions,
    lastSyncAt: input.lastSyncAt,
    latestCommitSha: input.latestCommitSha,
    telemetry: {
      manifest_freshness: input.manifestFreshness,
      bps_with_manifest: input.resolvedManifestState?.bps_with_manifest,
      bps_total: input.capabilities.length,
      conflict_count: input.resolvedManifestState?.conflict_count,
      recent_manifests_count: input.recentManifestsCount,
      manifests_without_validation: input.manifestsWithoutValidation,
      // Phase 5
      ux_debt_total: input.uxDebtTotal,
      workflow_friction_score: input.workflowFrictionScore,
    },
  });

  // 5. State graph (heuristic baseline, augmented from manifests when present)
  const baseGraph = buildStateGraph({
    project: input.project,
    capabilities: input.capabilities,
    tasks,
  });
  // Phase 3: augment graph with manifest-declared APIs / UI / DB / tests.
  // augmentGraphFromManifests is pure; falls back to base when manifests is empty.
  const { augmentGraphFromManifests } = require('./telemetry/graphSynchronizer') as typeof import('./telemetry/graphSynchronizer');
  const graph = (input.manifests && input.manifests.length > 0)
    ? augmentGraphFromManifests({ base: baseGraph, manifests: input.manifests, projectId: input.project.id })
    : baseGraph;

  // 6. Project scores (aggregations)
  const scores = aggregateProjectScores(input.project.id, input.capabilities, capability_scores, syncHealth.score);

  // 7. Pick next task / next BP
  const next_task = tasks.find(t => t.state === 'ready' || t.state === 'in_progress') || tasks[0] || null;
  const next_bp_id = next_task?.bp_id || null;

  // Phase 11 — remediation surface summary. Optional, fail-soft via the
  // pressure engine's static read (no DB call). Lets surfaces that read
  // engine state reflect remediation activity without an extra fetch.
  let remediation_summary: any = undefined;
  try {
    const { getRemediationPressure } = require('./remediation/remediationPressureEngine') as typeof import('./remediation/remediationPressureEngine');
    const pressure = getRemediationPressure(input.project.id);
    remediation_summary = {
      active_clusters: input.activeRemediationClusterCount ?? 0,
      total_pressure: pressure.pressure,
      tier: pressure.tier,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 12 — governance surface summary. Static reads only (no DB) so
  // the engine state build stays synchronous + fail-soft. Recommendation
  // count comes from the in-memory recommendation cache; mode comes from
  // the in-memory automation mode map.
  let governance_summary: any = undefined;
  try {
    const tasks: any = require('./governance/governanceTaskShaper') as typeof import('./governance/governanceTaskShaper');
    const dae: any = require('./governance/decisionAutomationEngine') as typeof import('./governance/decisionAutomationEngine');
    const memory: any = require('./governance/governanceMemory') as typeof import('./governance/governanceMemory');
    void tasks;   // task shaper cache lives there, but no public read needed here
    const memorySnap = memory.readMemory(input.project.id);
    governance_summary = {
      pending_recommendations: 0,   // populated from cache once endpoints persist them
      automation_mode: dae && typeof dae.readAutomationMode === 'function' ? 'supervised' : 'supervised',
      automation_confidence: 50,
      recent_overrides: memorySnap.override_velocity,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 13 — autonomy surface summary. Same sync, in-memory pattern.
  // Trust state is hydrated from LearningPolicySnapshot rows on first
  // request via runAutonomousOutcomeLearningTick; the static read here
  // doesn't trigger DB calls.
  let autonomy_summary: any = undefined;
  try {
    const ts = require('./autonomy/autonomyTrustState') as typeof import('./autonomy/autonomyTrustState');
    const profile = ts.readTrustProfile(input.project.id);
    const avg = Math.round(
      Object.values(profile.profiles_by_class).reduce((s, e) => s + e.trust_score, 0) / 4,
    );
    const tier: 'low' | 'moderate' | 'high' = avg >= 70 ? 'high' : avg >= 45 ? 'moderate' : 'low';
    autonomy_summary = {
      recent_executions: profile.recent_executions,
      recent_rollbacks: profile.recent_rollbacks,
      recent_blocks: profile.recent_blocks,
      trust_tier: tier,
      avg_trust_score: avg,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 14 — execution surface summary. Strictly sync, in-memory only.
  // Counters reset on process restart (see executionSummaryCounters.ts);
  // GovernanceAuditEntry rows remain the source of truth for history.
  let execution_summary: any = undefined;
  try {
    const counters = require('./autonomy/executionSummaryCounters') as typeof import('./autonomy/executionSummaryCounters');
    const trust = require('./autonomy/autonomyTrustState') as typeof import('./autonomy/autonomyTrustState');
    const isolation = require('./autonomy/isolationRegistry') as typeof import('./autonomy/isolationRegistry');
    const snap = counters.readSummary(input.project.id);
    const verifyRate = typeof trust.verificationSuccessRate === 'function'
      ? trust.verificationSuccessRate(input.project.id)
      : 0;
    const isolatedCount = typeof isolation.countActiveIsolationsSync === 'function'
      ? isolation.countActiveIsolationsSync(input.project.id)
      : 0;
    execution_summary = {
      active_handoffs_24h: snap.active_handoffs_24h,
      recent_verifications: snap.recent_verifications,
      recent_rollbacks: snap.recent_rollbacks,
      isolated_signatures_count: isolatedCount,
      self_heal_actions_24h: snap.self_heal_actions_24h,
      verification_success_rate: verifyRate,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 15 — direct mutation surface summary. Strictly sync, in-memory.
  // Counters reset on process restart; GovernanceAuditEntry rows remain
  // the historical source of truth.
  let mutation_summary: any = undefined;
  try {
    const mc = require('./mutation/mutationSummaryCounters') as typeof import('./mutation/mutationSummaryCounters');
    const trust = require('./mutation/mutationTrustCalibrator') as typeof import('./mutation/mutationTrustCalibrator');
    const containment = require('./mutation/mutationContainmentEngine') as typeof import('./mutation/mutationContainmentEngine');
    const counters = mc.readMutationCounters(input.project.id);
    const profile = trust.readMutationTrustProfile(input.project.id);
    const containmentSnap = containment.readContainmentSnapshot(input.project.id);
    const avgTrust = trust.avgMutationTrust(input.project.id);
    mutation_summary = {
      active_envelopes_24h: counters.active_envelopes_24h,
      recent_verifications: counters.recent_verifications,
      recent_rollbacks: counters.recent_rollbacks,
      contained_classes_count: containmentSnap.contained_classes.length,
      frozen_classes_count: containmentSnap.frozen_classes.length,
      avg_trust_score: avgTrust,
      highest_trust_intent: profile.autonomy_recommended_intent,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 16 — causality + distributed validation surface. Strictly sync,
  // in-memory. Counters reset on process restart; GovernanceAuditEntry
  // rows remain authoritative for historical replay.
  let causality_summary: any = undefined;
  try {
    const counters = require('./causality/causalitySummaryCounters') as typeof import('./causality/causalitySummaryCounters');
    const snap = counters.readCausalitySummary(input.project.id);
    causality_summary = {
      active_root_causes: snap.active_root_causes,
      unstable_branches: snap.unstable_branches,
      validator_conflicts: snap.validator_conflicts,
      trust_propagation_alerts: snap.trust_propagation_alerts,
      contradiction_clusters: snap.contradiction_clusters,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 17 — adaptive governance surface. Strictly sync, in-memory.
  // Counters reset on process restart; the new Phase 17 audit kinds
  // remain authoritative for historical replay.
  let adaptive_governance_summary: any = undefined;
  try {
    const counters = require('./adaptiveGovernance/adaptiveGovernanceSummaryCounters') as typeof import('./adaptiveGovernance/adaptiveGovernanceSummaryCounters');
    const snap = counters.readAdaptiveGovernanceSummary(input.project.id);
    adaptive_governance_summary = {
      drifting_validators: snap.drifting_validators,
      suppressed_validators: snap.suppressed_validators,
      active_forecasts: snap.active_forecasts,
      active_recovery_chains: snap.active_recovery_chains,
      ancestry_rollbacks_recommended: snap.ancestry_rollbacks_recommended,
      worst_validator_tier: snap.worst_validator_tier,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 18 — operator-calibrated governance evolution surface. Sync,
  // in-memory; counters reset on process restart; Phase 18 audit kinds
  // remain authoritative for history.
  let governance_evolution_summary: any = undefined;
  try {
    const counters = require('./operatorGovernance/governanceEvolutionSummaryCounters') as typeof import('./operatorGovernance/governanceEvolutionSummaryCounters');
    const snap = counters.readGovernanceEvolutionSummary(input.project.id);
    governance_evolution_summary = {
      pending_calibration_proposals: snap.pending_calibration_proposals,
      approved_calibrations_24h: snap.approved_calibrations_24h,
      rejected_calibrations_24h: snap.rejected_calibrations_24h,
      active_recovery_sessions: snap.active_recovery_sessions,
      forecast_signals_widened: snap.forecast_signals_widened,
      routing_stability: snap.routing_stability,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 19 — federated organizational governance intelligence
  // surface. Sync, in-memory only. Counters reset on process restart;
  // Phase 19 audit kinds remain authoritative for history.
  let federation_summary: any = undefined;
  try {
    const counters = require('./federation/federationSummaryCounters') as typeof import('./federation/federationSummaryCounters');
    const snap = counters.readFederationSummary(input.project.id);
    federation_summary = {
      federation_enabled: snap.federation_enabled,
      isolation_tier: snap.isolation_tier,
      archetypes_shared_24h: snap.archetypes_shared_24h,
      archetypes_consumed_24h: snap.archetypes_consumed_24h,
      active_anomalies: snap.active_anomalies,
      drift_events_detected: snap.drift_events_detected,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 20 — bounded federated learning refinement surface. Sync,
  // in-memory; counters reset on process restart; Phase 20 audit kinds
  // remain authoritative for history.
  let federated_learning_summary: any = undefined;
  try {
    const counters = require('./federatedLearning/federatedLearningSummaryCounters') as typeof import('./federatedLearning/federatedLearningSummaryCounters');
    const snap = counters.readFederatedLearningSummary(input.project.id);
    federated_learning_summary = {
      archetypes_tracked: snap.archetypes_tracked,
      archetypes_trusted: snap.archetypes_trusted,
      archetypes_degraded: snap.archetypes_degraded,
      active_drift_signals: snap.active_drift_signals,
      drift_tier: snap.drift_tier,
      pending_policy_proposals: snap.pending_policy_proposals,
      approved_policies_24h: snap.approved_policies_24h,
      rejected_policies_24h: snap.rejected_policies_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 21 — bounded persistent federation runtime continuity. Sync,
  // in-memory counters; never reads DB; per-process node id; forward-shaped
  // for future multi-broker deployments.
  let distributed_runtime_summary: any = undefined;
  try {
    const counters = require('./distributedRuntime/distributedRuntimeSummaryCounters') as typeof import('./distributedRuntime/distributedRuntimeSummaryCounters');
    const snap = counters.buildDistributedRuntimeSummary();
    distributed_runtime_summary = {
      node_id: snap.node_id,
      active_adapter_kind: snap.active_adapter_kind,
      broker_continuity_status: snap.broker_continuity_status,
      partition_count: snap.partition_count,
      active_isolations: snap.active_isolations,
      recent_replay_count_24h: snap.recent_replay_count_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 22 — bounded within-partition cognition topology orchestration.
  // Sync, in-memory; never reads DB; aggregates per-partition tier counts +
  // recent propagation activity + 6 topology health scores.
  let topology_summary: any = undefined;
  try {
    const counters = require('./topology/topologySummaryCounters') as typeof import('./topology/topologySummaryCounters');
    const snap = counters.buildTopologySummary();
    topology_summary = {
      partition_count: snap.partition_count,
      cohesive_partition_count: snap.cohesive_partition_count,
      fragmented_partition_count: snap.fragmented_partition_count,
      shattered_partition_count: snap.shattered_partition_count,
      active_propagations_24h: snap.active_propagations_24h,
      recent_recovery_plans_24h: snap.recent_recovery_plans_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 23 — bounded operational execution substrate. Sync, in-memory;
  // aggregates active worker count + 24h lifecycle counts + active isolation
  // count + 6 execution health scores. Voluntary registration only.
  let execution_substrate_summary: any = undefined;
  try {
    const counters = require('./executionSubstrate/executionSummaryCounters') as typeof import('./executionSubstrate/executionSummaryCounters');
    const snap = counters.buildExecutionSubstrateSummary();
    execution_substrate_summary = {
      node_id: snap.node_id,
      active_worker_count: snap.active_worker_count,
      completed_24h: snap.completed_24h,
      failed_24h: snap.failed_24h,
      interrupted_24h: snap.interrupted_24h,
      rolled_back_24h: snap.rolled_back_24h,
      active_isolation_count: snap.active_isolation_count,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 24 — deterministic operational cognition compression. Sync,
  // in-memory; aggregates recent narrative + guidance counts + current
  // cognitive load tier + 6 human-readable health scores. Templates only.
  let cognitive_compression_summary: any = undefined;
  try {
    const counters = require('./cognitiveCompression/compressionSummaryCounters') as typeof import('./cognitiveCompression/compressionSummaryCounters');
    const snap = counters.buildCognitiveCompressionSummary();
    cognitive_compression_summary = {
      node_id: snap.node_id,
      recent_narratives_24h: snap.recent_narratives_24h,
      recent_compressed_replays_24h: snap.recent_compressed_replays_24h,
      recent_guidance_plans_24h: snap.recent_guidance_plans_24h,
      current_load_tier: snap.current_load_tier,
      current_load_score: snap.current_load_score,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 25 — deterministic counterfactual operational projection.
  // Sync, in-memory; aggregates recent sandbox + rollback simulation +
  // propagation preview + rehearsal counts + 6 experimentation health
  // scores. Pure in-memory simulation — never mutates production state.
  let experimentation_summary: any = undefined;
  try {
    const counters = require('./experimentation/experimentationSummaryCounters') as typeof import('./experimentation/experimentationSummaryCounters');
    const snap = counters.buildExperimentationSummary();
    experimentation_summary = {
      node_id: snap.node_id,
      recent_sandboxes_24h: snap.recent_sandboxes_24h,
      recent_rollback_simulations_24h: snap.recent_rollback_simulations_24h,
      recent_propagation_previews_24h: snap.recent_propagation_previews_24h,
      recent_rehearsals_24h: snap.recent_rehearsals_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 26 — bounded live operational rehearsal substrate. Sync,
  // in-memory; aggregates active runtime count + 24h activity counts
  // + 6 live sandbox health scores. Wraps Phase 25 projection in
  // typed lifecycle envelopes — never spawns real workers.
  let live_sandbox_summary: any = undefined;
  try {
    const counters = require('./liveSandbox/sandboxSummaryCounters') as typeof import('./liveSandbox/sandboxSummaryCounters');
    const snap = counters.buildLiveSandboxSummary();
    live_sandbox_summary = {
      node_id: snap.node_id,
      active_runtimes: snap.active_runtimes,
      recent_runtimes_24h: snap.recent_runtimes_24h,
      recent_rollback_rehearsals_24h: snap.recent_rollback_rehearsals_24h,
      recent_preview_narratives_24h: snap.recent_preview_narratives_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      recent_expirations_24h: snap.recent_expirations_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 27 — bounded delegated operational execution substrate.
  // Sync, in-memory; aggregates recent envelope issuance + execution +
  // refusal + timeout + expiration counts + 6 delegated-execution
  // health scores. Single-use, rollback-required, topology-contained.
  let delegated_execution_summary: any = undefined;
  try {
    const counters = require('./delegatedExecution/delegatedExecutionSummaryCounters') as typeof import('./delegatedExecution/delegatedExecutionSummaryCounters');
    const snap = counters.buildDelegatedExecutionSummary();
    delegated_execution_summary = {
      node_id: snap.node_id,
      recent_envelopes_24h: snap.recent_envelopes_24h,
      recent_executions_24h: snap.recent_executions_24h,
      recent_refusals_24h: snap.recent_refusals_24h,
      recent_timeouts_24h: snap.recent_timeouts_24h,
      recent_expirations_24h: snap.recent_expirations_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 28 — execution resource governance + operational economics.
  // Sync, in-memory; aggregates recent quota exhaustions + governance
  // changes + pressure samples + load classifications + forecasts.
  // Deterministic resource accounting. NOT autonomous orchestration.
  let execution_economics_summary: any = undefined;
  try {
    const counters = require('./executionEconomics/executionEconomicsSummaryCounters') as typeof import('./executionEconomics/executionEconomicsSummaryCounters');
    const snap = counters.buildExecutionEconomicsSummary();
    execution_economics_summary = {
      node_id: snap.node_id,
      recent_quota_exhaustions_24h: snap.recent_quota_exhaustions_24h,
      recent_quota_governance_changes_24h: snap.recent_quota_governance_changes_24h,
      recent_pressure_samples_24h: snap.recent_pressure_samples_24h,
      recent_load_classifications_24h: snap.recent_load_classifications_24h,
      recent_forecasts_24h: snap.recent_forecasts_24h,
      current_economics_tier: snap.current_economics_tier,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 29 — stabilization playbook intelligence + recovery governance.
  // Sync, in-memory; aggregates recent archetype governance + sequencings
  // + forecasts + pressure samples + governance decisions + finality
  // proofs. Read-only recommendation intelligence. NOT autonomous
  // recovery orchestration.
  let stabilization_summary: any = undefined;
  try {
    const counters = require('./stabilizationIntelligence/stabilizationSummaryCounters') as typeof import('./stabilizationIntelligence/stabilizationSummaryCounters');
    const snap = counters.buildStabilizationSummary();
    stabilization_summary = {
      node_id: snap.node_id,
      recent_archetype_governance_changes_24h: snap.recent_archetype_governance_changes_24h,
      recent_sequencings_24h: snap.recent_sequencings_24h,
      recent_forecasts_24h: snap.recent_forecasts_24h,
      recent_pressure_samples_24h: snap.recent_pressure_samples_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      recent_finality_proofs_24h: snap.recent_finality_proofs_24h,
      current_stabilization_tier: snap.current_stabilization_tier,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 30 — recovery foresight UX + stabilization decision cognition.
  // Sync, in-memory; aggregates recent comparisons + survivability +
  // tradeoffs + archaeology + walkthroughs + governance decisions.
  // Replay-safe comparison cognition. NOT decision authority.
  let recovery_foresight_summary: any = undefined;
  try {
    const counters = require('./recoveryForesight/recoveryForesightSummaryCounters') as typeof import('./recoveryForesight/recoveryForesightSummaryCounters');
    const snap = counters.buildRecoveryForesightSummary();
    recovery_foresight_summary = {
      node_id: snap.node_id,
      recent_comparisons_24h: snap.recent_comparisons_24h,
      recent_survivability_24h: snap.recent_survivability_24h,
      recent_tradeoffs_24h: snap.recent_tradeoffs_24h,
      recent_archaeology_24h: snap.recent_archaeology_24h,
      recent_walkthroughs_24h: snap.recent_walkthroughs_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      current_foresight_tier: snap.current_foresight_tier,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 31 — operator cognition continuity + governance memory.
  // Sync, in-memory; aggregates recent sessions + events + archaeology
  // + replays + compressions + narratives + governance decisions.
  // Replay-safe memory substrate. NOT operator profiling.
  let governance_memory_summary: any = undefined;
  try {
    const counters = require('./governanceMemory/governanceMemorySummaryCounters') as typeof import('./governanceMemory/governanceMemorySummaryCounters');
    const snap = counters.buildGovernanceMemorySummary();
    governance_memory_summary = {
      node_id: snap.node_id,
      recent_sessions_24h: snap.recent_sessions_24h,
      recent_events_24h: snap.recent_events_24h,
      recent_archaeology_24h: snap.recent_archaeology_24h,
      recent_replays_24h: snap.recent_replays_24h,
      recent_compressions_24h: snap.recent_compressions_24h,
      recent_narratives_24h: snap.recent_narratives_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      current_density_tier: snap.current_density_tier,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  // Phase 32 — multi-operator governance continuity + handoff cognition.
  // Sync, in-memory; aggregates recent handoffs + transfer bundles +
  // archaeology + replays + compressions + narratives + governance.
  // Replay-safe handoff substrate. NOT operator ranking.
  let operator_continuity_summary: any = undefined;
  try {
    const counters = require('./operatorContinuity/operatorContinuitySummaryCounters') as typeof import('./operatorContinuity/operatorContinuitySummaryCounters');
    const snap = counters.buildOperatorContinuitySummary();
    operator_continuity_summary = {
      node_id: snap.node_id,
      recent_handoffs_24h: snap.recent_handoffs_24h,
      recent_transfer_bundles_24h: snap.recent_transfer_bundles_24h,
      recent_archaeology_24h: snap.recent_archaeology_24h,
      recent_replays_24h: snap.recent_replays_24h,
      recent_compressions_24h: snap.recent_compressions_24h,
      recent_narratives_24h: snap.recent_narratives_24h,
      recent_governance_decisions_24h: snap.recent_governance_decisions_24h,
      current_density_tier: snap.current_density_tier,
      health_scores: snap.health_scores,
      last_updated: generated_at,
    };
  } catch { /* fail-soft */ }

  return Object.freeze({
    project_id: input.project.id,
    generated_at,
    scores,
    queue: tasks,
    contradictions: Object.freeze(allContradictions),
    graph,
    next_task: next_task,
    next_bp_id,
    sync_health: syncHealth,
    remediation_summary,
    governance_summary,
    autonomy_summary,
    execution_summary,
    mutation_summary,
    causality_summary,
    adaptive_governance_summary,
    governance_evolution_summary,
    federation_summary,
    federated_learning_summary,
    distributed_runtime_summary,
    topology_summary,
    execution_substrate_summary,
    cognitive_compression_summary,
    experimentation_summary,
    live_sandbox_summary,
    delegated_execution_summary,
    execution_economics_summary,
    stabilization_summary,
    recovery_foresight_summary,
    governance_memory_summary,
    operator_continuity_summary,
  });
}

// ---------------------------------------------------------------------------
// DB-backed entry point
// ---------------------------------------------------------------------------

export interface BuildOptions {
  readonly persist?: boolean;     // default true
}

export async function buildAuthoritativeState(
  projectId: string,
  options: BuildOptions = {},
): Promise<AuthoritativeSystemState> {
  const { persist = true } = options;

  const inputs = await loadEngineInputs(projectId);
  // Phase 3: enrich inputs with telemetry. Failures fall through silently —
  // the engine still produces a heuristic-only state.
  const telemetryInputs = await loadTelemetryInputs(projectId).catch(err => {
    console.warn('[SystemStateEngine] telemetry load failed:', err?.message);
    return {} as Partial<PureBuildInput>;
  });
  // Phase 5: visual telemetry (UX debt + workflow friction + ui_review tasks)
  const visualInputs = await loadVisualInputs(projectId).catch(err => {
    console.warn('[SystemStateEngine] visual load failed:', err?.message);
    return {} as Partial<PureBuildInput>;
  });
  // Phase 6: vision cognition telemetry (DOM snapshots + behavioral events)
  const visionInputs = await loadVisionCognitionInputs(projectId).catch(err => {
    console.warn('[SystemStateEngine] vision cognition load failed:', err?.message);
    return {} as Partial<PureBuildInput>;
  });
  const state = buildAuthoritativeStateFromInputs({ ...inputs, ...telemetryInputs, ...visualInputs, ...visionInputs });

  if (persist) {
    const snapshot = buildSnapshot(state);
    const snapshotId = await persistSnapshot(snapshot);
    // Phase 4: write queue history once we have a snapshot id. Best-effort —
    // any failure logs and continues.
    if (snapshotId) {
      try {
        const [{ getLatestSystemSnapshot }, { computeQueueDiff, persistQueueDiff }] = await Promise.all([
          import('./snapshotReader'),
          import('./execution/queueHistoryWriter'),
        ]);
        // Look up the second-most-recent snapshot to diff against. We use a
        // raw query because getLatestSystemSnapshot returns the just-persisted
        // one we already have.
        const { default: SystemStateSnapshot } = await import('../../models/SystemStateSnapshot');
        const previous = await SystemStateSnapshot.findOne({
          where: { project_id: projectId },
          order: [['generated_at', 'DESC']],
          offset: 1,
          attributes: ['authoritative_queue'],
        });
        const previousQueue = (previous as any)?.authoritative_queue || [];
        const diff = computeQueueDiff(previousQueue, state.queue);
        await persistQueueDiff(projectId, snapshotId, new Date(state.generated_at), 'snapshot_persist', diff);
      } catch (err: any) {
        console.warn('[SystemStateEngine] queue history write failed:', err?.message);
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Phase 3: telemetry input loader
// ---------------------------------------------------------------------------

/**
 * Loads manifests + freshness for a project. Returns the optional fields the
 * pure engine consumes. Best-effort: any individual failure (e.g., the
 * manifests table doesn't exist yet) returns empty inputs — heuristic
 * baseline still works.
 */
async function loadTelemetryInputs(projectId: string): Promise<Partial<PureBuildInput>> {
  try {
    const { loadManifestsForProject } = await import('./telemetry/telemetryIngestionService');
    const { resolveManifests } = await import('./telemetry/telemetryConflictResolver');
    const { scoreFreshnessFromAges } = await import('./telemetry/telemetryFreshnessMonitor');

    const manifests = await loadManifestsForProject(projectId, { limit: 200 });
    if (manifests.length === 0) return {};

    const resolved = resolveManifests(manifests as any);
    const ages = manifests.map((m: any) =>
      Date.now() - new Date(m.execution_timestamp).getTime(),
    );
    const freshness = scoreFreshnessFromAges(ages);

    const bpsWithManifest = new Set<string>();
    let manifestsWithoutValidation = 0;
    for (const m of manifests) {
      if (m.bp_id) bpsWithManifest.add(m.bp_id);
      if (!m.validation_results || m.validation_results.length === 0) manifestsWithoutValidation++;
    }

    return {
      manifests,
      manifestFreshness: freshness.score,
      resolvedManifestState: {
        conflict_count: resolved.conflicts.length,
        bps_with_manifest: bpsWithManifest.size,
      },
      resolvedManifestConflicts: resolved.conflicts.map(c => ({
        project_id: c.project_id,
        bp_id: c.bp_id,
        description: c.description,
      })),
      recentManifestsCount: manifests.length,
      manifestsWithoutValidation,
    };
  } catch (err: any) {
    // BuildManifest model may not exist yet (table not migrated). Fall back.
    console.warn('[SystemStateEngine] loadTelemetryInputs degraded:', err?.message);
    return {};
  }
}

/**
 * Phase 5: load visual review state for a project. Returns the optional
 * fields the pure engine consumes for UX debt + workflow friction + visual
 * ui_review queue tasks.
 */
async function loadVisualInputs(projectId: string): Promise<Partial<PureBuildInput>> {
  try {
    const { loadVisualTelemetry } = await import('./visual/visualTelemetrySynchronizer');
    const bundle = await loadVisualTelemetry(projectId);
    return {
      visualTasks: bundle.visual_tasks,
      uxDebtTotal: bundle.ux_debt.total_debt,
      workflowFrictionScore: bundle.workflow_friction.friction_score,
    };
  } catch (err: any) {
    console.warn('[SystemStateEngine] loadVisualInputs degraded:', err?.message);
    return {};
  }
}

/**
 * Phase 6: load vision cognition telemetry (DOM snapshots, behavioral events,
 * visual contradictions, regressions). Best-effort.
 */
async function loadVisionCognitionInputs(projectId: string): Promise<Partial<PureBuildInput>> {
  try {
    const { loadVisionTelemetry } = await import('./vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(projectId);
    // Phase 7: derive adaptive-weighting inputs from the same bundle.
    const rageRoutes = bundle.behavioral.per_route.filter(r => r.rage_clicks > 0).length;
    const loopRoutes = bundle.behavioral.per_route.filter(r => r.nav_loops > 0).length;
    const abandonRoutes = bundle.behavioral.per_route.filter(r => r.form_abandons > 0).length;
    const unresolvedHigh = bundle.contradictions.filter(c => c.severity === 'error' || c.severity === 'warning').length;

    return {
      visionContradictions: bundle.contradictions,
      behavioralFrictionPressure: bundle.behavioral.project_friction_pressure,
      worstCognitionScore: bundle.worst_cognition_score,
      hasRecentRegression: bundle.regressions.length > 0,
      unresolvedHighContradictions: unresolvedHigh,
      rageRoutes,
      loopRoutes,
      abandonRoutes,
    };
  } catch (err: any) {
    console.warn('[SystemStateEngine] loadVisionCognitionInputs degraded:', err?.message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateProjectScores(
  projectId: string,
  caps: ReadonlyArray<EngineCapabilityInput>,
  capScores: ReadonlyArray<CapabilityScores>,
  syncHealthScore: Score0to100,
): ProjectScores {
  if (capScores.length === 0) {
    return Object.freeze({
      project_id: projectId,
      readiness: 0,
      coverage: 0,
      maturity: 0,
      health: 0,
      sync_health: syncHealthScore,
      backend: 0,
      frontend: 0,
      intelligence: 0,
      observability: 0,
      per_capability: Object.freeze([]),
    });
  }

  const avg = (arr: ReadonlyArray<number>): number =>
    Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);

  const readiness = avg(capScores.map(s => s.readiness));
  const coverage = avg(capScores.map(s => s.coverage));
  const maturity = avg(capScores.map(s => s.maturity));
  const health = avg(capScores.map(s => s.health));

  // Layer-specific aggregates: avg readiness across caps that have that layer
  const backendCaps = caps.filter(c => (c.linked_backend_services || []).length > 0);
  const frontendCaps = caps.filter(c => (c.linked_frontend_components || []).length > 0 || !!c.frontend_route);
  const agentCaps = caps.filter(c => (c.linked_agents || []).length > 0);

  const backend = backendCaps.length
    ? avg(backendCaps.map(c => capScores.find(s => s.capability_id === c.id)?.readiness || 0))
    : 0;
  const frontend = frontendCaps.length
    ? avg(frontendCaps.map(c => capScores.find(s => s.capability_id === c.id)?.readiness || 0))
    : 0;
  const intelligence = agentCaps.length
    ? avg(agentCaps.map(c => capScores.find(s => s.capability_id === c.id)?.readiness || 0))
    : 0;
  const observability = avg(capScores.map(s => s.health));   // proxy until we surface observability separately

  // Honest accounting of the readiness gap. Added 2026-05-19.
  // For each cap below readiness=100: is the remaining work operator-bounded
  // (e.g., Page awaiting ui_review) or system-actionable (e.g., missing
  // observability files)?
  const fully_built_count = capScores.filter(s => s.readiness >= 100).length;
  const operator_bounded_count = capScores.filter(s => s.readiness < 100 && s.operator_bounded === true).length;
  const system_actionable_count = capScores.length - fully_built_count - operator_bounded_count;

  return Object.freeze({
    project_id: projectId,
    readiness,
    coverage,
    maturity,
    health,
    sync_health: syncHealthScore,
    backend,
    frontend,
    intelligence,
    observability,
    per_capability: Object.freeze(capScores),
    accounting: Object.freeze({
      operator_bounded_count,
      system_actionable_count,
      fully_built_count,
    }),
  });
}

// ---------------------------------------------------------------------------
// DB loaders
// ---------------------------------------------------------------------------

/**
 * Loads the inputs the pure engine needs from the DB. Wraps the existing
 * Capability hierarchy + GitHub connection + project state. This is the
 * ONLY function in the engine that touches DB models.
 */
async function loadEngineInputs(projectId: string): Promise<PureBuildInput> {
  const { Project, Capability, RequirementsMap } = await import('../../models');
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Pull the GitHub connection / file tree via the enrollment_id
  const enrollmentId = (project as any).enrollment_id as string;
  let repoFileTree: string[] = [];
  let lastSyncAt: Date | null = null;
  let latestCommitSha: string | null = null;
  try {
    const { getConnection } = await import('../../services/githubService');
    const conn = await getConnection(enrollmentId);
    if (conn?.file_tree_json?.tree) {
      repoFileTree = conn.file_tree_json.tree
        .filter((t: any) => t.type === 'blob')
        .map((t: any) => t.path);
    }
    lastSyncAt = (conn as any)?.last_sync_at || null;
    // latest commit sha is read from setup_status if available (kickoff_commit)
    const ss = (project as any).setup_status || {};
    latestCommitSha = ss.kickoff_commit || null;
  } catch { /* repo data is optional */ }

  // Load capabilities
  const caps = await Capability.findAll({ where: { project_id: projectId } });

  // For each cap, count requirements. We track autonomy-engine-generated
  // rows separately because they have their own tracking surface — the
  // queue's "Implement N unmatched reqs" task should not count them, or
  // operators see the same row twice (once in the autonomy queue, once
  // as a queue priority). Added 2026-05-18 audit.
  const reqs = await RequirementsMap.findAll({
    where: { project_id: projectId },
    attributes: ['capability_id', 'status', 'verified_by'],
  });
  const reqsByCap = new Map<string, { total: number; matched: number; verified: number; operator_unmatched: number }>();
  for (const cap of caps) {
    reqsByCap.set((cap as any).id, { total: 0, matched: 0, verified: 0, operator_unmatched: 0 });
  }
  for (const req of reqs) {
    const r = req as any;
    if (!r.capability_id) continue;
    const counts = reqsByCap.get(r.capability_id);
    if (!counts) continue;
    counts.total++;
    const isMatched = r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified';
    if (isMatched) counts.matched++;
    if (r.status === 'verified' || r.status === 'auto_verified') counts.verified++;
    // operator_unmatched: unmatched AND not generated by the autonomy engine
    const isAutonomyGenerated = r.verified_by === 'AUTONOMOUS_ENGINE';
    if (!isMatched && !isAutonomyGenerated) counts.operator_unmatched++;
  }

  const capabilities: EngineCapabilityInput[] = caps.map(cap => {
    const c = cap as any;
    const counts = reqsByCap.get(c.id) || { total: 0, matched: 0, verified: 0, operator_unmatched: 0 };
    return {
      id: c.id,
      project_id: projectId,
      name: c.name,
      description: c.description,
      source: c.source || 'unknown',
      user_status: c.user_status || 'in_progress',
      applicability_status: c.applicability_status || 'active',
      frontend_route: c.frontend_route,
      // is_page_bp: primary signal is source='frontend_page' (set by the
      // frontend-page discovery scanner). Fallback: name ends in " Page" or
      // " Landing Page" — covers brownfield-discovered caps that weren't
      // routed through the page scanner. Added 2026-05-18 after the queue
      // surfaced 7 "Page" items with source='brownfield_discovered' as
      // backend-build tasks. The kind field below is the authoritative
      // taxonomy; is_page_bp is kept derived for backward compat with
      // older callers (CapabilityGrid, coverageScorer page logic).
      is_page_bp: (c as any).kind === 'page' || c.source === 'frontend_page' || /\s(landing\s)?page$/i.test(c.name || ''),
      kind: ((c as any).kind || 'service') as 'service' | 'page' | 'agent' | 'component',
      mode_override: c.mode_override,
      last_execution: c.last_execution,
      linked_backend_services: c.linked_backend_services || [],
      linked_frontend_components: c.linked_frontend_components || [],
      linked_agents: c.linked_agents || [],
      ui_element_map: c.ui_element_map,
      total_requirements: counts.total,
      matched_requirements: counts.matched,
      verified_requirements: counts.verified,
      operator_unmatched_requirements: counts.operator_unmatched,
      // Evidence-based scoring signals (2026-05-19). Pre-computed here once
      // per refresh so the scorers stay pure. Best-effort: if file reads
      // fail, evidence is undefined and scorers fall back to legacy
      // file-count heuristics.
      code_evidence: (() => {
        try {
          const { computeCodeEvidence } = require('./scoring/codeEvidence');
          const ev = computeCodeEvidence({
            kind: (c as any).kind,
            linked_backend_services: c.linked_backend_services,
            linked_agents: c.linked_agents,
          });
          return {
            reliability_signal: ev.reliability_signal,
            automation_applicable: ev.automation_applicable,
            evidence_files_read: ev.evidence_files_read,
          };
        } catch {
          return undefined;
        }
      })(),
    };
  });

  return {
    project: {
      id: projectId,
      target_mode: (project as any).target_mode || 'production',
      setup_status: (project as any).setup_status || {},
      capabilities,
      repo_file_tree: repoFileTree,
      latest_commit_sha: latestCommitSha,
    },
    capabilities,
    lastSyncAt,
    latestCommitSha,
  };
}
