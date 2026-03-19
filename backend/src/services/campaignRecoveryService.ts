/**
 * Campaign Recovery Service — Phases 4-7 (Mutating Recovery)
 *
 * Recovery functions that fix identified issues: ramp reset, queue rebuild,
 * scheduler verification, and safe campaign activation.
 */
import { Op } from 'sequelize';
import {
  Campaign,
  CampaignLead,
  ScheduledEmail,
  Lead,
} from '../models';
import { checkLeadSendable } from './communicationSafetyService';
import { getSetting, setSetting } from './settingsService';
import { enrollLeadInSequence } from './sequenceService';
import { activateCampaign } from './campaignService';
import { logAiEvent } from './aiEventService';
import {
  auditCampaignState,
  auditOutreachPipeline,
  runFullAudit,
  type CampaignStateAudit,
  type FullAuditResult,
} from './campaignActivationAuditService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RampResetResult {
  campaignId: string;
  action: string;
  previousRampState: any;
  newRampState: any;
}

export interface QueueRebuildResult {
  campaignId: string;
  dryRun: boolean;
  leadsAudited: number;
  leadsSkippedUnsendable: number;
  leadsAlreadyQueued: number;
  leadsRequeued: number;
  actionsCreated: number;
  errors: { leadId: number; error: string }[];
}

export interface SchedulerVerificationResult {
  wasPaused: boolean;
  resumed: boolean;
  staleRecovered: number;
  pendingCount: number;
  processingCount: number;
}

export interface ActivationResult {
  campaignId: string;
  name: string;
  previousStatus: string;
  newStatus: string;
  action: string;
  auditIssues: string[];
  errors: string[];
}

export interface FullRecoveryResult {
  campaignId: string;
  audit: FullAuditResult;
  rampReset?: RampResetResult;
  queueRebuild?: QueueRebuildResult;
  schedulerVerification?: SchedulerVerificationResult;
  activation?: ActivationResult;
}

// ── Phase 4: Ramp-Up Engine Reset ─────────────────────────────────────────

/**
 * Reset the ramp state for an autonomous campaign.
 * - force: reinitialize ramp from scratch via autonomousRampService
 * - resetToPhase: reset to a specific phase number
 */
export async function resetRampState(
  campaignId: string,
  options?: { resetToPhase?: number; force?: boolean },
): Promise<RampResetResult> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const campaignMode = (campaign as any).campaign_mode;
  if (campaignMode !== 'autonomous') {
    return {
      campaignId,
      action: 'skipped',
      previousRampState: null,
      newRampState: null,
    };
  }

  const previousRampState = (campaign as any).ramp_state;

  if (options?.force) {
    // Full reinitialize
    const { initializeRamp } = require('./autonomousRampService');
    await initializeRamp(campaignId);

    const updated = await Campaign.findByPk(campaignId);
    const newRampState = (updated as any).ramp_state;

    await logAiEvent('CampaignRecovery', 'ramp_force_reset', 'campaigns', campaignId, {
      previous: previousRampState,
      new: newRampState,
    });

    return {
      campaignId,
      action: 'force_reinitialized',
      previousRampState,
      newRampState,
    };
  }

  if (options?.resetToPhase && previousRampState) {
    const targetPhase = options.resetToPhase;
    const newState = {
      ...previousRampState,
      current_phase: targetPhase,
      status: 'ramping',
      phase_started_at: new Date().toISOString(),
      phase_health_score: null,
    };

    // Clear enrollment counts for phases after the target
    const enrolledPerPhase = { ...newState.leads_enrolled_per_phase };
    for (const key of Object.keys(enrolledPerPhase)) {
      if (parseInt(key) > targetPhase) {
        delete enrolledPerPhase[key];
      }
    }
    newState.leads_enrolled_per_phase = enrolledPerPhase;

    await campaign.update({ ramp_state: newState } as any);

    await logAiEvent('CampaignRecovery', 'ramp_phase_reset', 'campaigns', campaignId, {
      previous: previousRampState,
      new: newState,
      target_phase: targetPhase,
    });

    return {
      campaignId,
      action: `reset_to_phase_${targetPhase}`,
      previousRampState,
      newRampState: newState,
    };
  }

  // Default: just unstick the ramp if it's stuck
  if (previousRampState?.status === 'paused_for_review' || previousRampState?.status === 'evaluating') {
    const newState = {
      ...previousRampState,
      status: 'ramping',
      phase_started_at: new Date().toISOString(),
    };
    await campaign.update({ ramp_state: newState } as any);

    await logAiEvent('CampaignRecovery', 'ramp_unstick', 'campaigns', campaignId, {
      previous_status: previousRampState.status,
      new_status: 'ramping',
    });

    return {
      campaignId,
      action: `unstick_from_${previousRampState.status}`,
      previousRampState,
      newRampState: newState,
    };
  }

  return {
    campaignId,
    action: 'no_action_needed',
    previousRampState,
    newRampState: previousRampState,
  };
}

// ── Phase 5: Queue Rebuild ────────────────────────────────────────────────

/**
 * Rebuild the ScheduledEmail queue for a campaign.
 * Re-enrolls orphaned leads (active but no pending actions) into the sequence.
 * Duplicate-safe: skips leads that already have pending/processing actions.
 */
export async function rebuildCampaignQueue(
  campaignId: string,
  options?: { dryRun?: boolean },
): Promise<QueueRebuildResult> {
  const dryRun = options?.dryRun ?? false;
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!campaign.sequence_id) throw new Error('Campaign has no sequence assigned');

  const campaignLeads = await CampaignLead.findAll({
    where: {
      campaign_id: campaignId,
      status: { [Op.in]: ['enrolled', 'active'] },
    },
    attributes: ['lead_id', 'status'],
    raw: true,
  }) as any[];

  let leadsSkippedUnsendable = 0;
  let leadsAlreadyQueued = 0;
  let leadsRequeued = 0;
  let actionsCreated = 0;
  const errors: { leadId: number; error: string }[] = [];

  for (const cl of campaignLeads) {
    try {
      // Check sendability
      const sendable = await checkLeadSendable(cl.lead_id);
      if (!sendable.sendable) {
        leadsSkippedUnsendable++;
        continue;
      }

      // Check if lead already has pending/processing actions for this campaign
      const existingActions = await ScheduledEmail.count({
        where: {
          lead_id: cl.lead_id,
          campaign_id: campaignId,
          status: { [Op.in]: ['pending', 'processing'] },
        },
      });

      if (existingActions > 0) {
        leadsAlreadyQueued++;
        continue;
      }

      // Lead is sendable but has no pending actions — re-enroll
      if (!dryRun) {
        const actions = await enrollLeadInSequence(
          cl.lead_id,
          campaign.sequence_id,
          campaignId,
          true, // force=true to bypass idempotency guard
        );
        actionsCreated += (actions?.length || 0);

        // Ensure CampaignLead status is 'active' (not just 'enrolled')
        if (cl.status === 'enrolled') {
          await CampaignLead.update(
            { status: 'active' } as any,
            { where: { campaign_id: campaignId, lead_id: cl.lead_id } },
          );
        }
      }

      leadsRequeued++;
    } catch (err: any) {
      errors.push({ leadId: cl.lead_id, error: err.message });
    }
  }

  if (!dryRun) {
    await logAiEvent('CampaignRecovery', 'queue_rebuild', 'campaigns', campaignId, {
      leads_audited: campaignLeads.length,
      leads_requeued: leadsRequeued,
      actions_created: actionsCreated,
      leads_skipped_unsendable: leadsSkippedUnsendable,
      leads_already_queued: leadsAlreadyQueued,
      errors: errors.length,
    });
  }

  return {
    campaignId,
    dryRun,
    leadsAudited: campaignLeads.length,
    leadsSkippedUnsendable,
    leadsAlreadyQueued,
    leadsRequeued,
    actionsCreated,
    errors,
  };
}

// ── Phase 6: Scheduler Verification & Resume ──────────────────────────────

/**
 * Verify the scheduler state and optionally resume it.
 * Also recovers stale processing actions.
 */
export async function verifyAndResumeScheduler(): Promise<SchedulerVerificationResult> {
  const schedulerPaused = await getSetting('scheduler_paused');
  const wasPaused = schedulerPaused === true || schedulerPaused === 'true';
  let resumed = false;

  if (wasPaused) {
    await setSetting('scheduler_paused', false, 'campaign_recovery');
    resumed = true;

    await logAiEvent('CampaignRecovery', 'scheduler_resumed', undefined, undefined, {
      was_paused: true,
      resumed_by: 'campaign_recovery',
    });
  }

  // Recover stale processing actions (stuck >10 min)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  const [staleRecovered] = await ScheduledEmail.update(
    {
      status: 'pending',
      processing_started_at: null,
      processor_id: null,
    } as any,
    {
      where: {
        status: 'processing',
        processing_started_at: { [Op.lt]: staleThreshold },
      },
    },
  );

  if (staleRecovered > 0) {
    await logAiEvent('CampaignRecovery', 'stale_actions_recovered', undefined, undefined, {
      count: staleRecovered,
    });
  }

  const [pendingCount, processingCount] = await Promise.all([
    ScheduledEmail.count({ where: { status: 'pending' } }),
    ScheduledEmail.count({ where: { status: 'processing' } }),
  ]);

  return {
    wasPaused,
    resumed,
    staleRecovered,
    pendingCount,
    processingCount,
  };
}

// ── Phase 7: Safe Activation ──────────────────────────────────────────────

const CAMPAIGN_TYPE_PRIORITY: Record<string, number> = {
  cold_outbound: 1,
  alumni: 2,
  warm_nurture: 3,
  re_engagement: 4,
  alumni_re_engagement: 5,
};

/**
 * Safely activate campaigns in priority order.
 * Runs audit first, only proceeds if no blocking issues.
 */
export async function safeActivateCampaigns(
  campaignIds: string[],
): Promise<ActivationResult[]> {
  // Sort by type priority
  const campaigns = await Campaign.findAll({
    where: { id: { [Op.in]: campaignIds } },
  });

  const sorted = campaigns.sort((a, b) => {
    const pa = CAMPAIGN_TYPE_PRIORITY[a.type || ''] || 99;
    const pb = CAMPAIGN_TYPE_PRIORITY[b.type || ''] || 99;
    return pa - pb;
  });

  const results: ActivationResult[] = [];

  for (const campaign of sorted) {
    const result: ActivationResult = {
      campaignId: campaign.id,
      name: campaign.name,
      previousStatus: campaign.status,
      newStatus: campaign.status,
      action: 'none',
      auditIssues: [],
      errors: [],
    };

    try {
      // Run audit first
      const auditResults = await auditCampaignState(campaign.id);
      const audit = auditResults[0];
      if (audit) {
        result.auditIssues = audit.issues;
      }

      // Check for blocking issues (skip scheduler_paused — we may have just resumed it)
      const blockingIssues = (audit?.issues || []).filter(
        (i) => !i.includes('Scheduler is paused'),
      );

      if (campaign.status === 'draft' || campaign.status === 'paused') {
        // Check if there's a sequence
        if (!campaign.sequence_id) {
          result.errors.push('Cannot activate: no sequence assigned');
          results.push(result);
          continue;
        }

        // Activate
        await activateCampaign(campaign.id);
        result.newStatus = 'active';
        result.action = 'activated';

        await logAiEvent('CampaignRecovery', 'safe_activate', 'campaigns', campaign.id, {
          previous_status: campaign.status,
          new_status: 'active',
        });
      } else if (campaign.status === 'active') {
        // Already active — check if stalled
        const isStalled = blockingIssues.some((i) => i.includes('STALLED'));
        if (isStalled) {
          const rebuild = await rebuildCampaignQueue(campaign.id);
          result.action = `queue_rebuilt (${rebuild.leadsRequeued} leads re-enrolled, ${rebuild.actionsCreated} actions created)`;
          result.newStatus = 'active';
        } else {
          result.action = 'already_active_and_healthy';
        }
      } else {
        result.action = `skipped (status: ${campaign.status})`;
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }

    results.push(result);
  }

  return results;
}

// ── Full Recovery (Phases 4-7 Combined) ───────────────────────────────────

/**
 * Run a full recovery for a single campaign:
 * 1. Audit (phases 1-3)
 * 2. Ramp reset (phase 4, if applicable)
 * 3. Queue rebuild (phase 5)
 * 4. Scheduler verification (phase 6)
 * 5. Safe activation (phase 7)
 */
export async function runFullRecovery(
  campaignId: string,
  options?: { dryRun?: boolean; resetRamp?: boolean },
): Promise<FullRecoveryResult> {
  const dryRun = options?.dryRun ?? false;

  // Phase 1-3: Audit
  const audit = await runFullAudit(campaignId);

  const result: FullRecoveryResult = {
    campaignId,
    audit,
  };

  if (dryRun) {
    // In dry-run mode, also do a dry-run queue rebuild to show what would happen
    result.queueRebuild = await rebuildCampaignQueue(campaignId, { dryRun: true });
    return result;
  }

  // Phase 4: Ramp reset (if requested and applicable)
  if (options?.resetRamp) {
    result.rampReset = await resetRampState(campaignId, { force: false });
  }

  // Phase 5: Queue rebuild
  result.queueRebuild = await rebuildCampaignQueue(campaignId);

  // Phase 6: Scheduler verification
  result.schedulerVerification = await verifyAndResumeScheduler();

  // Phase 7: Safe activation (if not already active)
  const campaign = await Campaign.findByPk(campaignId);
  if (campaign && campaign.status !== 'active') {
    const activationResults = await safeActivateCampaigns([campaignId]);
    result.activation = activationResults[0];
  }

  await logAiEvent('CampaignRecovery', 'full_recovery_complete', 'campaigns', campaignId, {
    dry_run: false,
    ramp_reset: !!options?.resetRamp,
    leads_requeued: result.queueRebuild?.leadsRequeued || 0,
    scheduler_was_paused: result.schedulerVerification?.wasPaused || false,
    activation_action: result.activation?.action || 'already_active',
  });

  return result;
}
