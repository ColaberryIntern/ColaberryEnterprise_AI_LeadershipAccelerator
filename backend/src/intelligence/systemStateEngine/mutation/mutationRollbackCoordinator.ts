/**
 * mutationRollbackCoordinator — Phase 15. Walks a MutationEnvelope's
 * rollback_chain in reverse and executes each compensating step.
 *
 * Supports four rollback shapes:
 *   - staged:     execute steps with brief gaps; surface intermediate
 *                 events. Use when the chain is long.
 *   - partial:    execute only the first N steps; used when an
 *                 operator wants to peel back a slice of a composite
 *                 mutation without reverting the whole thing.
 *   - replay-aware: same as full but re-records each compensating step
 *                 in the audit log so the rollback itself is replayable.
 *   - containment: rolls back AND moves the intent class into
 *                 'contained' state via the trust calibrator.
 *
 * Each RollbackStep has a discriminated `kind`. The coordinator dispatches
 * to small inline handlers; no third-party code path is hit.
 */

import type {
  MutationEnvelope,
  MutationIntent,
  RollbackStep,
} from './mutationTypes';
import { recordMutationRollback, recordMutationContainment } from './mutationTrustCalibrator';
import { noteMutationRollback } from './mutationSummaryCounters';

export type RollbackMode = 'full' | 'staged' | 'partial' | 'replay_aware' | 'containment';

export interface ExecuteRollbackInput {
  readonly envelope: MutationEnvelope;
  readonly mode: RollbackMode;
  readonly partial_count?: number;            // for 'partial' mode
  readonly operator_id?: string;
  readonly reason: string;
}

export interface RollbackResult {
  readonly mutation_id: string;
  readonly mode: RollbackMode;
  readonly steps_attempted: number;
  readonly steps_succeeded: number;
  readonly errors: ReadonlyArray<string>;
  readonly summary: string;
}

export async function executeRollback(input: ExecuteRollbackInput): Promise<RollbackResult> {
  const { envelope, mode, partial_count, reason, operator_id } = input;

  // Walk in REVERSE so compensating steps undo in the inverse order.
  const reversed = [...envelope.rollback_chain].reverse();
  const slice = mode === 'partial' && typeof partial_count === 'number'
    ? reversed.slice(0, Math.max(0, partial_count))
    : reversed;

  const errors: string[] = [];
  let succeeded = 0;
  for (let i = 0; i < slice.length; i++) {
    const step = slice[i];
    try {
      await executeStep(step, envelope.scope.project_id, envelope.mutation_class);
      succeeded++;
      if (mode === 'replay_aware') {
        await writeReplayAudit(envelope, step, i, operator_id);
      }
      if (mode === 'staged' && i < slice.length - 1) {
        // Yield briefly between steps so SSE consumers see incremental
        // progress. Keep the gap small — this is not for human pacing.
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (err: any) {
      errors.push(`step ${i} (${step.kind}): ${err?.message || err}`);
    }
  }

  // Trust calibration: every non-empty rollback bumps the rollback counter.
  recordMutationRollback(envelope.scope.project_id, envelope.mutation_class);
  if (mode === 'containment') {
    recordMutationContainment(envelope.scope.project_id, envelope.mutation_class);
  }
  noteMutationRollback(envelope.scope.project_id);

  // Audit row for the rollback itself
  await writeRollbackAudit(envelope, mode, slice.length, succeeded, errors, reason, operator_id);

  return {
    mutation_id: envelope.mutation_id,
    mode,
    steps_attempted: slice.length,
    steps_succeeded: succeeded,
    errors,
    summary: errors.length === 0
      ? `ROLLBACK ${mode.toUpperCase()} OK (${succeeded}/${slice.length} steps).`
      : `ROLLBACK ${mode.toUpperCase()} PARTIAL (${succeeded}/${slice.length} succeeded; ${errors.length} errors).`,
  };
}

async function executeStep(step: RollbackStep, project_id: string, _intent: MutationIntent): Promise<void> {
  switch (step.kind) {
    case 'restore_automation_mode': {
      const { setAutomationMode } = await import('../governance/decisionAutomationEngine');
      const mode = (step.args.mode as any) ?? 'autonomous';
      setAutomationMode(project_id, mode);
      return;
    }
    case 'lift_isolation': {
      const { liftIsolation } = await import('../autonomy/isolationRegistry');
      const sig = step.args.signature as string;
      if (!sig) return;
      await liftIsolation(project_id, sig);
      return;
    }
    case 'restore_trust': {
      // Engine's `recordExecutionSuccess` is the canonical positive
      // counter; we use it to nudge trust back when a TRUST_RECALIBRATION
      // is reverted.
      const { recordExecutionSuccess } = await import('../autonomy/autonomyTrustState');
      const action_class = (step.args.action_class as any) ?? 'autonomous_safe';
      recordExecutionSuccess(project_id, action_class);
      return;
    }
    case 'restore_policy': {
      const { updatePolicy } = await import('../policy/cognitivePolicyEngine');
      const update = (step.args.update as any) ?? {};
      await updatePolicy(project_id, update, { persist: false });
      return;
    }
    case 'restore_pressure': {
      // Pressure engine self-heals via its own ticks; no manual reset
      // surface exists at the cluster level. The compensating step
      // emits a pressure.changed event signalling the rollback so
      // downstream listeners (Cory dashboard) reflect it; the engine
      // itself rebalances on its next tick.
      try {
        const { publishCognitiveEvent } = await import('../realtime/cognitiveEventBus');
        publishCognitiveEvent({
          kind: 'pressure.changed',
          project_id,
          severity: 'info',
          payload: { source: 'mutation_rollback_restore_pressure', cluster_id: step.args.cluster_id },
        });
      } catch { /* fail-soft */ }
      return;
    }
    case 'undo_cooldown': {
      // Cooldown gates are self-expiring; the inverse is a no-op + audit
      // entry. We log the intent so replay sees the rollback step.
      return;
    }
    case 'noop':
      return;
    default: {
      // Exhaustiveness guard — TS will warn at compile time if a new
      // RollbackStep kind is added without a handler here.
      const _exhaustive: never = step.kind as never;
      throw new Error(`Unknown rollback step kind: ${String(_exhaustive)}`);
    }
  }
}

async function writeRollbackAudit(
  env: MutationEnvelope,
  mode: RollbackMode,
  attempted: number,
  succeeded: number,
  errors: ReadonlyArray<string>,
  reason: string,
  operator_id: string | undefined,
): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: env.scope.project_id,
      kind: 'mutation_rolled_back',
      subject_id: env.mutation_id,
      payload: {
        mutation_class: env.mutation_class,
        mode,
        steps_attempted: attempted,
        steps_succeeded: succeeded,
        errors,
        reason,
      },
      operator_id: operator_id ?? null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[mutationRollbackCoordinator] audit write failed:', err?.message);
  }
}

async function writeReplayAudit(env: MutationEnvelope, step: RollbackStep, index: number, operator_id?: string): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: env.scope.project_id,
      kind: 'mutation_rolled_back',
      subject_id: env.mutation_id,
      payload: { replay_step: step, index, mutation_class: env.mutation_class },
      operator_id: operator_id ?? null,
      recorded_at: new Date(),
    } as any);
  } catch { /* fail-soft */ }
}
