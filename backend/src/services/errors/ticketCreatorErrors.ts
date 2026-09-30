// Agent Ticket Standard — "every ticket must have a home" (Ali, live, 2026-08-18,
// session CC-20260818-x4nk). A classified error class per CLAUDE.md's Observability
// Framework ("Every caught exception is tagged with a stable error_class string...
// Generic Error is not an acceptable classification in production code paths").
// Thrown by ticketService.createTicket() (and reused by
// backfillTicketReportsToAssignee.ts's dry-run reporting) whenever a non-human
// ticket creator cannot be resolved to a real human it reports to. This is a
// deliberate, hard rejection — never caught-and-swallowed by createTicket() itself.

export type TicketCreatorNotReportableReason = 'unregistered' | 'no_reports_to';

export interface TicketCreatorNotReportableContext {
  createdByType: string;
  createdById: string;
  reason: TicketCreatorNotReportableReason;
}

export class TicketCreatorNotReportableError extends Error {
  readonly error_class = 'TicketCreatorNotReportableError' as const;
  readonly context: TicketCreatorNotReportableContext;

  constructor(context: TicketCreatorNotReportableContext) {
    const reasonText =
      context.reason === 'unregistered'
        ? `no registered AiAgent row resolves for created_by_type='${context.createdByType}', ` +
          `created_by_id='${context.createdById}'`
        : `the registered AiAgent for created_by_type='${context.createdByType}', ` +
          `created_by_id='${context.createdById}' does not resolve to a real human — its ` +
          'reports_to chain (directly, or through an AI Leadership agent) is unset, broken, or too deep';
    super(
      `Ticket creation rejected: ${reasonText}. Every ticket-creating agent must report ` +
        'to a real human (org_members row) before it can create tickets — see ' +
        'directives/register-ticket-creating-agent.md.',
    );
    this.name = 'TicketCreatorNotReportableError';
    this.context = context;
    Object.setPrototypeOf(this, TicketCreatorNotReportableError.prototype);
  }
}
