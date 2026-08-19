import { TicketCreatorNotReportableError } from '../ticketCreatorErrors';

describe('TicketCreatorNotReportableError', () => {
  it('carries a stable error_class and the full context, and is a real Error', () => {
    const err = new TicketCreatorNotReportableError({
      createdByType: 'agent',
      createdById: 'SomeUnregisteredAgent',
      reason: 'unregistered',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TicketCreatorNotReportableError);
    expect(err.error_class).toBe('TicketCreatorNotReportableError');
    expect(err.context).toEqual({
      createdByType: 'agent',
      createdById: 'SomeUnregisteredAgent',
      reason: 'unregistered',
    });
    expect(err.message).toMatch(/no registered AiAgent row resolves/);
  });

  it('produces a distinct message for the no_reports_to reason', () => {
    const err = new TicketCreatorNotReportableError({
      createdByType: 'agent',
      createdById: 'RegisteredButUnmapped',
      reason: 'no_reports_to',
    });

    expect(err.context.reason).toBe('no_reports_to');
    // AI Leadership / AI Staff hierarchy (2026-08-19) — the message now
    // describes chain resolution (reports_to_type/reports_to_id), not the
    // superseded flat reports_to_org_member_id field. See
    // ticketCreatorErrors.ts's own updated no_reports_to message.
    expect(err.message).toMatch(/reports_to chain/);
    expect(err.message).toMatch(/unset, broken, or too deep/);
  });
});
