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
    expect(err.message).toMatch(/has no reports_to_org_member_id set/);
  });
});
