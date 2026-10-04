import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import AiSystemEvent from '../models/AiSystemEvent';
import { logAiEvent } from './aiEventService';
import { checkSequenceProgression } from './health/sequenceProgressionCheck';
import { checkCampaignHealth } from './health/campaignHealthCheck';
import { checkGrowthJourney } from './health/growthJourneyCheck';

// ─── Original content-generation health metrics (used by aiOpsRoutes, systemAutoResponseService) ───

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
    fallback_rate: Number((hourMetrics?.failure_rate || 0).toFixed(4)),
    total_requests_last_hour: hourMetrics?.total || 0,
  };

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

  if (recentFailureRate > 0.10 && recentTotal >= 3) {
    logAiEvent('SystemHealth', 'HIGH_FAILURE_RATE', 'system', undefined, {
      failure_rate: Number(recentFailureRate.toFixed(4)),
      window_minutes: 15,
      total_requests: recentTotal,
    }).catch(() => {});
  }

  let health_status: 'healthy' | 'warning' | 'critical';
  if (metrics.failure_rate >= 0.10) {
    health_status = 'critical';
  } else if (metrics.failure_rate >= 0.05) {
    health_status = 'warning';
  } else {
    health_status = 'healthy';
  }

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

// ─── Comprehensive System Health Checks ─────────────────────────────────────

export type HealthSeverity = 'ok' | 'warning' | 'critical';

export interface HealthCheck {
  name: string;
  severity: HealthSeverity;
  detail: string;
  metric?: number;
  autoFixed?: string;
}

export interface SystemHealthReport {
  timestamp: string;
  overall_status: HealthSeverity;
  checks: HealthCheck[];
  duration_ms: number;
}


// ── 2. Scheduler Liveness ───────────────────────────────────────────────────
// Uses a heartbeat timestamp written by processScheduledActions every 5 min.
async function checkSchedulerLiveness(checks: HealthCheck[]): Promise<void> {
  try {
    const { getSetting } = require('./settingsService');
    const heartbeat = await getSetting('scheduler_heartbeat');

    if (!heartbeat) {
      checks.push({ name: 'scheduler_liveness', severity: 'warning', detail: 'No scheduler heartbeat found. The scheduler may not have run yet since last restart.' });
      return;
    }

    const lastBeat = new Date(heartbeat).getTime();
    const ageMinutes = (Date.now() - lastBeat) / 60000;

    if (ageMinutes > 25) {
      checks.push({
        name: 'scheduler_liveness',
        severity: 'critical',
        detail: `Scheduler heartbeat is ${Math.round(ageMinutes)} minutes old. The scheduler cron job may have stopped firing. No campaign actions are being processed.`,
        metric: Math.round(ageMinutes),
      });
    } else if (ageMinutes > 12) {
      checks.push({
        name: 'scheduler_liveness',
        severity: 'warning',
        detail: `Scheduler heartbeat is ${Math.round(ageMinutes)} minutes old (expected <10). May have missed a cycle.`,
        metric: Math.round(ageMinutes),
      });
    } else {
      checks.push({ name: 'scheduler_liveness', severity: 'ok', detail: `Scheduler last ran ${Math.round(ageMinutes)} minutes ago.`, metric: Math.round(ageMinutes) });
    }
  } catch (err: any) {
    checks.push({ name: 'scheduler_liveness', severity: 'warning', detail: `Check failed: ${err.message}` });
  }
}

// ── 3. Database Health ──────────────────────────────────────────────────────
async function checkDatabaseHealth(checks: HealthCheck[]): Promise<void> {
  try {
    // Connection test with 3s timeout
    const start = Date.now();
    await Promise.race([
      sequelize.query('SELECT 1', { type: QueryTypes.SELECT }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), 3000)),
    ]);
    const latencyMs = Date.now() - start;

    if (latencyMs > 2000) {
      checks.push({ name: 'database_connectivity', severity: 'warning', detail: `Database responding but slow (${latencyMs}ms).`, metric: latencyMs });
    } else {
      checks.push({ name: 'database_connectivity', severity: 'ok', detail: `Database responding (${latencyMs}ms).`, metric: latencyMs });
    }

    // Active connections
    const [connRows] = await sequelize.query(
      `SELECT count(*) as active FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'`
    );
    const activeConns = parseInt((connRows as any)[0]?.active || '0', 10);
    if (activeConns > 80) {
      checks.push({ name: 'database_connections', severity: 'critical', detail: `${activeConns} active database connections — pool may be exhausted.`, metric: activeConns });
    } else if (activeConns > 40) {
      checks.push({ name: 'database_connections', severity: 'warning', detail: `${activeConns} active database connections — higher than normal.`, metric: activeConns });
    } else {
      checks.push({ name: 'database_connections', severity: 'ok', detail: `${activeConns} active database connections.`, metric: activeConns });
    }

    // Long-running queries
    const [longRows] = await sequelize.query(
      `SELECT count(*) as cnt FROM pg_stat_activity WHERE state = 'active' AND query_start < NOW() - INTERVAL '30 seconds' AND query NOT LIKE '%pg_stat_activity%'`
    );
    const longQueries = parseInt((longRows as any)[0]?.cnt || '0', 10);
    if (longQueries > 3) {
      checks.push({ name: 'database_long_queries', severity: 'warning', detail: `${longQueries} queries running longer than 30 seconds.`, metric: longQueries });
    }
  } catch (err: any) {
    checks.push({ name: 'database_connectivity', severity: 'critical', detail: `Database connection failed: ${err.message}` });
  }
}

// ── 4. Process Health ───────────────────────────────────────────────────────
async function checkProcessHealth(checks: HealthCheck[]): Promise<void> {
  const uptimeSeconds = process.uptime();
  const mem = process.memoryUsage();
  const v8 = require('v8');
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
  const heapPercent = Math.round((heapUsedMB / heapLimitMB) * 100);
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  // Recent restart detection
  if (uptimeSeconds < 300) {
    checks.push({
      name: 'process_uptime',
      severity: 'warning',
      detail: `Backend restarted ${Math.round(uptimeSeconds)} seconds ago. This may indicate a crash or deployment. Cold Outbound may have reverted to draft (auto-reactivation should handle this).`,
      metric: Math.round(uptimeSeconds),
    });
  } else {
    const uptimeHours = Math.round(uptimeSeconds / 3600);
    checks.push({ name: 'process_uptime', severity: 'ok', detail: `Backend uptime: ${uptimeHours}h.`, metric: uptimeSeconds });
  }

  // Memory pressure
  if (heapPercent > 90) {
    checks.push({ name: 'memory_pressure', severity: 'critical', detail: `Heap usage at ${heapPercent}% (${heapUsedMB}/${heapLimitMB}MB). RSS: ${rssMB}MB. Out-of-memory crash risk.`, metric: heapPercent });
  } else if (heapPercent > 75) {
    checks.push({ name: 'memory_pressure', severity: 'warning', detail: `Heap usage at ${heapPercent}% (${heapUsedMB}/${heapLimitMB}MB). RSS: ${rssMB}MB.`, metric: heapPercent });
  } else {
    checks.push({ name: 'memory_pressure', severity: 'ok', detail: `Heap: ${heapPercent}% (${heapUsedMB}/${heapLimitMB}MB). RSS: ${rssMB}MB.`, metric: heapPercent });
  }
}

// ── 5. Email Delivery Monitoring ────────────────────────────────────────────
async function checkEmailDelivery(checks: HealthCheck[]): Promise<void> {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent' AND channel = 'email') as email_sent,
        COUNT(*) FILTER (WHERE status = 'failed' AND channel = 'email') as email_failed
      FROM scheduled_emails
      WHERE created_at >= NOW() - INTERVAL '2 hours'
    `);
    const r = (rows as any)[0] || {};
    const sent = parseInt(r.email_sent || '0', 10);
    const failed = parseInt(r.email_failed || '0', 10);
    const total = sent + failed;

    if (total === 0) {
      checks.push({ name: 'email_delivery', severity: 'ok', detail: 'No email activity in the last 2 hours.', metric: 0 });
      return;
    }

    const failRate = failed / total;
    if (failRate > 0.20 && total >= 5) {
      checks.push({
        name: 'email_delivery',
        severity: 'critical',
        detail: `Email failure rate is ${Math.round(failRate * 100)}% (${failed}/${total} in last 2h). Mandrill may be blocking sends or the sender domain may be flagged.`,
        metric: Math.round(failRate * 100),
      });
    } else if (failRate > 0.10 && total >= 5) {
      checks.push({ name: 'email_delivery', severity: 'warning', detail: `Email failure rate is ${Math.round(failRate * 100)}% (${failed}/${total} in last 2h).`, metric: Math.round(failRate * 100) });
    } else {
      checks.push({ name: 'email_delivery', severity: 'ok', detail: `${sent} emails sent, ${failed} failed in last 2h (${Math.round(failRate * 100)}% failure rate).`, metric: Math.round(failRate * 100) });
    }
  } catch (err: any) {
    checks.push({ name: 'email_delivery', severity: 'warning', detail: `Check failed: ${err.message}` });
  }
}

// ── 6. External API Availability ────────────────────────────────────────────
async function checkExternalAPIs(checks: HealthCheck[]): Promise<void> {
  const { env } = require('../config/env');

  // Synthflow API check — reachability + auth + recent call success rate
  if (env.synthflowApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch('https://api.synthflow.ai/v2/calls', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${env.synthflowApiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.status === 401) {
        // 401 = genuine auth failure
        checks.push({
          name: 'synthflow_api',
          severity: 'critical',
          detail: `Synthflow API auth failed (HTTP 401). API key may be revoked. ALL voice calls will fail.`,
          metric: resp.status,
        });
      } else if (resp.status === 403) {
        // 403 can mean auth failure OR missing model_id — check response body
        const body = await resp.text().catch(() => '');
        const isModelIdError = body.includes('model_id');
        if (isModelIdError) {
          // API key works, just missing model_id in the test request — this is OK
          checks.push({ name: 'synthflow_api', severity: 'ok', detail: 'Synthflow API authenticated successfully.', metric: 200 });
        } else {
          checks.push({
            name: 'synthflow_api',
            severity: 'critical',
            detail: `Synthflow API auth failed (HTTP 403). Account may be suspended or payment failed. ALL voice calls will fail.`,
            metric: resp.status,
          });
        }
      } else {
        checks.push({ name: 'synthflow_api', severity: 'ok', detail: `Synthflow API reachable (HTTP ${resp.status}).`, metric: resp.status });
      }
    } catch (err: any) {
      // API completely unreachable — critical because Cory can't call Ali
      checks.push({
        name: 'synthflow_api',
        severity: 'critical',
        detail: `Synthflow API unreachable: ${err.message}. ALL voice calls including Cory alerts will fail.`,
      });
    }

    // Check recent call success rate (last 2 hours)
    try {
      const { sequelize: db } = require('../config/database');
      const { QueryTypes: QT } = require('sequelize');
      const [callStats] = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE provider_response->>'end_call_reason' = 'voicemail' OR status = 'failed') as failed_or_vm,
          COUNT(*) FILTER (WHERE provider_response->>'call_duration' IS NOT NULL AND CAST(provider_response->>'call_duration' AS int) > 30) as connected
        FROM communication_logs
        WHERE channel = 'voice' AND direction = 'outbound'
        AND created_at > NOW() - interval '2 hours'
      `, { type: QT.SELECT });

      const total = parseInt(callStats?.total || '0', 10);
      const connected = parseInt(callStats?.connected || '0', 10);
      const failedOrVm = parseInt(callStats?.failed_or_vm || '0', 10);

      // Check for actual failures (not voicemail) separately
      const [failOnlyStats] = await db.query(`
        SELECT COUNT(*) as actual_failures
        FROM communication_logs
        WHERE channel = 'voice' AND direction = 'outbound'
        AND created_at > NOW() - interval '2 hours'
        AND status = 'failed'
        AND (provider_response->>'end_call_reason' IS NULL OR provider_response->>'end_call_reason' != 'voicemail')
      `, { type: QT.SELECT });
      const actualFailures = parseInt((failOnlyStats as any)?.actual_failures || '0', 10);

      if (total >= 5 && connected === 0 && actualFailures > 0) {
        // Real failures (not just voicemail) — warn
        checks.push({
          name: 'synthflow_call_success',
          severity: 'warning',
          detail: `0/${total} voice calls connected in last 2h (${actualFailures} actual failures, ${failedOrVm - actualFailures} voicemail). Phone system may have issues.`,
          metric: 0,
        });
      } else if (total >= 5 && connected === 0) {
        // All voicemail, no real failures — this is normal, not a system issue
        checks.push({
          name: 'synthflow_call_success',
          severity: 'ok',
          detail: `0/${total} calls connected in last 2h — all went to voicemail (no system failures).`,
          metric: 0,
        });
      } else if (total > 0) {
        checks.push({
          name: 'synthflow_call_success',
          severity: 'ok',
          detail: `${connected}/${total} calls connected in last 2h.`,
          metric: connected,
        });
      }
    } catch { /* non-critical */ }
  }

  // Mandrill SMTP check (via test connection)
  try {
    const nodemailer = require('nodemailer');
    const transporter = env.mandrillApiKey
      ? nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587, secure: false, auth: { user: 'apikey', pass: env.mandrillApiKey } })
      : null;
    if (transporter) {
      await Promise.race([
        transporter.verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP verify timeout')), 5000)),
      ]);
      checks.push({ name: 'mandrill_smtp', severity: 'ok', detail: 'Mandrill SMTP connection verified.' });
    }
  } catch (err: any) {
    checks.push({
      name: 'mandrill_smtp',
      severity: 'critical',
      detail: `Mandrill SMTP connection failed: ${err.message}. All outbound emails will fail.`,
    });
  }
}

// ── 7. Frontend / Nginx Availability ────────────────────────────────────────
async function checkFrontendAvailability(checks: HealthCheck[]): Promise<void> {
  const urls = ['http://accelerator-nginx:80/', 'http://localhost:80/'];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        checks.push({ name: 'frontend_nginx', severity: 'ok', detail: `Frontend reachable at ${url} (HTTP ${resp.status}).` });
        return;
      }
    } catch {
      // Try next URL
    }
  }
  checks.push({
    name: 'frontend_nginx',
    severity: 'warning',
    detail: 'Frontend/nginx container is unreachable from backend. Users may not be able to access the website.',
  });
}


// ─── Aggregated Full System Health Check ────────────────────────────────────

export async function runFullSystemHealthCheck(): Promise<SystemHealthReport> {
  const start = Date.now();
  const checks: HealthCheck[] = [];

  // Run all checks (independent, can run in parallel)
  await Promise.allSettled([
    checkSequenceProgression(checks),
    checkSchedulerLiveness(checks),
    checkDatabaseHealth(checks),
    checkProcessHealth(checks),
    checkEmailDelivery(checks),
    checkExternalAPIs(checks),
    checkFrontendAvailability(checks),
    checkCampaignHealth(checks),
    checkGrowthJourney(checks),
  ]);

  const hasCritical = checks.some(c => c.severity === 'critical');
  const hasWarning = checks.some(c => c.severity === 'warning');

  return {
    timestamp: new Date().toISOString(),
    overall_status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok',
    checks,
    duration_ms: Date.now() - start,
  };
}

// Helper: format report for voice/email
export function formatHealthReportText(report: SystemHealthReport): string {
  const issues = report.checks.filter(c => c.severity !== 'ok');
  const autoFixed = issues.filter(c => c.autoFixed);
  const unresolved = issues.filter(c => !c.autoFixed);

  const lines: string[] = [];
  if (unresolved.length > 0) {
    lines.push('ISSUES REQUIRING ATTENTION:');
    unresolved.forEach((c, i) => lines.push(`${i + 1}. [${c.severity.toUpperCase()}] ${c.name}: ${c.detail}`));
  }
  if (autoFixed.length > 0) {
    lines.push('');
    lines.push('AUTO-FIXED:');
    autoFixed.forEach((c, i) => lines.push(`${i + 1}. ${c.name}: ${c.autoFixed}`));
  }

  const ok = report.checks.filter(c => c.severity === 'ok');
  lines.push('');
  lines.push(`HEALTHY SYSTEMS (${ok.length}/${report.checks.length}): ${ok.map(c => c.name).join(', ')}`);
  lines.push(`Check duration: ${report.duration_ms}ms`);

  return lines.join('\n');
}
