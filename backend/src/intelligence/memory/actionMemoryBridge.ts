/**
 * Action Memory Bridge — queries BposStepExecution for step-level success patterns.
 * Deterministic (no LLM) — pure SQL aggregation over historical execution data.
 * Used to inform priority adjustments in the execution engine.
 */

export interface ActionSuccessPattern {
  step_key: string;
  success_rate: number;          // 0-1
  avg_quality_delta: number;     // average quality improvement
  avg_readiness_delta: number;   // average readiness improvement
  avg_coverage_delta: number;    // average coverage improvement
  sample_count: number;
  last_success: string | null;
}

/**
 * Get success patterns for execution steps.
 * Requires at least `minSamples` completed executions to return a pattern.
 */
export async function getActionSuccessPatterns(
  processId?: string,
  minSamples: number = 5
): Promise<ActionSuccessPattern[]> {
  try {
    const { sequelize } = await import('../../config/database');

    const whereClause = processId
      ? `WHERE status = 'completed' AND process_id = '${processId}'`
      : `WHERE status = 'completed'`;

    const [results]: any[] = await sequelize.query(`
      SELECT
        step_key,
        COUNT(*) as sample_count,
        COUNT(*) FILTER (WHERE
          (metrics_after->>'qualityScore')::float >= (metrics_before->>'qualityScore')::float
        ) as successes,
        AVG(
          COALESCE((metrics_after->>'qualityScore')::float, 0) -
          COALESCE((metrics_before->>'qualityScore')::float, 0)
        ) as avg_quality_delta,
        AVG(
          COALESCE((metrics_after->>'readiness')::float, 0) -
          COALESCE((metrics_before->>'readiness')::float, 0)
        ) as avg_readiness_delta,
        AVG(
          COALESCE((metrics_after->>'reqCoverage')::float, 0) -
          COALESCE((metrics_before->>'reqCoverage')::float, 0)
        ) as avg_coverage_delta,
        MAX(completed_at) as last_success
      FROM bpos_step_executions
      ${whereClause}
      GROUP BY step_key
      HAVING COUNT(*) >= ${minSamples}
      ORDER BY COUNT(*) DESC
    `);

    return results.map((r: any) => ({
      step_key: r.step_key,
      success_rate: r.sample_count > 0 ? parseInt(r.successes) / parseInt(r.sample_count) : 0,
      avg_quality_delta: parseFloat(r.avg_quality_delta) || 0,
      avg_readiness_delta: parseFloat(r.avg_readiness_delta) || 0,
      avg_coverage_delta: parseFloat(r.avg_coverage_delta) || 0,
      sample_count: parseInt(r.sample_count),
      last_success: r.last_success,
    }));
  } catch {
    return []; // non-critical — return empty if table doesn't exist yet
  }
}

/**
 * Get recommended priority adjustments based on historical patterns.
 * Returns a map of step_key -> priority bonus (bounded to +/-10).
 */
export function getPatternBasedAdjustments(
  patterns: ActionSuccessPattern[]
): Record<string, number> {
  const adjustments: Record<string, number> = {};
  for (const p of patterns) {
    if (p.sample_count < 5) continue;
    // High success rate + positive quality delta → small boost
    if (p.success_rate >= 0.7 && p.avg_quality_delta > 0) {
      adjustments[p.step_key] = Math.min(10, Math.round(p.avg_quality_delta * 2));
    }
    // Low success rate → add risk note (negative adjustment)
    if (p.success_rate < 0.3) {
      adjustments[p.step_key] = Math.max(-10, Math.round((p.success_rate - 0.5) * 20));
    }
  }
  return adjustments;
}
