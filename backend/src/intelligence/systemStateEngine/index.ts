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
