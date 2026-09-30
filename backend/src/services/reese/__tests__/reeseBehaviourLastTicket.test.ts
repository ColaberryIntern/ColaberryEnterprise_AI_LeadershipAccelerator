import { computeLastTicketPerBehaviour } from '../reeseBehaviourLastTicket';

describe('computeLastTicketPerBehaviour', () => {
  it('happy path: picks the most recent ticket of each behaviour\'s own real type', () => {
    const result = computeLastTicketPerBehaviour([
      { id: 't1', ticket_number: 1, title: 'Older support ticket', type: 'student_support', status: 'in_progress', updated_at: new Date('2026-09-01T00:00:00Z') },
      { id: 't2', ticket_number: 2, title: 'Newer support ticket', type: 'student_support', status: 'in_progress', updated_at: new Date('2026-09-10T00:00:00Z') },
      { id: 't3', ticket_number: 3, title: 'Outreach signal', type: 'reese_autonomous_outreach', status: 'todo', updated_at: new Date('2026-09-05T00:00:00Z') },
    ]);

    expect(result.reactive_dm_reply).toEqual({ id: 't2', ticket_number: 2, title: 'Newer support ticket', at: new Date('2026-09-10T00:00:00Z') });
    expect(result.autonomous_outreach_sweep).toEqual({ id: 't3', ticket_number: 3, title: 'Outreach signal', at: new Date('2026-09-05T00:00:00Z') });
    // Follow-ups act on the SAME outreach ticket the sweep created, not a
    // separate ticket type of their own — honestly shares the sweep's ref.
    expect(result.outreach_follow_ups).toEqual(result.autonomous_outreach_sweep);
  });

  it('student_support_supersession_resolver: picks the most recent CLOSED student_support ticket, distinct from the open one reactive_dm_reply points at', () => {
    const result = computeLastTicketPerBehaviour([
      { id: 'open-1', ticket_number: 10, title: 'Still open', type: 'student_support', status: 'in_progress', updated_at: new Date('2026-09-12T00:00:00Z') },
      { id: 'closed-1', ticket_number: 11, title: 'Superseded and closed', type: 'student_support', status: 'done', updated_at: new Date('2026-09-08T00:00:00Z') },
    ]);

    expect(result.reactive_dm_reply?.id).toBe('open-1');
    expect(result.student_support_supersession_resolver?.id).toBe('closed-1');
  });

  it('boundary: behaviours with no ticket-bearing type (welcome_dms, presence_heartbeat, health_assessment) are never populated', () => {
    const result = computeLastTicketPerBehaviour([
      { id: 't1', ticket_number: 1, title: 'Support', type: 'student_support', status: 'done', updated_at: new Date() },
    ]);

    expect(result.welcome_dms).toBeUndefined();
    expect(result.presence_heartbeat).toBeUndefined();
    expect(result.health_assessment).toBeUndefined();
  });

  it('boundary: no tickets at all returns an empty object, never a fabricated entry', () => {
    expect(computeLastTicketPerBehaviour([])).toEqual({});
  });

  it('failure path: a row missing updated_at is skipped rather than crashing the whole computation', () => {
    const result = computeLastTicketPerBehaviour([
      { id: 't1', ticket_number: 1, title: 'No timestamp', type: 'student_support', status: 'done', updated_at: undefined as unknown as Date },
      { id: 't2', ticket_number: 2, title: 'Has a timestamp', type: 'student_support', status: 'in_progress', updated_at: new Date('2026-09-01T00:00:00Z') },
    ]);

    expect(result.reactive_dm_reply?.id).toBe('t2');
  });
});
