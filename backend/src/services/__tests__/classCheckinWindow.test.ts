import { classWindowAt } from '../classCheckinWindow';

// Session 3, Cohort - November 2026: Tue 2026-11-24 18:30-19:30 Central (CST, UTC-6).
const base = { sessionDate: '2026-11-24', startTime: '18:30', endTime: '19:30', status: 'scheduled' };
const at = (iso: string, over: Partial<typeof base> = {}) => classWindowAt({ ...base, ...over, now: new Date(iso) });

describe('classWindowAt', () => {
  it('is BEFORE five days early (when Ali scanned it) and up to an hour before start', () => {
    expect(at('2026-11-19T16:48:31Z')).toBe('before');
    expect(at('2026-11-24T23:29:00Z')).toBe('before'); // 5:29 PM CST
  });
  it('opens an hour early and stays open half an hour past the end', () => {
    expect(at('2026-11-24T23:31:00Z')).toBe('open'); // 5:31 PM
    expect(at('2026-11-25T00:40:00Z')).toBe('open'); // 6:40 PM
    expect(at('2026-11-25T01:59:00Z')).toBe('open'); // 7:59 PM
  });
  it('has ENDED after that, and whenever the class is completed or cancelled', () => {
    expect(at('2026-11-25T02:01:00Z')).toBe('ended');
    expect(at('2026-11-25T00:40:00Z', { status: 'completed' })).toBe('ended');
    expect(at('2026-11-25T00:40:00Z', { status: 'cancelled' })).toBe('ended');
  });
  it('a class the instructor has set live is open whatever the clock says', () => {
    expect(at('2026-11-19T16:48:31Z', { status: 'live' })).toBe('open');
  });
  it('a missing end time falls back to a two-hour class', () => {
    expect(at('2026-11-25T02:30:00Z', { endTime: '' })).toBe('open'); // 8:30 PM, inside 2h + 30m
  });
});
