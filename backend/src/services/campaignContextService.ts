// ─── Campaign Context Service ──────────────────────────────────────────────────
// Read-only service that provides Maya with a lightweight snapshot of a lead's
// campaign state.  Used to inject campaign awareness into the system prompt so
// Maya can reference recent messaging, avoid duplication, and respect campaign
// pacing — without ever modifying campaign state.
//
// SAFETY: This service performs SELECT queries only.  It must never INSERT,
// UPDATE, or DELETE any campaign-related records.

import { Op } from 'sequelize';
import CampaignLead from '../models/CampaignLead';
import Campaign from '../models/Campaign';
import ScheduledEmail from '../models/ScheduledEmail';
import InteractionOutcome from '../models/InteractionOutcome';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignSnapshot {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  currentStepIndex: number;
  totalSteps: number;
  nextTouchInHours: number | null;
  nextChannel: 'email' | 'voice' | 'sms' | null;
  nextSubject: string | null;
  lastTouchChannel: string | null;
  lastTouchHoursAgo: number | null;
  lastTouchSubject: string | null;
}

export interface EngagementSignals {
  emailOpened: boolean;
  emailClicked: boolean;
  replied: boolean;
}

export interface CampaignContext {
  activeCampaigns: CampaignSnapshot[];
  engagementSignals: EngagementSignals;
  nextTouchWithinHours: number | null;
  recentTouchWithinHours: number | null;
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Build a read-only campaign context snapshot for the given lead.
 * Returns null if the lead has no active campaigns.
 */
export async function getCampaignContext(
  leadId: number,
): Promise<CampaignContext | null> {
  try {
    // 1. Find all active/enrolled campaign enrollments for this lead
    const enrollments = await CampaignLead.findAll({
      where: {
        lead_id: leadId,
        status: { [Op.in]: ['enrolled', 'active'] },
      },
      include: [
        {
          model: Campaign,
          as: 'campaign',
          attributes: ['id', 'name', 'type', 'status'],
        },
      ],
    });

    if (!enrollments || enrollments.length === 0) return null;

    const now = Date.now();
    const activeCampaigns: CampaignSnapshot[] = [];

    for (const enrollment of enrollments) {
      const campaign = (enrollment as any).campaign;
      if (!campaign || campaign.status !== 'active') continue;

      const campaignId = campaign.id;

      // Next pending action for this lead+campaign
      const nextAction = await ScheduledEmail.findOne({
        where: {
          lead_id: leadId,
          campaign_id: campaignId,
          status: 'pending',
        },
        order: [['scheduled_for', 'ASC']],
        attributes: ['scheduled_for', 'channel', 'subject', 'step_index'],
      });

      // Last sent action for this lead+campaign
      const lastSent = await ScheduledEmail.findOne({
        where: {
          lead_id: leadId,
          campaign_id: campaignId,
          status: 'sent',
        },
        order: [['sent_at', 'DESC']],
        attributes: ['sent_at', 'channel', 'subject', 'step_index'],
      });

      const nextTouchMs = nextAction
        ? new Date((nextAction as any).scheduled_for).getTime() - now
        : null;
      const lastTouchMs = lastSent
        ? now - new Date((lastSent as any).sent_at).getTime()
        : null;

      activeCampaigns.push({
        campaignId,
        campaignName: campaign.name,
        campaignType: campaign.type,
        currentStepIndex: (enrollment as any).current_step_index ?? 0,
        totalSteps: (enrollment as any).total_steps ?? 0,
        nextTouchInHours: nextTouchMs !== null ? Math.round(nextTouchMs / 3_600_000 * 10) / 10 : null,
        nextChannel: nextAction ? (nextAction as any).channel : null,
        nextSubject: nextAction ? (nextAction as any).subject : null,
        lastTouchChannel: lastSent ? (lastSent as any).channel : null,
        lastTouchHoursAgo: lastTouchMs !== null ? Math.round(lastTouchMs / 3_600_000 * 10) / 10 : null,
        lastTouchSubject: lastSent ? (lastSent as any).subject : null,
      });
    }

    if (activeCampaigns.length === 0) return null;

    // 2. Engagement signals — check last 30 days of interaction outcomes
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const outcomes = await InteractionOutcome.findAll({
      where: {
        lead_id: leadId,
        created_at: { [Op.gte]: thirtyDaysAgo },
        outcome: { [Op.in]: ['opened', 'clicked', 'replied'] },
      },
      attributes: ['outcome'],
      raw: true,
    });

    const outcomeSet = new Set(outcomes.map((o: any) => o.outcome));

    // 3. Compute convenience rollups
    const allNextHours = activeCampaigns
      .map((c) => c.nextTouchInHours)
      .filter((h): h is number => h !== null);
    const allLastHours = activeCampaigns
      .map((c) => c.lastTouchHoursAgo)
      .filter((h): h is number => h !== null);

    return {
      activeCampaigns,
      engagementSignals: {
        emailOpened: outcomeSet.has('opened'),
        emailClicked: outcomeSet.has('clicked'),
        replied: outcomeSet.has('replied'),
      },
      nextTouchWithinHours: allNextHours.length > 0 ? Math.min(...allNextHours) : null,
      recentTouchWithinHours: allLastHours.length > 0 ? Math.min(...allLastHours) : null,
    };
  } catch (err: any) {
    console.warn('[CampaignContext] Failed to build context:', err.message);
    return null;
  }
}

// ─── Prompt Formatter ─────────────────────────────────────────────────────────

/**
 * Format the campaign context into a human-readable block for injection into
 * Maya's system prompt.  Returns empty string if no context.
 */
export function formatCampaignContextForPrompt(ctx: CampaignContext): string {
  const lines: string[] = [];

  lines.push('CAMPAIGN CONTEXT — The lead is enrolled in automated campaign(s):');

  for (const c of ctx.activeCampaigns) {
    const parts = [`- "${c.campaignName}" (${c.campaignType})`];
    parts.push(`step ${c.currentStepIndex + 1}/${c.totalSteps || '?'}`);

    if (c.lastTouchHoursAgo !== null) {
      const label = c.lastTouchHoursAgo < 1
        ? 'less than 1 hour ago'
        : `${Math.round(c.lastTouchHoursAgo)}h ago`;
      parts.push(`last ${c.lastTouchChannel}: ${label}`);
      if (c.lastTouchSubject) parts.push(`subject: "${c.lastTouchSubject}"`);
    }
    if (c.nextTouchInHours !== null) {
      const label = c.nextTouchInHours < 1
        ? 'less than 1 hour'
        : `${Math.round(c.nextTouchInHours)}h`;
      parts.push(`next ${c.nextChannel} in ${label}`);
    }
    lines.push(parts.join(' | '));
  }

  // Engagement signals
  const signals: string[] = [];
  if (ctx.engagementSignals.emailOpened) signals.push('opened emails');
  if (ctx.engagementSignals.emailClicked) signals.push('clicked links');
  if (ctx.engagementSignals.replied) signals.push('replied to messages');
  if (signals.length > 0) {
    lines.push(`Engagement: lead has ${signals.join(', ')}`);
  }

  // Campaign awareness rules
  lines.push('');
  lines.push('CAMPAIGN AWARENESS RULES:');
  lines.push('You must respect existing campaign automation. Campaign messages are the primary communication timeline.');
  lines.push('');

  if (ctx.nextTouchWithinHours !== null && ctx.nextTouchWithinHours <= 12) {
    lines.push(`- A campaign message is scheduled within the next ${Math.round(ctx.nextTouchWithinHours)} hours. Do NOT suggest additional outreach — let the campaign message proceed.`);
  }

  if (ctx.recentTouchWithinHours !== null && ctx.recentTouchWithinHours <= 6) {
    lines.push('- A campaign message was sent within the last 6 hours. Reference that message rather than repeating its content. Example: "You may have just received an email about the program. Did anything there raise questions?"');
  }

  lines.push('- Do NOT duplicate campaign messaging. If the campaign recently sent a program overview, do not repeat the overview — instead ask if they have questions about what they received.');
  lines.push('- Do NOT send outbound emails, SMS, or calls outside the campaign engine. You may only communicate inside this chat.');
  lines.push('- EXCEPTION: If the lead demonstrates strong booking intent (asks to book a call, asks about ROI, asks about team transformation), you MAY bypass campaign pacing and trigger the booking flow immediately. Booking is the highest-value conversion event and always takes priority.');

  return lines.join('\n');
}
