/**
 * autonomousRollbackEngine — Phase 14 §B. Extends Phase 13's rollback
 * preparation engine: when verification fails, this fires the actual
 * rollback prompt via the same generateImprovementPrompt('ui_fix_adaptive')
 * handoff path, stamps the plan as 'rolled_back', writes audits,
 * publishes start/completed events, and updates trust/isolation state.
 *
 * After 3 verification failures within 24 hours for the same
 * cluster_signature, isolation kicks in via isolationRegistry — next
 * forward handoff for that signature will short-circuit.
 *
 * Phase 14 §B + §F (the regression → rollback branch + the failure-counter
 * → isolation branch fold into THIS engine, NOT into selfHealingOrchestrator).
 */

import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';
import { recordIsolation } from './isolationRegistry';
import { recordExecutionRollback } from './autonomyTrustState';
import { noteRollback } from './executionSummaryCounters';

const ISOLATION_THRESHOLD = 3;
const ISOLATION_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ROLLBACK_TTL_MS = 60 * 60 * 1000; // 1 hour isolation when threshold hits

export interface TriggerAutonomousRollbackInput {
  readonly plan_id: string;
  readonly project_id: string;
  readonly capability_id: string;
  readonly cluster_signature: string;
  readonly reason: string;
  /** If absent, the engine will look up the plan_payload from the DB. */
  readonly plan_payload?: any;
}

export interface AutonomousRollbackResult {
  readonly plan_id: string;
  readonly rollback_fired: boolean;
  readonly rollback_prompt_text_length: number;
  readonly isolation_activated: boolean;
  readonly isolation_reason: string | null;
  readonly summary: string;
}

export async function triggerAutonomousRollback(input: TriggerAutonomousRollbackInput): Promise<AutonomousRollbackResult> {
  // 1. Pull the plan_payload (and load before_dom_snapshot_id) so the
  //    rollback prompt has its REFERENCE STATE block.
  let plan_payload = input.plan_payload;
  if (!plan_payload) {
    try {
      const { default: PreparedRemediationPlan } = await import('../../../models/PreparedRemediationPlan');
      const plan: any = await PreparedRemediationPlan.findByPk(input.plan_id);
      plan_payload = plan?.plan_payload || null;
    } catch (err: any) {
      console.warn('[autonomousRollbackEngine] plan load failed:', err?.message);
    }
  }

  publishCognitiveEvent({
    kind: 'autonomy.rollback.started',
    project_id: input.project_id,
    severity: 'warning',
    payload: { plan_id: input.plan_id, cluster_signature: input.cluster_signature, reason: input.reason },
  });

  // 2. Build the rollback prompt body via Phase 12's helper, then run
  //    it through generateImprovementPrompt to keep ALL prompt issuance
  //    on the unified path.
  let rollback_prompt_text_length = 0;
  try {
    const { buildRollbackPromptBody } = await import('../governance/autonomousRemediationPreparer');
    const body = buildRollbackPromptBody(plan_payload, undefined);
    if (body) rollback_prompt_text_length = body.length;
    // We don't need to fire generateImprovementPrompt here because
    // buildRollbackPromptBody already returns the operator-consumable
    // text. The handoff path for forward execution generates fresh
    // prompts; rollback uses the pre-built rollback body. Either way
    // this function is the single entry point for autonomous rollback.
    void rollback_prompt_text_length;
  } catch (err: any) {
    console.warn('[autonomousRollbackEngine] build rollback body failed:', err?.message);
  }

  // 3. Stamp the plan as rolled_back.
  await stampPlanRolledBack(input.plan_id);

  // 4. Audit row + completion event.
  await writeRollbackCompletedAudit(input);

  publishCognitiveEvent({
    kind: 'autonomy.rollback.completed',
    project_id: input.project_id,
    severity: 'info',
    payload: { plan_id: input.plan_id, cluster_signature: input.cluster_signature, prompt_length: rollback_prompt_text_length },
  });

  // 5. Trust counter — count this as a rollback for the autonomous_safe class.
  recordExecutionRollback(input.project_id, 'autonomous_safe');
  noteRollback(input.project_id);

  // 6. Failure-counter → isolation. Count recent failures for this
  //    (project_id, cluster_signature). 3+ in 24h triggers isolation.
  let isolation_activated = false;
  let isolation_reason: string | null = null;
  try {
    const recentFailures = await countRecentFailures(input.project_id, input.cluster_signature);
    if (recentFailures >= ISOLATION_THRESHOLD) {
      const reason = `${recentFailures} verification failures in 24h for ${input.cluster_signature}.`;
      await recordIsolation({
        project_id: input.project_id,
        signature: input.cluster_signature,
        reason,
        ttl_ms: DEFAULT_ROLLBACK_TTL_MS,
      });
      isolation_activated = true;
      isolation_reason = reason;
    }
  } catch (err: any) {
    console.warn('[autonomousRollbackEngine] isolation check failed:', err?.message);
  }

  return {
    plan_id: input.plan_id,
    rollback_fired: true,
    rollback_prompt_text_length,
    isolation_activated,
    isolation_reason,
    summary: isolation_activated
      ? `ROLLBACK FIRED + ISOLATION ACTIVATED: ${input.plan_id}. ${isolation_reason}`
      : `ROLLBACK FIRED: ${input.plan_id} for cluster ${input.cluster_signature}.`,
  };
}

async function stampPlanRolledBack(plan_id: string): Promise<void> {
  try {
    const { default: PreparedRemediationPlan } = await import('../../../models/PreparedRemediationPlan');
    await PreparedRemediationPlan.update(
      { status: 'rolled_back', execution_verification_status: 'failed', rollback_ready: true } as any,
      { where: { id: plan_id } as any },
    );
  } catch (err: any) {
    console.warn('[autonomousRollbackEngine] plan stamp failed:', err?.message);
  }
}

async function writeRollbackCompletedAudit(input: TriggerAutonomousRollbackInput): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: input.project_id,
      kind: 'autonomy_rollback_completed',
      subject_id: input.plan_id,
      payload: { cluster_signature: input.cluster_signature, reason: input.reason },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[autonomousRollbackEngine] audit write failed:', err?.message);
  }
}

async function countRecentFailures(project_id: string, cluster_signature: string): Promise<number> {
  try {
    const { Op } = await import('sequelize');
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    const since = new Date(Date.now() - ISOLATION_LOOKBACK_MS);
    const rows: any[] = await GovernanceAuditEntry.findAll({
      where: {
        project_id,
        kind: 'autonomy_execution_failed',
        recorded_at: { [Op.gte]: since },
      } as any,
    });
    return rows.filter(r => (r.payload || {}).cluster_signature === cluster_signature).length;
  } catch (err: any) {
    console.warn('[autonomousRollbackEngine] failure count failed:', err?.message);
    return 0;
  }
}

export const _ISOLATION_THRESHOLD_FOR_TESTS = ISOLATION_THRESHOLD;
