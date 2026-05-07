/**
 * orchestrationLearningEngine — top-level coordinator that runs the
 * outcome → proposal → guardrail → policy update loop.
 *
 * Pipeline:
 *   1. Aggregate recent remediation outcomes for a project.
 *   2. Score escalation effectiveness from dispatch history.
 *   3. Calibrate operational confidence.
 *   4. Propose weight adjustments from outcomes.
 *   5. Run guardrails on the proposal.
 *   6. Apply / queue / reject / rollback.
 *   7. Persist a policy snapshot.
 *
 * Phase 10 §1, §9.
 */
import { aggregateOutcomes } from './remediationOutcomeLearner';
import { proposeWeightAdjustments, type OutcomeBucket, type WeightAdjustmentProposal } from './adaptivePriorityTrainer';
import { calibrateOperationalConfidence, type OrchestrationConfidence } from './operationalConfidenceCalibrator';
import { evaluateGuardrails, type GuardrailDecision } from '../policy/safeLearningGuardrails';
import {
  getPolicy,
  recentDriftFor,
  consecutiveWorseOutcomesFor,
  updatePolicy,
} from '../policy/cognitivePolicyEngine';

export interface LearningTickResult {
  readonly project_id: string;
  readonly outcomes_aggregated: number;
  readonly proposal: WeightAdjustmentProposal;
  readonly decision: GuardrailDecision;
  readonly confidence: OrchestrationConfidence;
  readonly policy_version: number;
  readonly elapsed_ms: number;
}

export async function runLearningTick(projectId: string): Promise<LearningTickResult> {
  const t0 = Date.now();
  const aggregate = await aggregateOutcomes({ project_id: projectId, since_days: 30 });

  // Build per-task-type outcome buckets. V1 uses a single global bucket
  // until per-task-type outcome tagging lands; this is correct shape.
  const buckets: Record<string, OutcomeBucket> = {
    global: {
      attempts: aggregate.total_attempts,
      resolved: aggregate.resolved_count,
      avg_pressure_delta: aggregate.avg_pressure_delta ?? 0,
      avg_cognition_delta: aggregate.avg_cognition_delta ?? 0,
    },
  };

  const policy = getPolicy(projectId);
  const proposal = proposeWeightAdjustments(policy.priority_weights, buckets);

  const confidence = calibrateOperationalConfidence({
    sample_count: aggregate.total_attempts,
    prediction_accuracy: aggregate.total_attempts > 0
      ? aggregate.resolved_count / aggregate.total_attempts
      : 0.5,
    contradiction_churn_per_hour: 0,         // wire when contradiction stream surfaces this
    policy_changes_last_24h: 0,              // wire from snapshots
    historical_pattern_matches: 0,           // wire from federated registry
    recent_remediation_success_rate: aggregate.total_attempts > 0
      ? aggregate.resolved_count / aggregate.total_attempts
      : 0,
  });

  const decision = evaluateGuardrails({
    proposal,
    recent_drift: recentDriftFor(projectId),
    consecutive_worse_outcomes: consecutiveWorseOutcomesFor(projectId),
    rollback_target: policy.priority_weights,
  });

  let updatedVersion = policy.version;
  if (decision.action === 'apply' && decision.proposal) {
    const drift = Object.values(decision.proposal.deltas).reduce((s, d) => s + Math.abs(d), 0);
    const next = await updatePolicy(projectId, {
      priority_weights: decision.proposal.proposed,
      trigger: 'autonomous.applied',
      applied_drift: drift,
    }, { confidence: confidence.confidence });
    updatedVersion = next.version;
  } else if (decision.action === 'rollback' && decision.proposal) {
    const next = await updatePolicy(projectId, {
      priority_weights: decision.proposal.proposed,
      trigger: 'autonomous.rollback',
      applied_drift: 0,
    }, { confidence: 100 });
    updatedVersion = next.version;
  }

  return {
    project_id: projectId,
    outcomes_aggregated: aggregate.total_attempts,
    proposal,
    decision,
    confidence,
    policy_version: updatedVersion,
    elapsed_ms: Date.now() - t0,
  };
}
