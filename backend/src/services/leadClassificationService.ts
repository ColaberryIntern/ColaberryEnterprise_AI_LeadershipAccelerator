import { Op } from 'sequelize';
import { Lead, InteractionOutcome } from '../models';
import LeadTemperatureHistory from '../models/LeadTemperatureHistory';

export type LeadTemperature = 'cold' | 'cool' | 'warm' | 'hot' | 'qualified';

/** Engagement signal point values for temperature scoring */
const SIGNAL_POINTS: Record<string, number> = {
  sent: 0,
  opened: 5,
  clicked: 10,
  replied: 25,
  answered: 20,
  voicemail: 3,
  booked_meeting: 40,
  converted: 50,
  bounced: -10,
  unsubscribed: -30,
  declined: -5,
  no_response: 0,
};

/** Temperature thresholds */
const THRESHOLDS: Array<{ min: number; temperature: LeadTemperature }> = [
  { min: 80, temperature: 'qualified' },
  { min: 50, temperature: 'hot' },
  { min: 25, temperature: 'warm' },
  { min: 10, temperature: 'cool' },
  { min: -Infinity, temperature: 'cold' },
];

/**
 * Calculate engagement score from recent interactions.
 * Looks at last 90 days of InteractionOutcome records.
 */
export async function calculateEngagementScore(leadId: number): Promise<{
  score: number;
  breakdown: Record<string, { count: number; points: number }>;
}> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const outcomes = await InteractionOutcome.findAll({
    where: {
      lead_id: leadId,
      created_at: { [Op.gte]: ninetyDaysAgo },
    },
    attributes: ['outcome'],
    raw: true,
  }) as any[];

  let score = 0;
  const breakdown: Record<string, { count: number; points: number }> = {};

  for (const o of outcomes) {
    const points = SIGNAL_POINTS[o.outcome] ?? 0;
    score += points;

    if (!breakdown[o.outcome]) {
      breakdown[o.outcome] = { count: 0, points: 0 };
    }
    breakdown[o.outcome].count++;
    breakdown[o.outcome].points += points;
  }

  return { score, breakdown };
}

/** Determine temperature from engagement score */
export function scoreToTemperature(score: number): LeadTemperature {
  for (const t of THRESHOLDS) {
    if (score >= t.min) return t.temperature;
  }
  return 'cold';
}

/**
 * Classify a lead based on engagement signals.
 * Updates the Lead record and creates a history entry if temperature changed.
 */
export async function classifyLead(
  leadId: number,
  campaignId?: string,
  triggerOutcome?: string,
): Promise<{
  previous: string;
  current: LeadTemperature;
  score: number;
  changed: boolean;
}> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) {
    return { previous: 'unknown', current: 'cold', score: 0, changed: false };
  }

  const { score, breakdown } = await calculateEngagementScore(leadId);
  const newTemp = scoreToTemperature(score);
  const previousTemp = lead.lead_temperature || 'cold';
  const changed = newTemp !== previousTemp;

  if (changed) {
    await lead.update({
      lead_temperature: newTemp,
      temperature_updated_at: new Date(),
    });

    await LeadTemperatureHistory.create({
      lead_id: leadId,
      previous_temperature: previousTemp,
      new_temperature: newTemp,
      trigger_type: 'interaction_outcome',
      trigger_detail: triggerOutcome || 'engagement_score_change',
      campaign_id: campaignId || null,
      metadata: { score, breakdown },
    } as any);

    console.log(`[Classification] Lead ${leadId}: ${previousTemp} → ${newTemp} (score: ${score})`);
  }

  return { previous: previousTemp, current: newTemp, score, changed };
}

/**
 * Manually override a lead's temperature (admin action).
 */
export async function classifyLeadManual(
  leadId: number,
  temperature: LeadTemperature,
  adminId?: string,
): Promise<{ previous: string; current: LeadTemperature }> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error('Lead not found');

  const previousTemp = lead.lead_temperature || 'cold';

  await lead.update({
    lead_temperature: temperature,
    temperature_updated_at: new Date(),
  });

  await LeadTemperatureHistory.create({
    lead_id: leadId,
    previous_temperature: previousTemp,
    new_temperature: temperature,
    trigger_type: 'manual',
    trigger_detail: 'admin_override',
    metadata: { admin_id: adminId },
  } as any);

  console.log(`[Classification] Lead ${leadId}: manual override ${previousTemp} → ${temperature}`);

  return { previous: previousTemp, current: temperature };
}

/**
 * Get temperature history for a lead.
 */
export async function getTemperatureHistory(leadId: number): Promise<any[]> {
  return LeadTemperatureHistory.findAll({
    where: { lead_id: leadId },
    order: [['created_at', 'DESC']],
    raw: true,
  });
}
