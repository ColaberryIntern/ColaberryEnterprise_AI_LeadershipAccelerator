/**
 * Post-Execution Recommendation Service
 *
 * Generates prioritized, actionable recommendations from runtime
 * execution analytics. Read-only — never mutates curriculum.
 */

import { getVariableFailureRates, getPromptStabilityReport } from './postExecutionAnalyticsService';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────

export interface Recommendation {
  type: 'variable_fix' | 'prompt_improvement' | 'sequence_issue' | 'latency_alert';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  entity_id?: string;
  evidence: Record<string, any>;
}

// ─── Severity Ordering ──────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

// ─── Main Recommendation Engine ─────────────────────────────────────

export async function getRecommendations(): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // 1. Variable failure recommendations
  try {
    const varFailures = await getVariableFailureRates();
    for (const v of varFailures) {
      if (v.failure_rate < 20) continue;

      const severity: 'low' | 'medium' | 'high' =
        v.failure_rate > 50 ? 'high' : v.failure_rate > 30 ? 'medium' : 'low';

      recommendations.push({
        type: 'variable_fix',
        severity,
        title: `Variable {{${v.variable_key}}} missing in ${v.failure_rate}% of executions`,
        description: `The variable "${v.variable_key}" was expected but not available in ${v.times_missing} executions. Ensure it is defined and populated before sections that consume it.`,
        evidence: {
          variable_key: v.variable_key,
          times_missing: v.times_missing,
          failure_rate: v.failure_rate,
        },
      });
    }
  } catch { /* non-critical */ }

  // 2. Prompt stability recommendations
  try {
    const promptReport = await getPromptStabilityReport();
    for (const p of promptReport) {
      if (!p.is_unstable) continue;

      const severity: 'low' | 'medium' | 'high' =
        p.failure_rate > 50 ? 'high' :
        (p.avg_quality_score !== null && p.avg_quality_score < 50) ? 'high' : 'medium';

      const issues: string[] = [];
      if (p.failure_rate > 30) issues.push(`${p.failure_rate}% failure rate`);
      if (p.avg_quality_score !== null && p.avg_quality_score < 60) issues.push(`avg quality ${p.avg_quality_score}/100`);

      recommendations.push({
        type: 'prompt_improvement',
        severity,
        title: `Lesson "${p.lesson_title}" is unstable (${issues.join(', ')})`,
        description: `This lesson has ${p.total_executions} executions with issues: ${issues.join(' and ')}. Review the prompt template for clarity, variable dependencies, and output structure expectations.`,
        entity_id: p.lesson_id,
        evidence: {
          lesson_id: p.lesson_id,
          lesson_title: p.lesson_title,
          total_executions: p.total_executions,
          failure_rate: p.failure_rate,
          avg_quality_score: p.avg_quality_score,
        },
      });
    }
  } catch { /* non-critical */ }

  // 3. Latency alert
  try {
    const latencyRows = await sequelize.query<{ avg_latency: string }>(
      `SELECT ROUND(AVG(latency_ms)::numeric, 0) as avg_latency
       FROM section_execution_logs
       WHERE created_at > NOW() - INTERVAL '7 days'`,
      { type: QueryTypes.SELECT },
    );
    const avgLatency = Number(latencyRows[0]?.avg_latency || 0);
    if (avgLatency > 30000) {
      recommendations.push({
        type: 'latency_alert',
        severity: avgLatency > 60000 ? 'high' : 'medium',
        title: `Average execution latency is ${Math.round(avgLatency / 1000)}s (7-day avg)`,
        description: `Content generation is taking longer than expected. Consider prompt optimization, reducing token limits, or reviewing model configuration.`,
        evidence: { avg_latency_ms: avgLatency },
      });
    }
  } catch { /* non-critical */ }

  // Sort by severity (high first), cap at 20
  recommendations.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2));
  return recommendations.slice(0, 20);
}
