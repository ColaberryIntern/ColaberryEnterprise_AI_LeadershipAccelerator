/**
 * rollbackPreparationEngine — Phase 13 produces a complete
 * RollbackPreparation per autonomy decision. The Phase 12
 * autonomousRemediationPreparer's `buildRollbackPromptBody` already
 * builds the prompt body from a plan payload; this module composes
 * that with a replay-checkpoint snapshot reference + rollback
 * confidence so the operator dashboard can show "rollback ready: yes"
 * with a precise grounding.
 *
 * Phase 13 §A.4.
 */

import { buildRollbackPromptBody } from '../governance/autonomousRemediationPreparer';
import type { PlanPayload } from '../governance/autonomousRemediationPreparer';

export interface RollbackPreparationInput {
  readonly plan_payload: PlanPayload;
  /** Optional changeset to inject into the rollback prompt body. */
  readonly post_execution_change_set?: string | null;
  /** SystemStateSnapshot id captured immediately before the auto-approval. */
  readonly rollback_replay_checkpoint_snapshot_id: string | null;
  /** Sandbox passed signal — feeds rollback_confidence directly. */
  readonly sandbox_passed: boolean;
  /** Trust score for the action class (0-100). */
  readonly trust_score: number;
}

export interface RollbackPreparation {
  readonly rollback_prompt: string | null;
  readonly before_dom_snapshot_id: string | null;
  readonly post_execution_change_set: string | null;
  readonly rollback_replay_checkpoint_snapshot_id: string | null;
  readonly rollback_confidence: number;
  readonly notes: ReadonlyArray<string>;
}

export function prepareRollback(input: RollbackPreparationInput): RollbackPreparation {
  const notes: string[] = [];
  const rollback_prompt = buildRollbackPromptBody(input.plan_payload, input.post_execution_change_set);
  const before_dom_snapshot_id = input.plan_payload?.rollback?.before_dom_snapshot_id ?? null;

  if (!rollback_prompt) {
    notes.push('Rollback prompt unavailable: missing before-state DOM snapshot reference.');
  }
  if (!input.rollback_replay_checkpoint_snapshot_id) {
    notes.push('No replay checkpoint snapshot captured — rollback context degraded.');
  }
  if (!input.sandbox_passed) {
    notes.push('Sandbox did not pass — rollback safety lower.');
  }
  if (input.trust_score < 50) {
    notes.push('Trust score is low; consider operator-only rollback.');
  }

  // Confidence: scaled blend of (rollback prompt available, snapshot present,
  // sandbox passed, trust score above 60).
  let confidence = 0;
  if (rollback_prompt) confidence += 35;
  if (input.rollback_replay_checkpoint_snapshot_id) confidence += 25;
  if (input.sandbox_passed) confidence += 20;
  if (input.trust_score >= 60) confidence += 20;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    rollback_prompt,
    before_dom_snapshot_id,
    post_execution_change_set: input.post_execution_change_set ?? null,
    rollback_replay_checkpoint_snapshot_id: input.rollback_replay_checkpoint_snapshot_id,
    rollback_confidence: confidence,
    notes,
  };
}
