import InboxCaseEvent from '../../models/InboxCaseEvent';

// Single write path into the append-only inbox_case_events audit trail.
// Mirrors services/inbox/inboxAuditService.ts::logAuditEvent for the
// existing Inbox COS tables — every state transition, disposition change,
// question answer, and action lifecycle event goes through this function so
// the audit chain is never partially written.

export interface CaseEventInput {
  case_id: string;
  item_id?: string | null;
  action_id?: string | null;
  event_type: string;
  actor_type: 'admin' | 'system' | 'ai';
  actor_id: string;
  previous_state?: string | null;
  new_state?: string | null;
  details?: Record<string, unknown>;
  correlation_id: string;
}

export async function logCaseEvent(input: CaseEventInput): Promise<void> {
  try {
    await InboxCaseEvent.create({
      case_id: input.case_id,
      item_id: input.item_id ?? null,
      action_id: input.action_id ?? null,
      event_type: input.event_type,
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      previous_state: input.previous_state ?? null,
      new_state: input.new_state ?? null,
      details: input.details ?? {},
      correlation_id: input.correlation_id,
    });
  } catch (err: any) {
    // The audit write itself must never take down the calling operation, but
    // it also must never fail silently — this is the one place a console
    // line is acceptable in place of a re-throw, since inbox_case_events IS
    // the observability layer for this subsystem.
    console.error('[InboxCase] Failed to write case event (event_type=' + input.event_type + '):', err?.message);
  }
}
