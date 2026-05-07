/**
 * executionVerificationListener — Phase 14 closed-loop verifier.
 *
 * Subscribes to `remediation.cluster.resolved` (Phase 11). Per event:
 *   - Filter to plans with auto_executed_at != null AND
 *     execution_verification_status='pending' for matching
 *     (project_id, cluster_signature) within last 7 days.
 *   - Per-plan-id in-flight guard so same plan never double-verifies.
 *   - Read most recent UXRemediationOutcome row for the cluster
 *     (Phase 11 wrote it during recordPhase10_5Outcomes).
 *   - Threshold: net_delta >= 5 AND issues_regressed_count == 0 → verified.
 *     Else → failed; rollback engine triggers.
 *
 * Stale-verification sweep (heartbeat-driven, cooldown-gated 30 min)
 * flips plans where direct_executed_at < now - 6h AND status='pending'
 * to 'verification_timeout' (distinct from 'failed' — no evidence
 * either way).
 *
 * Phase 14 §A.2.
 */

import { cognitiveEventBus, publishCognitiveEvent, type CognitiveEvent } from '../realtime/cognitiveEventBus';
import { withCooldown, allowByRateLimit } from '../realtime/cognitiveStabilityProtection';
import { recordVerificationSuccess, recordVerificationFailure } from './autonomyTrustState';
import { noteVerificationOutcome } from './executionSummaryCounters';

const STALE_VERIFICATION_MS = 6 * 60 * 60 * 1000; // 6 hours
const STALE_SWEEP_COOLDOWN_MS = 30 * 60 * 1000; // 30 min per project
const NET_DELTA_THRESHOLD = 5;
const ROLLBACK_RATE_LIMIT_MAX = 2;
const ROLLBACK_RATE_LIMIT_WINDOW_MS = 60_000;

const inFlight = new Set<string>(); // plan_id

let started = false;
const unsubscribers: Array<() => void> = [];

export function startExecutionVerificationListener(): { stop: () => void; alreadyStarted: boolean } {
  if (started) return { stop: stopAll, alreadyStarted: true };
  started = true;
  unsubscribers.push(
    cognitiveEventBus.subscribeToKind('remediation.cluster.resolved', (event: CognitiveEvent) => {
      void handleClusterResolved(event);
    }),
  );
  return { stop: stopAll, alreadyStarted: false };
}

function stopAll(): void {
  for (const u of unsubscribers) u();
  unsubscribers.length = 0;
  started = false;
  inFlight.clear();
}

async function handleClusterResolved(event: CognitiveEvent): Promise<void> {
  const payload = (event.payload || {}) as any;
  const project_id = event.project_id;
  const cluster_signature = payload.cluster_signature;
  if (!cluster_signature) return;

  try {
    const { Op } = await import('sequelize');
    const { default: PreparedRemediationPlan } = await import('../../../models/PreparedRemediationPlan');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const plan: any = await PreparedRemediationPlan.findOne({
      where: {
        project_id,
        cluster_signature,
        auto_executed_at: { [Op.ne]: null },
        execution_verification_status: 'pending',
        direct_executed_at: { [Op.gte]: sevenDaysAgo },
      } as any,
      order: [['direct_executed_at', 'DESC']],
    });
    if (!plan) return;
    if (inFlight.has(plan.id)) return;
    inFlight.add(plan.id);
    try {
      await runVerification(plan, cluster_signature);
    } finally {
      inFlight.delete(plan.id);
    }
  } catch (err: any) {
    console.warn('[executionVerificationListener] resolved-handler failed:', err?.message);
  }
}

async function runVerification(plan: any, cluster_signature: string): Promise<void> {
  const { Op } = await import('sequelize');
  const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
  const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const outcome: any = await UXRemediationOutcome.findOne({
    where: {
      project_id: plan.project_id,
      capability_id: plan.capability_id,
      cluster_signature,
      observed_at: { [Op.gte]: fiveMinAgo },
    } as any,
    order: [['observed_at', 'DESC']],
  });

  // Compute net_delta + regression count
  const cognition_delta = outcome?.cognition_delta ?? null;
  const ux_debt_delta = outcome?.ux_debt_delta ?? null;
  const behavioral_delta = outcome?.behavioral_delta ?? null;
  const friction_delta = outcome?.friction_delta ?? null;
  const issues_regressed_count = outcome?.issues_regressed_count ?? 0;
  const issues_resolved_count = outcome?.issues_resolved_count ?? 0;
  const net_delta = scoreNetDelta({ cognition_delta, ux_debt_delta, behavioral_delta, friction_delta });

  const verified = net_delta >= NET_DELTA_THRESHOLD && issues_regressed_count === 0;
  const newStatus = verified ? 'verified' : 'failed';
  plan.execution_verification_status = newStatus;
  await plan.save();

  await GovernanceAuditEntry.create({
    project_id: plan.project_id,
    kind: verified ? 'autonomy_execution_verified' : 'autonomy_execution_failed',
    subject_id: plan.id,
    payload: {
      cluster_signature,
      net_delta,
      cognition_delta,
      ux_debt_delta,
      issues_resolved_count,
      issues_regressed_count,
      threshold: NET_DELTA_THRESHOLD,
    },
    operator_id: null,
    recorded_at: new Date(),
  } as any);

  if (verified) {
    recordVerificationSuccess(plan.project_id);
    noteVerificationOutcome(plan.project_id);
    publishCognitiveEvent({
      kind: 'autonomy.execution.verified',
      project_id: plan.project_id,
      severity: 'info',
      payload: { plan_id: plan.id, cluster_signature, net_delta },
    });
    return;
  }

  recordVerificationFailure(plan.project_id);
  noteVerificationOutcome(plan.project_id);
  publishCognitiveEvent({
    kind: 'autonomy.execution.failed',
    project_id: plan.project_id,
    severity: 'warning',
    payload: { plan_id: plan.id, cluster_signature, net_delta, issues_regressed_count },
  });

  // Rollback rate-limit per project
  const rollbackAllowed = allowByRateLimit({
    key: `autonomy_rollback_${plan.project_id}`,
    window_ms: ROLLBACK_RATE_LIMIT_WINDOW_MS,
    max_per_window: ROLLBACK_RATE_LIMIT_MAX,
  });
  if (!rollbackAllowed) {
    publishCognitiveEvent({
      kind: 'autonomy.rollback.started',
      project_id: plan.project_id,
      severity: 'warning',
      payload: { plan_id: plan.id, suppressed: true, reason: 'rollback_rate_limit' },
    });
    return;
  }

  try {
    const { triggerAutonomousRollback } = await import('./autonomousRollbackEngine');
    await triggerAutonomousRollback({
      plan_id: plan.id,
      project_id: plan.project_id,
      capability_id: plan.capability_id,
      cluster_signature,
      reason: `Verification failed: net_delta ${net_delta} < ${NET_DELTA_THRESHOLD} OR regressions ${issues_regressed_count} > 0.`,
    });
  } catch (err: any) {
    console.warn('[executionVerificationListener] rollback trigger failed:', err?.message);
  }
}

/**
 * Scoring policy: dimension-weighted blend, mirrors Phase 11 net_delta
 * weights for the four signed UX deltas. Null inputs are treated as 0.
 */
function scoreNetDelta(opts: { cognition_delta: number | null; ux_debt_delta: number | null; behavioral_delta: number | null; friction_delta: number | null }): number {
  const c = opts.cognition_delta ?? 0;
  const u = opts.ux_debt_delta ?? 0;
  const b = opts.behavioral_delta ?? 0;
  const f = opts.friction_delta ?? 0;
  return Math.round(c * 0.4 + u * 0.3 + b * 0.15 + f * 0.15);
}

/**
 * Heartbeat-driven sweep. Returns rows flipped per call. Cooldown-gated
 * so it runs at most once per 30 min per project (or globally when called
 * with project_id='*').
 *
 * In production, register via awarenessHeartbeatManager.registerHeartbeatHandler.
 */
export async function sweepStaleVerifications(project_id?: string): Promise<{ swept: number; project_scope: string }> {
  const cooldownKey = project_id
    ? `stale_verification_sweep_${project_id}`
    : 'stale_verification_sweep_global';
  if (!withCooldown(cooldownKey, STALE_SWEEP_COOLDOWN_MS)) {
    return { swept: 0, project_scope: project_id ?? '*' };
  }
  try {
    const { Op } = await import('sequelize');
    const { default: PreparedRemediationPlan } = await import('../../../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    const cutoff = new Date(Date.now() - STALE_VERIFICATION_MS);
    const where: any = {
      execution_verification_status: 'pending',
      direct_executed_at: { [Op.lt]: cutoff },
    };
    if (project_id) where.project_id = project_id;
    const stale: any[] = await PreparedRemediationPlan.findAll({ where });
    if (stale.length === 0) return { swept: 0, project_scope: project_id ?? '*' };
    for (const p of stale) {
      p.execution_verification_status = 'verification_timeout';
      await p.save();
      await GovernanceAuditEntry.create({
        project_id: p.project_id,
        kind: 'autonomy_execution_failed',  // closest existing kind; payload disambiguates timeout
        subject_id: p.id,
        payload: { reason: 'verification_timeout', cluster_signature: p.cluster_signature, hours_since_handoff: 6 },
        operator_id: null,
        recorded_at: new Date(),
      } as any);
    }
    return { swept: stale.length, project_scope: project_id ?? '*' };
  } catch (err: any) {
    console.warn('[executionVerificationListener] sweep failed:', err?.message);
    return { swept: 0, project_scope: project_id ?? '*' };
  }
}

/** Test-only direct verifier (skips event subscription). */
export async function _testRunVerification(plan: any, cluster_signature: string): Promise<void> {
  await runVerification(plan, cluster_signature);
}

/** Test-only listener reset. */
export function _resetExecutionVerificationListener(): void {
  for (const u of unsubscribers) u();
  unsubscribers.length = 0;
  started = false;
  inFlight.clear();
}

export function _isInFlight(plan_id: string): boolean {
  return inFlight.has(plan_id);
}

export function _scoreNetDeltaForTests(opts: { cognition_delta: number | null; ux_debt_delta: number | null; behavioral_delta: number | null; friction_delta: number | null }): number {
  return scoreNetDelta(opts);
}
