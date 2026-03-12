// ─── Strategic Metric Collector ──────────────────────────────────────────────
// Unified read-only aggregator. Calls existing services, returns one object.
// 15-minute in-memory cache to avoid hammering the DB.

import { getDashboardStats } from '../cohortService';
import { getLeadStats, getPipelineStats } from '../leadService';
import { getVisitorStats } from '../visitorAnalyticsService';
import { computeAgentKPIs } from '../reporting/agentPerformanceService';
import { getOpportunitySummary, getForecastProjections } from '../opportunityScoringService';
import { getGovernanceOverview } from '../governanceService';
import Campaign from '../../models/Campaign';
import InteractionOutcome from '../../models/InteractionOutcome';
import { Op } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StrategicMetrics {
  timestamp: string;
  revenue: {
    totalRevenue: number;
    totalEnrollments: number;
    paidEnrollments: number;
    pendingInvoice: number;
    seatsRemaining: number;
    upcomingCohorts: number;
  };
  funnel: {
    totalLeads: number;
    byStage: Record<string, number>;
    highIntent: number;
    conversionRate: number;
    thisMonth: number;
  };
  campaign: {
    activeCampaigns: number;
    totalSent: number;
    avgOpenRate: number;
    avgReplyRate: number;
    totalMeetings: number;
    totalConversions: number;
    registeredCampaigns: number;
    liveCampaigns: number;
    totalBudgetAllocated: number;
    totalBudgetSpent: number;
  };
  visitors: {
    total: number;
    sessions: number;
    bounceRate: number;
    avgDuration: number;
    today: number;
  };
  operations: {
    totalAgents: number;
    healthyAgents: number;
    erroredAgents: number;
    avgErrorRate: number;
    errors24h: number;
  };
  governance: {
    autonomyMode: string;
    systemStatus: string;
    activeAgents: number;
  };
  opportunities: {
    totalScored: number;
    avgScore: number;
    pipelineValue: number;
    projectedRevenue: number;
    stalledCount: number;
  };
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let cached: StrategicMetrics | null = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function invalidateMetricCache(): void {
  cached = null;
  cacheTime = 0;
}

// ─── Collector ──────────────────────────────────────────────────────────────

export async function getStrategicMetrics(): Promise<StrategicMetrics> {
  if (cached && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }

  const [
    dashStats,
    leadStats,
    pipelineStats,
    visitorStats,
    agentKPIs,
    opportunitySummary,
    forecastProjections,
    governanceOverview,
    campaignAgg,
  ] = await Promise.all([
    getDashboardStats().catch(() => ({ totalRevenue: 0, totalEnrollments: 0, paidEnrollments: 0, pendingInvoice: 0, seatsRemaining: 0, upcomingCohorts: 0 })),
    getLeadStats().catch(() => ({ total: 0, byStatus: {}, conversionRate: '0', highIntent: 0, thisMonth: 0 })),
    getPipelineStats().catch(() => ({} as Record<string, number>)),
    getVisitorStats().catch(() => ({ total_visitors: 0, total_sessions: 0, total_pageviews: 0, avg_session_duration: 0, bounce_rate: 0, visitors_today: 0, sessions_today: 0 })),
    computeAgentKPIs().catch(() => []),
    getOpportunitySummary().catch(() => ({ total_scored: 0, avg_score: 0, distribution: {}, stall_counts: {}, total_pipeline_value: 0 })),
    getForecastProjections().catch(() => ({ by_level: [], total_projected_enrollments: 0, total_projected_revenue: 0, weighted_pipeline_value: 0 })),
    getGovernanceOverview().catch(() => ({ total_agents: 0, active_agents: 0, errored_agents: 0, errors_24h: 0, system_status: 'healthy' as const, settings_sync: {} as any })),
    aggregateCampaignMetrics().catch(() => ({ activeCampaigns: 0, totalSent: 0, avgOpenRate: 0, avgReplyRate: 0, totalMeetings: 0, totalConversions: 0, registeredCampaigns: 0, liveCampaigns: 0, totalBudgetAllocated: 0, totalBudgetSpent: 0 })),
  ]);

  // Compute agent health from KPIs
  const totalAgents = agentKPIs.length || governanceOverview.total_agents;
  const healthyAgents = agentKPIs.filter((a) => a.error_rate < 0.1).length || governanceOverview.active_agents;
  const erroredAgents = agentKPIs.filter((a) => a.error_rate >= 0.5).length || governanceOverview.errored_agents;
  const avgErrorRate = agentKPIs.length > 0
    ? agentKPIs.reduce((sum, a) => sum + a.error_rate, 0) / agentKPIs.length
    : 0;

  // Compute stalled count from opportunity summary
  const stallValues = Object.values(opportunitySummary.stall_counts || {}) as number[];
  const stalledCount = stallValues.reduce((a, b) => a + b, 0);

  const metrics: StrategicMetrics = {
    timestamp: new Date().toISOString(),
    revenue: {
      totalRevenue: dashStats.totalRevenue,
      totalEnrollments: dashStats.totalEnrollments,
      paidEnrollments: dashStats.paidEnrollments,
      pendingInvoice: dashStats.pendingInvoice,
      seatsRemaining: dashStats.seatsRemaining,
      upcomingCohorts: dashStats.upcomingCohorts,
    },
    funnel: {
      totalLeads: leadStats.total,
      byStage: pipelineStats,
      highIntent: leadStats.highIntent,
      conversionRate: parseFloat(leadStats.conversionRate) || 0,
      thisMonth: leadStats.thisMonth,
    },
    campaign: campaignAgg,
    visitors: {
      total: (visitorStats as any).total_visitors || 0,
      sessions: (visitorStats as any).total_sessions || 0,
      bounceRate: (visitorStats as any).bounce_rate || 0,
      avgDuration: (visitorStats as any).avg_session_duration || 0,
      today: (visitorStats as any).visitors_today || 0,
    },
    operations: {
      totalAgents,
      healthyAgents,
      erroredAgents,
      avgErrorRate,
      errors24h: governanceOverview.errors_24h,
    },
    governance: {
      autonomyMode: (governanceOverview as any).autonomy_mode || 'full',
      systemStatus: governanceOverview.system_status,
      activeAgents: governanceOverview.active_agents,
    },
    opportunities: {
      totalScored: opportunitySummary.total_scored,
      avgScore: opportunitySummary.avg_score,
      pipelineValue: opportunitySummary.total_pipeline_value,
      projectedRevenue: forecastProjections.total_projected_revenue,
      stalledCount,
    },
  };

  cached = metrics;
  cacheTime = Date.now();
  return metrics;
}

// ─── Campaign Aggregation ───────────────────────────────────────────────────

async function aggregateCampaignMetrics() {
  const [activeCampaigns, registeredCampaigns, liveCampaigns] = await Promise.all([
    Campaign.count({ where: { status: 'active' } }),
    Campaign.count({ where: { tracking_link: { [Op.ne]: null } } as any }),
    Campaign.count({ where: { approval_status: 'live' } as any }),
  ]) as [number, number, number];

  // Budget aggregation
  const budgetAgg = await Campaign.findAll({
    attributes: [
      [Campaign.sequelize!.fn('COALESCE', Campaign.sequelize!.fn('SUM', Campaign.sequelize!.cast(Campaign.sequelize!.col('budget_cap'), 'numeric')), 0), 'total_allocated'],
      [Campaign.sequelize!.fn('COALESCE', Campaign.sequelize!.fn('SUM', Campaign.sequelize!.cast(Campaign.sequelize!.col('budget_spent'), 'numeric')), 0), 'total_spent'],
    ],
    where: { budget_cap: { [Op.ne]: null } } as any,
    raw: true,
  }).catch(() => [{ total_allocated: 0, total_spent: 0 }]) as any[];

  const totalBudgetAllocated = Number(budgetAgg[0]?.total_allocated) || 0;
  const totalBudgetSpent = Number(budgetAgg[0]?.total_spent) || 0;

  // Aggregate interaction outcomes for campaign metrics
  const outcomes = await InteractionOutcome.findAll({
    attributes: ['outcome_type'],
    raw: true,
  }).catch(() => []);

  const outcomeCounts: Record<string, number> = {};
  for (const o of outcomes as any[]) {
    const type = o.outcome_type || 'unknown';
    outcomeCounts[type] = (outcomeCounts[type] || 0) + 1;
  }

  const totalSent = outcomeCounts['email_sent'] || 0;
  const totalOpened = outcomeCounts['email_opened'] || 0;
  const totalReplied = outcomeCounts['email_replied'] || 0;
  const totalMeetings = outcomeCounts['meeting_booked'] || 0;
  const totalConversions = outcomeCounts['converted'] || 0;

  return {
    activeCampaigns,
    totalSent,
    avgOpenRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
    avgReplyRate: totalSent > 0 ? (totalReplied / totalSent) * 100 : 0,
    totalMeetings,
    totalConversions,
    registeredCampaigns,
    liveCampaigns,
    totalBudgetAllocated,
    totalBudgetSpent,
  };
}
