import { Op, fn, col, literal, QueryTypes } from 'sequelize';
import { Lead, Activity, Appointment, InteractionOutcome, CampaignLead } from '../models';
import { sequelize } from '../config/database';
import { getCampaignAttribution } from './campaignAnalyticsService';
import { logAgentExecution } from './governanceService';

const PIPELINE_STAGES = [
  'new_lead', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost',
];

const PRICE_PER_ENROLLMENT = 4500;

export async function getRevenueDashboard() {
  const forecastStart = Date.now();
  // Pipeline counts
  const pipelineCounts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) {
    pipelineCounts[stage] = await Lead.count({ where: { pipeline_stage: stage } });
  }

  // Funnel conversions (stage-to-stage)
  const totalActive = PIPELINE_STAGES
    .filter((s) => s !== 'lost')
    .reduce((sum, s) => sum + (pipelineCounts[s] || 0), 0);

  const funnelConversions = [];
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const from = PIPELINE_STAGES[i];
    const to = PIPELINE_STAGES[i + 1];
    if (from === 'lost') continue;
    const fromCount = pipelineCounts[from] || 0;
    // Count leads that made it past this stage
    const pastThisStage = PIPELINE_STAGES.slice(i + 1)
      .filter((s) => s !== 'lost')
      .reduce((sum, s) => sum + (pipelineCounts[s] || 0), 0);
    const rate = fromCount + pastThisStage > 0
      ? ((pastThisStage / (fromCount + pastThisStage)) * 100).toFixed(1)
      : '0.0';
    funnelConversions.push({ from, to, rate: parseFloat(rate) });
  }

  // Lead velocity — leads per week over last 12 weeks
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const weeklyLeads = await Lead.findAll({
    attributes: [
      [fn('to_char', col('created_at'), 'IYYY-"W"IW'), 'week'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where: {
      created_at: { [Op.gte]: twelveWeeksAgo },
    },
    group: [fn('to_char', col('created_at'), 'IYYY-"W"IW')],
    order: [[fn('to_char', col('created_at'), 'IYYY-"W"IW'), 'ASC']],
    raw: true,
  }) as any[];

  const leadVelocity = weeklyLeads.map((w: any) => ({
    week: w.week,
    count: parseInt(w.count, 10),
  }));

  // Conversion by source
  const sources = await Lead.findAll({
    attributes: [
      'form_type',
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', literal(`CASE WHEN pipeline_stage = 'enrolled' THEN 1 ELSE 0 END`)), 'enrolled'],
    ],
    group: ['form_type'],
    raw: true,
  }) as any[];

  const conversionBySource = sources
    .filter((s: any) => s.form_type)
    .map((s: any) => ({
      source: s.form_type,
      total: parseInt(s.total, 10),
      enrolled: parseInt(s.enrolled, 10),
      rate: parseInt(s.total, 10) > 0
        ? parseFloat(((parseInt(s.enrolled, 10) / parseInt(s.total, 10)) * 100).toFixed(1))
        : 0,
    }));

  // Revenue forecast
  const qualifiedLeads = (pipelineCounts['meeting_scheduled'] || 0)
    + (pipelineCounts['proposal_sent'] || 0)
    + (pipelineCounts['negotiation'] || 0);
  const historicalRate = totalActive > 0
    ? (pipelineCounts['enrolled'] || 0) / totalActive
    : 0.1; // default 10%
  const projectedEnrollments = Math.round(qualifiedLeads * Math.max(historicalRate, 0.1));
  const projectedRevenue = projectedEnrollments * PRICE_PER_ENROLLMENT;
  const actualRevenue = (pipelineCounts['enrolled'] || 0) * PRICE_PER_ENROLLMENT;

  // Upcoming appointments (next 7 days)
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingAppointments = await Appointment.findAll({
    where: {
      scheduled_at: { [Op.gte]: now, [Op.lte]: nextWeek },
      status: 'scheduled',
    },
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name', 'company'] }],
    order: [['scheduled_at', 'ASC']],
    limit: 10,
  });

  // Recent activities
  const recentActivities = await Activity.findAll({
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  // Campaign attribution
  let campaignAttribution;
  try {
    campaignAttribution = await getCampaignAttribution();
  } catch {
    campaignAttribution = { campaigns: [], by_type: [] };
  }

  const result = {
    pipelineCounts,
    funnelConversions,
    leadVelocity,
    conversionBySource,
    revenueForecast: {
      actualRevenue,
      projectedEnrollments,
      projectedRevenue,
      pipelineValue: qualifiedLeads * PRICE_PER_ENROLLMENT,
      enrolled: pipelineCounts['enrolled'] || 0,
      qualifiedLeads,
    },
    upcomingAppointments,
    recentActivities,
    campaignAttribution,
  };

  logAgentExecution('forecast_engine', 'success', Date.now() - forecastStart).catch(() => {});
  return result;
}

// ── Multi-Touch Attribution ─────────────────────────────────────────────

export interface TouchpointAttribution {
  channel: string;
  campaign_id?: string;
  campaign_name?: string;
  step_index?: number;
  outcome: string;
  timestamp: string;
  credit: number; // 0-1 (linear share)
}

export interface LeadAttribution {
  lead_id: number;
  lead_name: string;
  pipeline_stage: string;
  total_touchpoints: number;
  total_revenue: number;
  touchpoints: TouchpointAttribution[];
  first_touch: TouchpointAttribution | null;
  last_touch: TouchpointAttribution | null;
  channel_credit: Record<string, number>; // channel → total credit share
  campaign_credit: Record<string, number>; // campaign_id → total credit share
}

/**
 * Calculate multi-touch attribution for a lead.
 * Uses linear attribution: equal credit assigned to each touchpoint.
 */
export async function calculateMultiTouchAttribution(leadId: number): Promise<LeadAttribution> {
  const lead = await Lead.findByPk(leadId, { raw: true }) as any;
  if (!lead) throw new Error('Lead not found');

  // Get all interaction outcomes for this lead
  const outcomes = await InteractionOutcome.findAll({
    where: { lead_id: leadId },
    order: [['created_at', 'ASC']],
    raw: true,
  }) as any[];

  // Get campaign names for enrolled campaigns
  const campaignEnrollments = await CampaignLead.findAll({
    where: { lead_id: leadId },
    attributes: ['campaign_id'],
    raw: true,
  }) as any[];

  const campaignIds = [...new Set(outcomes.map((o: any) => o.campaign_id).filter(Boolean))];
  const campaignNames: Record<string, string> = {};
  if (campaignIds.length > 0) {
    const campaigns = await sequelize.query(
      `SELECT id, name FROM campaigns WHERE id IN (:ids)`,
      { replacements: { ids: campaignIds }, type: QueryTypes.SELECT },
    ) as any[];
    for (const c of campaigns) {
      campaignNames[c.id] = c.name;
    }
  }

  const totalTouchpoints = outcomes.length;
  const creditPerTouch = totalTouchpoints > 0 ? 1 / totalTouchpoints : 0;

  // Calculate revenue based on pipeline stage
  const isEnrolled = lead.pipeline_stage === 'enrolled';
  const totalRevenue = isEnrolled ? PRICE_PER_ENROLLMENT : 0;

  const touchpoints: TouchpointAttribution[] = outcomes.map((o: any) => ({
    channel: o.channel,
    campaign_id: o.campaign_id || undefined,
    campaign_name: o.campaign_id ? campaignNames[o.campaign_id] : undefined,
    step_index: o.step_index,
    outcome: o.outcome,
    timestamp: o.created_at,
    credit: creditPerTouch,
  }));

  // Aggregate credit by channel and campaign
  const channelCredit: Record<string, number> = {};
  const campaignCredit: Record<string, number> = {};

  for (const tp of touchpoints) {
    channelCredit[tp.channel] = (channelCredit[tp.channel] || 0) + tp.credit;
    if (tp.campaign_id) {
      campaignCredit[tp.campaign_id] = (campaignCredit[tp.campaign_id] || 0) + tp.credit;
    }
  }

  return {
    lead_id: leadId,
    lead_name: lead.name,
    pipeline_stage: lead.pipeline_stage,
    total_touchpoints: totalTouchpoints,
    total_revenue: totalRevenue,
    touchpoints,
    first_touch: touchpoints[0] || null,
    last_touch: touchpoints[touchpoints.length - 1] || null,
    channel_credit: channelCredit,
    campaign_credit: campaignCredit,
  };
}
