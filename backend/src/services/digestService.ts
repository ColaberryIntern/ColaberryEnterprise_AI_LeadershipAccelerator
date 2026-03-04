import { getDashboardStats } from './cohortService';
import { getLeadStats, getPipelineStats } from './leadService';
import {
  getOpportunitySummary,
  getForecastProjections,
  getTopOpportunities,
} from './opportunityScoringService';
import { getVisitorStats } from './visitorAnalyticsService';
import { getHighIntentVisitors } from './intentScoringService';
import { getUpcomingAppointments } from './appointmentService';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DigestData {
  generatedAt: Date;
  period: 'daily' | 'weekly';

  revenue: {
    totalRevenue: number;
    totalEnrollments: number;
    paidEnrollments: number;
    pendingInvoice: number;
    seatsRemaining: number;
    upcomingCohorts: number;
  };

  leads: {
    total: number;
    thisMonth: number;
    highIntent: number;
    conversionRate: string;
    byStatus: Record<string, number>;
  };

  pipeline: Record<string, number>;

  opportunities: {
    total_scored: number;
    avg_score: number;
    distribution: Record<string, number>;
    stall_counts: Record<string, number>;
    total_pipeline_value: number;
  };

  forecast: {
    total_projected_enrollments: number;
    total_projected_revenue: number;
    weighted_pipeline_value: number;
  };

  atRisk: Array<{
    leadName: string;
    company: string;
    score: number;
    stall_risk: string;
    stall_reason: string | null;
    days_since_last_activity: number;
  }>;

  visitors: {
    total_visitors: number;
    total_sessions: number;
    avg_session_duration: number;
    bounce_rate: number;
  };

  highIntentCount: number;

  appointments: Array<{
    title: string;
    scheduled_at: string;
    lead_name: string;
    type: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Compile                                                            */
/* ------------------------------------------------------------------ */

export async function compileDigestData(
  period: 'daily' | 'weekly'
): Promise<DigestData> {
  const [
    revenue,
    leadStats,
    pipeline,
    oppSummary,
    forecast,
    atRiskResult,
    visitorStats,
    highIntent,
    appointments,
  ] = await Promise.all([
    getDashboardStats(),
    getLeadStats(),
    getPipelineStats(),
    getOpportunitySummary(),
    getForecastProjections(),
    getTopOpportunities({ limit: 5, sort: 'stall_risk', order: 'DESC' }),
    getVisitorStats(),
    getHighIntentVisitors(45, 5),
    getUpcomingAppointments(7),
  ]);

  const vs = visitorStats as any;

  return {
    generatedAt: new Date(),
    period,
    revenue,
    leads: leadStats,
    pipeline,
    opportunities: oppSummary,
    forecast,
    atRisk: (atRiskResult.rows || [])
      .filter((r: any) => r.stall_risk && r.stall_risk !== 'none')
      .map((r: any) => ({
        leadName: r.lead?.name || 'Unknown',
        company: r.lead?.company || '',
        score: r.score,
        stall_risk: r.stall_risk,
        stall_reason: r.stall_reason,
        days_since_last_activity: r.days_since_last_activity,
      })),
    visitors: {
      total_visitors: vs.total_visitors || 0,
      total_sessions: vs.total_sessions || 0,
      avg_session_duration: vs.avg_session_duration || 0,
      bounce_rate: vs.bounce_rate || 0,
    },
    highIntentCount: highIntent.length,
    appointments: (appointments as any[]).map((a: any) => ({
      title: a.title,
      scheduled_at: a.scheduled_at,
      lead_name: a.lead?.name || 'Unknown',
      type: a.type || 'strategy_call',
    })),
  };
}
