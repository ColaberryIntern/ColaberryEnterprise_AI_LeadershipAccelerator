/**
 * directMutationEngine — Phase 15 top-level coordinator.
 *
 * For each governed autonomous mutation:
 *   1. Build a MutationEnvelope (envelope-first; nothing mutates state
 *      without an envelope).
 *   2. Forecast blast radius via mutationBlastRadiusForecaster.
 *   3. Run gates: containment check, blast gate, trust floor, rate limit.
 *   4. Apply the in-memory state mutation (no source-code edits, no DB
 *      schema changes — operational state only).
 *   5. Persist envelope as `mutation_envelope_created` audit row + emit
 *      `mutation.execution.started`.
 *   6. Schedule the verification engine to score the outcome.
 *
 * v1 supports applying mutations for:
 *   - QUEUE_STABILIZATION: registers a cooldown gate so the next rerank
 *     of the named cluster short-circuits.
 *   - PRESSURE_REBALANCE: invokes rerankClusterPriority.
 *   - ISOLATION_CONTAINMENT: records an isolation entry.
 *   - AUTOMATION_DEESCALATION: setAutomationMode(supervised).
 *   - TRUST_RECALIBRATION: applies a one-shot trust adjustment.
 *   - POLICY_NUDGE: shifts a cognitivePolicy threshold by ±5.
 *   - SELF_HEALING_ACTION: composite — wraps all of the above.
 *
 * Each apply path is intentionally narrow: the engine never mutates
 * source code, never runs Claude Code, never touches user-facing files.
 * It mutates the platform's own operational cognition state.
 */

import { randomUUID } from 'crypto';
import type {
  MutationEnvelope,
  MutationIntent,
  MutationScope,
  MutationContainmentState,
  MutationProvenanceChain,
  MutationVerificationResult,
  RollbackStep,
  MutationVerificationStatus,
} from './mutationTypes';
import { forecastMutationBlast, evaluateMutationBlastGate } from './mutationBlastRadiusForecaster';
import {
  isIntentFrozen, mutationTrustScore, recordMutationSuccess, recordMutationVerificationFailure,
} from './mutationTrustCalibrator';
import { isClassContained } from './mutationContainmentEngine';
import { allowByRateLimit, withCooldown } from '../realtime/cognitiveStabilityProtection';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';
import { verifyMutation } from './mutationVerificationEngine';
import { noteMutationFired, noteMutationVerification } from './mutationSummaryCounters';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;     // Phase 14 used 3 for handoffs; mutations of operational state are cheaper.
const TRUST_FLOOR = 40;       // Below this, the engine refuses autonomous fire.

export type FireOutcome =
  | 'fired'
  | 'rejected_contained'
  | 'rejected_blast'
  | 'rejected_trust_floor'
  | 'rejected_rate_limit'
  | 'rejected_dry_run'
  | 'apply_failed';

export interface FireMutationInput {
  readonly project_id: string;
  readonly intent: MutationIntent;
  readonly mutation_intent: string;             // human-readable one-liner
  readonly scope: MutationScope;
  readonly provenance: MutationProvenanceChain;
  readonly args: Readonly<Record<string, unknown>>;
  /** When true, run all gates + envelope build but skip actual state apply. */
  readonly dry_run?: boolean;
  /** Override the engine's blast forecaster inputs when callers know better. */
  readonly forecast_overrides?: {
    readonly dependency_fanout?: number;
    readonly proposed_magnitude?: number;
    readonly active_class_concurrency?: number;
    readonly current_orchestration_stability?: number;
    readonly current_cognition_health?: number;
  };
}

export interface FireMutationResult {
  readonly envelope: MutationEnvelope;
  readonly outcome: FireOutcome;
  readonly reason: string;
  readonly summary: string;
  readonly verification?: MutationVerificationResult;
}

export async function fireDirectMutation(input: FireMutationInput): Promise<FireMutationResult> {
  // 1. Build the envelope (always — even rejected mutations get an envelope
  //    written so audit/replay can see WHY they were rejected).
  const envelope = buildEnvelope(input);

  // 2. Containment + freeze gate
  if (isClassContained(input.project_id, input.intent) || isIntentFrozen(input.project_id, input.intent)) {
    return finalize(envelope, 'rejected_contained', `Intent class ${input.intent} is contained or frozen.`);
  }

  // 3. Trust floor (skip for ISOLATION_CONTAINMENT and AUTOMATION_DEESCALATION
  //    since those are SAFE-state mutations the engine should always allow).
  const trust = mutationTrustScore(input.project_id, input.intent);
  if (input.intent !== 'ISOLATION_CONTAINMENT' && input.intent !== 'AUTOMATION_DEESCALATION' && trust < TRUST_FLOOR) {
    return finalize(envelope, 'rejected_trust_floor', `Trust ${trust}/100 below floor ${TRUST_FLOOR}.`);
  }

  // 4. Blast gate
  const blastGate = evaluateMutationBlastGate(envelope.blast_radius);
  if (blastGate.action === 'reject') {
    return finalize(envelope, 'rejected_blast', blastGate.reason);
  }

  // 5. Per-project rate limit
  const allowed = allowByRateLimit({
    key: `mutation_fire_${input.project_id}`,
    window_ms: RATE_LIMIT_WINDOW_MS,
    max_per_window: RATE_LIMIT_MAX,
  });
  if (!allowed) {
    return finalize(envelope, 'rejected_rate_limit', `Project ${input.project_id} hit ${RATE_LIMIT_MAX}/min cap.`);
  }

  if (input.dry_run) {
    return finalize(envelope, 'rejected_dry_run', 'Dry run — gates passed, apply skipped.');
  }

  // 6. Apply
  let applyError: string | null = null;
  try {
    await applyMutation(input);
  } catch (err: any) {
    applyError = err?.message || String(err);
  }
  if (applyError) {
    return finalize(envelope, 'apply_failed', applyError);
  }

  const executedEnvelope: MutationEnvelope = { ...envelope, executed_at: new Date().toISOString() };

  // 7. Audit + event
  await writeEnvelopeAudit(executedEnvelope, 'mutation_executed');
  noteMutationFired(input.project_id, executedEnvelope.mutation_id);
  publishCognitiveEvent({
    kind: 'mutation.execution.started',
    project_id: input.project_id,
    severity: 'info',
    payload: {
      mutation_id: executedEnvelope.mutation_id,
      intent: executedEnvelope.mutation_class,
      blast_score: executedEnvelope.blast_radius.score,
    },
  });

  // 8. Schedule verification (synchronously inline for v1; future phases
  //    can hand off to a worker). Verification failure flips the
  //    envelope's verification_status and emits failure events.
  const verification = await verifyAndFinalize(executedEnvelope);

  return {
    envelope: { ...executedEnvelope, verification_status: verification.mutation_success ? 'verified' : 'failed', verified_at: verification.verified_at },
    outcome: 'fired',
    reason: 'Mutation applied + verification scheduled.',
    summary: `MUTATION FIRED ${executedEnvelope.mutation_class}: ${executedEnvelope.mutation_intent}.`,
    verification,
  };
}

function buildEnvelope(input: FireMutationInput): MutationEnvelope {
  const id = `mut-${randomUUID()}`;
  const blast = forecastMutationBlast({
    intent: input.intent,
    project_id: input.project_id,
    dependency_fanout: input.forecast_overrides?.dependency_fanout ?? 0,
    proposed_magnitude: input.forecast_overrides?.proposed_magnitude ?? 5,
    active_class_concurrency: input.forecast_overrides?.active_class_concurrency ?? 0,
    current_orchestration_stability: input.forecast_overrides?.current_orchestration_stability ?? 80,
    current_cognition_health: input.forecast_overrides?.current_cognition_health ?? 80,
  });
  const rollback_chain = buildRollbackChain(input);
  const reversibility = pickReversibility(input.intent);
  const containment_state: MutationContainmentState = isClassContained(input.project_id, input.intent) ? 'contained' : 'none';
  const trust_score = mutationTrustScore(input.project_id, input.intent);

  return {
    mutation_id: id,
    mutation_class: input.intent,
    mutation_intent: input.mutation_intent,
    scope: input.scope,
    reversibility,
    rollback_chain,
    blast_radius: blast,
    trust_score,
    verification_status: 'pending' satisfies MutationVerificationStatus,
    containment_state,
    provenance: input.provenance,
    provenance_origin: 'autonomous',
    created_at: new Date().toISOString(),
    executed_at: null,
    verified_at: null,
    rolled_back_at: null,
  };
}

function pickReversibility(intent: MutationIntent): MutationEnvelope['reversibility'] {
  switch (intent) {
    case 'TRUST_RECALIBRATION':
    case 'POLICY_NUDGE':
      return 'pure_inmemory';
    case 'ISOLATION_CONTAINMENT':
      return 'audit_backed';
    case 'AUTOMATION_DEESCALATION':
      return 'audit_backed';
    case 'PRESSURE_REBALANCE':
    case 'QUEUE_STABILIZATION':
      return 'pure_inmemory';
    case 'SELF_HEALING_ACTION':
      return 'composite';
  }
}

function buildRollbackChain(input: FireMutationInput): RollbackStep[] {
  switch (input.intent) {
    case 'AUTOMATION_DEESCALATION': {
      const previous_mode = (input.args.previous_mode as string) ?? 'autonomous';
      return [{ kind: 'restore_automation_mode', args: { mode: previous_mode } }];
    }
    case 'ISOLATION_CONTAINMENT': {
      const sig = (input.args.cluster_signature as string) ?? '';
      return sig ? [{ kind: 'lift_isolation', args: { signature: sig } }] : [{ kind: 'noop', args: {} }];
    }
    case 'TRUST_RECALIBRATION':
      return [{ kind: 'restore_trust', args: { action_class: input.args.action_class ?? 'autonomous_safe' } }];
    case 'POLICY_NUDGE':
      return [{ kind: 'restore_policy', args: { update: input.args.previous_policy ?? {} } }];
    case 'PRESSURE_REBALANCE':
      return [{ kind: 'restore_pressure', args: { cluster_id: input.args.cluster_id } }];
    case 'QUEUE_STABILIZATION':
      return [{ kind: 'undo_cooldown', args: { key: input.args.cooldown_key } }];
    case 'SELF_HEALING_ACTION':
      return [
        { kind: 'restore_automation_mode', args: { mode: input.args.previous_mode ?? 'autonomous' } },
        { kind: 'undo_cooldown', args: { key: input.args.cooldown_key } },
      ];
  }
}

async function applyMutation(input: FireMutationInput): Promise<void> {
  switch (input.intent) {
    case 'AUTOMATION_DEESCALATION': {
      const { setAutomationMode } = await import('../governance/decisionAutomationEngine');
      const mode = ((input.args.target_mode as string) ?? 'supervised') as 'autonomous' | 'supervised' | 'frozen';
      setAutomationMode(input.project_id, mode);
      return;
    }
    case 'ISOLATION_CONTAINMENT': {
      const { recordIsolation } = await import('../autonomy/isolationRegistry');
      const sig = (input.args.cluster_signature as string) ?? '';
      const reason = (input.args.reason as string) ?? 'autonomous_mutation_containment';
      if (!sig) return;
      await recordIsolation({ project_id: input.project_id, signature: sig, reason });
      return;
    }
    case 'TRUST_RECALIBRATION': {
      const { recordExecutionBlocked } = await import('../autonomy/autonomyTrustState');
      const action_class = ((input.args.action_class as string) ?? 'autonomous_safe') as any;
      // A negative-direction recalibration uses recordExecutionBlocked to
      // dampen trust; a positive-direction one would call recordExecutionSuccess.
      recordExecutionBlocked(input.project_id, action_class);
      return;
    }
    case 'POLICY_NUDGE': {
      const { updatePolicy } = await import('../policy/cognitivePolicyEngine');
      const update = (input.args.policy_update as any) ?? {};
      await updatePolicy(input.project_id, update, { persist: false });
      return;
    }
    case 'PRESSURE_REBALANCE': {
      // The pressure engine self-rebalances on its own ticks; v1
      // PRESSURE_REBALANCE simply publishes the rebalance request as a
      // pressure.changed event so downstream listeners can react. We do
      // NOT invoke rerankClusterPriority directly — its API expects a
      // full clusters array we don't have at this layer.
      publishCognitiveEvent({
        kind: 'pressure.changed',
        project_id: input.project_id,
        severity: 'info',
        payload: { source: 'mutation_pressure_rebalance', cluster_id: input.args.cluster_id },
      });
      return;
    }
    case 'QUEUE_STABILIZATION': {
      const key = (input.args.cooldown_key as string) ?? `queue_stab_${input.project_id}`;
      const ms = (input.args.cooldown_ms as number) ?? 5 * 60 * 1000;
      withCooldown(key, ms);
      return;
    }
    case 'SELF_HEALING_ACTION': {
      const { setAutomationMode } = await import('../governance/decisionAutomationEngine');
      setAutomationMode(input.project_id, 'supervised');
      const cooldownKey = (input.args.cooldown_key as string) ?? `self_heal_action_${input.project_id}`;
      withCooldown(cooldownKey, 30 * 60 * 1000);
      return;
    }
  }
}

async function verifyAndFinalize(envelope: MutationEnvelope): Promise<MutationVerificationResult> {
  const verification = await verifyMutation({ envelope });
  noteMutationVerification(envelope.scope.project_id);
  if (verification.mutation_success) {
    recordMutationSuccess(envelope.scope.project_id, envelope.mutation_class);
    publishCognitiveEvent({
      kind: 'mutation.execution.verified',
      project_id: envelope.scope.project_id,
      severity: 'info',
      payload: {
        mutation_id: envelope.mutation_id,
        intent: envelope.mutation_class,
        confidence: verification.verification_confidence,
      },
    });
    publishCognitiveEvent({
      kind: 'mutation.empirical.validation',
      project_id: envelope.scope.project_id,
      severity: 'info',
      payload: verification,
    });
    await writeEnvelopeAudit({ ...envelope, verification_status: 'verified', verified_at: verification.verified_at }, 'mutation_verified');
    return verification;
  }
  recordMutationVerificationFailure(envelope.scope.project_id, envelope.mutation_class);
  publishCognitiveEvent({
    kind: 'mutation.execution.failed',
    project_id: envelope.scope.project_id,
    severity: 'warning',
    payload: { mutation_id: envelope.mutation_id, intent: envelope.mutation_class, evidence: verification.evidence },
  });
  publishCognitiveEvent({
    kind: 'mutation.empirical.validation',
    project_id: envelope.scope.project_id,
    severity: 'warning',
    payload: verification,
  });
  await writeEnvelopeAudit({ ...envelope, verification_status: 'failed', verified_at: verification.verified_at }, 'mutation_failed');
  return verification;
}

async function writeEnvelopeAudit(envelope: MutationEnvelope, kind: 'mutation_executed' | 'mutation_verified' | 'mutation_failed' | 'mutation_envelope_created'): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: envelope.scope.project_id,
      kind,
      subject_id: envelope.mutation_id,
      payload: envelope,
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[directMutationEngine] audit write failed:', err?.message);
  }
}

function finalize(envelope: MutationEnvelope, outcome: FireOutcome, reason: string): FireMutationResult {
  // Persist a 'mutation_envelope_created' audit row even for rejections so
  // the rejection itself is replayable.
  void writeEnvelopeAudit(envelope, 'mutation_envelope_created');
  return {
    envelope,
    outcome,
    reason,
    summary: `MUTATION ${outcome.toUpperCase()}: ${envelope.mutation_class} — ${reason}`,
  };
}

export const _MUTATION_RATE_LIMIT_MAX_FOR_TESTS = RATE_LIMIT_MAX;
export const _MUTATION_TRUST_FLOOR_FOR_TESTS = TRUST_FLOOR;

/** Test-only — fire without DB calls. Skips audit writes + verification. */
export async function _testFireMutationPure(input: FireMutationInput): Promise<FireMutationResult> {
  const envelope = buildEnvelope(input);
  if (isClassContained(input.project_id, input.intent) || isIntentFrozen(input.project_id, input.intent)) {
    return { envelope, outcome: 'rejected_contained', reason: 'contained', summary: 'rejected' };
  }
  const trust = mutationTrustScore(input.project_id, input.intent);
  if (input.intent !== 'ISOLATION_CONTAINMENT' && input.intent !== 'AUTOMATION_DEESCALATION' && trust < TRUST_FLOOR) {
    return { envelope, outcome: 'rejected_trust_floor', reason: `Trust ${trust}/100`, summary: 'rejected' };
  }
  const blastGate = evaluateMutationBlastGate(envelope.blast_radius);
  if (blastGate.action === 'reject') {
    return { envelope, outcome: 'rejected_blast', reason: blastGate.reason, summary: 'rejected' };
  }
  return { envelope, outcome: 'fired', reason: 'pure path', summary: 'fired' };
}
