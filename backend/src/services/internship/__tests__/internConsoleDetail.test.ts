/**
 * One intern's detail panel.
 *
 * The guarantee worth most here is not what it adds but what it reuses: the headline row IS the
 * roster's row, scoped to one enrollment through the same loader. A detail page that assembled its
 * own copy could say "red" while the roster says "orange" about the same person on the same day,
 * and a disagreement between two authoritative-looking numbers is harder to notice and harder to
 * explain than either being wrong on its own.
 *
 * It also makes the 404 mean something: "not an active intern" is decided by the roster's own
 * predicate, so a non-intern enrollment cannot be opened by guessing an id.
 */
const mockRoster = jest.fn();
const mockSections = jest.fn();
const mockAttempts = jest.fn();
const mockStanding = jest.fn();
const mockTimeline = jest.fn();

jest.mock('../internConsoleRoster', () => ({ getConsoleRoster: (...a: unknown[]) => mockRoster(...a) }));
jest.mock('../internshipCertification', () => ({
  certAttempts: (...a: unknown[]) => mockAttempts(...a),
  internCertification: (...a: unknown[]) => mockStanding(...a),
}));
jest.mock('../../curriculumCompletionService', () => ({
  getStudentSectionBreakdown: (...a: unknown[]) => mockSections(...a),
}));
jest.mock('../../adminOs/personTimelineService', () => ({
  getPersonTimeline: (...a: unknown[]) => mockTimeline(...a),
}));

import { getInternConsoleDetail, FEED_LIMIT } from '../internConsoleDetail';

const ENR = 'enr-1';
const COHORT = 'cohort-1';
const NOW = new Date('2026-10-01T12:00:00Z');

const rosterRow = (over: Record<string, unknown> = {}) => ({
  enrollment_id: ENR,
  name: 'Quincy Nkwain Ninying',
  email: 'quincy@example.com',
  application_state: 'active',
  joined_at: '2026-10-01T00:00:00.000Z',
  day: 1,
  cohort: { id: COHORT, name: 'Cohort - July 2026', type: 'accelerator' },
  activity: {
    last_activity_at: '2026-10-01T10:00:00.000Z', last_activity_source: 'student_skill_evidence',
    days_since: 0, level: 'green', days: [], graced: false,
  },
  training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: null },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
});

const SERIES = { attempts: [{ completed_at: '2026-09-01T00:00:00.000Z', mode: 'practice', scaled_score: 700, items: 10, correct: 7 }], passing_scaled_score: 720 };
const STANDING = { readiness: { state: 'building', overall_scaled: 650 }, official: { status: 'none' } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockRoster.mockResolvedValue([rosterRow()]);
  mockSections.mockResolvedValue({ enrollmentId: ENR, name: 'Quincy', scheduledWeek: 6, rows: [] });
  mockAttempts.mockResolvedValue(SERIES);
  mockStanding.mockResolvedValue(STANDING);
  mockTimeline.mockResolvedValue([]);
});
afterEach(() => (console.warn as jest.Mock).mockRestore?.());

describe('who can be opened', () => {
  it('answers null for an enrollment that is not an active intern', async () => {
    // The roster's predicate decides. An empty shell instead of null would render as "this intern
    // has done nothing", which is a claim about a real person.
    mockRoster.mockResolvedValue([]);

    expect(await getInternConsoleDetail('someone-else', { now: NOW })).toBeNull();
  });

  it('does no further work for an enrollment it will not answer for', async () => {
    mockRoster.mockResolvedValue([]);

    await getInternConsoleDetail('someone-else', { now: NOW });

    expect(mockSections).not.toHaveBeenCalled();
    expect(mockAttempts).not.toHaveBeenCalled();
    expect(mockTimeline).not.toHaveBeenCalled();
  });

  it('answers null for a missing id without querying', async () => {
    expect(await getInternConsoleDetail('', { now: NOW })).toBeNull();
    expect(mockRoster).not.toHaveBeenCalled();
  });
});

describe('the headline row is the roster\'s own row', () => {
  it('asks the roster loader, scoped to this one enrollment', async () => {
    await getInternConsoleDetail(ENR, { now: NOW });

    expect(mockRoster).toHaveBeenCalledWith({ now: NOW, enrollmentIds: [ENR] });
  });

  it('cannot be made to answer for the wrong intern — the scope is load-bearing', async () => {
    // Asserting the ARGUMENT is not enough: an unscoped lookup would return the first intern for
    // every id, and the 404 would never fire. So this mock honours the scope, and the test needs
    // both halves — null for a stranger AND the real row for the real id. An unscoped call fails
    // the second half.
    mockRoster.mockImplementation(({ enrollmentIds }: { enrollmentIds?: readonly string[] }) =>
      Promise.resolve((enrollmentIds ?? []).includes(ENR) ? [rosterRow()] : []));

    expect(await getInternConsoleDetail('a-different-enrollment', { now: NOW })).toBeNull();
    expect((await getInternConsoleDetail(ENR, { now: NOW }))!.intern.enrollment_id).toBe(ENR);
  });

  it('returns that row unchanged rather than rebuilding it', async () => {
    // Byte-for-byte the roster's row. Anything else is a second implementation waiting to disagree.
    const row = rosterRow({ activity: { last_activity_at: null, last_activity_source: null, days_since: null, level: 'unknown', days: [], graced: false } });
    mockRoster.mockResolvedValue([row]);

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.intern).toEqual(row);
  });
});

describe('what the detail adds', () => {
  it('asks for the per-section breakdown with the intern\'s own cohort', async () => {
    await getInternConsoleDetail(ENR, { now: NOW });

    expect(mockSections).toHaveBeenCalledWith(COHORT, ENR);
  });

  it('carries the section rows and the cohort\'s scheduled week', async () => {
    mockSections.mockResolvedValue({
      enrollmentId: ENR, name: 'Quincy', scheduledWeek: 6,
      rows: [{ week: 1, sections: [], publishedCardCount: 4, completed: 2, completedPct: 50, weekDone: true }],
    });

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.training_sections).toHaveLength(1);
    expect(out!.scheduled_week).toBe(6);
  });

  it('asks for no section breakdown at all when the intern is in no cohort', async () => {
    // There is nothing to compare them against, and passing a null cohort id would query for a
    // cohort that does not exist and read as "no training".
    mockRoster.mockResolvedValue([rosterRow({ cohort: { id: null, name: null, type: null } })]);

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(mockSections).not.toHaveBeenCalled();
    expect(out!.training_sections).toBeNull();
    expect(out!.scheduled_week).toBeNull();
  });

  it('carries the cert series and the readiness/claim pair as separate facts', async () => {
    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.cert.series).toEqual(SERIES);
    expect(out!.cert.standing).toEqual(STANDING);
  });

  it('keeps each cert point\'s item count, so the trend stays interpretable', async () => {
    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.cert.series.attempts[0]).toMatchObject({ scaled_score: 700, items: 10, correct: 7 });
  });

  it('asks the timeline for this intern\'s own work only, with a bounded feed', async () => {
    await getInternConsoleDetail(ENR, { now: NOW });

    const q = mockTimeline.mock.calls[0][0];
    expect(q.enrollmentIds).toEqual([ENR]);
    expect(q.leadIds).toEqual([]);
    expect(q.domains).toEqual(['learning', 'community']);
    expect(q.limit).toBe(FEED_LIMIT);
  });

  it('carries feed entries with the fields a reader needs to trace them', async () => {
    mockTimeline.mockResolvedValue([
      { occurredAt: '2026-09-30T10:00:00.000Z', domain: 'learning', source: 'timeline_card_progress', type: 'card_completed', summary: 'Week 6 Build', occurrences: 1 },
    ]);

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.feed[0]).toMatchObject({
      occurredAt: '2026-09-30T10:00:00.000Z', type: 'card_completed',
      summary: 'Week 6 Build', source: 'timeline_card_progress',
    });
  });
});

describe('no attendance here either', () => {
  it('carries no attendance anywhere in the detail', async () => {
    mockSections.mockResolvedValue({ enrollmentId: ENR, name: 'Q', scheduledWeek: 6, rows: [] });

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    const body = JSON.stringify(out).toLowerCase();
    expect(body).not.toContain('attend');
    expect(body).not.toContain('meeting');
  });
});

describe('fail-soft per source', () => {
  it('still returns the panel when the cert series throws', async () => {
    // One regressed query must not blank an intern's whole page.
    mockAttempts.mockRejectedValue(new Error('cert exploded'));

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.intern.name).toBe('Quincy Nkwain Ninying');
    expect(out!.cert.series.attempts).toEqual([]);
    expect(out!.feed).toEqual([]);
  });

  it('still returns the panel when the section breakdown throws', async () => {
    mockSections.mockRejectedValue(new Error('sections exploded'));

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.training_sections).toBeNull();
    expect(out!.cert.series).toEqual(SERIES);
  });

  it('still returns the panel when the timeline throws', async () => {
    mockTimeline.mockRejectedValue(new Error('timeline exploded'));

    const out = await getInternConsoleDetail(ENR, { now: NOW });

    expect(out!.feed).toEqual([]);
    expect(out!.intern.enrollment_id).toBe(ENR);
  });
});
