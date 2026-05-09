/**
 * SystemStateEngine — public surface.
 *
 * THIS IS THE ONE BRAIN. Every consumer of "what's the state of the project,
 * what should the user do next, are there contradictions" reads from here.
 *
 * No other file in the codebase is permitted to compute readiness,
 * coverage, maturity, queue ordering, or contradiction detection
 * independently after the migration completes. Legacy logic is wrapped /
 * adapted / deprecated, never duplicated.
 */

export {
  buildAuthoritativeState,
  buildAuthoritativeStateFromInputs,
} from './systemStateEngine';

export {
  getLatestSystemSnapshot,
  readOrRebuild,
  memoizedReadOrRebuild,
} from './snapshotReader';
export type { SnapshotMetadata, SnapshotReadResult } from './snapshotReader';

export { refreshSystemState } from './refreshTriggers';
export type { RefreshTriggerKind } from './refreshTriggers';

export type {
  AuthoritativeSystemState,
  AuthoritativeTask,
  AuthoritativeTaskState,
  AuthoritativeTaskType,
  CapabilityScores,
  ContradictionFlag,
  ContradictionKind,
  ContradictionSeverity,
  DecisionTrace,
  EngineCapabilityInput,
  EngineProjectInput,
  ProjectScores,
  Score0to100,
  StateGraph,
  StateGraphEdge,
  StateGraphNode,
  StateGraphNodeType,
  SyncHealthDimensions,
  SyncHealthResult,
} from './types/systemState.types';

// Re-export scorers for direct access in tests / migration tools.
export { scoreReadiness } from './scoring/readinessScorer';
export { scoreCoverage } from './scoring/coverageScorer';
export { scoreMaturity } from './scoring/maturityScorer';
export { scoreHealth } from './scoring/healthScorer';
export { scoreSyncHealth } from './scoring/syncHealthScorer';

// ── Phase 3 telemetry surfaces ───────────────────────────────────────────
export { ingest as ingestManifest, loadManifestsForProject } from './telemetry/telemetryIngestionService';
export { validateManifestShape, validateManifestRefs } from './telemetry/manifestValidator';
export { resolveManifests } from './telemetry/telemetryConflictResolver';
export { scoreFreshnessFromAges, scoreFreshnessForProject, classifyAge } from './telemetry/telemetryFreshnessMonitor';
export type { FreshnessResult, FreshnessBucket } from './telemetry/telemetryFreshnessMonitor';
export { augmentGraphFromManifests, augmentGraphForProject, persistReferenceCopy as persistGraphRef } from './telemetry/graphSynchronizer';
export { buildDatabaseMapFromManifests, buildDatabaseMapForProject, persistReferenceCopy as persistDbMapRef } from './telemetry/databaseSynchronizer';
export { buildUIMapFromManifests, buildUIMapForProject, persistReferenceCopy as persistUiMapRef } from './telemetry/uiSynchronizer';
export { decideDeletions, sweepProject, sweepAll, DEFAULT_POLICY as SNAPSHOT_RETENTION_POLICY } from './telemetry/snapshotRetentionSweeper';
export type { RetentionPolicy } from './telemetry/snapshotRetentionSweeper';

// ── Phase 10.5 — UX remediation intelligence surfaces ────────────────────
export { buildRemediationIntelligenceReport } from './remediation/remediationIntelligenceEngine';
export { clusterOpenFeedback, classifyRow as classifyFeedbackRow } from './remediation/issueClusterEngine';
export { planRemediationSequence } from './remediation/remediationSequencePlanner';
export { computeRemediationConfidence } from './remediation/remediationConfidenceEngine';
export { detectRegressionPronePatterns } from './remediation/regressionProneFixDetector';
export { scoreUXRemediationOutcome, aggregateUXOutcomes } from './remediation/remediationEffectivenessAnalyzer';
export { analyzeBeforeAfterImpact } from './remediation/beforeAfterImpactAnalyzer';
export { updateRemediationPressure, getRemediationPressure, rerankClusterPriority } from './remediation/remediationPressureEngine';
export { startRemediationOrchestrationListener } from './remediation/remediationOrchestrationListener';
export { computeRemediationHealthIndex, computeRemediationHealthIndexPure } from './health/remediationHealthIndex';
export { buildReplayManifest } from './visual/uxRemediationReplay';
export { getRemediationPolicy, setRemediationPolicy } from './policy/remediationPolicy';
export type { IssueCluster, ClusterType } from './remediation/issueClusterEngine';
export type { RemediationSequencePlan } from './remediation/remediationSequencePlanner';
export type { RemediationConfidence } from './remediation/remediationConfidenceEngine';
export type { RegressionPronePattern, RegressionDetectionResult } from './remediation/regressionProneFixDetector';
export type { UXRemediationEffectivenessScore, UXRemediationAggregate } from './remediation/remediationEffectivenessAnalyzer';
export type { RemediationIntelligenceReport, ClusterWithIntelligence } from './remediation/remediationIntelligenceEngine';
export type { RemediationHealthIndex, RemediationHealthInputs } from './health/remediationHealthIndex';
export type { ReplayManifest } from './visual/uxRemediationReplay';
export type { RemediationPolicy } from './policy/remediationPolicy';

// ── Phase 11 — closed-loop outcome-driven UX cognition ───────────────────
export { getMemoizedVisionTelemetry, getMemoizedVisualTelemetry, invalidateTelemetryCache, getTelemetryCacheStats } from './realtime/telemetryMemoizationCache';
export { resolveSemanticRegions } from './remediation/semanticRegionResolver';
export type { SemanticRegion } from './remediation/semanticRegionResolver';
export { trackClusterConfidence, recordConfidenceRecompute } from './remediation/confidenceEvolutionTracker';
export type { ClusterConfidenceEvolution, ConfidenceDriftPoint } from './remediation/confidenceEvolutionTracker';
export { learnRemediationStrategies } from './remediation/remediationStrategyLearner';
export type { StrategyLearningReport, StrategyPerformance, StrategyKey } from './remediation/remediationStrategyLearner';
export { generateGovernanceInsights } from './remediation/remediationGovernanceInsights';
export type { RemediationGovernanceInsights } from './remediation/remediationGovernanceInsights';
export { sweepRemediationRetention, decideRemediationDeletions, DEFAULT_REMEDIATION_RETENTION_POLICY } from './telemetry/remediationRetentionSweeper';
export type { RemediationRetentionPolicy, SweepStats } from './telemetry/remediationRetentionSweeper';
export { applyRemediationPressureBoostClamped, applyCombinedTaskShaping } from './remediation/remediationPriorityWeighting';

// ── Phase 12 — governed decision automation ─────────────────────────────
export { buildDecisionAutomationReport, setAutomationMode, readAutomationMode } from './governance/decisionAutomationEngine';
export type { DecisionAutomationReport } from './governance/decisionAutomationEngine';
export { generateGovernanceRecommendations } from './governance/governanceRecommendationEngine';
export type { GovernanceRecommendation as GovernanceRecommendationDraft, GovernanceRecommendationInputs } from './governance/governanceRecommendationEngine';
export { evaluateAutomationConfidence } from './governance/automationConfidenceGate';
export type { AutomationConfidence, AutomationConfidenceInputs } from './governance/automationConfidenceGate';
export { preparePlanDraft, buildRollbackPromptBody } from './governance/autonomousRemediationPreparer';
export type { PreparedPlanDraft, PlanPayload, ProjectedOutcome, PreparePlanInput } from './governance/autonomousRemediationPreparer';
export { explainDecision } from './governance/decisionExplainabilityEngine';
export type { ExplanationChain } from './governance/decisionExplainabilityEngine';
export { recordSuccessfulPlan, recordUnsafePattern, recordOperatorOverride, readMemory as readGovernanceMemory } from './governance/governanceMemory';
export type { GovernanceMemoryState } from './governance/governanceMemory';
export { decideByMode } from './policy/automationModes';
export type { AutomationMode, AutomationModeDecision } from './policy/automationModes';
export { runGovernanceLearningTick } from './learning/runGovernanceLearningTick';
export type { GovernanceLearningResult } from './learning/runGovernanceLearningTick';
export { sweepGovernanceRetention, decideGovernanceDeletions, DEFAULT_GOVERNANCE_RETENTION_POLICY } from './telemetry/governanceRetentionSweeper';
export type { GovernanceRetentionPolicy, GovernanceSweepStats } from './telemetry/governanceRetentionSweeper';
export { simulateRemediationPlan, simulateContradictionResolution, simulateUXOutcome, simulateRecommendationApplication } from './simulation/orchestrationSimulationEngine';
export type { ProjectedDelta } from './simulation/orchestrationSimulationEngine';
export { governanceTaskShaper, noteRecommendationCreated, noteRecommendationDecided } from './governance/governanceTaskShaper';

// ── Phase 13 — supervised autonomous decision approval ─────────────────
export { recordCalibrationSample, calibrationScoreFor, getSandboxCalibrationStats } from './autonomy/sandboxCalibrationBuffer';
export type { CalibrationScore } from './autonomy/sandboxCalibrationBuffer';
export { evaluateSafeExecutionGuardrails, runSandboxValidation } from './autonomy/safeExecutionGuardrails';
export type { SafeExecutionInputs, SandboxValidationResult, ExecutionGuardrailDecision, RunSandboxInput } from './autonomy/safeExecutionGuardrails';
export { evaluateExecutionConfidence } from './autonomy/executionConfidenceCalibrator';
export type { ExecutionConfidence, ExecutionConfidenceInputs } from './autonomy/executionConfidenceCalibrator';
export { planAutonomyDecision, classifyExecution } from './autonomy/autonomousExecutionPlanner';
export type { AutonomyDecision, AutonomyDecisionInputs, ActionClass } from './autonomy/autonomousExecutionPlanner';
export { prepareRollback } from './autonomy/rollbackPreparationEngine';
export type { RollbackPreparation, RollbackPreparationInput } from './autonomy/rollbackPreparationEngine';
export { executeAutonomyDecision } from './autonomy/autonomyDecisionExecutor';
export type { AutonomyExecutionInput, AutonomyExecutionResult } from './autonomy/autonomyDecisionExecutor';
export { detectExecutionDrift, executionDriftHeartbeatHandler } from './autonomy/executionDriftDetector';
export type { DriftSignal } from './autonomy/executionDriftDetector';
export {
  recordExecutionSuccess, recordExecutionRollback, recordExecutionBlocked,
  readTrustProfile, executionSuccessRate, rollbackFrequency,
} from './autonomy/autonomyTrustState';
export type { AutonomyActionClass, AutonomyTrustEntry, ProjectTrustProfile } from './autonomy/autonomyTrustState';
export { runAutonomousOutcomeLearningTick } from './learning/runAutonomousOutcomeLearningTick';
export type { AutonomousLearningResult } from './learning/runAutonomousOutcomeLearningTick';
export { fetchSharedTrustProfiles, shouldFederationInfluence } from './transfer/federatedTrustProfiles';
export type { SharedTrustProfile } from './transfer/federatedTrustProfiles';

// ── Phase 14 — autonomous handoff + closed-loop verification ──────────
export {
  fireAutonomousHandoff,
  _testFireHandoffPure,
} from './autonomy/autonomousHandoffEngine';
export type {
  HandoffInput,
  HandoffResult,
} from './autonomy/autonomousHandoffEngine';
export {
  startExecutionVerificationListener,
  sweepStaleVerifications,
  _testRunVerification,
  _resetExecutionVerificationListener,
  _isInFlight,
  _scoreNetDeltaForTests,
} from './autonomy/executionVerificationListener';
export {
  triggerAutonomousRollback,
  _ISOLATION_THRESHOLD_FOR_TESTS,
} from './autonomy/autonomousRollbackEngine';
export type {
  TriggerAutonomousRollbackInput,
  AutonomousRollbackResult,
} from './autonomy/autonomousRollbackEngine';
export {
  startSelfHealingOrchestrator,
  _testHandlePressureEscalated,
  _testHandleTrustChanged,
  _resetSelfHealingOrchestrator,
  _SELF_HEAL_CB_THRESHOLD_FOR_TESTS,
} from './autonomy/selfHealingOrchestrator';
export {
  recordIsolation,
  liftIsolation,
  getActiveIsolations,
  isIsolated,
  countActiveIsolationsSync,
  _resetIsolationRegistry,
} from './autonomy/isolationRegistry';
export type {
  IsolationRecord,
  RecordIsolationInput,
} from './autonomy/isolationRegistry';
export {
  recordVerificationSuccess,
  recordVerificationFailure,
  verificationSuccessRate,
  readVerificationCounters,
  _resetVerificationCounters,
} from './autonomy/autonomyTrustState';
export {
  noteHandoffFired,
  noteVerificationOutcome,
  noteRollback,
  noteSelfHeal,
  readSummary as readExecutionSummary,
  _resetExecutionSummaryCounters,
} from './autonomy/executionSummaryCounters';
export type { ExecutionSummarySnapshot } from './autonomy/executionSummaryCounters';
export {
  assessBlastRadius,
  evaluateBlastRadiusGate,
} from './autonomy/safeExecutionGuardrails';
export type {
  BlastRadiusInput,
  BlastRadiusProfile,
} from './autonomy/safeExecutionGuardrails';

// ── Phase 15 — governed direct autonomous mutation ─────────────────────
export {
  fireDirectMutation,
  _testFireMutationPure,
  _MUTATION_RATE_LIMIT_MAX_FOR_TESTS,
  _MUTATION_TRUST_FLOOR_FOR_TESTS,
} from './mutation/directMutationEngine';
export type {
  FireMutationInput,
  FireMutationResult,
  FireOutcome,
} from './mutation/directMutationEngine';
export {
  forecastMutationBlast,
  evaluateMutationBlastGate,
  _MUTATION_BLAST_TIER_THRESHOLDS_FOR_TESTS,
} from './mutation/mutationBlastRadiusForecaster';
export type {
  MutationBlastForecastInput,
} from './mutation/mutationBlastRadiusForecaster';
export {
  verifyMutation,
  _VERIFICATION_WINDOW_MS_FOR_TESTS,
  _NET_DELTA_THRESHOLD_FOR_TESTS,
  _SURFACE_TOUCHING_INTENTS_FOR_TESTS,
} from './mutation/mutationVerificationEngine';
export {
  recordMutationSuccess,
  recordMutationRollback,
  recordMutationContainment,
  recordMutationVerificationFailure,
  freezeIntentClass,
  unfreezeIntentClass,
  isIntentFrozen,
  getFrozenIntents,
  readMutationTrustProfile,
  mutationTrustScore,
  avgMutationTrust,
  _resetMutationTrustState,
} from './mutation/mutationTrustCalibrator';
export {
  executeRollback,
} from './mutation/mutationRollbackCoordinator';
export type {
  RollbackMode,
  ExecuteRollbackInput,
  RollbackResult,
} from './mutation/mutationRollbackCoordinator';
export {
  containMutationCascade,
  liftContainment,
  readContainmentSnapshot,
  isClassContained,
  _resetMutationContainment,
  _CONTAIN_COOLDOWN_MS_FOR_TESTS,
} from './mutation/mutationContainmentEngine';
export type {
  ContainCascadeInput,
  ContainCascadeResult,
} from './mutation/mutationContainmentEngine';
export {
  appendProvenance,
  composeChain,
  emptyProvenance,
  lastTrigger,
  describeChain,
  _MAX_PROVENANCE_LENGTH_FOR_TESTS,
} from './mutation/mutationProvenanceChain';
export {
  noteMutationFired,
  noteMutationVerification,
  noteMutationRollback,
  readMutationCounters,
  _resetMutationSummaryCounters,
} from './mutation/mutationSummaryCounters';
export type { MutationCounterSnapshot } from './mutation/mutationSummaryCounters';
export type {
  MutationEnvelope,
  MutationIntent,
  MutationReversibility,
  MutationVerificationStatus,
  MutationContainmentState,
  MutationProvenanceChain,
  MutationProvenanceEntry,
  MutationScope,
  MutationBlastForecast,
  RollbackStep,
  MutationVerificationResult,
  MutationTrustEntry,
  MutationTrustProfile,
  MutationContainmentSnapshot,
  MutationSummarySnapshot,
} from './mutation/mutationTypes';
export { MUTATION_INTENT_CLASSES } from './mutation/mutationTypes';

// ── Phase 16 — causality replay + distributed validation cognition ──
export {
  buildLineageGraph,
  ancestorsOf,
  descendantsOf,
  depthOf,
  _MAX_LINEAGE_DEPTH_FOR_TESTS as _CAUSALITY_MAX_LINEAGE_DEPTH_FOR_TESTS,
} from './causality/mutationLineageGraph';
export type { BuildLineageGraphInput } from './causality/mutationLineageGraph';
export {
  buildContradictionPropagationProfile,
  isRecurrent as isContradictionRecurrent,
  _PROPAGATION_TEMPORAL_WINDOW_MS_FOR_TESTS,
} from './causality/contradictionPropagationTracker';
export type { BuildPropagationInput } from './causality/contradictionPropagationTracker';
export {
  buildTrustPropagationMap,
  _TRUST_DECAY_PER_GENERATION_FOR_TESTS,
} from './causality/causalTrustPropagation';
export type { BuildTrustPropagationInput } from './causality/causalTrustPropagation';
export {
  runAllValidators,
  mutationValidator,
  rollbackValidator,
  trustValidator,
  containmentValidator,
  blastRadiusValidator,
  VALIDATOR_ROLES,
} from './causality/distributedValidationHarness';
export type { ValidatorContext } from './causality/distributedValidationHarness';
export {
  arbitrate,
  _ESCALATION_RISK_THRESHOLD_FOR_TESTS,
  _ROLE_WEIGHTS_FOR_TESTS,
} from './causality/validationArbitrationEngine';
export type { ArbitrateInput } from './causality/validationArbitrationEngine';
export {
  recordArbitration,
  readValidatorTrustProfile,
  validatorTrust,
  extractDisagreements,
  persistDisagreementAudit,
  _resetValidatorTrust,
} from './causality/validatorTrustCalibrator';
export {
  analyzeRootCauses,
  _ROOT_CONFIDENCE_FLOOR_FOR_TESTS,
  _MAX_ROOTS_TO_SURFACE_FOR_TESTS,
} from './causality/rootCauseAnalyzer';
export type { RootCauseInput } from './causality/rootCauseAnalyzer';
export {
  buildStabilizationPlan,
  _HIGH_SCORE_THRESHOLD_FOR_TESTS,
  _MODERATE_SCORE_THRESHOLD_FOR_TESTS,
} from './causality/causalStabilizationEngine';
export type { BuildStabilizationPlanInput } from './causality/causalStabilizationEngine';
export {
  buildOperationalEpidemiologyMap,
} from './causality/operationalEpidemiologyEngine';
export type { BuildEpidemiologyInput } from './causality/operationalEpidemiologyEngine';
export {
  buildCausalityReplayTrace,
  _MAX_REPLAY_TRACE_NODES_FOR_TESTS,
} from './causality/causalityReplayEngine';
export type { BuildReplayTraceInput } from './causality/causalityReplayEngine';
export {
  noteRootCauseDetected,
  noteUnstableBranch,
  noteValidatorConflict,
  noteTrustPropagationAlert,
  noteContradictionCluster,
  readCausalitySummary,
  _resetCausalitySummaryCounters,
} from './causality/causalitySummaryCounters';
export type {
  // Lineage
  LineageNode,
  LineageNodeKind,
  LineageEdge,
  OperationalLineageGraph,
  // Propagation
  ContradictionCluster,
  ContradictionPropagationProfile,
  // Trust propagation
  CausalTrustPropagationEntry,
  CausalTrustPropagationMap,
  // Validators
  ValidatorRole,
  ValidatorRecommendation,
  ValidatorVerdict,
  ValidationArbitrationResult,
  ValidatorDisagreementProfile,
  ValidatorTrustEntry,
  ValidatorTrustProfile,
  // Root cause
  CausalConfidenceAttribution,
  RootCauseAnalysis,
  // Stabilization
  StabilizationPriorityScore,
  CausalStabilizationPlan,
  OperationalSpreadClassification,
  // Epidemiology
  OperationalEpidemiologyMap,
  // Replay
  ReplayTraceStep,
  CausalityReplayTrace,
  // Summary
  CausalitySummarySnapshot,
} from './causality/causalityTypes';
export {
  MAX_LINEAGE_DEPTH,
  TRUST_DECAY_PER_GENERATION,
  MAX_PROPAGATION_HOPS,
  MAX_REPLAY_TRACE_NODES,
  PROPAGATION_TEMPORAL_WINDOW_MS,
} from './causality/causalityTypes';

// ── Phase 17 — adaptive validator intelligence + causal governance evolution ──
export {
  observeArbitration,
  noteRollbackPrevented,
  noteRollbackMissed,
  noteStabilizationSuccess,
  noteStabilizationFailure,
  readReliabilityProfile,
  readRoleMetrics,
  _resetReliabilityTracker,
  _RELIABILITY_WINDOW_MS_FOR_TESTS,
  _testRecordObservation,
} from './adaptiveGovernance/validatorReliabilityTracker';
export {
  buildDriftProfile,
  suppressValidator,
  unsuppressValidator,
  isValidatorSuppressed,
  _resetDriftDetector,
} from './adaptiveGovernance/validatorDriftDetector';
export {
  observeForSpecialization,
  buildSpecializationMap,
  specializationAccuracy,
  _resetSpecializationAnalyzer,
  _testRecordSpecialization,
} from './adaptiveGovernance/validatorSpecializationAnalyzer';
export {
  _RECURRENCE_THRESHOLD_FOR_TESTS,
} from './adaptiveGovernance/organizationalCausalIntelligence';
export {
  buildAdaptiveWeights,
  buildAdaptiveWeightOverrides,
  _STATIC_ROLE_WEIGHTS_FOR_TESTS,
  _ROLE_WEIGHT_MIN_FOR_TESTS,
  _ROLE_WEIGHT_MAX_FOR_TESTS,
} from './adaptiveGovernance/adaptiveValidatorEngine';
export type { BuildAdaptiveWeightsInput } from './adaptiveGovernance/adaptiveValidatorEngine';
export {
  buildCausalStabilityForecast,
  _MAX_FORECAST_HORIZON_MS_FOR_TESTS,
} from './adaptiveGovernance/causalForecastingEngine';
export type { BuildForecastInput } from './adaptiveGovernance/causalForecastingEngine';
export {
  buildAncestryRollbackPlan,
  _MAX_PLAN_STEPS_FOR_TESTS,
  _PACING_MS_FOR_TESTS,
} from './adaptiveGovernance/ancestryRollbackAdvisor';
export type { BuildAncestryPlanInput } from './adaptiveGovernance/ancestryRollbackAdvisor';
export {
  buildValidatorMetaReasoningSummary,
} from './adaptiveGovernance/validatorMetaReasoning';
export type { BuildMetaReasoningInput } from './adaptiveGovernance/validatorMetaReasoning';
export {
  buildCausalRecoveryChain,
  _MAX_RECOVERY_CHAIN_STEPS_FOR_TESTS,
} from './adaptiveGovernance/causalRecoveryChainPlanner';
export type { BuildRecoveryChainInput } from './adaptiveGovernance/causalRecoveryChainPlanner';
export {
  buildOrganizationalCausalIntelligence,
} from './adaptiveGovernance/organizationalCausalIntelligence';
export type { BuildOrganizationalCausalInput } from './adaptiveGovernance/organizationalCausalIntelligence';
// _RECURRENCE_THRESHOLD_FOR_TESTS already exported above (line 463) — single canonical re-export
export {
  noteValidatorDrift,
  noteForecastGenerated,
  noteRecoveryChainGenerated,
  noteAncestryRollbackRecommended,
  readAdaptiveGovernanceSummary,
  _resetAdaptiveGovernanceSummary,
} from './adaptiveGovernance/adaptiveGovernanceSummaryCounters';
export type {
  ValidatorReliabilityMetrics,
  ValidatorReliabilityProfile,
  ValidatorStabilityTier,
  ValidatorDriftSignal,
  ValidatorDriftProfile,
  ValidatorSpecializationEntry,
  ValidatorSpecializationMap,
  AdaptiveWeightAttribution,
  AdaptiveWeightSet,
  ForecastSignal,
  ForecastConfidenceBounds,
  CausalStabilityForecastEntry,
  CausalStabilityForecast,
  AncestryRollbackStep,
  AncestryRollbackPlan,
  ValidatorMetaReasoningSummary,
  RecoveryStepKind,
  CausalRecoveryStep,
  CausalRecoveryChain,
  CausalArchetype,
  OrganizationalArchetypeEntry,
  OrganizationalCausalIntelligenceReport,
  AdaptiveGovernanceSummarySnapshot,
} from './adaptiveGovernance/adaptiveGovernanceTypes';
export {
  MAX_FORECAST_HORIZON_MS,
  RELIABILITY_WINDOW_MS,
  MIN_OBSERVATIONS_FOR_DRIFT,
  MAX_RECOVERY_CHAIN_STEPS,
  ROLE_WEIGHT_MIN,
  ROLE_WEIGHT_MAX,
  STATIC_ROLE_WEIGHT_DEFAULT,
} from './adaptiveGovernance/adaptiveGovernanceTypes';

// ── Phase 18 — operator-calibrated governance evolution ────────────
export {
  proposeCalibration,
  approveCalibration,
  rejectCalibration,
  rollbackCalibration,
  listProposals,
  getProposal,
  _resetCalibrationEngine,
  _MAX_ACTIVE_PROPOSALS_FOR_TESTS,
} from './operatorGovernance/operatorCalibrationEngine';
export type {
  ProposeCalibrationInput,
  ApproveRejectInput,
  RollbackCalibrationInput,
} from './operatorGovernance/operatorCalibrationEngine';
export {
  buildRoutingDecision,
  setRoutingOverride,
  clearRoutingOverride,
  suppressRouting,
  unsuppressRouting,
  isRoutingSuppressed,
  _resetRoutingEngine,
  _STRONG_BIAS_FOR_TESTS,
  _WEAK_BIAS_FOR_TESTS,
  _VOLATILE_VARIANCE_THRESHOLD_FOR_TESTS,
} from './operatorGovernance/specializationRoutingEngine';
export type {
  BuildRoutingDecisionInput,
  SetRoutingOverrideInput,
} from './operatorGovernance/specializationRoutingEngine';
export {
  recordForecastOutcome,
  buildForecastCalibrationProfile,
  readBoundWidenFactor,
  _resetForecastTuning,
  _WIDEN_THRESHOLD_PCT_FOR_TESTS,
  _TIGHTEN_THRESHOLD_PCT_FOR_TESTS,
  _MAX_OBSERVATIONS_PER_SIGNAL_FOR_TESTS,
} from './operatorGovernance/forecastTuningEngine';
export {
  buildGovernanceTopology,
  _TOPOLOGY_MAX_NODES_FOR_TESTS,
} from './operatorGovernance/governanceTopologyBuilder';
export type { BuildTopologyInput } from './operatorGovernance/governanceTopologyBuilder';
export {
  createRecoverySession,
  performStepAction,
  getRecoverySession,
  listRecoverySessions,
  _resetInteractiveRecovery,
  _MAX_ACTIVE_RECOVERY_SESSIONS_FOR_TESTS,
} from './operatorGovernance/interactiveRecoveryCoordinator';
export type {
  CreateRecoverySessionInput,
  StepActionInput,
} from './operatorGovernance/interactiveRecoveryCoordinator';
export {
  observeRecoveryOutcome,
  buildRecoveryOptimizationInsights,
  _resetRecoveryOptimizer,
  _MAX_OBSERVATIONS_PER_PROJECT_FOR_TESTS,
} from './operatorGovernance/recoveryStrategyOptimizer';
export type { ObserveRecoveryOutcomeInput } from './operatorGovernance/recoveryStrategyOptimizer';
export {
  buildCalibrationReplay,
  _TRANSPARENCY_REPLAY_MAX_ENTRIES_FOR_TESTS,
} from './operatorGovernance/governanceCalibrationReplay';
export type {
  BuildCalibrationReplayInput,
  CalibrationReplayResult,
} from './operatorGovernance/governanceCalibrationReplay';
export {
  buildGovernanceTransparencyReplay,
} from './operatorGovernance/governanceTransparencyReplayBuilder';
export type { BuildTransparencyReplayInput } from './operatorGovernance/governanceTransparencyReplayBuilder';
export {
  noteCalibrationProposed,
  noteCalibrationApproved,
  noteCalibrationRejected,
  noteRecoverySessionCreated,
  noteRecoverySessionFinished,
  noteForecastSignalWidened,
  noteForecastObservation,
  noteRoutingShift,
  noteAttributionEntry,
  readGovernanceEvolutionSummary,
  _resetGovernanceEvolutionSummary,
} from './operatorGovernance/governanceEvolutionSummaryCounters';
export type {
  // Calibration
  CalibrationType,
  CalibrationStatus,
  CalibrationConfidenceBounds,
  GovernanceCalibrationProposal,
  // Routing
  RoutingStabilityTier,
  RoutingAttribution,
  SpecializationRoutingDecision,
  // Forecast tuning
  ForecastOutcomeObservation,
  ForecastCalibrationProfile,
  // Recovery orchestration
  RecoveryStepStatus,
  InteractiveRecoveryStep,
  InteractiveRecoverySession,
  // Recovery optimization
  RecoveryDecisionAttribution,
  RecoveryArchetype,
  RecoveryOptimizationInsights,
  // Topology
  TopologyNodeKind,
  TopologyNode,
  TopologyEdge,
  GovernanceTopologyMap,
  // Transparency replay
  TransparencyReplayKind,
  TransparencyReplayEntry,
  GovernanceTransparencyReplay,
  // Health
  GovernanceHealthScores,
  GovernanceEvolutionSummarySnapshot,
} from './operatorGovernance/operatorGovernanceTypes';
export {
  MAX_ACTIVE_PROPOSALS_PER_PROJECT,
  MAX_ACTIVE_RECOVERY_SESSIONS_PER_PROJECT,
  FORECAST_TUNING_OBSERVATIONS_FLOOR,
  ROUTING_BIAS_MIN,
  ROUTING_BIAS_MAX,
  TOPOLOGY_MAX_NODES,
  TRANSPARENCY_REPLAY_MAX_ENTRIES,
} from './operatorGovernance/operatorGovernanceTypes';

// ── Phase 19 — federated organizational governance intelligence ──
export {
  readConsent,
  updateConsent,
  canShare,
  canConsume,
  _resetFederationConsent,
  _ARCHETYPE_KINDS_FOR_TESTS,
} from './federation/federationConsentEngine';
export type { UpdateConsentInput } from './federation/federationConsentEngine';
export {
  shareArchetype,
  listArchetypesFor,
  readOrgRegistry,
  _resetFederatedRegistry,
  _MAX_FEDERATED_ARCHETYPES_PER_ORG_FOR_TESTS,
} from './federation/federatedArchetypeRegistry';
export type {
  ShareArchetypeInput,
  ShareResult,
  ListArchetypesInput,
} from './federation/federatedArchetypeRegistry';
export {
  buildOrganizationalRecoveryIntelligence,
  _MIN_CONFIDENCE_LOW_FOR_TESTS,
  _MIN_SOURCE_COUNT_FOR_TESTS,
  _MAX_INSIGHTS_RETURNED_FOR_TESTS,
} from './federation/organizationalRecoveryIntelligence';
export type { BuildIntelligenceInput } from './federation/organizationalRecoveryIntelligence';
export {
  replayCalibrationImpact,
  _testReplayWithSnapshots,
  _CALIBRATION_IMPACT_DEFAULT_WINDOW_HOURS_FOR_TESTS,
  _CALIBRATION_IMPACT_MAX_WINDOW_HOURS_FOR_TESTS,
} from './federation/calibrationImpactReplay';
export type { ImpactReplayInput } from './federation/calibrationImpactReplay';
export {
  recordAnomalyObservation,
  buildForecastAnomalyProfile,
  _resetAnomalyEngine,
  _ANOMALY_Z_SCORE_THRESHOLD_FOR_TESTS,
  _ANOMALY_MIN_OBSERVATIONS_FOR_TESTS,
  _MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL_FOR_TESTS,
} from './federation/anomalyAwareForecastEngine';
export {
  buildGovernanceDriftReplay,
  _MAX_DRIFT_REPLAY_ENTRIES_FOR_TESTS,
} from './federation/governanceDriftReplay';
export type { BuildDriftReplayInput } from './federation/governanceDriftReplay';
export {
  recordSource,
  recordConsumption,
  readFederationLineage,
  readConsumptionAttributions,
  _resetFederationLineage,
  _MAX_LINEAGE_ENTRIES_PER_ARCHETYPE_FOR_TESTS,
} from './federation/federationLineageTracker';
export type {
  RecordSourceInput,
  RecordConsumptionInput,
  ReadLineageInput,
} from './federation/federationLineageTracker';
export {
  noteConsentUpdated,
  noteArchetypeShared,
  noteArchetypeConsumed,
  noteVisibilityViolation,
  noteAnomalyActive,
  noteDriftEvent,
  noteImpactReplay,
  readFederationSummary,
  _resetFederationSummary,
} from './federation/federationSummaryCounters';
export {
  anonymizeStepSequence,
  hashArchetypeSignature,
  stripIdentifyingFields,
  buildAnonymizedArchetype,
  _IDENTIFYING_FIELDS_FOR_TESTS,
} from './federation/federationAnonymizationHelpers';
export type { BuildAnonymizedArchetypeInput } from './federation/federationAnonymizationHelpers';
export type {
  // Consent
  ArchetypeKind,
  FederationIsolationTier,
  FederationConsentProfile,
  // Archetype payload + confidence
  AnonymizedArchetypePayload,
  FederatedArchetypeConfidence,
  FederatedArchetype,
  // Calibration impact
  CalibrationImpactDelta,
  CalibrationImpactReplay,
  // Anomalies
  ForecastAnomalyKind,
  ForecastAnomalyEntry,
  ForecastAnomalyProfile,
  // Drift replay
  DriftReplayKind,
  GovernanceDriftEntry,
  GovernanceDriftReplay,
  // Lineage
  FederationLineageNode,
  FederationLineageEdge,
  FederationLineageGraph,
  FederationConsumptionAttribution,
  // Visibility
  FederationVisibilityPolicy,
  // Insights
  OrganizationalRecoveryInsight,
  OrganizationalRecoveryIntelligenceReport,
  // Summary
  FederationHealthScores,
  FederationSummarySnapshot,
} from './federation/federationTypes';
export {
  MAX_FEDERATED_ARCHETYPES_PER_ORG,
  MAX_LINEAGE_ENTRIES_PER_ARCHETYPE,
  MAX_DRIFT_REPLAY_ENTRIES,
  ANOMALY_Z_SCORE_THRESHOLD,
  ANOMALY_MIN_OBSERVATIONS,
  CALIBRATION_IMPACT_DEFAULT_WINDOW_HOURS,
  CALIBRATION_IMPACT_MAX_WINDOW_HOURS,
} from './federation/federationTypes';

// ── Phase 20 — bounded federated organizational learning ───────────
export {
  getBrokerAdapter,
  setBrokerAdapter,
  BROKER_NAMESPACES,
  InMemoryBrokerAdapter,
  _resetBroker,
  _installFreshInMemoryAdapter,
} from './federatedLearning/persistentFederationBroker';
export type { BrokerStorageAdapter } from './federatedLearning/persistentFederationBroker';
export {
  recordOutcomeObservation,
  readEffectivenessProfile,
  listEffectivenessProfiles,
  _MAX_REFINEMENT_OBSERVATIONS_FOR_TESTS,
} from './federatedLearning/federatedEffectivenessTracker';
export type { RecordOutcomeInput } from './federatedLearning/federatedEffectivenessTracker';
export {
  evolveReliability,
  suppressArchetype,
  unsuppressArchetype,
  isArchetypeSuppressed,
  readReliabilityProfile as readArchetypeReliabilityProfile,
  listReliabilityProfiles as listArchetypeReliabilityProfiles,
  _resetReliabilitySuppressions,
  _RELIABILITY_DELTA_PER_OBSERVATION_FOR_TESTS,
  _MAX_RELIABILITY_HISTORY_FOR_TESTS,
} from './federatedLearning/archetypeReliabilityEvolution';
export type { EvolveReliabilityInput } from './federatedLearning/archetypeReliabilityEvolution';
export {
  buildOrganizationalStabilizationReport,
  _MAX_INSIGHTS_RETURNED_FOR_TESTS as _STABILIZATION_MAX_INSIGHTS_FOR_TESTS,
} from './federatedLearning/organizationalStabilizationIntelligence';
export type { BuildOrgStabilizationInput } from './federatedLearning/organizationalStabilizationIntelligence';
export {
  buildFederatedImpactDiffusionReplay,
  _MAX_DIFFUSION_REPLAY_ENTRIES_FOR_TESTS,
} from './federatedLearning/federatedImpactDiffusionReplay';
export type { BuildDiffusionReplayInput } from './federatedLearning/federatedImpactDiffusionReplay';
export {
  buildFederationDriftProfile,
  _DRIFT_TIER_THRESHOLDS_FOR_TESTS,
} from './federatedLearning/federationDriftDetector';
export type { BuildDriftProfileInput } from './federatedLearning/federationDriftDetector';
export {
  buildFederationVisibilityReplay,
  _VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS_FOR_TESTS,
  _VISIBILITY_REPLAY_MAX_WINDOW_HOURS_FOR_TESTS,
} from './federatedLearning/federationVisibilityReplay';
export type { BuildVisibilityReplayInput } from './federatedLearning/federationVisibilityReplay';
export {
  proposePolicyEvolution,
  approvePolicy,
  rejectPolicy,
  listPolicyProposals,
  getPolicyProposal,
  _MAX_POLICY_PROPOSALS_PER_ORG_FOR_TESTS,
} from './federatedLearning/federationPolicyEvolutionEngine';
export type {
  ProposePolicyInput,
  ApproveRejectPolicyInput,
} from './federatedLearning/federationPolicyEvolutionEngine';
export {
  noteEffectivenessUpdated,
  noteReliabilityEvolved,
  noteDriftDetected,
  notePolicyProposed,
  notePolicyApproved,
  notePolicyRejected,
  noteVisibilityReplay,
  readFederatedLearningSummary,
  _resetFederatedLearningSummary,
} from './federatedLearning/federatedLearningSummaryCounters';
export type {
  ArchetypeReliabilityTier,
  RefinementSignal,
  FederatedEffectivenessObservation,
  FederatedLearningAttribution,
  FederatedEffectivenessProfile,
  ArchetypeReliabilityProfile,
  OrganizationalStabilizationInsight,
  OrganizationalStabilizationReport,
  DiffusionReplayEntry,
  FederatedImpactDiffusionReplay,
  FederationDriftTier,
  FederationDriftSignalKind,
  FederationDriftSignal,
  FederationDriftProfile,
  VisibilityReplayEntry,
  FederationVisibilityReplay,
  PolicyEvolutionKind,
  PolicyProposalStatus,
  PolicyEvolutionImpactBounds,
  FederationPolicyEvolutionProposal,
  FederatedLearningHealthScores,
  FederatedLearningSummarySnapshot,
} from './federatedLearning/federatedLearningTypes';
export {
  MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE,
  MAX_RELIABILITY_HISTORY_PER_ARCHETYPE,
  MAX_DIFFUSION_REPLAY_ENTRIES,
  MAX_POLICY_PROPOSALS_PER_ORG,
  RELIABILITY_DELTA_PER_OBSERVATION,
  VISIBILITY_REPLAY_DEFAULT_WINDOW_HOURS,
  VISIBILITY_REPLAY_MAX_WINDOW_HOURS,
} from './federatedLearning/federatedLearningTypes';

// ── Phase 21 — distributed organizational cognition runtime ────────
export {
  initializeDistributedRuntime,
  getActiveAdapterKind as getDistributedAdapterKind,
  getNodeId as getDistributedNodeId,
  getConnectionStatus as getDistributedConnectionStatus,
  getActiveAdapter as getDistributedActiveAdapter,
  getActiveRedisAdapter,
  pingBroker,
} from './distributedRuntime/distributedBrokerRuntime';
export { RedisBrokerAdapter } from './distributedRuntime/redisBrokerAdapter';
export type { RedisClientLike, RedisBrokerAdapterOptions } from './distributedRuntime/redisBrokerAdapter';
export {
  recordAttribution,
  listAttributions,
  listAttributionsForOrg,
  getAttributionStats,
} from './distributedRuntime/brokerOperationAttribution';
export {
  recordSuccess as brokerRecordSuccess,
  recordFailure as brokerRecordFailure,
  isIsolated as isBrokerNamespaceIsolated,
  getIsolationState as getBrokerIsolationState,
  liftIsolation as liftBrokerIsolation,
  quarantine as quarantineBrokerNamespace,
  buildIsolationProfile,
} from './distributedRuntime/brokerIsolationEngine';
export {
  partitionIdFor,
  buildPartitionProfile,
  listPartitions,
  partitionCount,
  activeNamespaces,
} from './distributedRuntime/runtimePartitionCoordinator';
export {
  performContinuityReplay,
  listRecentReplays,
  recentReplayCount24h,
} from './distributedRuntime/runtimeContinuityReplay';
export { buildRuntimeTopology } from './distributedRuntime/runtimeTopologyTracker';
export { buildRuntimeVisibility } from './distributedRuntime/distributedRuntimeHealth';
export {
  buildRecoveryPlan,
  executeRecoveryStep,
  listRecoveryPlans,
} from './distributedRuntime/distributedRecoveryEngine';
export {
  buildDistributedRuntimeSummary,
  setCachedPartitionCount,
} from './distributedRuntime/distributedRuntimeSummaryCounters';
export type {
  BrokerAdapterKind,
  BrokerConnectionStatus,
  BrokerOperationAttribution,
  BrokerOperationOutcome,
  PartitionIsolationTier,
  RuntimePartitionProfile,
  ContinuityReplayBounds,
  ReplayOutcome,
  RuntimeContinuityReplay,
  BrokerIsolationReason,
  BrokerIsolationProfile,
  DistributedRuntimeTopology,
  DistributedRuntimeHealthScores,
  DistributedRuntimeVisibility,
  RecoveryStepKind as DistributedRecoveryStepKind,
  DistributedRecoveryStep,
  DistributedRecoveryPlan,
  DistributedRuntimeSummarySnapshot,
} from './distributedRuntime/distributedRuntimeTypes';
export {
  MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE,
  MAX_REPLAY_KEYS_PER_RUN,
  MAX_REPLAY_NAMESPACES_PER_RUN,
  MAX_REPLAY_TIME_BUDGET_MS,
  MAX_RECOVERY_PLANS_PER_NODE,
  ISOLATION_FAILURE_THRESHOLD,
  ISOLATION_FAILURE_WINDOW_MS,
} from './distributedRuntime/distributedRuntimeTypes';

// ── Phase 22 — within-partition cognition topology orchestration ───
export {
  recordDependencyEdge,
  listEdges as listTopologyEdges,
  buildCognitionTopologyGraph,
  downstreamNamespaces,
  upstreamNamespaces,
} from './topology/cognitionTopologyGraph';
export { buildRuntimeDependencyProfile } from './topology/runtimeDependencyTopology';
export {
  buildTopologyFragmentationProfile,
  classifyFragmentationTier,
} from './topology/topologyFragmentationDetector';
export {
  buildPropagationAttribution,
  buildRuntimePropagationReplay,
  listRecentPropagationReplays,
  listRecentAttributions as listRecentPropagationAttributions,
  recentPropagationCount24h,
} from './topology/runtimePropagationTopology';
export {
  recordStabilization,
  listStabilizationPaths,
} from './topology/stabilizationInfluenceTracker';
export { buildTopologyForecast } from './topology/topologyForecastEngine';
export {
  buildTopologyRecoveryPlan,
  executeTopologyRecoveryStep,
  listTopologyRecoveryPlans,
  recentRecoveryPlanCount24h as recentTopologyRecoveryPlanCount24h,
} from './topology/topologyRecoveryOrchestrator';
export { buildTopologyVisibilityReplay } from './topology/topologyReplayEngine';
export {
  buildTopologySummary,
  setCachedOrgList as setTopologyCachedOrgList,
  refreshCachedOrgList as refreshTopologyCachedOrgList,
} from './topology/topologySummaryCounters';
export type {
  TopologyDependencyRelation,
  DependencyLatencySensitivity,
  TopologyDependencyEdge,
  CognitionTopologyGraph,
  FragmentationTier,
  TopologyFragmentationProfile,
  PropagationConfidenceBounds,
  TopologyReplayAttribution,
  StabilizationInfluencePath,
  RuntimeDependencyProfile,
  PropagationKind,
  RuntimePropagationReplay,
  TopologyRecoveryStepKind as TopologyRecoveryStepKindV22,
  TopologyRecoveryStep,
  TopologyRecoveryPlan,
  TopologyForecastProfile,
  TopologyVisibilityReplay,
  TopologyHealthScores,
  TopologySummarySnapshot,
} from './topology/topologyTypes';
export {
  MAX_DEPENDENCY_EDGES_PER_PARTITION,
  MAX_PROPAGATION_REPLAYS_PER_PARTITION,
  MAX_STABILIZATION_INFLUENCE_PATHS_PER_PARTITION,
  MAX_TOPOLOGY_RECOVERY_PLANS_PER_PARTITION,
  MAX_PROPAGATION_WALK_DEPTH,
  PROPAGATION_REPLAY_BUDGET_MS,
  FORECAST_DEFAULT_HORIZON_MINUTES,
  FORECAST_MAX_HORIZON_MINUTES,
  FRAGMENTATION_PARTIAL_ISOLATION_THRESHOLD,
  FRAGMENTATION_FRAGMENTED_ISOLATION_THRESHOLD,
  FRAGMENTATION_SHATTERED_ISOLATION_RATIO,
} from './topology/topologyTypes';

// ── Phase 23 — bounded operational execution substrate ─────────────
export {
  registerWorker,
  markRunning as markWorkerRunning,
  markCompleted as markWorkerCompleted,
  markFailed as markWorkerFailed,
  markInterrupted as markWorkerInterrupted,
  markRolledBack as markWorkerRolledBack,
  recordHeartbeat as recordWorkerHeartbeat,
  sweepStalledWorkers,
  flipRunningToInterruptedOnBoot,
  getEnvelope as getExecutionEnvelope,
  listEnvelopes as listExecutionEnvelopes,
  listEnvelopesByState as listExecutionEnvelopesByState,
  listAllOrganizations as listExecutionOrganizations,
  activeWorkerCount,
  recentLifecycleCount24h,
} from './executionSubstrate/executionRuntimeCoordinator';
export type { RegisterWorkerInput, RegisterWorkerResult } from './executionSubstrate/executionRuntimeCoordinator';
export { runBoundedWorker } from './executionSubstrate/boundedExecutionWorker';
export type { BoundedExecutionResult, RunBoundedInput } from './executionSubstrate/boundedExecutionWorker';
export {
  evaluateRegistration as evaluateExecutionRegistration,
  evaluateEnvelopeBreach,
  buildGovernanceProfile as buildExecutionGovernanceProfile,
  listAttributionsForOrg as listExecutionGovernanceAttributions,
  recentDecisionCount24h as recentExecutionDecisionCount24h,
} from './executionSubstrate/executionGovernanceSupervisor';
export {
  recordSuccess as executionRecordSuccess,
  recordFailure as executionRecordFailure,
  isIsolated as isExecutionIsolated,
  liftIsolation as liftExecutionIsolation,
  quarantine as quarantineExecutionKind,
  buildIsolationProfile as buildExecutionIsolationProfile,
} from './executionSubstrate/executionIsolationEngine';
export {
  recordExecutionDependencyEdge,
  listEdges as listExecutionTopologyEdges,
  buildExecutionTopologyProfile,
} from './executionSubstrate/executionTopologyGraph';
export { buildExecutionContinuityReplay } from './executionSubstrate/executionContinuityTracker';
export {
  replayExecutionEnvelopes,
} from './executionSubstrate/executionReplayEngine';
export type { ReplayQueryInput, ReplayQueryResult } from './executionSubstrate/executionReplayEngine';
export {
  buildRollbackExecutionPlan,
  recordRollbackContinuity,
  listRollbackPlans as listExecutionRollbackPlans,
  listRollbackContinuityBounds,
} from './executionSubstrate/rollbackExecutionCoordinator';
export type {
  BuildRollbackPlanInput, RecordRollbackContinuityInput,
} from './executionSubstrate/rollbackExecutionCoordinator';
export { buildExecutionVisibilityReplay } from './executionSubstrate/executionVisibilityReplay';
export { buildExecutionSubstrateSummary } from './executionSubstrate/executionSummaryCounters';
export type {
  ExecutionWorkerKind,
  ExecutionBoundedEnvelope,
  ExecutionLifecycleTier,
  ExecutionWorkerEnvelope,
  ExecutionTopologyRelation,
  ExecutionDependencyEdge,
  ExecutionTopologyProfile,
  ExecutionContinuityReplay,
  ExecutionIsolationReason,
  ExecutionIsolationProfile,
  RollbackOutcome,
  RollbackSourcePhase,
  RollbackContinuityBounds,
  RollbackExecutionStep,
  RollbackExecutionPlan,
  ExecutionGovernanceDecision,
  SupervisorRule,
  ExecutionGovernanceAttribution,
  ExecutionGovernanceProfile,
  ExecutionVisibilityReplay,
  ExecutionHealthScores,
  ExecutionSubstrateSummarySnapshot,
} from './executionSubstrate/executionSubstrateTypes';
export {
  MAX_WORKER_ENVELOPES_PER_PARTITION,
  MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION,
  MAX_ROLLBACK_PLANS_PER_PARTITION,
  MAX_PARENT_DEPTH,
  MAX_DURATION_MS_CAP,
  MAX_ATTEMPTS_CAP,
  HEARTBEAT_TIMEOUT_MS,
  RECENT_VISIBILITY_LIMIT,
} from './executionSubstrate/executionSubstrateTypes';

// ── Phase 24 — deterministic operational cognition compression ─────
export {
  buildBlock as buildNarrativeBlock,
  buildOperationalNarrative,
  aggregateInheritedConfidence,
  listNarratives,
  recentNarrativeCount24h,
} from './cognitiveCompression/operationalNarrativeBuilder';
export type { BlockInput as NarrativeBlockInput, BuildNarrativeInput } from './cognitiveCompression/operationalNarrativeBuilder';
export { buildCausalStoryReplay } from './cognitiveCompression/causalStoryCompression';
export type { BuildCausalStoryInput } from './cognitiveCompression/causalStoryCompression';
export { buildRollbackNarrativeReplay } from './cognitiveCompression/rollbackNarrativeEngine';
export { buildContinuityNarrative } from './cognitiveCompression/continuityStoryEngine';
export { buildTopologyNarrativeReplay } from './cognitiveCompression/topologyNarrativeEngine';
export { buildOperationalTrustSurface } from './cognitiveCompression/trustSurfaceGenerator';
export { buildCognitiveLoadProfile } from './cognitiveCompression/cognitiveLoadAnalyzer';
export {
  buildOperatorGuidancePlan,
  listOperatorGuidancePlans,
  recentGuidancePlanCount24h,
} from './cognitiveCompression/operatorGuidanceOrchestrator';
export { buildCognitiveCompressionSummary } from './cognitiveCompression/compressionSummaryCounters';
export {
  listTemplateIds,
  getTemplateSpec,
  renderTemplate,
} from './cognitiveCompression/narrativeTemplateRegistry';
export type {
  CompressionSourcePhase,
  NarrativeCitation,
  NarrativeConfidenceBounds,
  OperationalNarrativeTier,
  NarrativeCompressionBounds,
  NarrativeDeterminismAttribution,
  NarrativeBlock,
  OperationalNarrativeKind,
  OperationalNarrative,
  CausalStoryReplay,
  RollbackNarrativeReplay,
  ContinuityNarrative,
  TopologyNarrativeReplay,
  OperationalTrustSurface,
  CognitiveLoadTier,
  CognitiveLoadProfile,
  GuidanceActionKind,
  GuidanceRankingRule,
  GuidanceRankingAttribution,
  GuidanceItem,
  OperatorGuidancePlan,
  CognitiveCompressionHealthScores,
  CognitiveCompressionSummarySnapshot,
} from './cognitiveCompression/cognitiveCompressionTypes';
export {
  MAX_NARRATIVES_PER_PARTITION,
  MAX_BLOCKS_PER_NARRATIVE,
  MAX_CITATIONS_PER_BLOCK,
  MAX_GUIDANCE_ITEMS_PER_PLAN,
  MAX_GUIDANCE_PLANS_PER_PARTITION,
  MAX_TEMPLATE_REGISTRY_SIZE,
  MAX_RENDERED_TEXT_CHARS,
  MAX_CAUSAL_CHAIN_DEPTH,
  COMPRESSION_RATIO_DENSE_THRESHOLD,
  COMPRESSION_RATIO_EXECUTIVE_THRESHOLD,
} from './cognitiveCompression/cognitiveCompressionTypes';

// ── Phase 25 — deterministic counterfactual operational projection ──
export {
  submitExecutionSandbox,
  listSandboxes,
  getSandbox,
  recentSandboxCount24h,
} from './experimentation/executionSandboxEngine';
export type { SubmitSandboxInput, SubmitSandboxResult } from './experimentation/executionSandboxEngine';
export {
  simulateRollback,
  listRollbackSimulations,
  recentRollbackSimulationCount24h,
} from './experimentation/rollbackSimulationEngine';
export type { SimulateRollbackInput } from './experimentation/rollbackSimulationEngine';
export {
  buildPropagationPreview,
  listPropagationPreviews,
  recentPropagationPreviewCount24h,
} from './experimentation/propagationPreviewEngine';
export type { BuildPropagationPreviewInput } from './experimentation/propagationPreviewEngine';
export {
  rehearseStabilization,
  listRehearsals,
  recentRehearsalCount24h,
} from './experimentation/stabilizationRehearsalEngine';
export type { RehearseStabilizationInput, RehearseStabilizationResult } from './experimentation/stabilizationRehearsalEngine';
export {
  buildTopologyExperimentationView,
} from './experimentation/topologyExperimentationGraph';
export type { TopologyExperimentationView, BuildTopologyExperimentationViewInput } from './experimentation/topologyExperimentationGraph';
export {
  evaluateSandboxSubmission,
  buildSandboxGovernanceProfile,
  listSandboxGovernanceAttributions,
  recentSandboxDecisionCount24h,
} from './experimentation/sandboxGovernanceSupervisor';
export { buildExperimentReplayBundle } from './experimentation/experimentReplayEngine';
export type { ExperimentReplayBundle, BuildReplayBundleInput } from './experimentation/experimentReplayEngine';
export { buildExperimentationTrustSurface } from './experimentation/experimentationTrustSurface';
export { buildExperimentationVisibilityReplay } from './experimentation/experimentationVisibilityReplay';
export { buildExperimentationSummary } from './experimentation/experimentationSummaryCounters';
export type {
  SandboxIsolationGuarantee,
  SimulationProjectionTier,
  ExperimentReplayConfidenceBounds,
  ExperimentReplayAttribution,
  SandboxDeterminismAttribution,
  ExperimentationBoundaryProfile,
  ProjectedChangeKind,
  ProjectionDeltaAttribution,
  SandboxGovernanceDecision,
  SandboxSupervisorRule,
  ExperimentationGovernanceAttribution,
  HypotheticalActionKind,
  HypotheticalAction,
  ExecutionSandboxProfile,
  RollbackSimulationStep,
  RollbackSimulationReplay,
  PropagationPreviewProfile,
  StabilizationRehearsalStep,
  StabilizationRehearsalReplay,
  TopologyExperimentationAnnotation,
  ExperimentationTrustSurface,
  ExperimentationVisibilityReplay,
  ExperimentationHealthScores,
  ExperimentationSummarySnapshot,
} from './experimentation/experimentationTypes';
export {
  MAX_SANDBOXES_PER_PARTITION,
  MAX_ROLLBACK_SIMULATIONS_PER_PARTITION,
  MAX_PROPAGATION_PREVIEWS_PER_PARTITION,
  MAX_REHEARSALS_PER_PARTITION,
  MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX,
  MAX_REHEARSAL_CHAIN_DEPTH,
  MAX_PROJECTION_BUDGET_MS,
  SANDBOX_TTL_MS,
} from './experimentation/experimentationTypes';

// ── Phase 26 — bounded live operational rehearsal substrate ────────
export { submitLiveSandbox } from './liveSandbox/liveSandboxCoordinator';
export type { SubmitLiveSandboxInput, SubmitLiveSandboxResult } from './liveSandbox/liveSandboxCoordinator';
export {
  createEphemeralRuntime,
  markRuntimeRunning,
  markRuntimeCompleted,
  markRuntimeFailed,
  expireRuntime,
  recordRuntimeHeartbeat,
  getRuntime,
  listRuntimes,
  activeRuntimeCount,
  recentRuntimeCount24h,
  recentExpirationCount24h,
} from './liveSandbox/ephemeralWorkerRuntime';
export {
  buildSandboxExecutionEnvelope,
  buildBoundaryProofChain,
} from './liveSandbox/sandboxExecutionEnvelope';
export { buildSandboxTopologyIsolationProfile } from './liveSandbox/sandboxTopologyIsolation';
export {
  rehearseSandboxRollback,
  listSandboxRollbackRehearsals,
  recentSandboxRollbackRehearsalCount24h,
} from './liveSandbox/sandboxRollbackRehearsal';
export type { RehearseSandboxRollbackInput } from './liveSandbox/sandboxRollbackRehearsal';
export {
  buildSandboxPreviewNarrative,
  listSandboxPreviewNarratives,
  recentSandboxPreviewNarrativeCount24h,
} from './liveSandbox/sandboxPreviewNarrativeBuilder';
export {
  evaluateLiveSandboxSubmission,
  buildLiveSandboxGovernanceProfile,
  listLiveSandboxGovernanceAttributions,
  recentLiveSandboxDecisionCount24h,
} from './liveSandbox/sandboxGovernanceSupervisor';
export {
  buildSandboxReplayBundle,
  getReplayDeterminismBounds,
} from './liveSandbox/sandboxReplayEngine';
export type { SandboxReplayBundle } from './liveSandbox/sandboxReplayEngine';
export { buildLiveSandboxTrustSurface } from './liveSandbox/sandboxTrustSurface';
export { buildLiveSandboxVisibilityReplay } from './liveSandbox/liveSandboxVisibilityReplay';
export { buildLiveSandboxSummary } from './liveSandbox/sandboxSummaryCounters';
export type {
  EphemeralRuntimeLifecycleTier,
  SandboxBoundaryProofChain,
  LiveSandboxHeartbeatAttribution,
  RehearsalPreviewCitation,
  SandboxReplayDeterminismBounds,
  SandboxRuntimeBoundaryTier,
  RuntimeLifecycleCompressionAttribution,
  SandboxExpirationTrigger,
  SandboxExpirationAttribution,
  EphemeralSandboxRuntimeProfile,
  SandboxExecutionEnvelope,
  SandboxTopologyIsolationProfile,
  SandboxRollbackRehearsalReplay,
  OperationalPreviewNarrativeBlock,
  OperationalPreviewNarrative,
  LiveSandboxGovernanceDecision,
  LiveSandboxSupervisorRule,
  SandboxGovernanceAttribution,
  SandboxGovernanceProfile,
  SandboxTrustSurface,
  LiveSandboxVisibilityReplay,
  LiveSandboxHealthScores,
  LiveSandboxSummarySnapshot,
} from './liveSandbox/liveSandboxTypes';
export {
  MAX_LIVE_SANDBOX_DEPTH,
  MAX_RUNTIMES_PER_PARTITION,
  MAX_HEARTBEATS_PER_RUNTIME,
  MAX_RUNTIME_TTL_MS,
  DEFAULT_RUNTIME_TTL_MS,
  RUNTIME_EXPIRING_WINDOW_MS,
} from './liveSandbox/liveSandboxTypes';

// ── Phase 27 — bounded delegated operational execution substrate ───
export {
  issueAuthorityEnvelope,
  validateEnvelope,
  consumeEnvelope,
  revokeEnvelope,
  transitionEnvelopeLifecycle,
  computeEnvelopeImmutabilityHash,
  getEnvelope as getDelegatedEnvelope,
  listEnvelopes as listDelegatedEnvelopes,
  recentEnvelopeCount24h as recentDelegatedEnvelopeCount24h,
} from './delegatedExecution/authorityEnvelopeEngine';
export type { IssueEnvelopeInput, IssueEnvelopeResult, EnvelopeValidationResult } from './delegatedExecution/authorityEnvelopeEngine';
export {
  getNonDelegatableRegistry,
  isActionForbidden,
  explainForbidden,
} from './delegatedExecution/nonDelegatableActionRegistry';
export {
  verifyRollbackCoverage,
} from './delegatedExecution/delegatedRollbackProtector';
export type { VerifyRollbackInput } from './delegatedExecution/delegatedRollbackProtector';
export {
  verifyTopologyContainment,
  computePreIssuanceContainmentProof,
} from './delegatedExecution/topologyDelegationContainment';
export type { VerifyContainmentInput } from './delegatedExecution/topologyDelegationContainment';
export {
  buildExecutionBudgetProfile,
  buildTimeoutBounds,
  runWithHardTimeout,
  recordBudgetConsumption,
} from './delegatedExecution/executionBudgetGovernor';
export {
  evaluateIssuance as evaluateDelegatedIssuance,
  evaluateExecution as evaluateDelegatedExecution,
  buildDelegatedGovernanceProfile,
  listDelegatedGovernanceAttributions,
  recentDelegatedDecisionCount24h,
} from './delegatedExecution/delegatedExecutionGovernance';
export type { IssuanceGateInput, IssuanceGateResult, ExecutionGateInput, ExecutionGateResult } from './delegatedExecution/delegatedExecutionGovernance';
export {
  executeDelegated,
  listExecutionTraces as listDelegatedExecutionTraces,
  getExecutionTrace as getDelegatedExecutionTrace,
  recentExecutionCount24h as recentDelegatedExecutionCount24h,
  recentRefusalCount24h as recentDelegatedRefusalCount24h,
  recentTimeoutCount24h as recentDelegatedTimeoutCount24h,
  recentExpirationCount24h as recentDelegatedExpirationCount24h,
} from './delegatedExecution/delegatedExecutionCoordinator';
export type { ExecuteDelegatedInput } from './delegatedExecution/delegatedExecutionCoordinator';
export {
  buildDelegatedReplayBundle,
  verifyTraceReplayability,
} from './delegatedExecution/delegatedExecutionReplay';
export type { DelegatedReplayBundle, BuildDelegatedReplayBundleInput } from './delegatedExecution/delegatedExecutionReplay';
export {
  buildAuthorityCompressionNarrative,
  listAuthorityNarratives,
} from './delegatedExecution/executionAuthorityCompressionNarrative';
export type { BuildAuthorityNarrativeInput } from './delegatedExecution/executionAuthorityCompressionNarrative';
export { buildDelegatedExecutionTrustSurface } from './delegatedExecution/delegatedExecutionTrustSurface';
export { buildDelegatedExecutionVisibilityReplay } from './delegatedExecution/delegatedExecutionVisibilityReplay';
export { buildDelegatedExecutionSummary } from './delegatedExecution/delegatedExecutionSummaryCounters';
export type {
  DelegatableActionKind,
  DelegatedAuthorityEnvelope,
  DelegatedExecutionLifecycleTier,
  AuthorityScopeBoundaryProofChain,
  DelegatedExecutionAttributionLineage,
  DelegatedExecutionTimeoutBounds,
  DelegatedGovernanceReplayHash,
  NonDelegatableActionKind,
  NonDelegatableOperationalActionRegistry,
  DelegatedExecutionFinalityProof,
  SafetyInvariantName,
  DelegatedExecutionSafetyInvariant,
  ExecutionAuthorityCompressionNarrativeBlock,
  ExecutionAuthorityCompressionNarrative,
  DelegatedRollbackProtectionProfile,
  TopologyDelegationContainmentProfile,
  ExecutionBudgetProfile,
  DelegatedGovernanceDecision,
  DelegatedSupervisorRule,
  DelegatedExecutionGovernanceAttribution,
  DelegatedExecutionGovernanceProfile,
  DelegatedExecutionReplayTrace,
  DelegatedExecutionOutcome,
  DelegatedExecutionResult,
  DelegatedExecutionTrustSurface,
  DelegatedExecutionVisibilityReplay,
  DelegatedExecutionHealthScores,
  DelegatedExecutionSummarySnapshot,
} from './delegatedExecution/delegatedExecutionTypes';
export {
  MAX_DELEGATION_DEPTH,
  MAX_ENVELOPE_TTL_MS,
  DEFAULT_ENVELOPE_TTL_MS,
  MAX_EXECUTION_TIMEOUT_MS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  PARTITION_HEALTH_MIN_SCORE,
} from './delegatedExecution/delegatedExecutionTypes';

// ── Phase 28 — execution resource governance + operational economics ─
// Deterministic resource accounting layer. Bounded, governance-safe,
// rollback-protected, topology-contained, replay-safe, organization-isolated.
// NOT autonomous orchestration — operator is sole authority source.
export {
  buildExecutionQuotaProfile, checkQuotaAvailability,
  recordConsumption as recordEconomicsConsumption,
  releaseConcurrent as releaseEconomicsConcurrent,
  setQuotaLimit, listQuotaGovernanceAttributions,
  recordQuotaExhaustion, listQuotaExhaustions,
  recentQuotaExhaustionCount24h, recentQuotaGovernanceCount24h,
} from './executionEconomics/executionQuotaEngine';
export type { SetQuotaLimitInput, SetQuotaLimitResult, QuotaAvailabilityResult } from './executionEconomics/executionQuotaEngine';
export {
  buildRuntimePressureProfile, listPressureSamples,
  recentPressureSampleCount24h,
} from './executionEconomics/runtimePressureGovernor';
export {
  buildTopologyLoadDistributionProfile, listLoadDistributionProfiles,
  recentLoadClassificationCount24h,
} from './executionEconomics/topologyLoadDistributionProfiler';
export {
  buildRollbackResourceForecast, listRollbackResourceForecasts,
  recentForecastCount24h,
} from './executionEconomics/rollbackResourceForecaster';
export { classifyEconomicsTier } from './executionEconomics/delegatedPressureClassifier';
export type { ClassifyEconomicsTierInput } from './executionEconomics/delegatedPressureClassifier';
export {
  buildEconomicsComposite, buildExecutionEconomicsReplay,
  verifyEconomicsReplayDeterminism,
} from './executionEconomics/executionEconomicsCoordinator';
export type { EconomicsComposite, BuildEconomicsCompositeInput } from './executionEconomics/executionEconomicsCoordinator';
export { buildExecutionEconomicsTrustSurface } from './executionEconomics/executionEconomicsTrustSurface';
export type { BuildTrustSurfaceInput as BuildEconomicsTrustSurfaceInput } from './executionEconomics/executionEconomicsTrustSurface';
export {
  buildExecutionEconomicsNarrative, listExecutionEconomicsNarratives,
  recentNarrativeCount24h as recentEconomicsNarrativeCount24h,
} from './executionEconomics/executionEconomicsNarrativeBuilder';
export { buildExecutionEconomicsVisibilityReplay } from './executionEconomics/executionEconomicsVisibilityReplay';
export { buildExecutionEconomicsSummary } from './executionEconomics/executionEconomicsSummaryCounters';
export {
  getForbiddenEconomicsRegistry, isEconomicsActionForbidden,
  explainForbiddenEconomics,
} from './executionEconomics/forbiddenEconomicsActionRegistry';
export type {
  QuotaResourceKey,
  ExecutionQuotaProfile,
  QuotaGovernanceAttribution,
  QuotaExhaustionAttribution,
  QuotaExhaustionFinalityProof,
  RuntimePressureProfile,
  TopologyLoadDistributionProfile,
  RollbackResourceForecast,
  EconomicsReplayDeterminismAttribution,
  ExecutionEconomicsBoundaryProofChain,
  EconomicsCompressionNarrativeBlock,
  ExecutionEconomicsNarrative,
  ExecutionEconomicsReplay,
  ExecutionEconomicsTrustSurface,
  ExecutionEconomicsHealthScores,
  ExecutionEconomicsSummarySnapshot,
  ExecutionEconomicsVisibilityReplay,
  ExecutionEconomicsTier,
  DelegatedPressureTier,
  ForbiddenEconomicsActionKind,
  ForbiddenEconomicsActionRegistry,
} from './executionEconomics/executionEconomicsTypes';
export {
  DEFAULT_QUOTA_LIMITS,
  MAX_QUOTA_LIMIT,
  MIN_QUOTA_LIMIT,
  FORECAST_HORIZON_MS,
  PRESSURE_SCORE_LOW,
  PRESSURE_SCORE_MODERATE,
  PRESSURE_SCORE_ELEVATED,
  PRESSURE_SCORE_CRITICAL,
} from './executionEconomics/executionEconomicsTypes';

// ── Phase 29 — stabilization playbook intelligence + recovery governance ─
// Read-only recommendation intelligence. Bounded, deterministic,
// rollback-protected, operator-mediated, replay-safe, organization-isolated.
// NOT autonomous recovery orchestration — operator click + Phase 27
// envelope is the sole mutation path.
export {
  listArchetypes as listStabilizationArchetypes,
  listBuiltInArchetypes,
  listOperatorArchetypes,
  getArchetype as getStabilizationArchetype,
  listArchetypeGovernanceAttributions,
  setOperatorArchetype,
  recentArchetypeGovernanceCount24h,
  verifyBuiltInIntegrity as verifyStabilizationBuiltInIntegrity,
} from './stabilizationIntelligence/recoveryArchetypeRegistry';
export type {
  SetOperatorArchetypeInput, SetOperatorArchetypeResult,
} from './stabilizationIntelligence/recoveryArchetypeRegistry';
export {
  buildRollbackSequencing, listSequencingProfiles,
  recentSequencingCount24h,
} from './stabilizationIntelligence/rollbackSequencingEngine';
export type {
  BuildSequencingInput, BuildSequencingResult,
} from './stabilizationIntelligence/rollbackSequencingEngine';
export {
  buildContinuityRestorationForecast, listForecasts as listContinuityForecasts,
  recentForecastCount24h as recentContinuityForecastCount24h,
} from './stabilizationIntelligence/continuityRestorationForecaster';
export type {
  BuildForecastInput as BuildContinuityForecastInput,
  BuildForecastResult as BuildContinuityForecastResult,
} from './stabilizationIntelligence/continuityRestorationForecaster';
export {
  buildRecoveryPressureProfile, buildContainmentAttribution,
  listPressureSamples as listRecoveryPressureSamples,
  recentPressureSampleCount24h as recentRecoveryPressureSampleCount24h,
} from './stabilizationIntelligence/recoveryPressureAnalyzer';
export {
  evaluateArchetypeApplication, recordArchetypeFinalityProof,
  listGovernanceAttributions as listRecoveryGovernanceAttributions,
  listFinalityProofs as listRecoveryFinalityProofs,
  recentGovernanceCount24h as recentRecoveryGovernanceCount24h,
  recentFinalityProofCount24h,
} from './stabilizationIntelligence/recoveryGovernanceSupervisor';
export type {
  ApplicationGateInput, ApplicationGateResult, RecordFinalityProofInput,
} from './stabilizationIntelligence/recoveryGovernanceSupervisor';
export {
  buildStabilizationComposite,
} from './stabilizationIntelligence/stabilizationPlaybookCoordinator';
export type {
  StabilizationComposite, BuildCompositeInput,
} from './stabilizationIntelligence/stabilizationPlaybookCoordinator';
export {
  buildStabilizationReplayBundle, verifyStabilizationReplayDeterminism,
  listReplayTraces as listStabilizationReplayTraces,
} from './stabilizationIntelligence/stabilizationReplayEngine';
export type {
  BuildReplayBundleInput as BuildStabilizationReplayBundleInput,
} from './stabilizationIntelligence/stabilizationReplayEngine';
export {
  buildStabilizationTrustSurface,
} from './stabilizationIntelligence/stabilizationTrustSurface';
export type {
  BuildTrustSurfaceInput as BuildStabilizationTrustSurfaceInput,
} from './stabilizationIntelligence/stabilizationTrustSurface';
export {
  buildStabilizationNarrative, listStabilizationNarratives,
  recentNarrativeCount24h as recentStabilizationNarrativeCount24h,
} from './stabilizationIntelligence/stabilizationNarrativeBuilder';
export type {
  BuildNarrativeInput as BuildStabilizationNarrativeInput,
} from './stabilizationIntelligence/stabilizationNarrativeBuilder';
export {
  buildStabilizationVisibilityReplay,
} from './stabilizationIntelligence/stabilizationVisibilityReplay';
export type {
  BuildVisibilityInput as BuildStabilizationVisibilityInput,
} from './stabilizationIntelligence/stabilizationVisibilityReplay';
export {
  buildStabilizationSummary,
} from './stabilizationIntelligence/stabilizationSummaryCounters';
export {
  getForbiddenRecoveryRegistry, isRecoveryActionForbidden,
  explainForbiddenRecovery,
} from './stabilizationIntelligence/forbiddenRecoveryActionRegistry';
export type {
  RecoveryArchetypeProvenance,
  RecoveryArchetypeProfile,
  RecoveryArchetypeStep,
  RecoveryArchetypeGovernanceAttribution,
  RecommendedEnvelopePayload,
  RollbackSequencingProfile,
  ContinuityRestorationForecast,
  RecoveryPressureProfile,
  RecoveryPressureContainmentAttribution,
  StabilizationReplayTrace,
  RecoveryGovernanceAttribution,
  RecoveryGovernanceDecision,
  RecoverySupervisorRule,
  StabilizationTrustSurface,
  StabilizationBoundaryProofChain,
  RecoveryReplayDeterminismAttribution,
  RecoveryArchetypeFinalityProof,
  StabilizationCompressionNarrativeBlock,
  StabilizationNarrative,
  StabilizationVisibilityReplay,
  StabilizationReplayBundle,
  StabilizationHealthScores,
  StabilizationSummarySnapshot,
  StabilizationTier,
  RecoveryPressureTier,
  ForbiddenRecoveryActionKind,
  ForbiddenRecoveryActionRegistry,
} from './stabilizationIntelligence/stabilizationIntelligenceTypes';
export {
  MAX_BUILT_IN_ARCHETYPES,
  MAX_OPERATOR_ARCHETYPES_PER_PARTITION,
  MAX_STEPS_PER_ARCHETYPE,
  FORECAST_CONFIDENCE_CAP,
} from './stabilizationIntelligence/stabilizationIntelligenceTypes';

// ── Phase 30 — recovery foresight UX + stabilization decision cognition ─
// Read-only comparison cognition. Bounded, deterministic, advisory-only,
// rollback-protected, replay-safe, operator-mediated, organization-isolated.
// NOT decision authority — the engine never ranks; operators sort UI side.
export {
  buildStabilizationDecisionComparison, listComparisons,
  listNeutralityProofs, listVisibilityAttributions,
  recentComparisonCount24h,
} from './recoveryForesight/stabilizationDecisionEngine';
export type {
  BuildComparisonInput,
} from './recoveryForesight/stabilizationDecisionEngine';
export {
  buildRollbackSurvivabilityComparison, listSurvivabilityComparisons,
  recentSurvivabilityCount24h,
} from './recoveryForesight/rollbackSurvivabilityComparator';
export type {
  BuildSurvivabilityInput,
} from './recoveryForesight/rollbackSurvivabilityComparator';
export {
  buildContinuityTradeoffProfile, listTradeoffProfiles,
  recentTradeoffCount24h,
} from './recoveryForesight/continuityTradeoffAnalyzer';
export type {
  BuildTradeoffInput,
} from './recoveryForesight/continuityTradeoffAnalyzer';
export {
  buildRecoveryArchaeologyReplay, listArchaeologyTraces,
  recentArchaeologyCount24h,
} from './recoveryForesight/recoveryArchaeologyReplay';
export type {
  BuildArchaeologyInput,
} from './recoveryForesight/recoveryArchaeologyReplay';
export {
  evaluateComparisonRequest, listDecisionGovernanceAttributions,
  recentDecisionGovernanceCount24h,
} from './recoveryForesight/decisionGovernanceSupervisor';
export type {
  ComparisonGateInput, ComparisonGateResult,
} from './recoveryForesight/decisionGovernanceSupervisor';
export {
  buildRecoveryForesightComposite,
} from './recoveryForesight/recoveryForesightCoordinator';
export type {
  RecoveryForesightComposite,
  BuildCompositeInput as BuildForesightCompositeInput,
} from './recoveryForesight/recoveryForesightCoordinator';
export {
  buildRecoveryForesightReplayBundle, verifyForesightReplayDeterminism,
  listForesightReplayTraces,
} from './recoveryForesight/stabilizationDecisionReplay';
export type {
  BuildReplayBundleInput as BuildForesightReplayBundleInput,
} from './recoveryForesight/stabilizationDecisionReplay';
export {
  buildStabilizationGuidanceSurface, listGuidanceSurfaces,
  recentGuidanceCount24h,
} from './recoveryForesight/stabilizationGuidanceSurface';
export type {
  BuildGuidanceInput,
} from './recoveryForesight/stabilizationGuidanceSurface';
export {
  buildRecoveryNarrativeWalkthrough, listWalkthroughs,
  recentWalkthroughCount24h,
} from './recoveryForesight/recoveryNarrativeWalkthrough';
export type {
  BuildWalkthroughInput,
} from './recoveryForesight/recoveryNarrativeWalkthrough';
export {
  buildRecoveryForesightTrustSurface,
} from './recoveryForesight/recoveryForesightTrustSurface';
export type {
  BuildTrustSurfaceInput as BuildForesightTrustSurfaceInput,
} from './recoveryForesight/recoveryForesightTrustSurface';
export {
  buildRecoveryForesightVisibilityReplay,
} from './recoveryForesight/recoveryForesightVisibilityReplay';
export type {
  BuildVisibilityInput as BuildForesightVisibilityInput,
} from './recoveryForesight/recoveryForesightVisibilityReplay';
export {
  buildRecoveryForesightSummary,
} from './recoveryForesight/recoveryForesightSummaryCounters';
export {
  getForbiddenForesightRegistry, isForesightActionForbidden,
  explainForbiddenForesight,
} from './recoveryForesight/forbiddenForesightActionRegistry';
export type {
  DecisionForesightTier,
  ArchetypeComparisonRow,
  StabilizationDecisionComparisonProfile,
  RollbackSurvivabilityRow,
  RollbackSurvivabilityComparison,
  ContinuityTradeoffRow,
  ContinuityTradeoffProfile,
  RecoveryArchaeologyReplayTrace,
  StabilizationGuidanceBlock,
  StabilizationGuidanceSurface,
  DecisionGovernanceAttribution,
  DecisionGovernanceDecision,
  DecisionSupervisorRule,
  StabilizationDecisionReplayTrace,
  RecoveryNarrativeWalkthroughBlock,
  RecoveryNarrativeWalkthrough,
  DecisionBoundaryProofChain,
  DecisionReplayDeterminismAttribution,
  ComparisonNeutralityProof,
  RecoveryForesightDeterminismBounds,
  DecisionVisibilityAttribution,
  RecoveryForesightTrustSurface,
  RecoveryForesightVisibilityReplay,
  RecoveryForesightReplayBundle,
  RecoveryForesightHealthScores,
  RecoveryForesightSummarySnapshot,
  ForbiddenForesightActionKind,
  ForbiddenForesightActionRegistry,
} from './recoveryForesight/recoveryForesightTypes';
export {
  MAX_COMPARISONS_PER_PARTITION,
  MAX_WALKTHROUGHS_PER_PARTITION,
  FORESIGHT_CONFIDENCE_CAP,
  COMPARISON_TIER_CONFIDENCE_THRESHOLD,
} from './recoveryForesight/recoveryForesightTypes';

// ── Phase 31 — operator cognition continuity + governance memory ───
// Replay-safe per-org append-only event log. Bounded, deterministic,
// operator-mediated, organization-isolated, replay-safe, governance-safe.
// NOT operator profiling — records WHAT happened, NEVER infers WHO the
// operator is or what they're likely to do next.
export {
  openSession, recordEvent, closeSession, sweepExpiredSessions,
  buildStabilizationSessionTimeline,
  listSessions, getSession,
  listEvents,
  recentSessionCount24h, recentEventCount24h,
} from './governanceMemory/stabilizationSessionTimeline';
export type {
  OpenSessionInput, OpenSessionResult,
  RecordEventInput, RecordEventResult,
  CloseSessionInput, CloseSessionResult,
  BuildTimelineInput,
} from './governanceMemory/stabilizationSessionTimeline';
export {
  buildOperatorContinuityProfile, recordNeutralityProof,
  listNeutralityProofs as listMemoryNeutralityProofs,
} from './governanceMemory/operatorContinuityRegistry';
export type {
  BuildContinuityProfileInput,
} from './governanceMemory/operatorContinuityRegistry';
export {
  buildGovernanceArchaeology, listArchaeologyReplays as listMemoryArchaeologyReplays,
  recentArchaeologyCount24h as recentMemoryArchaeologyCount24h,
} from './governanceMemory/governanceArchaeologyEngine';
export type {
  BuildArchaeologyInput as BuildMemoryArchaeologyInput,
} from './governanceMemory/governanceArchaeologyEngine';
export {
  buildReasoningContinuityReplay, verifyContinuityReplayDeterminism,
  listReplays as listReasoningContinuityReplays,
  recentReplayCount24h as recentReasoningContinuityReplayCount24h,
} from './governanceMemory/reasoningContinuityReplay';
export type {
  BuildReplayInput as BuildReasoningReplayInput,
} from './governanceMemory/reasoningContinuityReplay';
export {
  evaluateMemoryRequest, listMemoryGovernanceAttributions,
  recentMemoryGovernanceCount24h,
} from './governanceMemory/governanceMemorySupervisor';
export type {
  MemoryGateInput, MemoryGateResult,
} from './governanceMemory/governanceMemorySupervisor';
export {
  buildOperatorReasoningCompression, listCompressions as listMemoryCompressions,
  recentCompressionCount24h as recentMemoryCompressionCount24h,
} from './governanceMemory/operatorReasoningCompression';
export type {
  BuildCompressionInput,
} from './governanceMemory/operatorReasoningCompression';
export {
  buildCognitionTimelineSurface,
} from './governanceMemory/cognitionTimelineSurface';
export type {
  BuildTimelineSurfaceInput,
} from './governanceMemory/cognitionTimelineSurface';
export {
  buildGovernanceMemoryComposite, buildGovernanceMemoryReplayBundle,
} from './governanceMemory/governanceMemoryCoordinator';
export type {
  GovernanceMemoryComposite,
  BuildCompositeInput as BuildMemoryCompositeInput,
} from './governanceMemory/governanceMemoryCoordinator';
export {
  buildContinuityNarrative as buildMemoryContinuityNarrative,
  listContinuityNarratives as listMemoryContinuityNarratives,
  recentContinuityNarrativeCount24h as recentMemoryContinuityNarrativeCount24h,
} from './governanceMemory/continuityNarrativeBuilder';
export type {
  BuildContinuityNarrativeInput as BuildMemoryContinuityNarrativeInput,
} from './governanceMemory/continuityNarrativeBuilder';
export {
  buildGovernanceMemoryTrustSurface,
} from './governanceMemory/governanceMemoryTrustSurface';
export type {
  BuildTrustSurfaceInput as BuildMemoryTrustSurfaceInput,
} from './governanceMemory/governanceMemoryTrustSurface';
export {
  buildGovernanceMemoryVisibilityReplay,
} from './governanceMemory/governanceMemoryVisibilityReplay';
export type {
  BuildVisibilityInput as BuildMemoryVisibilityInput,
} from './governanceMemory/governanceMemoryVisibilityReplay';
export {
  buildGovernanceMemorySummary,
} from './governanceMemory/governanceMemorySummaryCounters';
export {
  getForbiddenMemoryRegistry, isMemoryActionForbidden,
  explainForbiddenMemory,
} from './governanceMemory/forbiddenMemoryActionRegistry';
export type {
  MemoryDensityTier,
  StabilizationSessionLifecycle,
  StabilizationSessionEventKind,
  StabilizationSessionEvent,
  StabilizationSessionTimeline,
  OperatorContinuityProfile,
  StabilizationSession,
  GovernanceArchaeologyReplay,
  ReasoningContinuityReplay,
  CognitionTimelinePoint,
  CognitionTimelineSurface,
  GovernanceMemoryAttribution,
  GovernanceMemoryDecision,
  GovernanceMemorySupervisorRule,
  ContinuityNarrativeBlock as MemoryContinuityNarrativeBlock,
  ContinuityNarrative as MemoryContinuityNarrative,
  ReasoningCompressionOmissionAttribution,
  OperatorReasoningCompression,
  MemoryBoundaryProofChain,
  MemoryReplayDeterminismAttribution,
  MemoryEventFinalityProof,
  MemoryNeutralityProof,
  GovernanceMemoryTrustSurface,
  GovernanceMemoryVisibilityReplay,
  GovernanceMemoryReplayBundle,
  GovernanceMemoryHealthScores,
  GovernanceMemorySummarySnapshot,
  ForbiddenMemoryActionKind,
  ForbiddenMemoryActionRegistry,
} from './governanceMemory/governanceMemoryTypes';
export {
  MAX_SESSIONS_PER_PARTITION,
  MAX_EVENTS_PER_PARTITION,
  MAX_EVENTS_PER_SESSION,
  SESSION_TTL_MS,
} from './governanceMemory/governanceMemoryTypes';

// ── Phase 32 — multi-operator governance continuity + handoff cognition ─
// Replay-safe per-org append-only handoff event log. Bounded, deterministic,
// operator-mediated, organization-isolated, replay-safe, governance-safe,
// anti-profiling. Handoff = typed event. NEVER trust transfer.
// authority_transfer_supported: false typed-as-literal on every handoff.
export {
  recordHandoff, acknowledgeHandoff, completeHandoff, declineHandoff,
  sweepExpiredHandoffs,
  listHandoffs, getHandoff,
  recentHandoffCount24h,
} from './operatorContinuity/governanceHandoffRegistry';
export type {
  RecordHandoffInput, RecordHandoffResult,
  TransitionHandoffInput, TransitionHandoffResult,
} from './operatorContinuity/governanceHandoffRegistry';
export {
  buildContinuityTransferBundle, listTransferBundles, getTransferBundle,
  recentTransferBundleCount24h,
} from './operatorContinuity/continuityTransferEngine';
export type {
  BuildTransferBundleInput, BuildTransferBundleResult,
} from './operatorContinuity/continuityTransferEngine';
export {
  buildSharedStabilizationTimeline,
} from './operatorContinuity/sharedStabilizationTimeline';
export type {
  BuildSharedTimelineInput,
} from './operatorContinuity/sharedStabilizationTimeline';
export {
  buildOperatorHandoffArchaeology,
  listArchaeologyReplays as listHandoffArchaeologyReplays,
  recentArchaeologyCount24h as recentHandoffArchaeologyCount24h,
} from './operatorContinuity/operatorHandoffArchaeology';
export type {
  BuildArchaeologyInput as BuildHandoffArchaeologyInput,
} from './operatorContinuity/operatorHandoffArchaeology';
export {
  buildCollaborativeContinuityReplay, verifyCollaborativeReplayDeterminism,
  listReplays as listCollaborativeReplays,
  recentReplayCount24h as recentCollaborativeReplayCount24h,
} from './operatorContinuity/collaborativeContinuityReplay';
export type {
  BuildReplayInput as BuildCollaborativeReplayInput,
} from './operatorContinuity/collaborativeContinuityReplay';
export {
  evaluateHandoffRequest, listHandoffGovernanceAttributions,
  recentHandoffGovernanceCount24h,
} from './operatorContinuity/handoffGovernanceSupervisor';
export type {
  HandoffGateInput, HandoffGateResult,
} from './operatorContinuity/handoffGovernanceSupervisor';
export {
  buildOperatorCoordinationCompression,
  listCompressions as listCoordinationCompressions,
  recentCompressionCount24h as recentCoordinationCompressionCount24h,
} from './operatorContinuity/operatorCoordinationCompression';
export type {
  BuildCompressionInput as BuildCoordinationCompressionInput,
} from './operatorContinuity/operatorCoordinationCompression';
export {
  buildMultiOperatorComposite, buildOperatorContinuityReplayBundle,
} from './operatorContinuity/multiOperatorCoordinator';
export type {
  MultiOperatorComposite,
  BuildCompositeInput as BuildMultiOperatorCompositeInput,
} from './operatorContinuity/multiOperatorCoordinator';
export {
  buildContinuityTransferNarrative as buildHandoffContinuityNarrative,
  listContinuityTransferNarratives as listHandoffContinuityNarratives,
  recentContinuityTransferNarrativeCount24h as recentHandoffContinuityNarrativeCount24h,
} from './operatorContinuity/continuityTransferNarrativeBuilder';
export type {
  BuildContinuityTransferNarrativeInput,
} from './operatorContinuity/continuityTransferNarrativeBuilder';
export {
  buildOperatorContinuityTrustSurface,
} from './operatorContinuity/operatorContinuityTrustSurface';
export type {
  BuildTrustSurfaceInput as BuildOperatorContinuityTrustSurfaceInput,
} from './operatorContinuity/operatorContinuityTrustSurface';
export {
  buildOperatorContinuityVisibilityReplay,
  recordHandoffReplayNeutralityProof,
  recordCollaborativeVisibilityAttribution,
  listHandoffNeutralityProofs,
  listCollaborativeVisibilityAttributions,
} from './operatorContinuity/operatorContinuityVisibilityReplay';
export type {
  BuildVisibilityInput as BuildOperatorContinuityVisibilityInput,
} from './operatorContinuity/operatorContinuityVisibilityReplay';
export {
  buildOperatorContinuitySummary,
} from './operatorContinuity/operatorContinuitySummaryCounters';
export {
  getForbiddenHandoffRegistry, isHandoffActionForbidden,
  explainForbiddenHandoff,
} from './operatorContinuity/forbiddenHandoffActionRegistry';
export type {
  HandoffDensityTier,
  HandoffLifecycleState,
  HandoffEventKind,
  GovernanceHandoffProfile,
  ContinuityTransferBundle,
  SharedStabilizationTimelinePoint,
  SharedStabilizationTimeline,
  OperatorHandoffArchaeologyReplay,
  CollaborativeContinuityReplay,
  HandoffGovernanceAttribution,
  HandoffGovernanceDecision,
  HandoffGovernanceSupervisorRule,
  ContinuityTransferNarrativeBlock,
  ContinuityTransferNarrative,
  CoordinationCompressionOmissionAttribution,
  OperatorCoordinationCompression,
  HandoffBoundaryProofChain,
  HandoffReplayDeterminismAttribution,
  HandoffEventFinalityProof,
  HandoffReplayNeutralityProof,
  ContinuityTransferDeterminismBounds,
  CollaborativeVisibilityAttribution,
  OperatorContinuityTrustSurface,
  OperatorContinuityVisibilityReplay,
  OperatorContinuityReplayBundle,
  OperatorContinuityHealthScores,
  OperatorContinuitySummarySnapshot,
  ForbiddenHandoffActionKind,
  ForbiddenHandoffActionRegistry,
} from './operatorContinuity/operatorContinuityTypes';
export {
  MAX_HANDOFFS_PER_PARTITION,
  MAX_TRANSFER_BUNDLES_PER_PARTITION,
  MAX_REFERENCES_PER_BUNDLE,
  HANDOFF_TTL_MS,
} from './operatorContinuity/operatorContinuityTypes';

// Auto-start the orchestration listener on first import. Idempotent —
// listener guards against double-start internally. We do this here
// rather than in server.ts so tests + scripts that import the engine
// also benefit from continuous reranking without extra wiring.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startRemediationOrchestrationListener } = require('./remediation/remediationOrchestrationListener');
  startRemediationOrchestrationListener();
} catch { /* test environment may not have all deps loaded */ }

// Phase 14: auto-start the verification listener + self-heal orchestrator.
// Both guard internally against double-start.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startExecutionVerificationListener } = require('./autonomy/executionVerificationListener');
  startExecutionVerificationListener();
} catch { /* test environment may not have all deps loaded */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startSelfHealingOrchestrator } = require('./autonomy/selfHealingOrchestrator');
  startSelfHealingOrchestrator();
} catch { /* test environment may not have all deps loaded */ }
