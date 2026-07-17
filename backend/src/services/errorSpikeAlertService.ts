/**
 * Error Spike Alerting — BC #10099862873 (P1, item 2).
 *
 * The other half of "error-classification consistency pass on highest-risk
 * services... feeding spikes into the shared alert service": auth
 * middleware and the apollo/ghl/basecamp/synthflow external API wrappers
 * now emit a classified `ai_events` row (via emitAiEvent) on every failure.
 * This periodic evaluator turns those rows into alerts, reusing the
 * cronHealthAlertService.ts shape (pure evaluator + thin orchestrator +
 * emitAlert()).
 *
 * Scoped to an explicit allowlist of the event_types this P1 pass actually
 * instrumented — ai_events also carries routine LLM-call telemetry with
 * expected occasional failures that isn't meant to page anyone.
 */
import { Op, fn, col } from 'sequelize';
import AiEvent from '../models/AiEvent';
import { emitAlert } from './alertService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ErrorSpikeAlert {
  type: 'warning' | 'critical';
  severity: number;
  title: string;
  description: string;
  impactArea: string;
  metadata: Record<string, any>;
}

// ─── Watched event types ────────────────────────────────────────────────────

const WATCHED_EVENT_TYPES: Record<string, string> = {
  admin_auth_failed: 'auth',
  sales_or_admin_auth_failed: 'auth',
  cory_auth_failed: 'auth',
  participant_auth_failed: 'auth',
  alumni_auth_failed: 'auth',
  apollo_request_failed: 'external_api_apollo',
  ghl_request_failed: 'external_api_ghl',
  basecamp_request_failed: 'external_api_basecamp',
  synthflow_call_failed: 'external_api_synthflow',
};

// ─── Thresholds ─────────────────────────────────────────────────────────────
// Mirrors cronHealthAlertService.ts's convention (same starting defaults
// Ali delegated to Kes's discretion on the decision ticket).

const MIN_SAMPLE_SIZE = 5;
const WARNING_PERCENT = 50;
const CRITICAL_PERCENT = 80;
const WINDOW_HOURS = 1;

// ─── Pure Evaluator ─────────────────────────────────────────────────────────

export interface SampleFailure {
  message: string | null;
  ip: string | null;
  occurredAt: Date;
}

export function evaluateErrorSpike(
  eventType: string,
  total: number,
  failed: number,
  sample: SampleFailure | null = null,
): ErrorSpikeAlert[] {
  if (total < MIN_SAMPLE_SIZE) return [];

  const errorRate = Math.round((failed / total) * 100);
  if (errorRate < WARNING_PERCENT) return [];

  const impactArea = WATCHED_EVENT_TYPES[eventType] || 'unknown';
  const isCritical = errorRate >= CRITICAL_PERCENT;

  return [{
    type: isCritical ? 'critical' : 'warning',
    severity: isCritical ? 5 : 3,
    title: `Error Spike: ${eventType}`,
    description:
      `${failed}/${total} (${errorRate}%) of "${eventType}" events failed in the last ${WINDOW_HOURS}h. ` +
      (impactArea === 'auth'
        ? 'A spike in authentication failures may indicate a broken client, an expired shared secret, or a credential-stuffing attempt.'
        : `The ${impactArea.replace('external_api_', '')} integration may be down or misconfigured.`) +
      (sample?.message ? ` Most recent failure: ${sample.message}` : ''),
    impactArea,
    metadata: {
      event_type: eventType, error_rate: errorRate, failed, total, window_hours: WINDOW_HOURS,
      sample_failure: sample ? { message: sample.message, ip: sample.ip, occurred_at: sample.occurredAt.toISOString() } : null,
    },
  }];
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export async function checkErrorClassSpikes(): Promise<void> {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

  const rows = await AiEvent.findAll({
    attributes: ['event_type', 'outcome', [fn('COUNT', col('id')), 'count']],
    where: {
      event_type: { [Op.in]: Object.keys(WATCHED_EVENT_TYPES) },
      created_at: { [Op.gte]: since },
    },
    group: ['event_type', 'outcome'],
    raw: true,
  }) as unknown as Array<{ event_type: string; outcome: string; count: string }>;

  const byEventType = new Map<string, { total: number; failed: number }>();
  for (const row of rows) {
    const entry = byEventType.get(row.event_type) || { total: 0, failed: 0 };
    const count = Number(row.count);
    entry.total += count;
    if (row.outcome === 'failure') entry.failed += count;
    byEventType.set(row.event_type, entry);
  }

  for (const [eventType, { total, failed }] of byEventType) {
    try {
      // Cheap pre-check (same threshold logic evaluateErrorSpike applies)
      // before spending a second query fetching the sample failure row.
      const errorRate = total > 0 ? Math.round((failed / total) * 100) : 0;
      let sample: SampleFailure | null = null;
      if (total >= MIN_SAMPLE_SIZE && errorRate >= WARNING_PERCENT) {
        const latest = await AiEvent.findOne({
          where: { event_type: eventType, outcome: 'failure', created_at: { [Op.gte]: since } },
          order: [['created_at', 'DESC']],
        });
        if (latest) {
          const meta = (latest as any).metadata || {};
          sample = { message: meta.message ?? null, ip: meta.ip ?? null, occurredAt: (latest as any).created_at };
        }
      }

      const alerts = evaluateErrorSpike(eventType, total, failed, sample);
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
      console.error(`[ErrorSpikeAlert] Failed evaluating ${eventType}:`, err.message);
    }
  }
}
