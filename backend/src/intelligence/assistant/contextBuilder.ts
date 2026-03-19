// ─── Context Builder ──────────────────────────────────────────────────────
// Combines SQL + ML + vector results into formatted context for narrative.
// Extracts structured insights using rule-based analysis.

import { Intent } from './intentClassifier';
import { SqlResult } from './sqlExecutor';
import { MlResult } from './mlExecutor';
import { VectorResult } from './vectorExecutor';

export interface Insight {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric?: string;
  value?: number;
}

export interface PipelineContext {
  formattedContext: string;
  insights: Insight[];
  recommendations: string[];
  ruleNarrative: string; // fallback narrative if LLM unavailable
  tokenEstimate: number;
  sources: string[];
}

// ─── Semantic Formatters ─────────────────────────────────────────────────────

function formatValue(key: string, value: any): string {
  if (value == null) return 'N/A';
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const k = key.toLowerCase();
  if (k.includes('rate') || k.includes('pct') || k.includes('percent')) return `${num.toFixed(1)}%`;
  if (k.includes('revenue') || k.includes('amount') || k.includes('cost') || k.includes('price')) return `$${num.toLocaleString()}`;
  if (k.includes('duration') || k.includes('time_ms') || k.includes('avg_time')) return `${num.toFixed(0)}ms`;
  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toFixed(2);
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

export function buildContext(
  intent: Intent,
  sqlResults: SqlResult[],
  mlResults: MlResult[],
  vectorResults: VectorResult[],
  question: string,
  entityType?: string
): PipelineContext {
  const sections: string[] = [];
  const allSources = new Set<string>();
  const insights: Insight[] = [];
  const recommendations: string[] = [];
  const narrativeParts: string[] = [];

  // ── SQL Results — totals first for LLM accuracy ──
  // Phase 1: Output totals/counts queries first (single-row aggregates)
  sections.push('=== VERIFIED TOTALS (use these exact numbers) ===');
  for (const sr of sqlResults) {
    sr.tables.forEach((t) => allSources.add(t));
    if (sr.rows.length === 0) continue;
    const isTotals = sr.description.includes('totals') || sr.description.includes('entity counts');
    if (!isTotals || sr.rows.length !== 1) continue;
    sections.push(`[${sr.description}]`);
    const row = sr.rows[0];
    for (const [key, val] of Object.entries(row)) {
      sections.push(`  ${key}: ${formatValue(key, val)}`);
    }
    sections.push('');
  }
  sections.push('=== END VERIFIED TOTALS ===');
  sections.push('');

  // Phase 2: Output detail/breakdown queries
  for (const sr of sqlResults) {
    if (sr.rows.length === 0) continue;
    // Skip totals already output above
    const isTotals = sr.description.includes('totals') || sr.description.includes('entity counts');
    if (isTotals && sr.rows.length === 1) continue;

    sections.push(`[SQL] ${sr.description}:`);
    const keys = Object.keys(sr.rows[0]);
    // Format as compact table (top 10 rows)
    const displayRows = sr.rows.slice(0, 10);
    sections.push(keys.join(' | '));
    for (const row of displayRows) {
      sections.push(keys.map((k) => formatValue(k, row[k])).join(' | '));
    }
    if (sr.rows.length > 10) sections.push(`... and ${sr.rows.length - 10} more rows`);
    sections.push('');
  }

  // ── ML Results ──
  for (const mr of mlResults) {
    if (mr.status !== 'success' || mr.data.length === 0) continue;
    allSources.add(`ml:${mr.task}`);
    sections.push(`[ML:${mr.task}] ${mr.data.length} results:`);
    const sample = mr.data.slice(0, 5);
    for (const item of sample) {
      const summary = Object.entries(item).map(([k, v]) => `${k}=${formatValue(k, v)}`).join(', ');
      sections.push(`  ${summary}`);
    }
    sections.push('');
  }

  // ── Vector Results ──
  for (const vr of vectorResults) {
    if (vr.status !== 'success' || vr.data.length === 0) continue;
    allSources.add(`vector:${vr.task}`);
    sections.push(`[Vector:${vr.task}] ${vr.data.length} matches:`);
    const sample = vr.data.slice(0, 5);
    for (const item of sample) {
      const label = item.name || item.label || item.entity || JSON.stringify(item).slice(0, 100);
      const score = item.similarity || item.score;
      sections.push(`  ${label}${score != null ? ` (score: ${Number(score).toFixed(3)})` : ''}`);
    }
    sections.push('');
  }

  // ── Extract Insights (rule-based, carried over from insightEngine.ts) ──
  extractInsights(intent, sqlResults, mlResults, insights, narrativeParts, recommendations, entityType);

  // ── Build Context String ──
  let formattedContext = sections.join('\n');

  // Token estimation and truncation
  const tokenEstimate = Math.ceil(formattedContext.length / 4);
  if (tokenEstimate > 8000) {
    // Truncate by priority: keep SQL, trim ML, drop vector
    const sqlSection = sections.filter((s) => s.startsWith('[SQL]') || !s.startsWith('[')).join('\n');
    formattedContext = sqlSection.slice(0, 32000); // ~8000 tokens
  }

  const ruleNarrative = narrativeParts.join(' ') || 'Analysis complete. See data below for details.';

  return {
    formattedContext,
    insights,
    recommendations,
    ruleNarrative,
    tokenEstimate: Math.ceil(formattedContext.length / 4),
    sources: [...allSources],
  };
}

// ─── Rule-Based Insight Extraction (from insightEngine.ts) ──────────────────

function extractInsights(
  intent: Intent,
  sqlResults: SqlResult[],
  mlResults: MlResult[],
  insights: Insight[],
  narrative: string[],
  recommendations: string[],
  entityType?: string
): void {
  const analyzer = INSIGHT_ANALYZERS[intent];
  if (analyzer) {
    analyzer(sqlResults, mlResults, insights, narrative, recommendations, entityType);
  }

  // ML-specific insights
  for (const mr of mlResults) {
    if (mr.status !== 'success' || mr.data.length === 0) continue;
    if (mr.task === 'anomaly_detector') {
      const anomalies = mr.data.filter((d) => d.is_anomaly || d.anomaly_score > 0.7);
      if (anomalies.length > 0) {
        insights.push({
          type: 'ML Anomalies Detected',
          severity: anomalies.length > 5 ? 'critical' : 'warning',
          message: `ML anomaly detector found ${anomalies.length} anomalous data points.`,
          value: anomalies.length,
        });
      }
    }
    if (mr.task === 'risk_scorer') {
      const highRisk = mr.data.filter((d) => (d.risk_score || d.score || 0) > 80);
      if (highRisk.length > 0) {
        insights.push({
          type: 'High Risk Entities',
          severity: 'critical',
          message: `${highRisk.length} entities scored above 80 on risk assessment.`,
          value: highRisk.length,
        });
        recommendations.push('Review high-risk entities immediately — scores above 80 require attention.');
      }
    }
  }
}

type InsightExtractor = (
  sql: SqlResult[], ml: MlResult[], insights: Insight[], narrative: string[], recs: string[], entityType?: string
) => void;

const INSIGHT_ANALYZERS: Record<string, InsightExtractor> = {
  campaign_analysis: extractCampaignInsights,
  lead_analysis: extractLeadInsights,
  student_analysis: extractStudentInsights,
  agent_analysis: extractAgentInsights,
  anomaly_detection: extractAnomalyInsights,
  forecast_request: extractForecastInsights,
  general_insight: extractGeneralInsights,
};

function extractCampaignInsights(sql: SqlResult[], _ml: MlResult[], insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, description } of sql) {
    // Use the dedicated totals query (description: 'Campaign totals by status')
    if (description.includes('totals') && rows.length > 0) {
      const r = rows[0];
      const total = Number(r.total_campaigns || 0);
      const active = Number(r.active_campaigns || 0);
      const paused = Number(r.paused_campaigns || 0);
      const completed = Number(r.completed_campaigns || 0);
      narrative.push(`${total} campaigns total (${active} active, ${paused} paused, ${completed} completed).`);
      if (paused > 5) {
        insights.push({ type: 'Paused Campaigns', severity: 'warning', message: `${paused} campaigns are paused.`, value: paused });
        recs.push('Review paused campaigns to reactivate or archive.');
      }
    }
    if (description.includes('errors') && rows.length > 0) {
      const totalErrors = rows.reduce((s, r) => s + Number(r.error_count || 0), 0);
      narrative.push(`${totalErrors} campaign errors in the last 7 days.`);
      if (totalErrors > 10) {
        insights.push({
          type: 'High Error Volume',
          severity: totalErrors > 50 ? 'critical' : 'warning',
          message: `${totalErrors} errors across ${rows.length} components.`,
          value: totalErrors,
        });
        recs.push(`Investigate top error component: "${rows[0]?.component}" (${rows[0]?.error_count} occurrences).`);
      }
    }
  }
}

function extractLeadInsights(sql: SqlResult[], _ml: MlResult[], insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, description } of sql) {
    // Use the dedicated totals query (description: 'Lead totals by temperature')
    if (description.includes('totals') && rows.length > 0) {
      const r = rows[0];
      const total = Number(r.total_leads || 0);
      const hot = Number(r.hot_leads || 0);
      const warm = Number(r.warm_leads || 0);
      const cold = Number(r.cold_leads || 0);
      narrative.push(`${total} leads total (${hot} hot, ${warm} warm, ${cold} cold).`);
      if (hot > 0) {
        insights.push({ type: 'Hot Leads', severity: 'info', message: `${hot} hot leads ready for outreach.`, value: hot });
        recs.push(`Prioritize ${hot} hot leads for immediate follow-up.`);
      }
    }
    if (description.includes('distribution') && rows.length > 0) {
      const total = rows.reduce((s, r) => s + Number(r.count || 0), 0);

      // Bottleneck detection
      const stageMap: Record<string, number> = {};
      for (const r of rows) stageMap[r.stage] = (stageMap[r.stage] || 0) + Number(r.count || 0);
      const sorted = Object.entries(stageMap).sort((a, b) => b[1] - a[1]);
      if (sorted.length >= 2 && sorted[0][1] > total * 0.5) {
        insights.push({
          type: 'Pipeline Bottleneck',
          severity: 'warning',
          message: `${Math.round((sorted[0][1] / total) * 100)}% of leads stuck in "${sorted[0][0]}".`,
          value: sorted[0][1],
        });
        recs.push(`Review "${sorted[0][0]}" stage — over half of leads concentrated here.`);
      }
    }
    if (description.includes('activity trend') && rows.length > 1) {
      const recent = rows.slice(-3);
      const older = rows.slice(0, 3);
      const recentAvg = recent.reduce((s, r) => s + Number(r.activity_count || 0), 0) / Math.max(recent.length, 1);
      const olderAvg = older.reduce((s, r) => s + Number(r.activity_count || 0), 0) / Math.max(older.length, 1);
      const delta = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
      if (Math.abs(delta) > 15) {
        insights.push({
          type: delta > 0 ? 'Activity Increasing' : 'Activity Declining',
          severity: delta < -30 ? 'warning' : 'info',
          message: `Lead activity ${delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(delta))}%.`,
        });
      }
      narrative.push(`Lead activity ${delta > 0 ? 'trending up' : delta < -15 ? 'trending down' : 'stable'}.`);
    }
  }
}

function extractStudentInsights(sql: SqlResult[], _ml: MlResult[], insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, tables } of sql) {
    if (tables.includes('enrollments') && rows.length > 0) {
      const total = rows.reduce((s, r) => s + Number(r.count || 0), 0);
      const activeCount = Number(rows.find((r) => r.status?.toLowerCase() === 'active')?.count || 0);
      narrative.push(`${total} enrollments (${activeCount} active).`);
      const inactive = total - activeCount;
      if (inactive > 0 && inactive / total > 0.3) {
        insights.push({
          type: 'High Inactive Rate',
          severity: inactive / total > 0.5 ? 'critical' : 'warning',
          message: `${Math.round((inactive / total) * 100)}% of enrollments inactive.`,
          value: inactive,
        });
        recs.push('Review inactive enrollments — consider re-engagement.');
      }
    }
  }
}

function extractAgentInsights(sql: SqlResult[], _ml: MlResult[], insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, tables, description } of sql) {
    // Use the dedicated totals query — frame as business automation capacity
    if (tables.includes('ai_agents') && description?.includes('totals') && rows.length > 0) {
      const r = rows[0];
      const total = Number(r.total_agents || 0);
      const active = Number(r.active_agents || 0);
      const withErrors = Number(r.agents_with_errors || 0);
      narrative.push(`${total} automation processes running the business (${active} actively executing, ${withErrors} need attention).`);
      if (withErrors > 0) {
        insights.push({
          type: 'Automation Issues',
          severity: withErrors > 5 ? 'critical' : 'warning',
          message: `${withErrors} automated business processes have errors — may impact outreach, monitoring, or reporting.`,
          value: withErrors,
        });
        recs.push(`Review ${withErrors} automation processes with errors to prevent business disruption.`);
      }
    }
    // Detail rows — flag high-error processes in business terms
    if (tables.includes('ai_agents') && description?.includes('error counts') && rows.length > 0) {
      for (const agent of rows) {
        if (Number(agent.error_count) > 5) {
          insights.push({
            type: 'Process Reliability',
            severity: Number(agent.error_count) > 20 ? 'critical' : 'warning',
            message: `Automation "${agent.agent_name}" has ${agent.error_count} errors — may be degrading business operations.`,
            value: Number(agent.error_count),
          });
        }
      }
    }
    if (description?.includes('execution summary') && rows.length > 0) {
      const totalExecs = rows.reduce((s, r) => s + Number(r.executions || 0), 0);
      const errorExecs = rows.filter((r) => r.result?.toLowerCase() === 'failed').reduce((s, r) => s + Number(r.executions || 0), 0);
      const errorRate = totalExecs > 0 ? (errorExecs / totalExecs) * 100 : 0;
      narrative.push(`${totalExecs} automated tasks completed in the last 24 hours (${errorRate.toFixed(1)}% failure rate).`);
      if (errorRate > 10) {
        insights.push({
          type: 'Automation Reliability',
          severity: errorRate > 25 ? 'critical' : 'warning',
          message: `${errorRate.toFixed(1)}% of automated tasks failed — business processes may be delayed.`,
          value: Math.round(errorRate),
        });
        recs.push('Investigate automation failures to restore full business operations.');
      }
    }
  }
}

function extractAnomalyInsights(sql: SqlResult[], _ml: MlResult[], insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, description } of sql) {
    if (description.includes('error frequency') && rows.length > 0) {
      const counts = rows.map((r) => Number(r.error_count || 0));
      const avg = counts.reduce((a, b) => a + b, 0) / Math.max(counts.length, 1);
      const spikes = rows.filter((r) => Number(r.error_count || 0) > avg * 2);
      if (spikes.length > 0) {
        insights.push({ type: 'Error Spike', severity: 'critical', message: `${spikes.length} periods with errors > 2x average.`, value: spikes.length });
        narrative.push(`${spikes.length} error spikes in last 48 hours.`);
        recs.push('Investigate error spikes — check deployments and external deps.');
      } else {
        narrative.push('No significant error spikes in last 48 hours.');
      }
    }
    if (description.includes('error rates') && rows.length > 0) {
      const highError = rows.filter((r) => Number(r.error_rate_pct || 0) > 20);
      for (const agent of highError) {
        insights.push({
          type: `${agent.agent_name} High Error Rate`,
          severity: Number(agent.error_rate_pct) > 50 ? 'critical' : 'warning',
          message: `${agent.error_rate_pct}% error rate (${agent.errors}/${agent.total}).`,
          value: Number(agent.error_rate_pct),
        });
      }
      if (highError.length > 0) {
        narrative.push(`${highError.length} agents with >20% error rate.`);
        recs.push('Prioritize agents with highest error rates.');
      }
    }
  }
}

function extractForecastInsights(sql: SqlResult[], _ml: MlResult[], insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, description } of sql) {
    if (rows.length < 3) continue;
    const valueKey = Object.keys(rows[0]).find((k) => k !== 'week' && k !== 'day') || 'count';
    const values = rows.map((r) => Number(r[valueKey] || 0));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Linear regression
    const n = values.length;
    const xMean = (n - 1) / 2;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - avg);
      den += (i - xMean) * (i - xMean);
    }
    const slope = den !== 0 ? num / den : 0;
    const forecast4w = Math.max(0, Math.round(avg + slope * 4));
    const trendDir = slope > 0.5 ? 'up' : slope < -0.5 ? 'down' : 'stable';
    const label = description.replace(/\(.*\)/, '').trim();

    narrative.push(`${label}: avg ${Math.round(avg)}/week, forecast ${forecast4w}/week in 4 weeks (${trendDir}).`);
    insights.push({
      type: `${label} Forecast`,
      severity: trendDir === 'down' ? 'warning' : 'info',
      message: `Projected ${forecast4w}/week in 4 weeks (currently ${Math.round(avg)}/week).`,
      value: forecast4w,
    });
    if (trendDir === 'down') recs.push(`${label} declining — investigate causes.`);
    else if (trendDir === 'up') recs.push(`${label} growing — ensure capacity.`);
  }
}

function extractGeneralInsights(sql: SqlResult[], _ml: MlResult[], _insights: Insight[], narrative: string[], recs: string[]): void {
  for (const { rows, description } of sql) {
    if (rows.length > 0 && description.includes('entity counts') && rows[0]) {
      const r = rows[0];
      narrative.push(`Business overview: ${r.total_leads || 0} leads in pipeline, ${r.total_campaigns || 0} campaigns running, ${r.total_enrollments || 0} program enrollments, ${r.total_agents || 0} automation processes.`);
    }
    if (rows.length > 0 && description.includes('Email outreach totals') && rows[0]) {
      const r = rows[0];
      const sent7d = Number(r.emails_sent_7d) || 0;
      const sentToday = Number(r.emails_sent_today) || 0;
      const pending = Number(r.emails_pending) || 0;
      narrative.push(`Email outreach: ${sent7d} emails sent this week, ${sentToday} today, ${pending} pending delivery.`);
    }
  }
  if (recs.length === 0) recs.push('Ask about revenue, enrollments, lead pipeline, campaign performance, or student outcomes for deeper analysis.');
}
