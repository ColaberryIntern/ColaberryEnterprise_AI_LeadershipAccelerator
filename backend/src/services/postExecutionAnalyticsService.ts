/**
 * Post-Execution Analytics Service
 *
 * SQL-based aggregation engine for runtime execution data.
 * All queries use sequelize.query() with QueryTypes.SELECT for efficiency.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────

export interface SectionPerformanceMetrics {
  lesson_id: string;
  total_executions: number;
  success_count: number;
  partial_count: number;
  failed_count: number;
  success_rate: number;
  avg_quality_score: number | null;
  avg_coherence_score: number | null;
  avg_goal_alignment_score: number | null;
  avg_latency_ms: number;
}

export interface VariableFailureReport {
  variable_key: string;
  times_missing: number;
  failure_rate: number;
}

export interface PromptStabilityReport {
  lesson_id: string;
  lesson_title: string;
  total_executions: number;
  failure_rate: number;
  avg_quality_score: number | null;
  is_unstable: boolean;
}

export interface HealthTrendPoint {
  date: string;
  total_executions: number;
  success_rate: number;
  avg_quality: number | null;
  failure_count: number;
}

export interface RuntimeDashboard {
  overall: {
    total_executions: number;
    success_rate: number;
    avg_quality: number | null;
    avg_latency_ms: number;
    failed_count: number;
    failure_rate: number;
  };
  variable_failures: VariableFailureReport[];
  unstable_prompts: PromptStabilityReport[];
  trend: HealthTrendPoint[];
}

// ─── Section Performance ────────────────────────────────────────────

export async function getSectionPerformance(lessonId: string): Promise<SectionPerformanceMetrics> {
  const rows = await sequelize.query<{
    total: string;
    success_count: string;
    partial_count: string;
    failed_count: string;
    avg_quality: string | null;
    avg_coherence: string | null;
    avg_goal: string | null;
    avg_latency: string;
  }>(
    `SELECT
      COUNT(*)::int as total,
      SUM(CASE WHEN execution_status = 'success' THEN 1 ELSE 0 END)::int as success_count,
      SUM(CASE WHEN execution_status = 'partial' THEN 1 ELSE 0 END)::int as partial_count,
      SUM(CASE WHEN execution_status = 'failed' THEN 1 ELSE 0 END)::int as failed_count,
      ROUND(AVG(quality_score)::numeric, 1) as avg_quality,
      ROUND(AVG(coherence_score)::numeric, 1) as avg_coherence,
      ROUND(AVG(goal_alignment_score)::numeric, 1) as avg_goal,
      ROUND(AVG(latency_ms)::numeric, 0) as avg_latency
    FROM section_execution_logs
    WHERE lesson_id = :lessonId`,
    { replacements: { lessonId }, type: QueryTypes.SELECT },
  );

  const row = rows[0] || { total: '0', success_count: '0', partial_count: '0', failed_count: '0', avg_quality: null, avg_coherence: null, avg_goal: null, avg_latency: '0' };
  const total = Number(row.total);

  return {
    lesson_id: lessonId,
    total_executions: total,
    success_count: Number(row.success_count),
    partial_count: Number(row.partial_count),
    failed_count: Number(row.failed_count),
    success_rate: total > 0 ? Math.round((Number(row.success_count) / total) * 100) : 0,
    avg_quality_score: row.avg_quality ? Number(row.avg_quality) : null,
    avg_coherence_score: row.avg_coherence ? Number(row.avg_coherence) : null,
    avg_goal_alignment_score: row.avg_goal ? Number(row.avg_goal) : null,
    avg_latency_ms: Number(row.avg_latency) || 0,
  };
}

// ─── Variable Failure Rates ─────────────────────────────────────────

export async function getVariableFailureRates(): Promise<VariableFailureReport[]> {
  const totalRows = await sequelize.query<{ total: string }>(
    `SELECT COUNT(*)::int as total FROM section_execution_logs`,
    { type: QueryTypes.SELECT },
  );
  const totalExecutions = Number(totalRows[0]?.total || 0);
  if (totalExecutions === 0) return [];

  const rows = await sequelize.query<{ variable_key: string; times_missing: string }>(
    `SELECT
      var_key as variable_key,
      COUNT(*)::int as times_missing
    FROM section_execution_logs,
      jsonb_array_elements_text(variables_missing_runtime) as var_key
    GROUP BY var_key
    ORDER BY times_missing DESC
    LIMIT 20`,
    { type: QueryTypes.SELECT },
  );

  return rows.map(r => ({
    variable_key: r.variable_key,
    times_missing: Number(r.times_missing),
    failure_rate: Math.round((Number(r.times_missing) / totalExecutions) * 100),
  }));
}

// ─── Prompt Stability ───────────────────────────────────────────────

export async function getPromptStabilityReport(): Promise<PromptStabilityReport[]> {
  const rows = await sequelize.query<{
    lesson_id: string;
    lesson_title: string;
    total: string;
    failed_count: string;
    avg_quality: string | null;
  }>(
    `SELECT
      sel.lesson_id,
      COALESCE(cl.title, 'Unknown') as lesson_title,
      COUNT(*)::int as total,
      SUM(CASE WHEN sel.execution_status = 'failed' THEN 1 ELSE 0 END)::int as failed_count,
      ROUND(AVG(sel.quality_score)::numeric, 1) as avg_quality
    FROM section_execution_logs sel
    LEFT JOIN curriculum_lessons cl ON cl.id = sel.lesson_id
    GROUP BY sel.lesson_id, cl.title
    HAVING COUNT(*) >= 2
    ORDER BY SUM(CASE WHEN sel.execution_status = 'failed' THEN 1 ELSE 0 END)::float / COUNT(*) DESC
    LIMIT 20`,
    { type: QueryTypes.SELECT },
  );

  return rows.map(r => {
    const total = Number(r.total);
    const failedCount = Number(r.failed_count);
    const failureRate = total > 0 ? Math.round((failedCount / total) * 100) : 0;
    const avgQuality = r.avg_quality ? Number(r.avg_quality) : null;

    return {
      lesson_id: r.lesson_id,
      lesson_title: r.lesson_title,
      total_executions: total,
      failure_rate: failureRate,
      avg_quality_score: avgQuality,
      is_unstable: failureRate > 30 || (avgQuality !== null && avgQuality < 60),
    };
  });
}

// ─── Health Trend ───────────────────────────────────────────────────

export async function getProgramHealthTrend(days: number = 30): Promise<HealthTrendPoint[]> {
  const rows = await sequelize.query<{
    date: string;
    total: string;
    success_count: string;
    failed_count: string;
    avg_quality: string | null;
  }>(
    `SELECT
      DATE(created_at) as date,
      COUNT(*)::int as total,
      SUM(CASE WHEN execution_status = 'success' THEN 1 ELSE 0 END)::int as success_count,
      SUM(CASE WHEN execution_status = 'failed' THEN 1 ELSE 0 END)::int as failed_count,
      ROUND(AVG(quality_score)::numeric, 1) as avg_quality
    FROM section_execution_logs
    WHERE created_at > NOW() - INTERVAL '1 day' * :days
    GROUP BY DATE(created_at)
    ORDER BY date ASC`,
    { replacements: { days }, type: QueryTypes.SELECT },
  );

  return rows.map(r => {
    const total = Number(r.total);
    return {
      date: r.date,
      total_executions: total,
      success_rate: total > 0 ? Math.round((Number(r.success_count) / total) * 100) : 0,
      avg_quality: r.avg_quality ? Number(r.avg_quality) : null,
      failure_count: Number(r.failed_count),
    };
  });
}

// ─── Dashboard Aggregation ──────────────────────────────────────────

export async function getDashboardMetrics(): Promise<RuntimeDashboard> {
  // Overall stats
  const overallRows = await sequelize.query<{
    total: string;
    success_count: string;
    failed_count: string;
    avg_quality: string | null;
    avg_latency: string;
  }>(
    `SELECT
      COUNT(*)::int as total,
      SUM(CASE WHEN execution_status = 'success' THEN 1 ELSE 0 END)::int as success_count,
      SUM(CASE WHEN execution_status = 'failed' THEN 1 ELSE 0 END)::int as failed_count,
      ROUND(AVG(quality_score)::numeric, 1) as avg_quality,
      ROUND(AVG(latency_ms)::numeric, 0) as avg_latency
    FROM section_execution_logs`,
    { type: QueryTypes.SELECT },
  );

  const o = overallRows[0] || { total: '0', success_count: '0', failed_count: '0', avg_quality: null, avg_latency: '0' };
  const total = Number(o.total);
  const failedCount = Number(o.failed_count);

  // Parallel fetch remaining data
  const [variableFailures, unstablePrompts, trend] = await Promise.all([
    getVariableFailureRates(),
    getPromptStabilityReport(),
    getProgramHealthTrend(),
  ]);

  return {
    overall: {
      total_executions: total,
      success_rate: total > 0 ? Math.round((Number(o.success_count) / total) * 100) : 0,
      avg_quality: o.avg_quality ? Number(o.avg_quality) : null,
      avg_latency_ms: Number(o.avg_latency) || 0,
      failed_count: failedCount,
      failure_rate: total > 0 ? Math.round((failedCount / total) * 100) : 0,
    },
    variable_failures: variableFailures,
    unstable_prompts: unstablePrompts.filter(p => p.is_unstable),
    trend,
  };
}
