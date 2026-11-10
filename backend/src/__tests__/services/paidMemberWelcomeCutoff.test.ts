/**
 * The "new payers only" cutoff for the paid-member welcome (C10.18). Pure module, no mocks.
 */
import { isFirstSessionPast, NEW_PAID_MEMBERS_SQL, parseWelcomeSince } from '../../services/welcome/paidMemberWelcomeCutoff';

describe('parseWelcomeSince', () => {
  it('reads an ISO timestamp with a zone', () => {
    expect(parseWelcomeSince('2026-11-10T05:00:00Z')!.toISOString()).toBe('2026-11-10T05:00:00.000Z');
    expect(parseWelcomeSince('2026-11-09T23:00:00-06:00')!.toISOString()).toBe('2026-11-10T05:00:00.000Z');
    expect(parseWelcomeSince(' 2026-11-10T05:00Z ')!.toISOString()).toBe('2026-11-10T05:00:00.000Z');
  });

  it('refuses anything else, including a timestamp with no zone that would shift with the host', () => {
    for (const bad of [null, undefined, '', '   ', '2026-11-10', '2026-11-10T05:00:00', 'now', '2026-13-40T05:00:00Z']) {
      expect(parseWelcomeSince(bad as any)).toBeNull();
    }
  });
});

describe('isFirstSessionPast', () => {
  it('is past only once the date is behind today', () => {
    expect(isFirstSessionPast('2026-12-03', '2026-12-04')).toBe(true);
    expect(isFirstSessionPast('2026-12-03', '2026-12-03')).toBe(false);
    expect(isFirstSessionPast('2026-12-03', '2026-11-13')).toBe(false);
  });

  it('an unreadable date is not called past', () => {
    expect(isFirstSessionPast(null, '2026-12-04')).toBe(false);
    expect(isFirstSessionPast('2026-12-03', 'today')).toBe(false);
  });
});

describe('NEW_PAID_MEMBERS_SQL', () => {
  it('keys on the FIRST paid row, by created_at, ignoring comp and never-paid rows', () => {
    expect(NEW_PAID_MEMBERS_SQL).toMatch(/MIN\(created_at\)/);
    expect(NEW_PAID_MEMBERS_SQL).not.toMatch(/started_at/); // the realign script moves started_at
    expect(NEW_PAID_MEMBERS_SQL).toMatch(/plan <> 'comp'/);
    expect(NEW_PAID_MEMBERS_SQL).toMatch(/NOT IN \('pending', 'failed'\)/);
  });

  it('takes the cutoff and limit only as bound parameters', () => {
    expect(NEW_PAID_MEMBERS_SQL).toMatch(/>= :since/);
    expect(NEW_PAID_MEMBERS_SQL).toMatch(/LIMIT :limit/);
    expect(NEW_PAID_MEMBERS_SQL).not.toMatch(/\$\{/);
  });
});
