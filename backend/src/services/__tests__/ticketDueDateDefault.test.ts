import { computeDefaultTicketDueDate } from '../ticketDueDateDefault';

describe('computeDefaultTicketDueDate', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');

  it('returns now + 24h for critical', () => {
    expect(computeDefaultTicketDueDate('critical', now)).toEqual(new Date('2026-09-29T12:00:00.000Z'));
  });

  it('returns now + 48h for high', () => {
    expect(computeDefaultTicketDueDate('high', now)).toEqual(new Date('2026-09-30T12:00:00.000Z'));
  });

  it('returns now + 72h for medium', () => {
    expect(computeDefaultTicketDueDate('medium', now)).toEqual(new Date('2026-10-01T12:00:00.000Z'));
  });

  it('returns now + 120h for low', () => {
    expect(computeDefaultTicketDueDate('low', now)).toEqual(new Date('2026-10-03T12:00:00.000Z'));
  });

  it('falls back to the medium window for null', () => {
    expect(computeDefaultTicketDueDate(null, now)).toEqual(new Date('2026-10-01T12:00:00.000Z'));
  });

  it('falls back to the medium window for undefined', () => {
    expect(computeDefaultTicketDueDate(undefined, now)).toEqual(new Date('2026-10-01T12:00:00.000Z'));
  });

  it('falls back to the medium window for an unrecognized value', () => {
    expect(computeDefaultTicketDueDate('urgent' as any, now)).toEqual(new Date('2026-10-01T12:00:00.000Z'));
  });

  it('returns a real Date instance, never a string', () => {
    const result = computeDefaultTicketDueDate('high', now);
    expect(result).toBeInstanceOf(Date);
  });

  it('defaults `now` to the real current time when omitted', () => {
    const before = Date.now();
    const result = computeDefaultTicketDueDate('critical');
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
  });
});
