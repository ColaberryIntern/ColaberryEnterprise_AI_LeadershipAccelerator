import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import AiSystemEvent from '../models/AiSystemEvent';
import { logAiEvent } from './aiEventService';

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

// ── 1. Sequence Progression Gaps ────────────────────────────────────────────
// Detects leads that completed a step but have no next step scheduled.
// This means scheduleNextStep() silently failed after send.
async function checkSequenceProgression(checks: HealthCheck[]): Promise<void> {
  try {
    const [rows] = await sequelize.query(`
      SELECT se.id, se.lead_id, se.campaign_id, se.sequence_id, se.step_index, se.sent_at
      FROM scheduled_emails se
      WHERE se.status = 'sent'
        AND se.sent_at < NOW() - INTERVAL '4 hours'
        AND se.sent_at > NOW() - INTERVAL '7 days'
        AND se.sequence_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_emails se2
          WHERE se2.lead_id = se.lead_id
            AND se2.sequence_id = se.sequence_id
            AND se2.step_index = se.step_index + 1
            AND se2.status IN ('pending', 'processing', 'sent')
        )
        AND EXISTS (
          SELECT 1 FROM follow_up_sequences fs
          WHERE fs.id = se.sequence_id
            AND jsonb_array_length(fs.steps) > se.step_index + 1
        )
    `);

    const gaps = rows as any[];
    if (gaps.length > 0) {
      // Attempt auto-fix: schedule the missing next steps
      let fixed = 0;
      try {
        const { scheduleNextStep } = require('./sequenceService');
        const ScheduledEmail = require('../models').ScheduledEmail;
        for (const gap of gaps.slice(0, 50)) { // Cap at 50 to avoid overload
          const completedAction = await ScheduledEmail.findByPk(gap.id);
          if (completedAction) {
            const next = await scheduleNextStep(completedAction);
            if (next) fixed++;
          }
        }
      } catch (fixErr: any) {
        console.error(`[SystemHealth] Sequence gap auto-fix error: ${fixErr.message}`);
      }

      if (fixed > 0) {
        checks.push({
          name: 'sequence_progression',
          severity: 'warning',
          detail: `Found ${gaps.length} leads stuck after a step with no next step scheduled. Auto-recovered ${fixed} of them by re-running scheduleNextStep.`,
          metric: gaps.length,
          autoFixed: `Recovered ${fixed}/${gaps.length} stuck sequences`,
        });
      } else {
        checks.push({
          name: 'sequence_progression',
          severity: 'critical',
          detail: `${gaps.length} leads completed a campaign step but have no next step scheduled. The scheduleNextStep function may be failing silently. These leads are stalled and not receiving further campaign messages.`,
          metric: gaps.length,
        });
      }
    } else {
      checks.push({ name: 'sequence_progression', severity: 'ok', detail: 'All sequence progressions are healthy — no gaps detected.', metric: 0 });
    }
  } catch (err: any) {
    checks.push({ name: 'sequence_progression', severity: 'warning', detail: `Check failed: ${err.message}` });
  }
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
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
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
    checks.push({ name: 'memory_pressure', severity: 'critical', detail: `Heap usage at ${heapPercent}% (${heapUsedMB}/${heapTotalMB}MB). RSS: ${rssMB}MB. Out-of-memory crash risk.`, metric: heapPercent });
  } else if (heapPercent > 75) {
    checks.push({ name: 'memory_pressure', severity: 'warning', detail: `Heap usage at ${heapPercent}% (${heapUsedMB}/${heapTotalMB}MB). RSS: ${rssMB}MB.`, metric: heapPercent });
  } else {
    checks.push({ name: 'memory_pressure', severity: 'ok', detail: `Heap: ${heapPercent}% (${heapUsedMB}MB). RSS: ${rssMB}MB.`, metric: heapPercent });
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
      WHERE updated_at >= NOW() - INTERVAL '2 hours'
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

  // Synthflow API check
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
      // Any response (even 4xx) means the API is reachable
      checks.push({ name: 'synthflow_api', severity: 'ok', detail: `Synthflow API reachable (HTTP ${resp.status}).`, metric: resp.status });
    } catch (err: any) {
      checks.push({
        name: 'synthflow_api',
        severity: 'warning',
        detail: `Synthflow API unreachable: ${err.message}. Voice calls and Cory alerts will fail.`,
      });
    }
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

// ── 8. Campaign-Specific Checks (moved from inline health monitor) ──────────
async function checkCampaignHealth(checks: HealthCheck[]): Promise<void> {
  try {
    // Stuck-in-processing actions
    const [stuckRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'`
    );
    const stuckCount = parseInt((stuckRows as any)[0]?.cnt || '0', 10);
    if (stuckCount > 0) {
      checks.push({ name: 'stuck_actions', severity: 'warning', detail: `${stuckCount} actions stuck in processing for over 10 minutes. The stale recovery job should clean these up.`, metric: stuckCount });
    }

    // Cold Outbound draft check
    const [coldRows] = await sequelize.query(
      `SELECT status FROM campaigns WHERE name LIKE '%Cold Outbound%' LIMIT 1`
    );
    if ((coldRows as any)[0]?.status === 'draft') {
      // Auto-fix
      await sequelize.query(`UPDATE campaigns SET status = 'active' WHERE name LIKE '%Cold Outbound%' AND status = 'draft'`);
      checks.push({
        name: 'cold_outbound_status',
        severity: 'warning',
        detail: 'Cold Outbound campaign had reverted to draft status.',
        autoFixed: 'Auto-reactivated Cold Outbound to active.',
      });
    }

    // No sends gap
    const [sendRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '1 hour'`
    );
    const recentSends = parseInt((sendRows as any)[0]?.cnt || '0', 10);
    const [pendingRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'pending' AND scheduled_for <= NOW()`
    );
    const pastDuePending = parseInt((pendingRows as any)[0]?.cnt || '0', 10);

    if (recentSends === 0 && pastDuePending > 0) {
      checks.push({
        name: 'send_throughput',
        severity: 'critical',
        detail: `No sends in the last hour, but ${pastDuePending} actions are past due and waiting. The scheduler may be stalled or all actions are failing.`,
        metric: pastDuePending,
      });
    }

    // Failure spike
    const [failRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '1 hour'`
    );
    const recentFails = parseInt((failRows as any)[0]?.cnt || '0', 10);
    if (recentFails > 5) {
      checks.push({
        name: 'action_failures',
        severity: 'warning',
        detail: `${recentFails} campaign actions failed in the last hour. Check email provider status and content generation logs.`,
        metric: recentFails,
      });
    }
  } catch (err: any) {
    checks.push({ name: 'campaign_health', severity: 'warning', detail: `Check failed: ${err.message}` });
  }
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
