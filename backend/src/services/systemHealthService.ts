import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import AiSystemEvent from '../models/AiSystemEvent';
import { logAiEvent } from './aiEventService';

export interface SystemHealthMetrics {
  health_status: 'healthy' | 'warning' | 'critical';
  metrics: {
    avg_generation_time_ms: number;
    p95_generation_time_ms: number;
    failure_rate: number;
    retry_rate: number;
    cache_hit_rate: number;
    fallback_rate: number;
    total_requests_last_hour: number;
  };
  alerts: Array<{ id: string; event_type: string; details: any; created_at: string }>;
}

export async function getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
  // Query 1: 1-hour window metrics
  const [hourMetrics] = await sequelize.query(`
    SELECT
      COUNT(*)::int as total,
      COALESCE(AVG(duration_ms) FILTER (WHERE success = true AND cache_hit = false), 0)::float as avg_ms,
      COALESCE(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE success = true AND cache_hit = false),
        0
      )::float as p95_ms,
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE success = false)::float / COUNT(*)
        ELSE 0
      END as failure_rate,
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE retry_count > 0)::float / COUNT(*)
        ELSE 0
      END as retry_rate,
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE cache_hit = true)::float / COUNT(*)
        ELSE 0
      END as cache_hit_rate
    FROM content_generation_logs
    WHERE created_at >= NOW() - INTERVAL '1 hour'
  `, { type: QueryTypes.SELECT }) as any;

  const metrics = {
    avg_generation_time_ms: Math.round(hourMetrics?.avg_ms || 0),
    p95_generation_time_ms: Math.round(hourMetrics?.p95_ms || 0),
    failure_rate: Number((hourMetrics?.failure_rate || 0).toFixed(4)),
    retry_rate: Number((hourMetrics?.retry_rate || 0).toFixed(4)),
    cache_hit_rate: Number((hourMetrics?.cache_hit_rate || 0).toFixed(4)),
    fallback_rate: Number((hourMetrics?.failure_rate || 0).toFixed(4)), // failures = fallbacks
    total_requests_last_hour: hourMetrics?.total || 0,
  };

  // Query 2: 15-minute window for failure alert check
  const [recentMetrics] = await sequelize.query(`
    SELECT
      COUNT(*)::int as total,
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE success = false)::float / COUNT(*)
        ELSE 0
      END as failure_rate
    FROM content_generation_logs
    WHERE created_at >= NOW() - INTERVAL '15 minutes'
  `, { type: QueryTypes.SELECT }) as any;

  const recentFailureRate = recentMetrics?.failure_rate || 0;
  const recentTotal = recentMetrics?.total || 0;

  // Trigger alert if failure rate > 10% in last 15 minutes (only if meaningful sample)
  if (recentFailureRate > 0.10 && recentTotal >= 3) {
    logAiEvent('SystemHealth', 'HIGH_FAILURE_RATE', 'system', undefined, {
      failure_rate: Number(recentFailureRate.toFixed(4)),
      window_minutes: 15,
      total_requests: recentTotal,
    }).catch(() => {});
  }

  // Derive health status
  let health_status: 'healthy' | 'warning' | 'critical';
  if (metrics.failure_rate >= 0.10) {
    health_status = 'critical';
  } else if (metrics.failure_rate >= 0.05) {
    health_status = 'warning';
  } else {
    health_status = 'healthy';
  }

  // Recent alerts
  const alerts = await AiSystemEvent.findAll({
    where: {
      event_type: ['HIGH_FAILURE_RATE', 'SLOW_LLM_CALL_DETECTED', 'SAFE_MODE_ENABLED', 'SAFE_MODE_DISABLED'],
    },
    order: [['created_at', 'DESC']],
    limit: 10,
    attributes: ['id', 'event_type', 'details', 'created_at'],
  });

  return {
    health_status,
    metrics,
    alerts: alerts.map(a => ({
      id: a.id,
      event_type: a.event_type,
      details: a.details,
      created_at: (a as any).created_at?.toISOString?.() || String((a as any).created_at),
    })),
  };
}
