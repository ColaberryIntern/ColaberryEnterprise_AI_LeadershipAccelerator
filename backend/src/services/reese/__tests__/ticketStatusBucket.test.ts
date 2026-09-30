import { computeNeedsReply, computeStatusBucket } from '../ticketStatusBucket';

describe('computeNeedsReply', () => {
  it('happy path: true when the latest activity actor is not this agent', () => {
    expect(computeNeedsReply('student-uuid-1', ['reese-admin-uuid'])).toBe(true);
  });

  it('false when the latest activity actor IS this agent (any of its own identity ids)', () => {
    expect(computeNeedsReply('reese-admin-uuid', ['reese-admin-uuid', 'Reese'])).toBe(false);
  });

  it('boundary: no activity rows yet (null actor) is honestly false, never a fabricated "needs reply"', () => {
    expect(computeNeedsReply(null, ['reese-admin-uuid'])).toBe(false);
  });
});

describe('computeStatusBucket', () => {
  const NOW = new Date('2026-09-19T12:00:00Z');
  const PAST = new Date('2026-09-01T00:00:00Z');
  const FUTURE = new Date('2026-10-01T00:00:00Z');

  it('happy path: overdue when due_date is past and status is non-terminal', () => {
    expect(computeStatusBucket({ status: 'in_progress', dueDate: PAST, needsReply: false, now: NOW })).toBe('overdue');
  });

  it('happy path: ready_to_verify when status is in_review and not overdue', () => {
    expect(computeStatusBucket({ status: 'in_review', dueDate: null, needsReply: false, now: NOW })).toBe('ready_to_verify');
  });

  it('happy path: needs_reply when not overdue, not in_review, and someone else acted last', () => {
    expect(computeStatusBucket({ status: 'in_progress', dueDate: null, needsReply: true, now: NOW })).toBe('needs_reply');
  });

  it('happy path: open is the honest default when none of the other 3 buckets apply', () => {
    expect(computeStatusBucket({ status: 'todo', dueDate: FUTURE, needsReply: false, now: NOW })).toBe('open');
  });

  it('precedence: overdue beats needs_reply when both are true', () => {
    expect(computeStatusBucket({ status: 'in_progress', dueDate: PAST, needsReply: true, now: NOW })).toBe('overdue');
  });

  it('precedence: overdue beats ready_to_verify — a past-due ticket sitting in in_review still reads as overdue, the more urgent signal', () => {
    expect(computeStatusBucket({ status: 'in_review', dueDate: PAST, needsReply: false, now: NOW })).toBe('overdue');
  });

  it('precedence: in_review beats needs_reply', () => {
    expect(computeStatusBucket({ status: 'in_review', dueDate: null, needsReply: true, now: NOW })).toBe('ready_to_verify');
  });

  it('boundary: a done ticket with a past due_date is null, never overdue and never a fabricated "open" — a closed ticket fits none of the 4 real buckets', () => {
    expect(computeStatusBucket({ status: 'done', dueDate: PAST, needsReply: false, now: NOW })).toBeNull();
  });

  it('boundary: a cancelled ticket is null even when needsReply is true — nothing to reply to on a closed ticket', () => {
    expect(computeStatusBucket({ status: 'cancelled', dueDate: PAST, needsReply: true, now: NOW })).toBeNull();
  });

  it('boundary: a null due_date never shows overdue', () => {
    expect(computeStatusBucket({ status: 'in_progress', dueDate: null, needsReply: false, now: NOW })).toBe('open');
  });
});
