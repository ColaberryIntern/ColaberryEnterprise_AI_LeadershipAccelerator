import { engagementScore, rankOutreach, reachOutCandidate, reasonsFor, type OutreachSignals } from '../explorerOutreachRanking';

const NOW = Date.parse('2026-10-26T17:00:00Z');
const day = (n: number): string => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const base = (o: Partial<OutreachSignals> = {}): OutreachSignals => ({
  enrollment_id: 'e', email: 'a@example.com', name: 'A', primary_state: 'ACTIVE_LEARNER', overlays: [], e_score: 0, i_score: 0,
  cards: 0, rsvps: 0, calls: 0, next_call: null, tour_furthest: null, tour_total: null, tour_finished: false,
  last_seen: day(0), last_contacted_at: null, ...o,
});

describe('reach out now: who qualifies', () => {
  it('a recently active explorer nobody has contacted qualifies', () => {
    expect(reachOutCandidate(base(), NOW)).toBe(true);
  });
  it.each([
    ['converted', { primary_state: 'CONVERTED' }],
    ['a call already coming up', { next_call: day(-2) }],
    ['contacted 3 days ago', { last_contacted_at: day(3) }],
    ['not seen for 20 days', { last_seen: day(20) }],
    ['never seen', { last_seen: null }],
  ] as [string, Partial<OutreachSignals>][])('%s does not', (_n, o) => {
    expect(reachOutCandidate(base(o), NOW)).toBe(false);
  });
  it('a call in the past or contact 8 days ago no longer blocks', () => {
    expect(reachOutCandidate(base({ next_call: day(2), last_contacted_at: day(8) }), NOW)).toBe(true);
  });
});

describe('ranking', () => {
  it('reach out orders by intent: RSVPs, a finished tour and HIGH_INTENT lift a person', () => {
    const rows = [
      base({ enrollment_id: '1', email: 'low@example.com', i_score: 10 }),
      base({ enrollment_id: '2', email: 'rsvp@example.com', i_score: 10, rsvps: 1, tour_finished: true }),
      base({ enrollment_id: '3', email: 'hot@example.com', i_score: 40, overlays: ['HIGH_INTENT'] }),
      base({ enrollment_id: '4', email: 'done@example.com', i_score: 90, primary_state: 'CONVERTED' }),
    ];
    expect(rankOutreach(rows, 'reach_out', 10, NOW).map((r) => r.email)).toEqual(['hot@example.com', 'rsvp@example.com', 'low@example.com']);
  });
  it('most engaged counts everyone, by recorded activity', () => {
    const rows = [
      base({ email: 'idle@example.com', last_seen: day(30) }),
      base({ email: 'busy@example.com', cards: 5, calls: 1 }),
      base({ email: 'converted@example.com', primary_state: 'CONVERTED', cards: 2 }),
    ];
    expect(rankOutreach(rows, 'engaged', 10, NOW).map((r) => r.email)).toEqual(['busy@example.com', 'converted@example.com', 'idle@example.com']);
    expect(engagementScore(base({ cards: 5, calls: 1 }), NOW)).toBe(15 + 12 + 10);
  });
  it('ties break on the email (stable order) and the limit applies', () => {
    const rows = [base({ email: 'b@example.com' }), base({ email: 'a@example.com' }), base({ email: 'c@example.com' })];
    expect(rankOutreach(rows, 'engaged', 2, NOW).map((r) => r.email)).toEqual(['a@example.com', 'b@example.com']);
  });
  it('an empty population is an empty list', () => {
    expect(rankOutreach([], 'reach_out', 25, NOW)).toEqual([]);
  });
});

describe('reasons, in plain words and only from recorded facts', () => {
  it('lists the call, intent, RSVPs, tour, assignments, last active and contact', () => {
    expect(reasonsFor(base({ next_call: '2026-10-28T15:00:00Z', overlays: ['HIGH_INTENT'], rsvps: 2, tour_furthest: 5, tour_total: 8, cards: 1, last_seen: day(3), last_contacted_at: day(10) }), NOW))
      .toEqual(['Admissions call booked for Oct 28', 'High intent', "RSVP'd to 2 Open Houses", 'Campus tour: stop 5 of 8', 'Completed 1 assignment', 'Last active 3 days ago', 'Last contacted 10 days ago (portal records)']);
  });
  it('a finished tour and a fresh account', () => {
    expect(reasonsFor(base({ tour_finished: true, tour_furthest: 8, tour_total: 8 }), NOW)).toEqual(['Finished the campus tour', 'Active today', 'No contact in portal records']);
  });
  it('never claims a tour or call that was not recorded', () => {
    const r = reasonsFor(base(), NOW).join(' ');
    expect(r).not.toMatch(/tour|call|RSVP|assignment/i);
  });
});
