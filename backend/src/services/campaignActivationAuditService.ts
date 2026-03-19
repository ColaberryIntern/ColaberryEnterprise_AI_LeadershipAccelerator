/**
 * Campaign Activation Audit Service — Phases 1-3 (Read-Only Diagnostics)
 *
 * Pure diagnostic functions that inspect campaign state, lead eligibility,
 * and outreach pipeline health without modifying any data.
 */
import { Op } from 'sequelize';
import {
  Campaign,
  CampaignLead,
  ScheduledEmail,
  CampaignHealth,
  Lead,
  CommunicationLog,
  FollowUpSequence,
} from '../models';
import { checkLeadSendable } from './communicationSafetyService';
import { getSetting } from './settingsService';
import { env } from '../config/env';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CampaignStateAudit {
  campaignId: string;
  name: string;
  type: string;
  mode: string;
  status: string;
  issues: string[];
  warnings: string[];
  metrics: {
    leadCount: number;
    activeLeadCount: number;
    pendingActionCount: number;
    failedActionCount: number;
    sentLast24h: number;
    processingCount: number;
    staleProcessingCount: number;
  };
  ramp?: {
    status: string;
    currentPhase: number;
    phaseSizes: number[];
    phaseStartedAt: string | null;
    healthScore: number | null;
  };
  healthScore: number | null;
  healthStatus: string | null;
}

export interface LeadAuditResult {
  totalLeads: number;
  sendableLeads: number;
  blockedLeads: { leadId: number; reason: string }[];
  orphanedLeads: { leadId: number; issue: string }[];
  leadsWithoutEmail: number;
  leadsWithoutPhone: number;
}

export interface PipelineAuditResult {
  channels: {
    email: { configured: boolean; error?: string };
    sms: { configured: boolean; error?: string };
    voice: { configured: boolean; error?: string };
    ai: { configured: boolean; error?: string };
  };
  scheduler: {
    paused: boolean;
    lastRun: string | null;
  };
  sequence: {
    exists: boolean;
    stepCount: number;
    isActive: boolean;
  } | null;
  queue: {
    pending: number;
    processing: number;
    stale: number;
    failed: number;
    sent24h: number;
  };
}

export interface FullAuditResult {
  state: CampaignStateAudit;
  leads: LeadAuditResult;
  pipeline: PipelineAuditResult;
}

// ── Phase 1: Campaign State Audit ─────────────────────────────────────────

/**
 * Audit campaign state for one or all active campaigns.
 * Identifies mismatches between UI status and backend reality.
 */
export async function auditCampaignState(
  campaignId?: string,
): Promise<CampaignStateAudit[]> {
  const where: any = campaignId
    ? { id: campaignId }
    : { status: { [Op.in]: ['active', 'paused', 'draft'] } };

  const campaigns = await Campaign.findAll({ where });
  const results: CampaignStateAudit[] = [];
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const schedulerPaused = await getSetting('scheduler_paused');
  const isPaused = schedulerPaused === true || schedulerPaused === 'true';

  for (const campaign of campaigns) {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check sequence
    if (!campaign.sequence_id) {
      issues.push('No sequence assigned — campaign cannot send any messages');
    }

    // Count leads
    const leadCount = await CampaignLead.count({
      where: { campaign_id: campaign.id },
    });
    const activeLeadCount = await CampaignLead.count({
      where: {
        campaign_id: campaign.id,
        status: { [Op.in]: ['enrolled', 'active'] },
      },
    });

    if (campaign.status === 'active' && activeLeadCount === 0) {
      issues.push('Campaign is active but has zero enrolled/active leads');
    }

    // Count actions
    const pendingActionCount = await ScheduledEmail.count({
      where: { campaign_id: campaign.id, status: 'pending' },
    });
    const failedActionCount = await ScheduledEmail.count({
      where: { campaign_id: campaign.id, status: 'failed' },
    });
    const processingCount = await ScheduledEmail.count({
      where: { campaign_id: campaign.id, status: 'processing' },
    });
    const staleProcessingCount = await ScheduledEmail.count({
      where: {
        campaign_id: campaign.id,
        status: 'processing',
        processing_started_at: { [Op.lt]: staleThreshold },
      },
    });
    const sentLast24h = await ScheduledEmail.count({
      where: {
        campaign_id: campaign.id,
        status: 'sent',
        sent_at: { [Op.gte]: last24h },
      },
    });

    // Core mismatch: active campaign with leads but no pending actions
    if (
      campaign.status === 'active' &&
      activeLeadCount > 0 &&
      pendingActionCount === 0
    ) {
      issues.push(
        `STALLED: Campaign is active with ${activeLeadCount} leads but 0 pending actions — queue is empty`,
      );
    }

    if (staleProcessingCount > 0) {
      warnings.push(
        `${staleProcessingCount} actions stuck in 'processing' for >10 minutes`,
      );
    }

    if (failedActionCount > 5) {
      warnings.push(`${failedActionCount} failed actions detected`);
    }

    // Scheduler paused
    if (campaign.status === 'active' && isPaused) {
      issues.push('Scheduler is paused — no sends will be processed');
    }

    // Ramp state check for autonomous campaigns
    let rampInfo: CampaignStateAudit['ramp'];
    const campaignMode = (campaign as any).campaign_mode;
    const rampState = (campaign as any).ramp_state;

    if (campaignMode === 'autonomous' && rampState) {
      rampInfo = {
        status: rampState.status,
        currentPhase: rampState.current_phase,
        phaseSizes: rampState.phase_sizes,
        phaseStartedAt: rampState.phase_started_at,
        healthScore: rampState.phase_health_score,
      };

      if (rampState.status === 'paused_for_review') {
        issues.push('Ramp is paused for review — no new leads will be activated');
      }

      if (rampState.status === 'evaluating' && rampState.phase_started_at) {
        const phaseAge =
          Date.now() - new Date(rampState.phase_started_at).getTime();
        if (phaseAge > 48 * 60 * 60 * 1000) {
          warnings.push(
            `Ramp has been evaluating for >48h (stuck?) — phase ${rampState.current_phase}`,
          );
        }
      }
    }

    // Health score
    let healthScore: number | null = null;
    let healthStatus: string | null = null;
    const health = await CampaignHealth.findOne({
      where: { campaign_id: campaign.id },
    });
    if (health) {
      healthScore = health.health_score;
      healthStatus = health.status;
      if (health.status === 'critical') {
        warnings.push(`Campaign health is CRITICAL (score: ${health.health_score})`);
      }
    }

    results.push({
      campaignId: campaign.id,
      name: campaign.name,
      type: campaign.type || 'unknown',
      mode: campaignMode || 'standard',
      status: campaign.status,
      issues,
      warnings,
      metrics: {
        leadCount,
        activeLeadCount,
        pendingActionCount,
        failedActionCount,
        sentLast24h,
        processingCount,
        staleProcessingCount,
      },
      ramp: rampInfo,
      healthScore,
      healthStatus,
    });
  }

  return results;
}

// ── Phase 2: Campaign Lead Deep Check ─────────────────────────────────────

/**
 * Audit all leads in a campaign for eligibility, blocking conditions,
 * and orphaned state (active lead with no pending actions).
 */
export async function auditCampaignLeads(
  campaignId: string,
): Promise<LeadAuditResult> {
  const campaignLeads = await CampaignLead.findAll({
    where: {
      campaign_id: campaignId,
      status: { [Op.in]: ['enrolled', 'active'] },
    },
    attributes: ['lead_id', 'status'],
    raw: true,
  }) as any[];

  const blockedLeads: { leadId: number; reason: string }[] = [];
  const orphanedLeads: { leadId: number; issue: string }[] = [];
  let sendableCount = 0;
  let noEmailCount = 0;
  let noPhoneCount = 0;

  for (const cl of campaignLeads) {
    try {
      // Check sendability
      const sendable = await checkLeadSendable(cl.lead_id);
      if (!sendable.sendable) {
        blockedLeads.push({ leadId: cl.lead_id, reason: sendable.reason || 'unknown' });
        continue;
      }

      // Check contact info
      const lead = await Lead.findByPk(cl.lead_id, {
        attributes: ['id', 'email', 'phone'],
      });
      if (lead) {
        if (!lead.email) noEmailCount++;
        if (!lead.phone) noPhoneCount++;
      }

      sendableCount++;

      // Check for orphaned leads (active but no pending actions)
      if (cl.status === 'active') {
        const pendingActions = await ScheduledEmail.count({
          where: {
            lead_id: cl.lead_id,
            campaign_id: campaignId,
            status: { [Op.in]: ['pending', 'processing'] },
          },
        });
        if (pendingActions === 0) {
          // Check if they completed the sequence
          const sentActions = await ScheduledEmail.count({
            where: {
              lead_id: cl.lead_id,
              campaign_id: campaignId,
              status: 'sent',
            },
          });
          if (sentActions === 0) {
            orphanedLeads.push({
              leadId: cl.lead_id,
              issue: 'Active lead with no pending or sent actions — never queued',
            });
          } else {
            // Has sent actions but none pending — may have completed the sequence (not an issue)
          }
        }
      }
    } catch (err: any) {
      blockedLeads.push({ leadId: cl.lead_id, reason: `audit_error: ${err.message}` });
    }
  }

  return {
    totalLeads: campaignLeads.length,
    sendableLeads: sendableCount,
    blockedLeads,
    orphanedLeads,
    leadsWithoutEmail: noEmailCount,
    leadsWithoutPhone: noPhoneCount,
  };
}

// ── Phase 3: Outreach Pipeline Validation ─────────────────────────────────

/**
 * Validate the outreach pipeline: channel connectivity, scheduler state,
 * sequence validity, and queue health.
 */
export async function auditOutreachPipeline(
  campaignId?: string,
): Promise<PipelineAuditResult> {
  // Channel connectivity (same pattern as campaignHealthScanner)
  const channels = {
    email: {
      configured: !!(env.smtpUser && env.smtpPass),
      ...(!(env.smtpUser && env.smtpPass) && { error: 'SMTP credentials not configured' }),
    },
    sms: {
      configured: true, // GHL key is in DB settings
    },
    voice: {
      configured: !!(env.synthflowApiKey && (env as any).synthflowInterestAgentId),
      ...(!(env.synthflowApiKey) && { error: 'Synthflow API key not configured' }),
    },
    ai: {
      configured: !!env.openaiApiKey,
      ...(!env.openaiApiKey && { error: 'OpenAI API key not configured' }),
    },
  };

  // Scheduler state
  const schedulerPaused = await getSetting('scheduler_paused');
  const lastRun = await getSetting('scheduler_last_run');
  const scheduler = {
    paused: schedulerPaused === true || schedulerPaused === 'true',
    lastRun: lastRun ? String(lastRun) : null,
  };

  // Sequence validation (if campaign-specific)
  let sequence: PipelineAuditResult['sequence'] = null;
  if (campaignId) {
    const campaign = await Campaign.findByPk(campaignId, {
      attributes: ['sequence_id'],
    });
    if (campaign?.sequence_id) {
      const seq = await FollowUpSequence.findByPk(campaign.sequence_id);
      sequence = {
        exists: !!seq,
        stepCount: seq?.steps?.length || 0,
        isActive: seq?.is_active || false,
      };
    } else {
      sequence = { exists: false, stepCount: 0, isActive: false };
    }
  }

  // Queue health
  const queueWhere: any = campaignId ? { campaign_id: campaignId } : {};
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [pending, processing, stale, failed, sent24h] = await Promise.all([
    ScheduledEmail.count({ where: { ...queueWhere, status: 'pending' } }),
    ScheduledEmail.count({ where: { ...queueWhere, status: 'processing' } }),
    ScheduledEmail.count({
      where: {
        ...queueWhere,
        status: 'processing',
        processing_started_at: { [Op.lt]: staleThreshold },
      },
    }),
    ScheduledEmail.count({ where: { ...queueWhere, status: 'failed' } }),
    ScheduledEmail.count({
      where: {
        ...queueWhere,
        status: 'sent',
        sent_at: { [Op.gte]: last24h },
      },
    }),
  ]);

  return {
    channels,
    scheduler,
    sequence,
    queue: { pending, processing, stale, failed, sent24h },
  };
}

// ── Full Audit (Phases 1-3 Combined) ──────────────────────────────────────

/**
 * Run a full audit for a single campaign: state + leads + pipeline.
 */
export async function runFullAudit(campaignId: string): Promise<FullAuditResult> {
  const [stateResults, leads, pipeline] = await Promise.all([
    auditCampaignState(campaignId),
    auditCampaignLeads(campaignId),
    auditOutreachPipeline(campaignId),
  ]);

  return {
    state: stateResults[0],
    leads,
    pipeline,
  };
}
