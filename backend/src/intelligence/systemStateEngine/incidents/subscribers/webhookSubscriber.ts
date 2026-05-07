/**
 * webhookSubscriber — generic HTTP POST subscriber. Posts the raw incident
 * payload as JSON. Configured per-instance with target URL + auth token.
 */
import type { IncidentSubscriber, IncidentDispatchPayload, SubscriberDispatchResult } from './types';

export interface WebhookSubscriberConfig {
  readonly id: string;
  readonly url: string;
  readonly auth_header?: string;       // e.g., "Bearer <token>"
  readonly min_severity?: 'info' | 'warning' | 'error';
  readonly timeout_ms?: number;
  readonly only_types?: ReadonlyArray<string>;
}

export function createWebhookSubscriber(config: WebhookSubscriberConfig): IncidentSubscriber {
  const sevRank: Record<string, number> = { info: 0, warning: 1, error: 2 };
  const minSev = config.min_severity ?? 'warning';
  const onlyTypes = config.only_types ? new Set(config.only_types) : null;

  return {
    id: config.id,
    description: `POSTs incident payloads to ${config.url}`,
    accepts(p: IncidentDispatchPayload): boolean {
      if (sevRank[p.severity] < sevRank[minSev]) return false;
      if (onlyTypes && !onlyTypes.has(p.type)) return false;
      return true;
    },
    async dispatch(p: IncidentDispatchPayload): Promise<SubscriberDispatchResult> {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), config.timeout_ms ?? 5000);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.auth_header) headers['Authorization'] = config.auth_header;
        const res = await fetch(config.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(p),
          signal: controller.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
          return { status: 'failed', message: `HTTP ${res.status}` };
        }
        return { status: 'succeeded' };
      } catch (err: any) {
        clearTimeout(t);
        return { status: 'failed', message: err?.message ?? 'fetch failed' };
      }
    },
  };
}
