const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

import { scheduleForEnrollment, selfPacedAnchor } from '../scheduleForEnrollment';
import { BuildPlan } from '../planContract';

/**
 * A self-paced learner has no cohort, so until this change they fell through an
 * INNER JOIN on `cohorts` and got no due dates at all. Measured on production
 * 2026-10-27: 74.3% of a cohort learner's tasks carried a due date against
 * 10.5% of a cohort-less learner's, and 384 of the 385 cohort-less enrollments
 * had no build plan to date in the first place.
 *
 * The fix is a second anchor, not a second scheduler. These tests hold that
 * line: a cohort learner's dates must not move, and a self-paced learner's
 * dates must be real, reproducible, and not already in the past.
 */

const JULY = '2026-07-23';
const iso = (d: Date) => d.toISOString().slice(0, 10);

const plan = (): BuildPlan => ({
  releases: [
    { key: 'r0', name: 'Release 0', week_start: 1, week_end: 2 },
    { key: 'r1', name: 'Release 1', week_start: 3, week_end: 4 },
  ],
  stories: [
    { id: 'STORY-001', release: 'r0' },
    { id: 'STORY-002', release: 'r0' },
    { id: 'STORY-003', release: 'r1' },
  ],
} as unknown as BuildPlan);

beforeEach(() => mockQuery.mockReset());

describe('selfPacedAnchor', () => {
  it('prefers the publish date, because that is when the programme really starts', () => {
    const published = new Date('2026-11-03T09:00:00.000Z');
    expect(selfPacedAnchor(published, '2026-07-19T00:00:00.000Z')).toEqual(published);
  });

  it('falls back to the signup date when nothing has published yet', () => {
    expect(iso(selfPacedAnchor(null, '2026-07-19T00:00:00.000Z')!)).toBe('2026-07-19');
  });

  it('is null when there is no fixed point at all, rather than reaching for now()', () => {
    expect(selfPacedAnchor(null, null)).toBeNull();
    expect(selfPacedAnchor(null, undefined)).toBeNull();
  });

  it('is null on an unparseable signup date rather than an Invalid Date', () => {
    expect(selfPacedAnchor(null, 'not-a-date')).toBeNull();
  });
});

describe('a cohort learner is untouched', () => {
  it('still anchors on the cohort start date', async () => {
    mockQuery.mockResolvedValue([[{ start_date: JULY, created_at: '2026-05-01T00:00:00.000Z' }]]);
    const s = await scheduleForEnrollment('e1', plan(), null, '2026-07-20T00:00:00.000Z');
    expect(s).not.toBeNull();
    // Week 4 of a Thursday cohort starting 2026-07-23.
    expect(iso(s!.buildStart)).toBe('2026-08-13');
    expect(iso(s!.demoDay)).toBe('2026-10-08');
  });

  it('ignores the signup date entirely when a cohort start exists', async () => {
    mockQuery.mockResolvedValue([[{ start_date: JULY, created_at: '2019-01-01T00:00:00.000Z' }]]);
    const s = await scheduleForEnrollment('e1', plan(), null, '2026-07-20T00:00:00.000Z');
    expect(iso(s!.buildStart)).toBe('2026-08-13');
  });
});

describe('a self-paced learner now gets dates', () => {
  it('anchors on the publish date and produces a real window', async () => {
    mockQuery.mockResolvedValue([[{ start_date: null, created_at: '2026-07-19T00:00:00.000Z' }]]);
    const s = await scheduleForEnrollment('e2', plan(), null, '2026-11-03T00:00:00.000Z');
    expect(s).not.toBeNull();
    // Anchor 2026-11-03 (Tue). Build opens week 4, demo week 12 — the same
    // relative shape a cohort gets, on this learner's own clock.
    expect(iso(s!.buildStart)).toBe('2026-11-24');
    expect(iso(s!.demoDay)).toBe('2027-01-19');
  });

  it('is NOT born overdue when signup long predates the plan', async () => {
    // The whole reason the anchor is the publish date and not the signup date.
    mockQuery.mockResolvedValue([[{ start_date: null, created_at: '2026-07-19T00:00:00.000Z' }]]);
    const publishedAt = new Date('2026-11-03T00:00:00.000Z');
    const s = await scheduleForEnrollment('e2', plan(), null, publishedAt);
    expect(s!.buildStart.getTime()).toBeGreaterThan(publishedAt.getTime());
    expect(s!.demoDay.getTime()).toBeGreaterThan(publishedAt.getTime());
  });

  it('gives the self-paced learner the same window length as a cohort learner', async () => {
    mockQuery.mockResolvedValue([[{ start_date: JULY, created_at: '2026-05-01T00:00:00.000Z' }]]);
    const cohort = await scheduleForEnrollment('e1', plan(), null, JULY);
    mockQuery.mockResolvedValue([[{ start_date: null, created_at: '2026-07-19T00:00:00.000Z' }]]);
    const selfPaced = await scheduleForEnrollment('e2', plan(), null, '2026-11-03T00:00:00.000Z');
    expect(selfPaced!.buildWeeks).toBe(cohort!.buildWeeks);
  });

  it('is reproducible — the same inputs twice give the same dates', async () => {
    const row = [[{ start_date: null, created_at: '2026-07-19T00:00:00.000Z' }]];
    mockQuery.mockResolvedValue(row);
    const a = await scheduleForEnrollment('e2', plan(), null, '2026-11-03T00:00:00.000Z');
    mockQuery.mockResolvedValue(row);
    const b = await scheduleForEnrollment('e2', plan(), null, '2026-11-03T00:00:00.000Z');
    expect(iso(b!.buildStart)).toBe(iso(a!.buildStart));
    expect(iso(b!.demoDay)).toBe(iso(a!.demoDay));
  });

  it('falls back to the signup date when the plan has never published', async () => {
    mockQuery.mockResolvedValue([[{ start_date: null, created_at: '2026-07-19T00:00:00.000Z' }]]);
    const s = await scheduleForEnrollment('e2', plan(), null, null);
    expect(s).not.toBeNull();
    expect(iso(s!.buildStart)).toBe('2026-08-09');
  });
});

describe('the failure paths still return null rather than throwing', () => {
  it('returns null when the enrollment does not exist', async () => {
    mockQuery.mockResolvedValue([[]]);
    await expect(scheduleForEnrollment('nope', plan(), null, null)).resolves.toBeNull();
  });

  it('returns null when there is neither a cohort start nor any anchor', async () => {
    mockQuery.mockResolvedValue([[{ start_date: null, created_at: null }]]);
    await expect(scheduleForEnrollment('e3', plan(), null, null)).resolves.toBeNull();
  });

  it('returns null, not a throw, when the query fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection dropped'));
    await expect(scheduleForEnrollment('e4', plan(), null, null)).resolves.toBeNull();
  });
});

describe('the inner join cannot come back', () => {
  it('LEFT JOINs cohorts and does not filter on start_date in SQL', async () => {
    mockQuery.mockResolvedValue([[{ start_date: JULY, created_at: null }]]);
    await scheduleForEnrollment('e1', plan(), null, JULY);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/LEFT JOIN\s+cohorts/i);
    // The old query carried `AND c.start_date IS NOT NULL`, which is what
    // dropped the cohort-less learner before the row was ever seen.
    expect(sql).not.toMatch(/start_date IS NOT NULL/i);
    expect(sql).toMatch(/e\.created_at/i);
  });
});
