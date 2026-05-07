/**
 * incidentFanoutEngine — pluggable subscriber registry for cognitive
 * incident dispatch.
 *
 * Subscribers receive structured incident payloads + can choose to act
 * (post Slack message, send email, hit webhook, log). Each subscriber's
 * outcome is recorded for observability.
 *
 * Phase 9 §2, §3.
 */
import type { IncidentSubscriber, SubscriberDispatchOutcome, IncidentDispatchPayload } from './subscribers/types';

const subscribers = new Map<string, IncidentSubscriber>();

export function registerIncidentSubscriber(subscriber: IncidentSubscriber): () => void {
  subscribers.set(subscriber.id, subscriber);
  return () => subscribers.delete(subscriber.id);
}

export function listSubscribers(): IncidentSubscriber[] {
  return Array.from(subscribers.values());
}

export interface FanoutResult {
  readonly incident_id: string;
  readonly attempted_subscribers: ReadonlyArray<string>;
  readonly outcomes: ReadonlyArray<SubscriberDispatchOutcome>;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
  readonly elapsed_ms: number;
}

/**
 * Dispatch an incident payload to every subscriber whose `accepts()` filter
 * returns true. Outcomes are aggregated; one failing subscriber doesn't
 * block the others.
 */
export async function fanOutIncident(payload: IncidentDispatchPayload): Promise<FanoutResult> {
  const t0 = Date.now();
  const all = Array.from(subscribers.values());
  const accepting = all.filter(s => {
    try { return s.accepts(payload); } catch { return false; }
  });

  const outcomes: SubscriberDispatchOutcome[] = [];
  await Promise.all(accepting.map(async (s) => {
    const subT0 = Date.now();
    try {
      const result = await s.dispatch(payload);
      outcomes.push({
        subscriber_id: s.id,
        status: result.status,
        message: result.message,
        elapsed_ms: Date.now() - subT0,
      });
    } catch (err: any) {
      outcomes.push({
        subscriber_id: s.id,
        status: 'failed',
        message: err?.message ?? 'unknown error',
        elapsed_ms: Date.now() - subT0,
      });
    }
  }));

  return {
    incident_id: payload.incident_id,
    attempted_subscribers: accepting.map(s => s.id),
    outcomes,
    succeeded: outcomes.filter(o => o.status === 'succeeded').length,
    failed: outcomes.filter(o => o.status === 'failed').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
    elapsed_ms: Date.now() - t0,
  };
}

/** Persist the dispatch result so operators can audit later. */
export async function persistDispatchLog(payload: IncidentDispatchPayload, result: FanoutResult): Promise<void> {
  try {
    const { default: IncidentDispatchLog } = await import('../../../models/IncidentDispatchLog');
    await IncidentDispatchLog.create({
      incident_id: payload.incident_id,
      project_id: payload.project_id,
      severity: payload.severity,
      type: payload.type,
      attempted_subscribers: [...result.attempted_subscribers],
      outcomes: [...result.outcomes],
      succeeded: result.succeeded,
      failed: result.failed,
      elapsed_ms: result.elapsed_ms,
      dispatched_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[incidentFanoutEngine] dispatch log write failed:', err?.message);
  }
}

/** Test helper. */
export function _resetSubscribersForTests(): void {
  subscribers.clear();
}
