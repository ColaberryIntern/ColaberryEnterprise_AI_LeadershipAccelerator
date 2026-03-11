import { Op } from 'sequelize';
import { Campaign, CampaignLead, Lead, InteractionOutcome } from '../models';
import { enrollLeadInSequence } from './sequenceService';
import { recordOutcome } from './interactionService';

// ── Types ────────────────────────────────────────────────────────────────

export interface ExitCheck {
  shouldExit: boolean;
  reason: string;
}

export type ActivitySignal =
  | 'email_reply'
  | 'sms_reply'
  | 'voice_conversation'
  | 'link_click'
  | 'landing_page_visit'
  | 'strategy_call_booked';

export interface LifecycleStats {
  active: number;
  inactive: number;
  re_engaging: number;
  enrolled: number;
  dnd: number;
  bounced: number;
  total: number;
}

// ── Exit Conditions ──────────────────────────────────────────────────────

/**
 * Check if a lead should exit the lifecycle loop.
 * Exit reasons: enrolled in program, DND, email bounce, unsubscribed.
 */
export async function checkExitConditions(leadId: number): Promise<ExitCheck> {
  const lead = await Lead.findByPk(leadId, { raw: true }) as any;
  if (!lead) return { shouldExit: true, reason: 'lead_not_found' };

  // Enrolled in the accelerator program
  if (lead.pipeline_stage === 'enrolled') {
    return { shouldExit: true, reason: 'enrolled' };
  }

  // Lead marked as DND
  if (lead.status === 'dnd' || lead.status === 'unsubscribed') {
    return { shouldExit: true, reason: 'dnd' };
  }

  // Check for bounced or unsubscribed outcomes
  const negativeOutcome = await InteractionOutcome.findOne({
    where: {
      lead_id: leadId,
      outcome: { [Op.in]: ['bounced', 'unsubscribed'] },
    },
    order: [['created_at', 'DESC']],
    raw: true,
  });

  if (negativeOutcome) {
    return { shouldExit: true, reason: (negativeOutcome as any).outcome };
  }

  // No valid phone for SMS campaigns
  if (!lead.phone || lead.phone.trim() === '') {
    // Not a hard exit — just flag it
  }

  return { shouldExit: false, reason: '' };
}

// ── Inactivity Detection ─────────────────────────────────────────────────

/**
 * Daily cron: detect leads who completed a lifecycle-enabled campaign
 * and have been inactive for the configured inactivity period.
 * Moves them into the paired re-engagement campaign.
 */
export async function detectInactiveLeads(): Promise<{
  processed: number;
  moved_to_reengagement: number;
  exited: number;
  skipped: number;
}> {
  const stats = { processed: 0, moved_to_reengagement: 0, exited: 0, skipped: 0 };

  // Find lifecycle-enabled campaigns (not re_engagement type)
  const campaigns = await Campaign.findAll({
    where: { status: 'active' },
    raw: true,
  }) as any[];

  const lifecycleCampaigns = campaigns.filter((c: any) => {
    const tc = c.targeting_criteria || {};
    return tc.lifecycle_enabled && !['re_engagement', 'alumni_re_engagement'].includes(c.type);
  });

  for (const campaign of lifecycleCampaigns) {
    const tc = campaign.targeting_criteria || {};
    const inactivityDays = tc.inactivity_days || 30;
    const pairedCampaignId = tc.paired_campaign_id;

    if (!pairedCampaignId) continue;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);

    // Find completed leads who are still marked 'active' in lifecycle
    const inactiveLeads = await CampaignLead.findAll({
      where: {
        campaign_id: campaign.id,
        status: 'completed',
        lifecycle_status: 'active',
        [Op.or]: [
          { last_activity_at: { [Op.is]: null as any } },
          { last_activity_at: { [Op.lt]: cutoffDate } },
        ],
      } as any,
    }) as any[];

    for (const cl of inactiveLeads) {
      stats.processed++;

      // Check exit conditions
      const exit = await checkExitConditions(cl.lead_id);
      if (exit.shouldExit) {
        await cl.update({ lifecycle_status: exit.reason === 'enrolled' ? 'enrolled' : exit.reason === 'dnd' ? 'dnd' : 'bounced' });
        stats.exited++;
        continue;
      }

      // Check the paired re-engagement campaign exists and is active
      const reengageCampaign = await Campaign.findByPk(pairedCampaignId, { raw: true }) as any;
      if (!reengageCampaign || reengageCampaign.status !== 'active') {
        stats.skipped++;
        continue;
      }

      // Check if already enrolled in re-engagement
      const existing = await CampaignLead.findOne({
        where: { campaign_id: pairedCampaignId, lead_id: cl.lead_id },
      });

      if (existing) {
        stats.skipped++;
        continue;
      }

      // Enroll in re-engagement campaign
      await CampaignLead.create({
        campaign_id: pairedCampaignId,
        lead_id: cl.lead_id,
        status: 'active',
        lifecycle_status: 're_engaging',
        campaign_cycle_number: cl.campaign_cycle_number || 1,
        last_campaign_entry: new Date(),
      } as any);

      // Create scheduled actions
      if (reengageCampaign.sequence_id) {
        await enrollLeadInSequence(cl.lead_id, reengageCampaign.sequence_id, pairedCampaignId);
      }

      // Update primary campaign lead status
      await cl.update({ lifecycle_status: 're_engaging' });

      // Record tracking event for intent/marketing system
      await recordOutcome({
        lead_id: cl.lead_id,
        campaign_id: campaign.id,
        channel: 'system',
        step_index: 0,
        outcome: 'sent',
        metadata: {
          event: 'lifecycle_transition',
          from_campaign: campaign.id,
          to_campaign: pairedCampaignId,
          reason: 'inactivity',
          inactivity_days: inactivityDays,
          cycle_number: cl.campaign_cycle_number || 1,
          utm_source: tc.utm_source || 'alumni_reengagement',
          utm_campaign: tc.utm_campaign,
        },
      }).catch(() => { /* non-critical */ });

      stats.moved_to_reengagement++;
    }
  }

  console.log(`[Lifecycle] Inactivity scan: ${stats.processed} checked, ${stats.moved_to_reengagement} moved to re-engagement, ${stats.exited} exited, ${stats.skipped} skipped`);
  return stats;
}

// ── Re-Engagement Completion ─────────────────────────────────────────────

/**
 * Daily cron: detect leads who completed a re-engagement campaign.
 * If they responded → mark active, done.
 * If still inactive after 30 days → re-enter primary campaign (cycle++).
 */
export async function detectReengagementComplete(): Promise<{
  processed: number;
  reactivated: number;
  re_entered_primary: number;
  exited: number;
  waiting: number;
}> {
  const stats = { processed: 0, reactivated: 0, re_entered_primary: 0, exited: 0, waiting: 0 };

  // Find re-engagement campaigns with lifecycle enabled
  const campaigns = await Campaign.findAll({
    where: { status: 'active', type: { [Op.in]: ['re_engagement', 'alumni_re_engagement'] } },
    raw: true,
  }) as any[];

  const lifecycleCampaigns = campaigns.filter((c: any) => {
    const tc = c.targeting_criteria || {};
    return tc.lifecycle_enabled && tc.paired_campaign_id;
  });

  for (const campaign of lifecycleCampaigns) {
    const tc = campaign.targeting_criteria || {};
    const primaryCampaignId = tc.paired_campaign_id;
    const inactivityDays = tc.inactivity_days || 30;

    // Find completed re-engagement leads
    const completedLeads = await CampaignLead.findAll({
      where: {
        campaign_id: campaign.id,
        status: 'completed',
        lifecycle_status: 're_engaging',
      },
    }) as any[];

    for (const cl of completedLeads) {
      stats.processed++;

      // Check exit conditions
      const exit = await checkExitConditions(cl.lead_id);
      if (exit.shouldExit) {
        await cl.update({ lifecycle_status: exit.reason === 'enrolled' ? 'enrolled' : exit.reason === 'dnd' ? 'dnd' : 'bounced' });

        // Also update primary campaign lead
        await CampaignLead.update(
          { lifecycle_status: exit.reason === 'enrolled' ? 'enrolled' : exit.reason === 'dnd' ? 'dnd' : 'bounced' } as any,
          { where: { campaign_id: primaryCampaignId, lead_id: cl.lead_id } },
        );
        stats.exited++;
        continue;
      }

      // Check if lead responded during re-engagement
      const responded = await InteractionOutcome.findOne({
        where: {
          lead_id: cl.lead_id,
          campaign_id: campaign.id,
          outcome: { [Op.in]: ['replied', 'clicked', 'booked_meeting', 'converted'] },
        },
        raw: true,
      });

      if (responded) {
        // Lead re-engaged — mark active, done
        await cl.update({ lifecycle_status: 'active' });
        await CampaignLead.update(
          { lifecycle_status: 'active' } as any,
          { where: { campaign_id: primaryCampaignId, lead_id: cl.lead_id } },
        );
        stats.reactivated++;
        continue;
      }

      // Still inactive — check if enough time has passed to re-enter primary
      const completedAt = cl.completed_at ? new Date(cl.completed_at) : null;
      if (!completedAt) {
        stats.waiting++;
        continue;
      }

      const reentryDate = new Date(completedAt);
      reentryDate.setDate(reentryDate.getDate() + inactivityDays);

      if (new Date() < reentryDate) {
        stats.waiting++;
        continue;
      }

      // Re-enter primary campaign
      const primaryCl = await CampaignLead.findOne({
        where: { campaign_id: primaryCampaignId, lead_id: cl.lead_id },
      }) as any;

      if (!primaryCl) {
        stats.waiting++;
        continue;
      }

      const newCycle = (primaryCl.campaign_cycle_number || 1) + 1;

      // Reset primary CampaignLead for next cycle
      await primaryCl.update({
        status: 'active',
        current_step_index: 0,
        campaign_cycle_number: newCycle,
        lifecycle_status: 'active',
        last_campaign_entry: new Date(),
        completed_at: null,
      });

      // Create fresh scheduled actions
      const primaryCampaign = await Campaign.findByPk(primaryCampaignId, { raw: true }) as any;
      if (primaryCampaign?.sequence_id) {
        await enrollLeadInSequence(cl.lead_id, primaryCampaign.sequence_id, primaryCampaignId);
      }

      // Mark re-engagement lead as completed cycle
      await cl.update({ lifecycle_status: 'active' });

      // Record tracking event
      await recordOutcome({
        lead_id: cl.lead_id,
        campaign_id: primaryCampaignId,
        channel: 'system',
        step_index: 0,
        outcome: 'sent',
        metadata: {
          event: 'lifecycle_transition',
          from_campaign: campaign.id,
          to_campaign: primaryCampaignId,
          reason: 're_entry',
          cycle_number: newCycle,
          utm_source: 'alumni_champion',
          utm_campaign: 'alumni_ai_champion_reentry',
        },
      }).catch(() => { /* non-critical */ });

      stats.re_entered_primary++;
    }
  }

  console.log(`[Lifecycle] Re-engagement scan: ${stats.processed} checked, ${stats.reactivated} reactivated, ${stats.re_entered_primary} re-entered primary, ${stats.exited} exited, ${stats.waiting} waiting`);
  return stats;
}

// ── Activity Signal Tracking ─────────────────────────────────────────────

/**
 * Called from webhooks/handlers when a lead takes an action.
 * Updates last_activity_at on all active CampaignLead records for this lead.
 * Also feeds into the intent scoring and behavioral signal systems.
 */
export async function updateActivitySignal(
  leadId: number,
  signal: ActivitySignal,
  metadata?: Record<string, any>,
): Promise<void> {
  // Update last_activity_at on all active campaign enrollments
  await CampaignLead.update(
    { last_activity_at: new Date() } as any,
    {
      where: {
        lead_id: leadId,
        lifecycle_status: { [Op.in]: ['active', 're_engaging'] },
      },
    },
  );

  // Increment response_count for reply-type signals
  if (['email_reply', 'sms_reply', 'voice_conversation', 'strategy_call_booked'].includes(signal)) {
    const activeEnrollments = await CampaignLead.findAll({
      where: {
        lead_id: leadId,
        status: { [Op.in]: ['enrolled', 'active'] },
      },
    });

    for (const cl of activeEnrollments) {
      await (cl as any).update({
        response_count: ((cl as any).response_count || 0) + 1,
      });
    }
  }

  // Record as interaction outcome for attribution + intent scoring
  const activeEnrollment = await CampaignLead.findOne({
    where: {
      lead_id: leadId,
      status: { [Op.in]: ['enrolled', 'active'] },
    },
    order: [['enrolled_at', 'DESC']],
    raw: true,
  }) as any;

  if (activeEnrollment) {
    await recordOutcome({
      lead_id: leadId,
      campaign_id: activeEnrollment.campaign_id,
      channel: signal.includes('email') ? 'email' : signal.includes('sms') ? 'sms' : signal.includes('voice') ? 'voice' : 'web',
      step_index: 0,
      outcome: 'sent',
      metadata: {
        ...metadata,
        event: signal,
        signal_type: signal,
        lifecycle_status: activeEnrollment.lifecycle_status,
        campaign_cycle: activeEnrollment.campaign_cycle_number,
      },
    }).catch(() => { /* non-critical */ });
  }

  console.log(`[Lifecycle] Activity signal: lead=${leadId}, signal=${signal}`);
}

// ── Lifecycle Stats ──────────────────────────────────────────────────────

/**
 * Get lifecycle status counts across all alumni campaign leads.
 */
export async function getLifecycleStats(): Promise<LifecycleStats> {
  // Find alumni campaigns
  const campaigns = await Campaign.findAll({
    where: { status: { [Op.in]: ['active', 'paused'] } },
    raw: true,
  }) as any[];

  const alumniCampaignIds = campaigns
    .filter((c: any) => {
      const tc = c.targeting_criteria || {};
      return tc.lifecycle_enabled && tc.lead_source_type === 'alumni';
    })
    .map((c: any) => c.id);

  if (alumniCampaignIds.length === 0) {
    return { active: 0, inactive: 0, re_engaging: 0, enrolled: 0, dnd: 0, bounced: 0, total: 0 };
  }

  const allLeads = await CampaignLead.findAll({
    where: { campaign_id: { [Op.in]: alumniCampaignIds } },
    attributes: ['lifecycle_status'],
    raw: true,
  }) as any[];

  const counts: LifecycleStats = { active: 0, inactive: 0, re_engaging: 0, enrolled: 0, dnd: 0, bounced: 0, total: allLeads.length };

  for (const cl of allLeads) {
    const status = cl.lifecycle_status || 'active';
    if (status in counts) {
      (counts as any)[status]++;
    }
  }

  return counts;
}
