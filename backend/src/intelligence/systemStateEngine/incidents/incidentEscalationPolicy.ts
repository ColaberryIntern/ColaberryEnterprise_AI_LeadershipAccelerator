/**
 * incidentEscalationPolicy — pure policy mapping incident state + history
 * to the recommended next action.
 *
 * V1 rule set (composable):
 *   - severity:error ⇒ dispatch immediately
 *   - severity:warning + occurrence ≥3 ⇒ dispatch
 *   - same incident type + same routes within 30 min ⇒ correlate (don't double-dispatch)
 *   - re-opened incident (resolved → opened within 24h) ⇒ escalate severity
 *   - unresolved error + 60 min since open ⇒ re-dispatch (paged)
 *
 * Phase 9 §2.
 */

export interface EscalationInputs {
  readonly type: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly state: 'open' | 'acknowledged' | 'resolved' | 'expired';
  readonly occurrence_count: number;
  readonly opened_at: Date;
  readonly last_seen_at: Date;
  readonly previous_resolved_at?: Date | null;        // for re-open detection
  readonly affected_routes: ReadonlyArray<string>;
  /** Prior dispatches in the last hour (correlation). */
  readonly recent_dispatches?: ReadonlyArray<{ type: string; routes: ReadonlyArray<string>; dispatched_at: Date }>;
}

export type EscalationDecision =
  | { action: 'dispatch'; reason: string; effective_severity: 'info' | 'warning' | 'error' }
  | { action: 'suppress'; reason: string }
  | { action: 'escalate'; reason: string; effective_severity: 'error' };

const REDISPATCH_AFTER_MIN = 60;
const CORRELATION_WINDOW_MIN = 30;
const REOPEN_WINDOW_HOURS = 24;
const WARNING_DISPATCH_THRESHOLD = 3;

export function decideEscalation(input: EscalationInputs): EscalationDecision {
  const now = Date.now();
  const sinceOpenedMin = (now - input.opened_at.getTime()) / (60_000);

  // Reopened recently?
  if (input.previous_resolved_at) {
    const reopenWindowMs = REOPEN_WINDOW_HOURS * 3600 * 1000;
    if (now - input.previous_resolved_at.getTime() < reopenWindowMs) {
      return {
        action: 'escalate',
        reason: 'Incident re-opened within 24h of previous resolution.',
        effective_severity: 'error',
      };
    }
  }

  // Error-level always dispatches immediately
  if (input.severity === 'error') {
    // Re-dispatch when unresolved 60+ min after open
    if (input.state === 'open' && sinceOpenedMin >= REDISPATCH_AFTER_MIN) {
      return {
        action: 'dispatch',
        reason: `Unresolved error open for ${Math.round(sinceOpenedMin)}m — re-dispatching.`,
        effective_severity: 'error',
      };
    }
    return { action: 'dispatch', reason: 'Error severity — immediate dispatch.', effective_severity: 'error' };
  }

  // Suppress recent same-type same-routes dispatches (correlation window)
  if (input.recent_dispatches && input.recent_dispatches.length > 0) {
    const correlationWindowMs = CORRELATION_WINDOW_MIN * 60_000;
    const correlated = input.recent_dispatches.find(d =>
      d.type === input.type &&
      now - d.dispatched_at.getTime() < correlationWindowMs &&
      d.routes.some(r => input.affected_routes.includes(r)),
    );
    if (correlated) {
      return { action: 'suppress', reason: `Correlated with dispatch ${Math.round((now - correlated.dispatched_at.getTime()) / 60_000)}m ago — suppressed.` };
    }
  }

  // Warning: dispatch when occurrence count crosses threshold
  if (input.severity === 'warning') {
    if (input.occurrence_count >= WARNING_DISPATCH_THRESHOLD) {
      return {
        action: 'dispatch',
        reason: `Warning seen ${input.occurrence_count} times — escalating beyond threshold.`,
        effective_severity: input.occurrence_count >= 5 ? 'error' : 'warning',
      };
    }
    return { action: 'suppress', reason: `Warning occurrence ${input.occurrence_count} below threshold ${WARNING_DISPATCH_THRESHOLD}.` };
  }

  // Info: never auto-dispatch
  return { action: 'suppress', reason: 'Info severity — log only, no dispatch.' };
}
