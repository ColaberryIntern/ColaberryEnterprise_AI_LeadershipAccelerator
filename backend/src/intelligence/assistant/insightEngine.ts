// ─── Insight Engine ────────────────────────────────────────────────────────
// Transforms raw SQL results into actionable insights.
// Deterministic rules — no LLM generation.

import { Intent } from './intentClassifier';
import { BuiltQuery } from './queryBuilder';

export interface Insight {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  metric?: string;
  value?: number | string;
  trend?: 'up' | 'down' | 'stable';
}

export interface InsightResult {
  narrative: string;
  insights: Insight[];
  recommendations: string[];
}

/**
 * Analyze query results and produce deterministic insights.
 */
export function generateInsights(
  intent: Intent,
  queryResults: { query: BuiltQuery; rows: Record<string, any>[] }[],
  entityType?: string
): InsightResult {
  const analyzer = INSIGHT_ANALYZERS[intent];
  if (!analyzer) {
    return defaultInsight(queryResults);
  }
  return analyzer(queryResults, entityType);
}

type InsightAnalyzer = (
  results: { query: BuiltQuery; rows: Record<string, any>[] }[],
  entityType?: string
) => InsightResult;

const INSIGHT_ANALYZERS: Record<Intent, InsightAnalyzer> = {
  campaign_analysis: analyzeCampaigns,
  lead_analysis: analyzeLeads,
  student_analysis: analyzeStudents,
  agent_analysis: analyzeAgents,
  anomaly_detection: analyzeAnomalies,
  forecast_request: analyzeForecast,
  general_insight: analyzeGeneral,
};

// ─── Campaign Insights ───────────────────────────────────────────────────────

function analyzeCampaigns(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const insights: Insight[] = [];
  const parts: string[] = [];
  const recommendations: string[] = [];

  for (const { query, rows } of results) {
    if (query.tables.includes('campaigns') && rows.length > 0) {
      const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
      const statuses = rows.map((r) => `${r.status} (${r.count})`).join(', ');
      parts.push(`${total} campaigns: ${statuses}.`);

      const paused = rows.filter((r) => r.status?.toLowerCase() === 'paused');
      if (paused.length > 0) {
        const pausedCount = paused.reduce((s, r) => s + Number(r.count || 0), 0);
        insights.push({
          title: 'Paused Campaigns',
          description: `${pausedCount} campaigns are currently paused.`,
          severity: pausedCount > 5 ? 'warning' : 'info',
          value: pausedCount,
        });
        recommendations.push('Review paused campaigns to reactivate or archive stale ones.');
      }
    }

    if (query.tables.includes('campaign_errors') && rows.length > 0) {
      const totalErrors = rows.reduce((sum, r) => sum + Number(r.error_count || 0), 0);
      parts.push(`${totalErrors} campaign errors in the last 7 days.`);

      if (totalErrors > 10) {
        insights.push({
          title: 'High Campaign Error Volume',
          description: `${totalErrors} errors across ${rows.length} error types in the last 7 days.`,
          severity: totalErrors > 50 ? 'critical' : 'warning',
          value: totalErrors,
        });
        const topError = rows[0];
        recommendations.push(`Investigate top error type: "${topError.error_type}" (${topError.error_count} occurrences).`);
      }
    }
  }

  return {
    narrative: parts.join(' ') || 'No campaign data available.',
    insights,
    recommendations,
  };
}

// ─── Lead Insights ───────────────────────────────────────────────────────────

function analyzeLeads(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const insights: Insight[] = [];
  const parts: string[] = [];
  const recommendations: string[] = [];

  for (const { query, rows } of results) {
    if (query.description.includes('distribution') && rows.length > 0) {
      const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
      const stages = [...new Set(rows.map((r) => r.stage))];
      parts.push(`${total} leads across ${stages.length} pipeline stages.`);

      const hotLeads = rows.filter((r) => r.temperature?.toLowerCase() === 'hot');
      const hotCount = hotLeads.reduce((s, r) => s + Number(r.count || 0), 0);
      if (hotCount > 0) {
        insights.push({
          title: 'Hot Leads',
          description: `${hotCount} hot leads in pipeline ready for outreach.`,
          severity: 'info',
          value: hotCount,
          trend: 'up',
        });
        recommendations.push(`Prioritize the ${hotCount} hot leads for immediate follow-up.`);
      }

      // Check for pipeline bottleneck
      const stageMap: Record<string, number> = {};
      for (const r of rows) {
        stageMap[r.stage] = (stageMap[r.stage] || 0) + Number(r.count || 0);
      }
      const sortedStages = Object.entries(stageMap).sort((a, b) => b[1] - a[1]);
      if (sortedStages.length >= 2) {
        const [topStage, topCount] = sortedStages[0];
        if (topCount > total * 0.5) {
          insights.push({
            title: 'Pipeline Bottleneck',
            description: `${Math.round((topCount / total) * 100)}% of leads stuck in "${topStage}" stage.`,
            severity: 'warning',
            value: `${topStage}: ${topCount}`,
          });
          recommendations.push(`Review "${topStage}" stage — over half of leads are concentrated here.`);
        }
      }
    }

    if (query.description.includes('activity trend') && rows.length > 1) {
      const recent = rows.slice(-3);
      const older = rows.slice(0, 3);
      const recentAvg = recent.reduce((s, r) => s + Number(r.activity_count || 0), 0) / Math.max(recent.length, 1);
      const olderAvg = older.reduce((s, r) => s + Number(r.activity_count || 0), 0) / Math.max(older.length, 1);
      const delta = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

      if (Math.abs(delta) > 15) {
        insights.push({
          title: delta > 0 ? 'Activity Increasing' : 'Activity Declining',
          description: `Lead activity ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(delta))}% recently.`,
          severity: delta < -30 ? 'warning' : 'info',
          trend: delta > 0 ? 'up' : 'down',
        });
      }
      parts.push(`Lead activity ${delta > 0 ? 'trending up' : delta < -15 ? 'trending down' : 'stable'} over the last 14 days.`);
    }
  }

  return {
    narrative: parts.join(' ') || 'No lead data available.',
    insights,
    recommendations,
  };
}

// ─── Student Insights ────────────────────────────────────────────────────────

function analyzeStudents(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const insights: Insight[] = [];
  const parts: string[] = [];
  const recommendations: string[] = [];

  for (const { query, rows } of results) {
    if (query.tables.includes('enrollments') && rows.length > 0) {
      const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
      const active = rows.find((r) => r.status?.toLowerCase() === 'active');
      const activeCount = Number(active?.count || 0);
      parts.push(`${total} enrollments (${activeCount} active).`);

      const inactive = total - activeCount;
      if (inactive > 0 && inactive / total > 0.3) {
        insights.push({
          title: 'High Inactive Rate',
          description: `${Math.round((inactive / total) * 100)}% of enrollments are inactive.`,
          severity: inactive / total > 0.5 ? 'critical' : 'warning',
          value: inactive,
        });
        recommendations.push('Review inactive enrollments — consider re-engagement campaigns or cleanup.');
      }
    }

    if (query.description.includes('Attendance') && rows.length > 1) {
      const recentWeeks = rows.slice(-3);
      const avgAttendance = recentWeeks.reduce((s, r) => s + Number(r.attendance_count || 0), 0) / Math.max(recentWeeks.length, 1);
      parts.push(`Average ${Math.round(avgAttendance)} attendance records per week recently.`);

      if (avgAttendance < 10) {
        insights.push({
          title: 'Low Attendance',
          description: 'Attendance is below expected levels.',
          severity: 'warning',
          value: Math.round(avgAttendance),
          trend: 'down',
        });
        recommendations.push('Investigate low attendance — check for scheduling issues or student engagement.');
      }
    }
  }

  return {
    narrative: parts.join(' ') || 'No student data available.',
    insights,
    recommendations,
  };
}

// ─── Agent Insights ──────────────────────────────────────────────────────────

function analyzeAgents(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const insights: Insight[] = [];
  const parts: string[] = [];
  const recommendations: string[] = [];

  for (const { query, rows } of results) {
    if (query.tables.includes('ai_agents') && rows.length > 0) {
      const total = rows.length;
      const errored = rows.filter((r) => Number(r.error_count || 0) > 0);
      const running = rows.filter((r) => r.status?.toLowerCase() === 'running');
      parts.push(`${total} AI agents (${running.length} running, ${errored.length} with errors).`);

      for (const agent of errored) {
        if (Number(agent.error_count) > 5) {
          insights.push({
            title: `${agent.agent_name} Has Errors`,
            description: `${agent.agent_name}: ${agent.error_count} errors. Status: ${agent.status}.`,
            severity: Number(agent.error_count) > 20 ? 'critical' : 'warning',
            value: Number(agent.error_count),
          });
        }
      }

      if (errored.length > 0) {
        recommendations.push(`Review ${errored.length} agents with errors — prioritize highest error counts.`);
      }
    }

    if (query.description.includes('execution summary') && rows.length > 0) {
      const totalExecs = rows.reduce((s, r) => s + Number(r.executions || 0), 0);
      const errorRows = rows.filter((r) => r.status?.toLowerCase() === 'error');
      const errorExecs = errorRows.reduce((s, r) => s + Number(r.executions || 0), 0);
      const errorRate = totalExecs > 0 ? (errorExecs / totalExecs * 100) : 0;

      parts.push(`${totalExecs} agent executions in the last 24 hours (${errorRate.toFixed(1)}% error rate).`);

      if (errorRate > 10) {
        insights.push({
          title: 'High Agent Error Rate',
          description: `${errorRate.toFixed(1)}% of agent executions failed in the last 24 hours.`,
          severity: errorRate > 25 ? 'critical' : 'warning',
          value: `${errorRate.toFixed(1)}%`,
        });
        recommendations.push('Investigate agent failures — check orchestration logs for root cause.');
      }
    }
  }

  return {
    narrative: parts.join(' ') || 'No agent data available.',
    insights,
    recommendations,
  };
}

// ─── Anomaly Insights ────────────────────────────────────────────────────────

function analyzeAnomalies(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const insights: Insight[] = [];
  const parts: string[] = [];
  const recommendations: string[] = [];

  for (const { query, rows } of results) {
    if (query.description.includes('error frequency') && rows.length > 0) {
      // Detect spikes: if any hour has > 2x the average
      const counts = rows.map((r) => Number(r.error_count || 0));
      const avg = counts.reduce((a, b) => a + b, 0) / Math.max(counts.length, 1);
      const spikes = rows.filter((r) => Number(r.error_count || 0) > avg * 2);

      if (spikes.length > 0) {
        insights.push({
          title: 'Error Spike Detected',
          description: `${spikes.length} time periods with error counts > 2x average (avg: ${avg.toFixed(0)}).`,
          severity: 'critical',
          value: spikes.length,
        });
        parts.push(`Detected ${spikes.length} error spikes in the last 48 hours.`);
        recommendations.push('Investigate error spikes — check deployment logs and external dependencies.');
      } else {
        parts.push('No significant error spikes detected in the last 48 hours.');
      }
    }

    if (query.description.includes('Agent error rates') && rows.length > 0) {
      const highError = rows.filter((r) => Number(r.error_rate_pct || 0) > 20);
      for (const agent of highError) {
        insights.push({
          title: `${agent.agent_name} — High Error Rate`,
          description: `${agent.error_rate_pct}% error rate (${agent.errors}/${agent.total} executions).`,
          severity: Number(agent.error_rate_pct) > 50 ? 'critical' : 'warning',
          value: `${agent.error_rate_pct}%`,
        });
      }
      if (highError.length > 0) {
        parts.push(`${highError.length} agents with error rates above 20%.`);
        recommendations.push('Prioritize agents with highest error rates for debugging.');
      }
    }
  }

  return {
    narrative: parts.join(' ') || 'No anomalies detected in recent data.',
    insights,
    recommendations: recommendations.length > 0 ? recommendations : ['System appears to be operating normally.'],
  };
}

// ─── Forecast Insights ───────────────────────────────────────────────────────

function analyzeForecast(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const insights: Insight[] = [];
  const parts: string[] = [];
  const recommendations: string[] = [];

  for (const { query, rows } of results) {
    if (rows.length < 3) continue;

    const valueKey = Object.keys(rows[0]).find((k) => k !== 'week' && k !== 'day') || 'count';
    const values = rows.map((r) => Number(r[valueKey] || 0));
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;

    // Simple linear regression for trend
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = avg;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) * (i - xMean);
    }
    const slope = den !== 0 ? num / den : 0;
    const forecast4w = Math.max(0, Math.round(yMean + slope * 4));
    const trendDir = slope > 0.5 ? 'up' : slope < -0.5 ? 'down' : 'stable';

    const label = query.description.replace(/\(.*\)/, '').trim();
    parts.push(`${label}: avg ${Math.round(avg)}/week, forecast ${forecast4w}/week in 4 weeks (${trendDir}).`);

    insights.push({
      title: `${label} Forecast`,
      description: `Projected: ${forecast4w}/week in 4 weeks (currently ${Math.round(avg)}/week).`,
      severity: trendDir === 'down' ? 'warning' : 'info',
      value: forecast4w,
      trend: trendDir,
    });

    if (trendDir === 'down') {
      recommendations.push(`${label} is declining — investigate causes and consider intervention.`);
    } else if (trendDir === 'up') {
      recommendations.push(`${label} is growing — ensure capacity to handle increased volume.`);
    }
  }

  return {
    narrative: parts.join(' ') || 'Insufficient data for forecasting.',
    insights,
    recommendations,
  };
}

// ─── General/Default ─────────────────────────────────────────────────────────

function analyzeGeneral(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const parts: string[] = [];

  for (const { query, rows } of results) {
    if (rows.length > 0) {
      if (query.description.includes('entity counts') && rows[0]) {
        const r = rows[0];
        parts.push(`System overview: ${r.total_leads || 0} leads, ${r.total_campaigns || 0} campaigns, ${r.total_enrollments || 0} enrollments, ${r.total_agents || 0} agents.`);
      } else {
        parts.push(`${query.description}: ${rows.length} results.`);
      }
    }
  }

  return {
    narrative: parts.join(' ') || 'No data available.',
    insights: [],
    recommendations: ['Ask a specific question about campaigns, leads, students, or agents for deeper analysis.'],
  };
}

function defaultInsight(results: { query: BuiltQuery; rows: Record<string, any>[] }[]): InsightResult {
  const totalRows = results.reduce((s, r) => s + r.rows.length, 0);
  return {
    narrative: `Processed ${results.length} queries returning ${totalRows} total rows.`,
    insights: [],
    recommendations: [],
  };
}
