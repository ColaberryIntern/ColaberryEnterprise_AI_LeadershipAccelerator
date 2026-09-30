/**
 * Dashboard Threshold Watcher — BC #10099862873 (P1, item 4).
 *
 * "Periodically evaluate the data already shown on the existing dashboards
 * and alert on breach — converts pull-dashboards into push-alerts without
 * rebuilding their logic." Reuses the cronHealthAlertService.ts shape (pure
 * evaluator + thin DB-touching orchestrator + emitAlert()).
 *
 * Scope note (logged assumption): of the dashboards named in the ticket —
 * health, trust center, war room, ingest logs — this only wires Trust Center
 * and Ingest Logs.
 *   - Health is already push-alerted today by the pre-existing
 *     SystemHealthMonitor cron (schedulerService.ts) via direct Synthflow/
 *     email calls; re-checking the same underlying data here would double-
 *     alert on the same signal, not add coverage.
 *   - War Room (launchSafety.ts::getWarRoomStatus) is a manual mode toggle,
 *     not a metric with a breach threshold — nothing to evaluate.
 * Trust Center and Ingest Logs are the two dashboards that are genuinely
 * pull-only today with no push-alert path.
 */
import { getTrustOverview } from './trustMetricsService';
import { ingestStatusCounts, ingestStatusCountsBySource } from './ingestStatsService';
import { emitAlert } from './alertService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThresholdAlert {
  type: 'warning' | 'critical';
  severity: number;
  title: string;
  description: string;
  impactArea: string;
  metadata: Record<string, any>;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────
// Ingest error-rate mirrors cronHealthAlertService.ts's convention (same
// starting defaults Ali delegated to Kes's discretion on the decision ticket).

const INGEST_MIN_SAMPLE_SIZE = 5;
const INGEST_ERROR_RATE_WARNING_PERCENT = 50;
const INGEST_ERROR_RATE_CRITICAL_PERCENT = 80;
const INGEST_WINDOW_HOURS = 2; // matches systemHealthService.ts's email-failure-rate window

// ─── Pure Evaluators ────────────────────────────────────────────────────────

export interface DimensionScoreLike {
  key: string;
  label: string;
  score: number;
  state: string;
  evidence?: string;
}

export function evaluateTrustCenterHealth(overview: {
  compositeTrustScore: number;
  band: 'red' | 'amber' | 'green';
  dimensions?: DimensionScoreLike[];
}): ThresholdAlert[] {
  if (overview.band === 'green') return [];

  // Lowest-scoring dimension is included so the alert names *what* regressed,
  // not just that the composite dropped — the composite alone doesn't say
  // which of the underlying governance/safety signals to go fix.
  const dimensions = overview.dimensions || [];
  const worst = dimensions.length > 0
    ? [...dimensions].sort((a, b) => a.score - b.score)[0]
    : null;

  return [{
    type: overview.band === 'red' ? 'critical' : 'warning',
    severity: overview.band === 'red' ? 5 : 3,
    title: 'Trust Center Score Degraded',
    description:
      `Trust Center composite score is ${overview.compositeTrustScore}/100 (${overview.band.toUpperCase()} band). ` +
      'The platform-readiness dashboard (governance/safety signals) has dropped out of the healthy range.' +
      (worst ? ` Weakest dimension: "${worst.label}" at ${worst.score}/100${worst.evidence ? ` (${worst.evidence})` : ''}.` : ''),
    impactArea: 'trust_center',
    metadata: {
      composite_score: overview.compositeTrustScore,
      band: overview.band,
      worst_dimension: worst ? { key: worst.key, label: worst.label, score: worst.score, evidence: worst.evidence ?? null } : null,
    },
  }];
}

export interface SourceStatusCounts {
  source_slug: string;
  accepted: number;
  rejected: number;
  error: number;
  pending: number;
}

/** Picks the source with the most failed (rejected+error) payloads, if any failed. */
function worstSource(bySource: SourceStatusCounts[]): SourceStatusCounts | null {
  const failing = bySource.filter((s) => s.rejected + s.error > 0);
  if (failing.length === 0) return null;
  return [...failing].sort((a, b) => (b.rejected + b.error) - (a.rejected + a.error))[0];
}

export function evaluateIngestHealth(counts: Record<string, number>, bySource: SourceStatusCounts[] = []): ThresholdAlert[] {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total < INGEST_MIN_SAMPLE_SIZE) return [];

  const failed = (counts.rejected || 0) + (counts.error || 0);
  const errorRate = Math.round((failed / total) * 100);
  const worst = worstSource(bySource);
  const worstSourceSuffix = worst
    ? ` Worst offender: "${worst.source_slug}" (${worst.rejected + worst.error}/${worst.accepted + worst.rejected + worst.error + worst.pending} failed).`
    : '';
  const worstSourceMetadata = worst
    ? { source_slug: worst.source_slug, rejected: worst.rejected, error: worst.error, total: worst.accepted + worst.rejected + worst.error + worst.pending }
    : null;

  if (errorRate >= INGEST_ERROR_RATE_CRITICAL_PERCENT) {
    return [{
      type: 'critical',
      severity: 5,
      title: 'Lead Ingest Error Spike',
      description:
        `${failed}/${total} (${errorRate}%) of leads ingested in the last ${INGEST_WINDOW_HOURS}h were rejected or errored. ` +
        'A source integration is likely broken and inbound leads are being silently dropped.' + worstSourceSuffix,
      impactArea: 'lead_ingest',
      metadata: { error_rate: errorRate, failed, total, window_hours: INGEST_WINDOW_HOURS, worst_source: worstSourceMetadata },
    }];
  }
  if (errorRate >= INGEST_ERROR_RATE_WARNING_PERCENT) {
    return [{
      type: 'warning',
      severity: 3,
      title: 'Lead Ingest Error Spike',
      description:
        `${failed}/${total} (${errorRate}%) of leads ingested in the last ${INGEST_WINDOW_HOURS}h were rejected or errored — ` +
        `above the ${INGEST_ERROR_RATE_WARNING_PERCENT}% noise threshold.` + worstSourceSuffix,
      impactArea: 'lead_ingest',
      metadata: { error_rate: errorRate, failed, total, window_hours: INGEST_WINDOW_HOURS, worst_source: worstSourceMetadata },
    }];
  }
  return [];
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Evaluate every wired dashboard and emit alerts for any in breach. One
 * dashboard's evaluation failure must not block the others.
 */
export async function checkDashboardThresholds(): Promise<void> {
  const checks: Array<() => Promise<ThresholdAlert[]>> = [
    async () => evaluateTrustCenterHealth(await getTrustOverview()),
    async () => {
      const [counts, bySource] = await Promise.all([
        ingestStatusCounts(INGEST_WINDOW_HOURS),
        ingestStatusCountsBySource(INGEST_WINDOW_HOURS),
      ]);
      return evaluateIngestHealth(counts, bySource);
    },
  ];

  for (const check of checks) {
    try {
      const alerts = await check();
      for (const alert of alerts) {
        await emitAlert({
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          sourceType: 'system',
          impactArea: alert.impactArea,
          urgency: alert.type === 'critical' ? 'immediate' : 'medium',
          metadata: alert.metadata,
        });
      }
    } catch (err: any) {
      console.error('[DashboardThresholdWatcher] A dashboard check failed:', err.message);
    }
  }
}
