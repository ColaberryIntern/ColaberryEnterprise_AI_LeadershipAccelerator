/**
 * Shared types for incident-fanout subscribers.
 *
 * Phase 9 §3.
 */

export interface IncidentDispatchPayload {
  readonly incident_id: string;
  readonly project_id: string;
  readonly type: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly state: 'open' | 'acknowledged' | 'resolved' | 'expired';
  readonly affected_routes: ReadonlyArray<string>;
  readonly cognition_impact: number | null;
  readonly recommended_actions: ReadonlyArray<string>;
  readonly opened_at: string;
  readonly occurrence_count: number;
  readonly summary: string;     // pre-rendered short message
  readonly evidence?: Record<string, unknown>;
}

export type DispatchStatus = 'succeeded' | 'failed' | 'skipped';

export interface SubscriberDispatchResult {
  readonly status: DispatchStatus;
  readonly message?: string;
}

export interface SubscriberDispatchOutcome {
  readonly subscriber_id: string;
  readonly status: DispatchStatus;
  readonly message?: string;
  readonly elapsed_ms: number;
}

export interface IncidentSubscriber {
  readonly id: string;
  readonly description: string;
  /** Returns true when this subscriber should receive the payload. */
  accepts(payload: IncidentDispatchPayload): boolean;
  dispatch(payload: IncidentDispatchPayload): Promise<SubscriberDispatchResult>;
}

/** Helper: render a single-line incident summary suitable for chat / email. */
export function renderIncidentSummary(payload: IncidentDispatchPayload): string {
  const sev = payload.severity.toUpperCase();
  const routes = payload.affected_routes.length > 0
    ? ` · ${payload.affected_routes.slice(0, 2).join(', ')}${payload.affected_routes.length > 2 ? ` (+${payload.affected_routes.length - 2})` : ''}`
    : '';
  const cog = typeof payload.cognition_impact === 'number'
    ? ` · cognition impact ${payload.cognition_impact}`
    : '';
  return `[${sev}] ${payload.type} #${payload.incident_id.slice(0, 8)}${routes}${cog} — ${payload.summary}`;
}
