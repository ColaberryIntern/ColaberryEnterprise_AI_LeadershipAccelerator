import { InteractionOutcome, Lead, ScheduledEmail, CampaignLead } from '../models';
import type { OutcomeType } from '../models/InteractionOutcome';
import { classifyLead } from './leadClassificationService';

export interface RecordOutcomeParams {
  lead_id: number;
  campaign_id?: string;
  scheduled_email_id?: string;
  channel: string;
  step_index: number;
  outcome: OutcomeType;
  metadata?: Record<string, any>;
}

/** Normalize title into a broad category for aggregation */
export function normalizeTitleCategory(title?: string): string {
  if (!title) return 'unknown';
  const t = title.toLowerCase();

  if (/\b(ceo|cto|cfo|cio|coo|cmo|chief)\b/.test(t)) return 'C-Suite';
  if (/\b(svp|senior vice president)\b/.test(t)) return 'SVP';
  if (/\b(vp|vice president)\b/.test(t)) return 'VP';
  if (/\b(director|head of)\b/.test(t)) return 'Director';
  if (/\b(senior manager|sr\.\s*manager)\b/.test(t)) return 'Sr. Manager';
  if (/\b(manager|mgr)\b/.test(t)) return 'Manager';
  if (/\b(lead|principal|staff|senior|sr\.)\b/.test(t)) return 'Senior IC';
  if (/\b(founder|co-founder|owner|partner)\b/.test(t)) return 'Founder';

  return 'IC';
}

/** Normalize employee count into buckets for aggregation */
export function normalizeCompanySizeBucket(employeeCount?: number, companySize?: string): string {
  // Try numeric employee count first
  if (employeeCount !== undefined && employeeCount !== null) {
    if (employeeCount <= 10) return '1-10';
    if (employeeCount <= 50) return '11-50';
    if (employeeCount <= 200) return '51-200';
    if (employeeCount <= 1000) return '201-1000';
    return '1000+';
  }

  // Fall back to company_size string
  if (!companySize) return 'unknown';
  const s = companySize.toLowerCase();

  if (/1[-–]10|solo|micro/.test(s)) return '1-10';
  if (/11[-–]50|small/.test(s)) return '11-50';
  if (/51[-–]200|mid/.test(s)) return '51-200';
  if (/201[-–]1000|medium|large/.test(s)) return '201-1000';
  if (/1000\+|1001|enterprise/.test(s)) return '1000+';

  return 'unknown';
}

/** Record an interaction outcome with denormalized lead dimensions */
export async function recordOutcome(params: RecordOutcomeParams): Promise<void> {
  try {
    const lead = await Lead.findByPk(params.lead_id);
    if (!lead) {
      console.warn(`[InteractionService] Lead ${params.lead_id} not found, recording without dimensions`);
    }

    await InteractionOutcome.create({
      lead_id: params.lead_id,
      campaign_id: params.campaign_id || null,
      scheduled_email_id: params.scheduled_email_id || null,
      channel: params.channel,
      step_index: params.step_index,
      outcome: params.outcome,
      lead_industry: lead?.industry || null,
      lead_title_category: normalizeTitleCategory(lead?.title),
      lead_company_size_bucket: normalizeCompanySizeBucket(lead?.employee_count, lead?.company_size),
      lead_source_type: lead?.lead_source_type || 'warm',
      metadata: params.metadata || null,
    } as any);

    // Auto-classify lead temperature after every interaction
    try {
      await classifyLead(params.lead_id, params.campaign_id, params.outcome);
    } catch (classErr: any) {
      console.error(`[InteractionService] Classification error:`, classErr.message);
    }

    // Update CampaignLead tracking if within a campaign
    if (params.campaign_id) {
      try {
        const campaignLead = await CampaignLead.findOne({
          where: { campaign_id: params.campaign_id, lead_id: params.lead_id },
        });
        if (campaignLead) {
          const updates: Record<string, any> = {
            last_activity_at: new Date(),
            touchpoint_count: (campaignLead.touchpoint_count || 0) + 1,
          };
          // Count responses (reply, answered, booked_meeting, converted)
          const responseOutcomes = ['replied', 'answered', 'booked_meeting', 'converted'];
          if (responseOutcomes.includes(params.outcome)) {
            updates.response_count = (campaignLead.response_count || 0) + 1;
          }
          await campaignLead.update(updates);
        }
      } catch (trackErr: any) {
        console.error(`[InteractionService] CampaignLead tracking error:`, trackErr.message);
      }
    }
  } catch (err: any) {
    // Non-blocking — don't fail sends because of tracking errors
    console.error(`[InteractionService] Failed to record outcome:`, err.message);
  }
}

/** Record outcome from a ScheduledEmail action (convenience wrapper) */
export async function recordActionOutcome(
  action: InstanceType<typeof ScheduledEmail>,
  outcome: OutcomeType,
  metadata?: Record<string, any>,
): Promise<void> {
  await recordOutcome({
    lead_id: action.lead_id,
    campaign_id: action.campaign_id || undefined,
    scheduled_email_id: action.id,
    channel: action.channel || 'email',
    step_index: action.step_index || 0,
    outcome,
    metadata: {
      ...(metadata || {}),
      ai_generated: action.ai_generated || false,
    },
  });
}

/** Record outcome from a Mandrill webhook event */
export async function recordWebhookOutcome(
  scheduledEmailId: string,
  outcome: OutcomeType,
  metadata?: Record<string, any>,
): Promise<void> {
  const action = await ScheduledEmail.findByPk(scheduledEmailId);
  if (!action) {
    console.warn(`[InteractionService] ScheduledEmail ${scheduledEmailId} not found for webhook outcome`);
    return;
  }

  await recordOutcome({
    lead_id: action.lead_id,
    campaign_id: action.campaign_id || undefined,
    scheduled_email_id: action.id,
    channel: action.channel || 'email',
    step_index: action.step_index || 0,
    outcome,
    metadata: {
      ...(metadata || {}),
      source: 'mandrill_webhook',
      ai_generated: action.ai_generated || false,
    },
  });
}

/** Get outcome counts for a lead */
export async function getLeadOutcomeSummary(leadId: number): Promise<Record<string, number>> {
  const outcomes = await InteractionOutcome.findAll({
    where: { lead_id: leadId },
    attributes: ['outcome'],
  });

  const counts: Record<string, number> = {};
  for (const o of outcomes) {
    counts[o.outcome] = (counts[o.outcome] || 0) + 1;
  }
  return counts;
}

/** Get outcome counts for a campaign */
export async function getCampaignOutcomeSummary(campaignId: string): Promise<{
  total: number;
  by_outcome: Record<string, number>;
  by_channel: Record<string, number>;
}> {
  const outcomes = await InteractionOutcome.findAll({
    where: { campaign_id: campaignId },
  });

  const by_outcome: Record<string, number> = {};
  const by_channel: Record<string, number> = {};

  for (const o of outcomes) {
    by_outcome[o.outcome] = (by_outcome[o.outcome] || 0) + 1;
    by_channel[o.channel] = (by_channel[o.channel] || 0) + 1;
  }

  return {
    total: outcomes.length,
    by_outcome,
    by_channel,
  };
}
