import { Op, fn, col, literal } from 'sequelize';
import {
  Lead,
  Visitor,
  IntentScore,
  InteractionOutcome,
  Activity,
  Appointment,
  CampaignLead,
  BehavioralSignal,
} from '../models';
import OpportunityScore from '../models/OpportunityScore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRICE_PER_ENROLLMENT = 4500;

const PIPELINE_SCORES: Record<string, number> = {
  new_lead: 10,
  contacted: 25,
  meeting_scheduled: 50,
  proposal_sent: 70,
  negotiation: 85,
  enrolled: 100,
  lost: 0,
};

const OPPORTUNITY_LEVELS: Array<{ max: number; level: string }> = [
  { max: 19, level: 'cold_prospect' },
  { max: 39, level: 'warming' },
  { max: 59, level: 'qualified' },
  { max: 79, level: 'hot_opportunity' },
  { max: 100, level: 'ready_to_close' },
];

const CONVERSION_RATES: Record<string, number> = {
  cold_prospect: 0.02,
  warming: 0.08,
  qualified: 0.20,
  hot_opportunity: 0.45,
  ready_to_close: 0.75,
};

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function getOpportunityLevel(score: number): string {
  for (const { max, level } of OPPORTUNITY_LEVELS) {
    if (score <= max) return level;
  }
  return 'ready_to_close';
}

function computeStallRisk(score: number, daysSinceLastActivity: number): { risk: string; reason: string | null } {
  if (score >= 40 && daysSinceLastActivity > 14) {
    return { risk: 'high', reason: `No activity in ${daysSinceLastActivity} days despite high opportunity score` };
  }
  if (score >= 40 && daysSinceLastActivity > 7) {
    return { risk: 'medium', reason: `No activity in ${daysSinceLastActivity} days — follow-up needed` };
  }
  if (score >= 60 && daysSinceLastActivity > 3) {
    return { risk: 'low', reason: 'Hot lead cooling — consider proactive outreach' };
  }
  return { risk: 'none', reason: null };
}

function buildRecommendedActions(
  pipelineStage: string,
  score: number,
  stallRisk: string,
  intentScore: number,
  hasAppointment: boolean,
  hasCampaign: boolean,
  lastChannel: string | null,
  daysSinceLastActivity: number,
): Array<{ action: string; priority: string; reason: string }> {
  const actions: Array<{ action: string; priority: string; reason: string }> = [];

  if (pipelineStage === 'new_lead' && score >= 20) {
    actions.push({ action: 'Enroll in warm nurture campaign', priority: 'high', reason: 'Lead shows interest but has not been contacted' });
  }

  if (pipelineStage === 'contacted' && !hasAppointment) {
    actions.push({ action: 'Schedule strategy call', priority: 'high', reason: 'Lead contacted but no meeting scheduled' });
  }

  if (hasAppointment && !['proposal_sent', 'negotiation', 'enrolled'].includes(pipelineStage)) {
    actions.push({ action: 'Send proposal', priority: 'medium', reason: 'Meeting completed — advance to proposal stage' });
  }

  if (stallRisk === 'high') {
    actions.push({ action: 'Personal outreach required — call within 24h', priority: 'critical', reason: `No activity in ${daysSinceLastActivity} days` });
  } else if (stallRisk === 'medium' && lastChannel === 'email') {
    actions.push({ action: 'Try voice outreach', priority: 'high', reason: 'Email engagement stalled — switch channel' });
  }

  if (intentScore >= 70 && !hasCampaign) {
    actions.push({ action: 'Enroll in behavioral trigger campaign', priority: 'high', reason: 'Very high intent score but not in any campaign' });
  }

  if (pipelineStage === 'negotiation' && daysSinceLastActivity > 7) {
    actions.push({ action: 'Escalate — closing window narrowing', priority: 'critical', reason: 'Negotiation stalled for 7+ days' });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

export async function computeOpportunityScore(leadId: number): Promise<OpportunityScore | null> {
  const lead = await Lead.findByPk(leadId, {
    include: [
      { model: Visitor, as: 'visitor', attributes: ['id', 'total_sessions', 'total_pageviews'] },
    ],
  });
  if (!lead) return null;

  const leadData = lead as any;
  const visitorId = leadData.visitor?.id;

  // Fetch all needed data in parallel
  const [intentScoreRow, outcomes, lastActivity, appointmentCount, campaignCount, lastSignal] = await Promise.all([
    visitorId ? IntentScore.findOne({ where: { visitor_id: visitorId } }) : Promise.resolve(null),
    InteractionOutcome.findAll({ where: { lead_id: leadId }, attributes: ['outcome', 'channel', 'created_at'], order: [['created_at', 'DESC']], limit: 100 }),
    Activity.findOne({ where: { lead_id: leadId }, order: [['created_at', 'DESC']], attributes: ['created_at'] }),
    Appointment.count({ where: { lead_id: leadId, status: { [Op.in]: ['scheduled', 'completed'] } } }),
    CampaignLead.count({ where: { lead_id: leadId } }),
    visitorId ? BehavioralSignal.findOne({ where: { visitor_id: visitorId }, order: [['detected_at', 'DESC']], attributes: ['detected_at'] }) : Promise.resolve(null),
  ]);

  // 1. Intent Score component (25%)
  const intentRaw = (intentScoreRow as any)?.score || 0;
  const intentComponent = Math.min(100, intentRaw) * 0.25;

  // 2. Engagement component (20%) — normalize outcome counts
  const outcomeCounts: Record<string, number> = {};
  for (const o of outcomes) {
    const oc = (o as any).outcome;
    outcomeCounts[oc] = (outcomeCounts[oc] || 0) + 1;
  }
  const replied = outcomeCounts['replied'] || 0;
  const clicked = outcomeCounts['clicked'] || 0;
  const opened = outcomeCounts['opened'] || 0;
  const booked = outcomeCounts['booked_meeting'] || 0;
  const engagementRaw = Math.min(100, (replied * 25) + (clicked * 15) + (booked * 30) + (opened * 5));
  const engagementComponent = engagementRaw * 0.20;

  // 3. Pipeline Position component (20%)
  const pipelineScore = PIPELINE_SCORES[leadData.pipeline_stage] ?? 10;
  const pipelineComponent = pipelineScore * 0.20;

  // 4. Recency component (15%) — exponential decay with 14-day half-life
  const lastDates = [
    lastActivity ? new Date((lastActivity as any).created_at) : null,
    lastSignal ? new Date((lastSignal as any).detected_at) : null,
    ...(outcomes.length > 0 ? [new Date((outcomes[0] as any).created_at)] : []),
  ].filter(Boolean) as Date[];
  const mostRecentActivity = lastDates.length > 0 ? new Date(Math.max(...lastDates.map(d => d.getTime()))) : null;
  const daysSinceLastActivity = mostRecentActivity ? Math.round((Date.now() - mostRecentActivity.getTime()) / (1000 * 60 * 60 * 24)) : 999;
  const recencyRaw = mostRecentActivity ? Math.pow(2, -daysSinceLastActivity / 14) * 100 : 0;
  const recencyComponent = recencyRaw * 0.15;

  // 5. Session Depth component (10%)
  const totalSessions = leadData.visitor?.total_sessions || 0;
  const sessionRaw = totalSessions > 0 ? Math.min(100, Math.log2(totalSessions + 1) * 20) : 0;
  const sessionComponent = sessionRaw * 0.10;

  // 6. Campaign Response component (10%) — best outcome
  let bestResponse = 0;
  if (replied > 0 || booked > 0) bestResponse = 100;
  else if (clicked > 0) bestResponse = 60;
  else if (opened > 0) bestResponse = 30;
  const campaignComponent = bestResponse * 0.10;

  // Total score
  const totalScore = Math.min(100, Math.round(
    intentComponent + engagementComponent + pipelineComponent + recencyComponent + sessionComponent + campaignComponent
  ));

  const opportunityLevel = getOpportunityLevel(totalScore);
  const { risk: stallRisk, reason: stallReason } = computeStallRisk(totalScore, daysSinceLastActivity);

  const daysInPipeline = Math.round((Date.now() - new Date(leadData.created_at).getTime()) / (1000 * 60 * 60 * 24));

  const hasCompletedAppointment = appointmentCount > 0;
  const hasCampaign = campaignCount > 0;
  const lastChannel = outcomes.length > 0 ? (outcomes[0] as any).channel : null;

  const recommendedActions = buildRecommendedActions(
    leadData.pipeline_stage, totalScore, stallRisk, intentRaw,
    hasCompletedAppointment, hasCampaign, lastChannel, daysSinceLastActivity,
  );

  const conversionProbability = CONVERSION_RATES[opportunityLevel] || 0.02;
  const projectedRevenue = Math.round(conversionProbability * PRICE_PER_ENROLLMENT);

  // Upsert
  const [record] = await OpportunityScore.upsert({
    id: undefined as any,
    lead_id: leadId,
    visitor_id: visitorId || null,
    score: totalScore,
    opportunity_level: opportunityLevel,
    score_components: {
      intent: Math.round(intentComponent),
      engagement: Math.round(engagementComponent),
      pipeline: Math.round(pipelineComponent),
      recency: Math.round(recencyComponent),
      sessions: Math.round(sessionComponent),
      campaign_response: Math.round(campaignComponent),
    },
    stall_risk: stallRisk,
    stall_reason: stallReason,
    days_in_pipeline: daysInPipeline,
    days_since_last_activity: daysSinceLastActivity,
    recommended_actions: recommendedActions,
    conversion_probability: conversionProbability,
    projected_revenue: projectedRevenue,
    score_updated_at: new Date(),
    updated_at: new Date(),
  });

  return record;
}

// ---------------------------------------------------------------------------
// Batch recomputation
// ---------------------------------------------------------------------------

export async function recomputeActiveOpportunityScores(): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find leads to recompute
  const [recentLeads, recentOutcomeLeads, neverComputed] = await Promise.all([
    // Leads updated in last 24h
    Lead.findAll({
      where: { updated_at: { [Op.gte]: oneDayAgo } },
      attributes: ['id'],
    }),
    // Leads with recent interaction outcomes
    InteractionOutcome.findAll({
      where: { created_at: { [Op.gte]: oneDayAgo } },
      attributes: ['lead_id'],
      group: ['lead_id'],
    }),
    // Leads never scored
    Lead.findAll({
      attributes: ['id'],
      where: {
        id: {
          [Op.notIn]: literal('(SELECT lead_id FROM opportunity_scores)'),
        },
        pipeline_stage: { [Op.ne]: 'lost' },
      },
    }),
  ]);

  const leadIds = new Set<number>();
  for (const l of recentLeads) leadIds.add((l as any).id);
  for (const o of recentOutcomeLeads) leadIds.add((o as any).lead_id);
  for (const l of neverComputed) leadIds.add((l as any).id);

  let scored = 0;
  for (const leadId of leadIds) {
    try {
      await computeOpportunityScore(leadId);
      scored++;
    } catch (err: any) {
      console.error(`[OpportunityScore] Error scoring lead ${leadId}:`, err.message);
    }
  }

  return scored;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getTopOpportunities(options?: {
  limit?: number;
  offset?: number;
  level?: string;
  stallRisk?: string;
  pipelineStage?: string;
  sort?: string;
  order?: string;
}): Promise<{ rows: OpportunityScore[]; count: number }> {
  const { limit = 50, offset = 0, level, stallRisk, pipelineStage, sort = 'score', order = 'DESC' } = options || {};

  const where: any = {};
  if (level) where.opportunity_level = level;
  if (stallRisk) where.stall_risk = stallRisk;

  const include: any[] = [{
    model: Lead,
    as: 'lead',
    attributes: ['id', 'name', 'email', 'company', 'title', 'pipeline_stage', 'lead_temperature', 'lead_score', 'created_at'],
    where: pipelineStage ? { pipeline_stage: pipelineStage } : undefined,
  }];

  const validSorts = ['score', 'days_since_last_activity', 'stall_risk', 'conversion_probability', 'days_in_pipeline'];
  const sortField = validSorts.includes(sort) ? sort : 'score';

  const { rows, count } = await OpportunityScore.findAndCountAll({
    where,
    include,
    order: [[sortField, order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
    limit,
    offset,
  });

  return { rows, count };
}

export async function getOpportunityDistribution(): Promise<Record<string, number>> {
  const results = await OpportunityScore.findAll({
    attributes: ['opportunity_level', [fn('COUNT', col('id')), 'count']],
    group: ['opportunity_level'],
  });

  const dist: Record<string, number> = {
    cold_prospect: 0,
    warming: 0,
    qualified: 0,
    hot_opportunity: 0,
    ready_to_close: 0,
  };

  for (const r of results) {
    dist[(r as any).opportunity_level] = parseInt((r as any).getDataValue('count'), 10);
  }

  return dist;
}

export async function getOpportunitySummary(): Promise<{
  total_scored: number;
  avg_score: number;
  distribution: Record<string, number>;
  stall_counts: Record<string, number>;
  total_pipeline_value: number;
}> {
  const [totalRow, distribution, stallResults] = await Promise.all([
    OpportunityScore.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'total'],
        [fn('AVG', col('score')), 'avg'],
        [fn('SUM', col('projected_revenue')), 'pipeline_value'],
      ],
    }),
    getOpportunityDistribution(),
    OpportunityScore.findAll({
      attributes: ['stall_risk', [fn('COUNT', col('id')), 'count']],
      group: ['stall_risk'],
    }),
  ]);

  const stallCounts: Record<string, number> = { none: 0, low: 0, medium: 0, high: 0 };
  for (const r of stallResults) {
    stallCounts[(r as any).stall_risk] = parseInt((r as any).getDataValue('count'), 10);
  }

  return {
    total_scored: parseInt((totalRow as any)?.getDataValue('total') || '0', 10),
    avg_score: Math.round(parseFloat((totalRow as any)?.getDataValue('avg') || '0')),
    distribution,
    stall_counts: stallCounts,
    total_pipeline_value: Math.round(parseFloat((totalRow as any)?.getDataValue('pipeline_value') || '0')),
  };
}

export async function getForecastProjections(): Promise<{
  by_level: Array<{ level: string; count: number; conversion_rate: number; projected_enrollments: number; projected_revenue: number }>;
  total_projected_enrollments: number;
  total_projected_revenue: number;
  weighted_pipeline_value: number;
}> {
  const distribution = await getOpportunityDistribution();

  const byLevel = Object.entries(CONVERSION_RATES).map(([level, rate]) => {
    const count = distribution[level] || 0;
    const projectedEnrollments = Math.round(count * rate * 10) / 10;
    return {
      level,
      count,
      conversion_rate: rate,
      projected_enrollments: projectedEnrollments,
      projected_revenue: Math.round(projectedEnrollments * PRICE_PER_ENROLLMENT),
    };
  });

  const totalProjectedEnrollments = Math.round(byLevel.reduce((sum, b) => sum + b.projected_enrollments, 0) * 10) / 10;
  const totalProjectedRevenue = Math.round(totalProjectedEnrollments * PRICE_PER_ENROLLMENT);

  // Weighted pipeline value = sum of (each lead's score/100 * PRICE)
  const weightedRow = await OpportunityScore.findOne({
    attributes: [[fn('SUM', literal(`score * ${PRICE_PER_ENROLLMENT} / 100.0`)), 'weighted']],
  });
  const weightedPipelineValue = Math.round(parseFloat((weightedRow as any)?.getDataValue('weighted') || '0'));

  return {
    by_level: byLevel,
    total_projected_enrollments: totalProjectedEnrollments,
    total_projected_revenue: totalProjectedRevenue,
    weighted_pipeline_value: weightedPipelineValue,
  };
}
