/**
 * safeLearningGuardrails — bounds and safety checks that wrap any
 * proposed adaptation before it touches production policy.
 *
 * Implements:
 *   - bounded adaptation (per-tick max delta)
 *   - confidence floor (don't apply low-confidence proposals)
 *   - rollback trigger (revert if outcomes worsen after adaptation)
 *   - supervised mode (adaptations require human approval)
 *
 * Phase 10 §12.
 */
import type { PriorityWeights, WeightAdjustmentProposal } from '../learning/adaptivePriorityTrainer';

export type GuardrailMode = 'autonomous' | 'supervised' | 'frozen';

export interface GuardrailConfig {
  readonly mode: GuardrailMode;
  readonly min_confidence_to_apply: number;        // 0-100
  readonly max_total_drift_per_window: number;     // sum-of-abs-deltas across rolling window
  readonly rollback_after_worse_outcomes: number;  // count of consecutive bad outcomes that trigger rollback
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = Object.freeze({
  mode: 'supervised',
  min_confidence_to_apply: 65,
  max_total_drift_per_window: 0.10,
  rollback_after_worse_outcomes: 3,
});

export interface GuardrailDecision {
  readonly action: 'apply' | 'queue_for_review' | 'reject' | 'rollback';
  readonly reason: string;
  readonly proposal: WeightAdjustmentProposal | null;
  readonly mode: GuardrailMode;
}

export interface GuardrailContext {
  readonly proposal: WeightAdjustmentProposal;
  readonly recent_drift: number;                  // sum of abs deltas applied in window
  readonly consecutive_worse_outcomes: number;
  readonly config?: GuardrailConfig;
  /** Snapshot of weights to roll back to when rollback fires. */
  readonly rollback_target?: PriorityWeights;
}

export function evaluateGuardrails(ctx: GuardrailContext): GuardrailDecision {
  const config = ctx.config ?? DEFAULT_GUARDRAILS;

  // 1. Rollback takes precedence
  if (ctx.consecutive_worse_outcomes >= config.rollback_after_worse_outcomes) {
    return {
      action: 'rollback',
      reason: `${ctx.consecutive_worse_outcomes} consecutive worse outcomes — reverting to last-known-good policy.`,
      proposal: ctx.rollback_target
        ? {
            proposed: ctx.rollback_target,
            deltas: { priority: 0, blocking: 0, maturity_gain: 0, readiness_gain: 0, dependency: 0, confidence: 0, execution_cost_penalty: 0 },
            reasons: ['Rollback to safe baseline.'],
            confidence: 100,
            clamped: false,
          }
        : null,
      mode: config.mode,
    };
  }

  // 2. Frozen mode rejects everything
  if (config.mode === 'frozen') {
    return { action: 'reject', reason: 'Learning frozen by operator.', proposal: null, mode: 'frozen' };
  }

  // 3. Confidence floor
  if (ctx.proposal.confidence < config.min_confidence_to_apply) {
    return {
      action: 'queue_for_review',
      reason: `Proposal confidence ${ctx.proposal.confidence} below floor ${config.min_confidence_to_apply}.`,
      proposal: ctx.proposal,
      mode: config.mode,
    };
  }

  // 4. Drift budget
  const proposalDrift = Object.values(ctx.proposal.deltas).reduce((s, d) => s + Math.abs(d), 0);
  if (ctx.recent_drift + proposalDrift > config.max_total_drift_per_window) {
    return {
      action: 'reject',
      reason: `Drift budget exhausted (recent ${ctx.recent_drift.toFixed(3)} + proposal ${proposalDrift.toFixed(3)} > ${config.max_total_drift_per_window}).`,
      proposal: ctx.proposal,
      mode: config.mode,
    };
  }

  // 5. Supervised mode queues; autonomous applies
  if (config.mode === 'supervised') {
    return {
      action: 'queue_for_review',
      reason: 'Supervised mode — proposal queued for human approval.',
      proposal: ctx.proposal,
      mode: 'supervised',
    };
  }

  return {
    action: 'apply',
    reason: 'All guardrails passed.',
    proposal: ctx.proposal,
    mode: 'autonomous',
  };
}
