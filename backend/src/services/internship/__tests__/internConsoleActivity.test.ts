/**
 * "When is the last time they showed activity" — and the ways that question gets answered
 * wrongly in a way nobody notices.
 *
 * Three failure modes these pin:
 *
 *   1. **Never confused with stopped.** An intern who has done nothing since joining is not
 *      "gone dark 10+ days" — they never started. Reporting those as the same colour hides
 *      the only group that is always worth acting on.
 *   2. **One blind source speaking for all of them.** `community_members.last_active_at` is
 *      only fresh while a portal tab is pinging, so an intern working all day in their repo
 *      reads as idle. The timeline covers that, and the heartbeat covers the timeline's own
 *      gaps. Taking the later of the two is the design, not a tie-break.
 *   3. **A false alarm on a new intern.** Someone in week one reading as "at risk" costs
 *      trust in every other red on the board.
 */
const mockQuery = jest.fn();
const mockTimeline = jest.fn();
const mockActivityDays = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../adminOs/personTimelineService', () => ({
  getPersonTimeline: (...a: unknown[]) => mockTimeline(...a),
  activityDaysByEnrollment: (...a: unknown[]) => mockActivityDays(...a),
}));

import {
  internActivitySignal, internActivitySignals, daysFromEvents, signalFrom, categoryOf,
  bandFor, withGrace, WINDOW_DAYS, NEW_INTERN_GRACE_DAYS,
} from '../internConsoleActivity';

const ENR = 'enr-1';
const NOW = new Date('2026-10-01T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const event = (at: string, source = 'timeline_card_progress') =>
  ({ occurredAt: at, domain: 'learning', source, type: 'card_completed', summary: 'Week 1 Learn', occurrences: 1 });

/** sequelize is called twice: heartbeat, then membership. */
const db = (heartbeat: string | null, joinedAt: string | null) => {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce([heartbeat ? [{ last_active_at: heartbeat }] : [], {}])
    .mockResolvedValueOnce([joinedAt ? [{ joined_at: joinedAt }] : [], {}]);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockTimeline.mockResolvedValue([]);
});
afterEach(() => (console.warn as jest.Mock).mockRestore?.());

describe('the bands, at every boundary', () => {
  it.each([
    [0, 'green'], [1, 'yellow'], [3, 'yellow'], [4, 'orange'], [6, 'orange'],
    [7, 'red'], [9, 'red'], [10, 'black'], [40, 'black'],
  ] as const)('%i days since activity is %s', (days, expected) => {
    expect(bandFor(days)).toBe(expected);
  });

  it('calls never-active "unknown", never "black"', () => {
    // The whole point of the sixth band. Someone who never started needs a different
    // conversation from someone who stopped.
    expect(bandFor(null)).toBe('unknown');
  });
});

describe('the new-intern grace cap', () => {
  it('softens orange, red and black for someone inside their first 30 days', () => {
    for (const level of ['orange', 'red', 'black'] as const) {
      expect(withGrace(level, 10)).toEqual({ level: 'yellow', graced: true });
    }
  });

  it('does not touch green or yellow — there is nothing to soften', () => {
    expect(withGrace('green', 5)).toEqual({ level: 'green', graced: false });
    expect(withGrace('yellow', 5)).toEqual({ level: 'yellow', graced: false });
  });

  it('expires: the same silence past 30 days reports its real band', () => {
    expect(withGrace('red', NEW_INTERN_GRACE_DAYS)).toEqual({ level: 'yellow', graced: true });
    expect(withGrace('red', NEW_INTERN_GRACE_DAYS + 1)).toEqual({ level: 'red', graced: false });
  });

  it('never softens "unknown", however new they are', () => {
    // An intern who has done nothing at all is the one case worth surfacing on day 2.
    expect(withGrace('unknown', 1)).toEqual({ level: 'unknown', graced: false });
  });

  it('says when a band was granted rather than measured', async () => {
    mockTimeline.mockResolvedValue([event(daysAgo(8))]);
    db(null, daysAgo(10));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.days_since).toBe(8);   // the measured fact is still reported
    expect(out.level).toBe('yellow'); // the band is softened
    expect(out.graced).toBe(true);    // and it says so
  });
});

describe('which source answered', () => {
  it('takes the timeline when it is more recent, and names the table', async () => {
    mockTimeline.mockResolvedValue([event(daysAgo(1), 'timeline_card_progress')]);
    db(daysAgo(5), daysAgo(90));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.days_since).toBe(1);
    expect(out.last_activity_source).toBe('timeline_card_progress');
  });

  it('takes the portal heartbeat when IT is more recent', async () => {
    // The reverse case. Someone reading in the portal without completing anything is still
    // showing up, and the timeline would call them quiet.
    mockTimeline.mockResolvedValue([event(daysAgo(6))]);
    db(daysAgo(0), daysAgo(90));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.days_since).toBe(0);
    expect(out.last_activity_source).toBe('portal_presence');
  });

  it('works on either source alone', async () => {
    mockTimeline.mockResolvedValue([]);
    db(daysAgo(2), daysAgo(90));
    expect((await internActivitySignal(ENR, { now: NOW })).last_activity_source).toBe('portal_presence');

    mockTimeline.mockResolvedValue([event(daysAgo(2))]);
    db(null, daysAgo(90));
    expect((await internActivitySignal(ENR, { now: NOW })).last_activity_source).toBe('timeline_card_progress');
  });

  it('reports never when neither source has anything', async () => {
    mockTimeline.mockResolvedValue([]);
    db(null, daysAgo(5));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.last_activity_at).toBeNull();
    expect(out.days_since).toBeNull();
    expect(out.level).toBe('unknown');
  });
});

describe('fail-soft', () => {
  it('still answers from the heartbeat when the timeline throws', async () => {
    // One broken source must not cost the console every other signal — the board would go
    // blank for everyone because one query regressed.
    mockTimeline.mockRejectedValue(new Error('timeline exploded'));
    db(daysAgo(2), daysAgo(90));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.days_since).toBe(2);
    expect(out.last_activity_source).toBe('portal_presence');
  });

  it('still answers from the timeline when the database throws', async () => {
    mockTimeline.mockResolvedValue([event(daysAgo(3))]);
    mockQuery.mockReset();
    mockQuery.mockRejectedValue(new Error('db down'));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.days_since).toBe(3);
    expect(out.level).toBe('yellow');
  });
});

describe('the 28-day window', () => {
  it('is always exactly 28 entries, oldest first, however sparse the data', async () => {
    // A grid with gaps reads as missing data. Quiet days are the thing being looked for,
    // so they have to be present and zero.
    mockTimeline.mockResolvedValue([event(daysAgo(1))]);
    db(null, daysAgo(90));

    const { days } = await internActivitySignal(ENR, { now: NOW });

    expect(days).toHaveLength(WINDOW_DAYS);
    expect(days[0].date < days[days.length - 1].date).toBe(true);
    expect(days.filter((d) => d.events === 0)).toHaveLength(WINDOW_DAYS - 1);
  });

  it('counts several events on one day into that day', async () => {
    mockTimeline.mockResolvedValue([event(daysAgo(2)), event(daysAgo(2)), event(daysAgo(2))]);
    db(null, daysAgo(90));

    const { days } = await internActivitySignal(ENR, { now: NOW });

    expect(days.filter((d) => d.events > 0)).toHaveLength(1);
    expect(Math.max(...days.map((d) => d.events))).toBe(3);
  });

  it('honours a collapsed row\'s occurrence count rather than counting it once', async () => {
    // The timeline collapses identical events into one row carrying `occurrences`.
    // Counting that as a single event would under-report a busy day.
    mockTimeline.mockResolvedValue([{ ...event(daysAgo(4)), occurrences: 5 }]);
    db(null, daysAgo(90));

    const { days } = await internActivitySignal(ENR, { now: NOW });

    expect(Math.max(...days.map((d) => d.events))).toBe(5);
  });

  it('ignores events older than the window instead of folding them into day one', async () => {
    mockTimeline.mockResolvedValue([event(daysAgo(200)), event(daysAgo(1))]);
    db(null, daysAgo(400));

    const { days } = await internActivitySignal(ENR, { now: NOW });

    expect(days.reduce((n, d) => n + d.events, 0)).toBe(1);
  });

  it('still reports a last activity that predates the window', async () => {
    // The grid is 28 days; "last active" is not. Someone quiet for 200 days must still
    // report 200, not null.
    mockTimeline.mockResolvedValue([event(daysAgo(200))]);
    db(null, daysAgo(400));

    const out = await internActivitySignal(ENR, { now: NOW });

    expect(out.days_since).toBe(200);
    expect(out.level).toBe('black');
    expect(out.days.every((d) => d.events === 0)).toBe(true);
  });
});

describe('what it asks the timeline for', () => {
  it('asks only for this intern, and only for their own work', async () => {
    // Acquisition and commerce describe how someone was sold to. That is not activity, and
    // including it would make a well-marketed intern look busy.
    db(null, daysAgo(90));
    await internActivitySignal(ENR, { now: NOW });

    const q = mockTimeline.mock.calls[0][0];
    expect(q.enrollmentIds).toEqual([ENR]);
    expect(q.leadIds).toEqual([]);
    expect(q.domains).toEqual(['learning', 'community']);
  });
});

describe('the roster path: three queries, whatever the intern count', () => {
  const A = 'enr-a';
  const B = 'enr-b';

  /** The batch loader's shape: one row per intern per day. */
  const dayRow = (enrollmentId: string, date: string, events: number, lastSource = 'xp_events') =>
    ({ enrollmentId, date, events, lastAt: `${date}T10:00:00.000Z`, lastSource });

  beforeEach(() => {
    mockActivityDays.mockResolvedValue([]);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[], {}]);
  });

  it('asks each source once for ten interns, not once per intern', async () => {
    // The reason this path exists at all. A loop over the single-intern function would be three
    // queries each, and its timeline query is a union of ten subqueries — a hundred-odd
    // subqueries to draw one table.
    const ids = Array.from({ length: 10 }, (_, i) => `enr-${i}`);

    await internActivitySignals(ids, { now: NOW });

    expect(mockActivityDays).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(2); // heartbeats, memberships
    expect(mockActivityDays.mock.calls[0][0].enrollmentIds).toHaveLength(10);
  });

  it('asks the batch loader for the same two domains as the single-intern path', async () => {
    await internActivitySignals([A], { now: NOW });

    expect(mockActivityDays.mock.calls[0][0].domains).toEqual(['learning', 'community']);
  });

  it('returns every requested intern, including one with nothing at all', async () => {
    // Omitting a silent intern would quietly shorten the roster — and a silent intern is exactly
    // who the console is for.
    mockActivityDays.mockResolvedValue([dayRow(A, '2026-09-30', 3)]);
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: A, last_active_at: daysAgo(1) }], {}])
      .mockResolvedValueOnce([[{ enrollment_id: A, joined_at: daysAgo(90) }], {}]);

    const out = await internActivitySignals([A, B], { now: NOW });

    expect([...out.keys()]).toEqual([A, B]);
    expect(out.get(B)!.level).toBe('unknown');
    expect(out.get(B)!.days_since).toBeNull();
    expect(out.get(B)!.days).toHaveLength(WINDOW_DAYS);
  });

  it('keeps each intern\'s days to that intern', async () => {
    mockActivityDays.mockResolvedValue([
      dayRow(A, '2026-09-30', 3), dayRow(B, '2026-09-29', 7), dayRow(A, '2026-09-28', 1),
    ]);

    const out = await internActivitySignals([A, B], { now: NOW });

    expect(out.get(A)!.days.reduce((n, d) => n + d.events, 0)).toBe(4);
    expect(out.get(B)!.days.reduce((n, d) => n + d.events, 0)).toBe(7);
  });

  it('does not query anything for an empty roster', async () => {
    expect((await internActivitySignals([], { now: NOW })).size).toBe(0);
    expect(mockActivityDays).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('still answers from heartbeats when the batch activity query throws', async () => {
    mockActivityDays.mockRejectedValue(new Error('lateral exploded'));
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: A, last_active_at: daysAgo(2) }], {}])
      .mockResolvedValueOnce([[{ enrollment_id: A, joined_at: daysAgo(90) }], {}]);

    const out = await internActivitySignals([A], { now: NOW });

    expect(out.get(A)!.days_since).toBe(2);
    expect(out.get(A)!.last_activity_source).toBe('portal_presence');
  });
});

describe('the roster and the detail page cannot disagree', () => {
  // The worst bug available here: a roster saying "red" and the intern's own page saying "orange"
  // for the same person on the same day. Both look authoritative. So both paths are fed the same
  // underlying facts and required to produce the SAME signal, rather than each being checked
  // against its own expectation.
  const ENR_X = 'enr-x';

  it('produces an identical signal for the same facts through both paths', async () => {
    const events = [
      event(daysAgo(5), 'timeline_card_progress'),
      event(daysAgo(5), 'timeline_card_progress'),
      event(daysAgo(12), 'xp_events'),
    ];
    const beat = daysAgo(8);
    const joined = daysAgo(120);

    // Path 1: the single-intern feed.
    mockTimeline.mockResolvedValue(events);
    db(beat, joined);
    const single = await internActivitySignal(ENR_X, { now: NOW });

    // Path 2: the roster batch, given the same facts already folded into day rows.
    mockActivityDays.mockResolvedValue(daysFromEvents(events).map((d) => ({ ...d, enrollmentId: ENR_X })));
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: ENR_X, last_active_at: beat }], {}])
      .mockResolvedValueOnce([[{ enrollment_id: ENR_X, joined_at: joined }], {}]);
    const batch = (await internActivitySignals([ENR_X], { now: NOW })).get(ENR_X)!;

    expect(batch).toEqual(single);
    // And not vacuously: these facts must actually produce a band and a populated grid.
    expect(single.level).toBe('orange');
    expect(single.days_since).toBe(5);
    expect(single.days.filter((d) => d.events > 0)).toHaveLength(2);
  });
});

describe('folding a feed into day rows', () => {
  it('sums a day and keeps the latest event as that day\'s source', async () => {
    const out = daysFromEvents([
      { ...event('2026-09-28T09:00:00.000Z', 'xp_events'), occurrences: 2 },
      event('2026-09-28T18:00:00.000Z', 'runtime_mentor_turns'),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].events).toBe(3);
    expect(out[0].lastSource).toBe('runtime_mentor_turns');
    expect(out[0].lastAt).toBe('2026-09-28T18:00:00.000Z');
  });

  it('does not let an earlier event overwrite the day\'s winning source', async () => {
    // Order of the feed must not decide the answer.
    const out = daysFromEvents([
      event('2026-09-28T18:00:00.000Z', 'runtime_mentor_turns'),
      event('2026-09-28T09:00:00.000Z', 'xp_events'),
    ]);

    expect(out[0].lastSource).toBe('runtime_mentor_turns');
  });

  it('separates days', async () => {
    const out = daysFromEvents([event('2026-09-28T09:00:00.000Z'), event('2026-09-29T09:00:00.000Z')]);

    expect(out.map((d) => d.date)).toEqual(['2026-09-28', '2026-09-29']);
  });
});

describe('what they were doing, not just that they did something', () => {
  const dayRow = (date: string, events: number, source: string) =>
    ({ date, events, lastAt: `${date}T10:00:00.000Z`, lastSource: source });

  it('maps each source to its track', () => {
    expect(categoryOf('timeline_card_progress')).toBe('training');
    expect(categoryOf('cert_sessions')).toBe('certification');
    expect(categoryOf('student_tasks')).toBe('project');
    expect(categoryOf('community_likes')).toBe('community');
  });

  it('calls an UNKNOWN source "other", never training', () => {
    // A new source silently inflating training is a number nobody checks; a neutral band is a
    // question somebody asks.
    expect(categoryOf('some_new_table')).toBe('other');
    expect(categoryOf(null)).toBe('other');
    expect(categoryOf(undefined)).toBe('other');
  });

  it('splits a day across the tracks the intern touched', () => {
    const out = signalFrom({
      days: [
        dayRow('2026-10-01', 4, 'timeline_card_progress'),
        dayRow('2026-10-01', 2, 'cert_sessions'),
        dayRow('2026-10-01', 1, 'student_tasks'),
        dayRow('2026-10-01', 3, 'community_likes'),
      ],
      heartbeat: null, joinedAt: null, now: NOW,
    });

    const today = out.days.find((d) => d.date === '2026-10-01')!;
    expect(today.events).toBe(10);
    expect(today.by_category).toEqual({ training: 4, project: 1, certification: 2, community: 3, other: 0 });
  });

  it('gives every day all five keys, so a reader never meets undefined', () => {
    const out = signalFrom({ days: [], heartbeat: null, joinedAt: null, now: NOW });

    for (const day of out.days) {
      expect(Object.keys(day.by_category).sort())
        .toEqual(['certification', 'community', 'other', 'project', 'training']);
      expect(day.events).toBe(0);
    }
  });

  it('keeps the category total equal to the day total', () => {
    // If these drift, a stacked bar stops meaning the number beside it.
    const out = signalFrom({
      days: [dayRow('2026-09-30', 5, 'xp_events'), dayRow('2026-09-30', 2, 'mystery_table')],
      heartbeat: null, joinedAt: null, now: NOW,
    });

    const day = out.days.find((d) => d.date === '2026-09-30')!;
    expect(Object.values(day.by_category).reduce((a, b) => a + b, 0)).toBe(day.events);
    expect(day.by_category.other).toBe(2);
  });
});
