/**
 * governanceIncidentSubscriber — Phase 12. Listens to governance events
 * (escalation_dispatched, automation.blocked at warning+ severity,
 * override_storm_detected) and dispatches them through the existing
 * incidentFanoutEngine (Slack/Email/Webhook/Console).
 *
 * No new dispatch infrastructure — the existing fanout already supports
 * filtering by severity + type. We just adapt governance events into
 * the IncidentDispatchPayload shape.
 *
 * Phase 12 §H.
 */

import type { IncidentSubscriber, IncidentDispatchPayload, SubscriberDispatchResult } from './types';

/**
 * Pure adapter — turn a governance audit/event into an incident
 * dispatch payload. Matches the shape the existing subscribers
 * (slackSubscriber, emailSubscriber, etc.) consume.
 */
export function buildGovernanceIncidentPayload(opts: {
  project_id: string;
  kind: string;                                     // governance.escalation_dispatched | automation.blocked | etc.
  severity: 'info' | 'warning' | 'error';
  summary: string;
  evidence: Record<string, unknown>;
  affected_routes?: ReadonlyArray<string>;
  recommended_actions?: ReadonlyArray<string>;
}): IncidentDispatchPayload {
  return {
    incident_id: `governance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    project_id: opts.project_id,
    type: opts.kind,
    severity: opts.severity,
    state: 'open',
    affected_routes: opts.affected_routes ? [...opts.affected_routes] : [],
    cognition_impact: null,
    recommended_actions: opts.recommended_actions ?? [],
    opened_at: new Date().toISOString(),
    occurrence_count: 1,
    summary: opts.summary,
    evidence: opts.evidence,
  };
}

/**
 * Console-style governance subscriber. Accepts payloads whose type
 * starts with `governance.`; logs to stdout. Acts as the floor —
 * Slack/email subscribers added separately follow the same pattern.
 */
export const governanceConsoleSubscriber: IncidentSubscriber = {
  id: 'governance-console',
  description: 'Logs governance escalations to console (development + audit floor).',
  accepts(payload: IncidentDispatchPayload): boolean {
    return typeof payload.type === 'string' && payload.type.startsWith('governance.');
  },
  async dispatch(payload: IncidentDispatchPayload): Promise<SubscriberDispatchResult> {
    console.log(`[governance-incident] [${payload.severity}] ${payload.type} project=${payload.project_id} :: ${payload.summary}`);
    return { status: 'succeeded' };
  },
};
