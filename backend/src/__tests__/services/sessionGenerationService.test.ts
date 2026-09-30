/**
 * sessionGenerationService — covers the new per-day time-override support
 * (day_times) added for the multi-day/multi-time cohort schedule feature.
 * Regression coverage: every cohort with no day_times set must behave
 * byte-identically to before (the single shared start_time/end_time path).
 */

const mockCohortFindByPk = jest.fn();
const mockLiveSessionDestroy = jest.fn();
const mockLiveSessionCreate = jest.fn();

jest.mock('../../models', () => ({
  Cohort: { findByPk: mockCohortFindByPk },
  LiveSession: { destroy: mockLiveSessionDestroy, create: mockLiveSessionCreate },
}));

import { resolveSchedule, generateSessionsFromCohort } from '../../services/sessionGenerationService';

describe('resolveSchedule', () => {
  it('passes through explicit day_times when an explicit schedule is present', () => {
    const cohort = {
      core_day: null,
      optional_lab_day: null,
      core_time: null,
      settings_json: {
        schedule: {
          recurring_days: ['Tuesday', 'Saturday'],
          core_days: ['Tuesday', 'Saturday'],
          total_sessions: 24,
          start_time: '18:00',
          end_time: '19:30',
          day_times: { Tuesday: { start_time: '18:00', end_time: '19:30' }, Saturday: { start_time: '10:00', end_time: '11:30' } },
        },
      },
    };
    const schedule = resolveSchedule(cohort);
    expect(schedule.day_times).toEqual({
      Tuesday: { start_time: '18:00', end_time: '19:30' },
      Saturday: { start_time: '10:00', end_time: '11:30' },
    });
  });

  it('regression: a cohort with no explicit schedule (legacy core_day path) has no day_times at all', () => {
    const cohort = { core_day: 'Thursday', optional_lab_day: null, core_time: '1:00-3:00 PM', settings_json: null };
    const schedule = resolveSchedule(cohort);
    expect(schedule.day_times).toBeUndefined();
  });

  it('regression: an explicit schedule that never set day_times leaves it undefined, not an empty object', () => {
    const cohort = {
      core_day: null, optional_lab_day: null, core_time: null,
      settings_json: { schedule: { recurring_days: ['Monday'], core_days: ['Monday'], total_sessions: 12, start_time: '13:00', end_time: '15:00' } },
    };
    const schedule = resolveSchedule(cohort);
    expect(schedule.day_times).toBeUndefined();
  });
});

describe('generateSessionsFromCohort — per-day time', () => {
  beforeEach(() => {
    mockCohortFindByPk.mockReset();
    mockLiveSessionDestroy.mockReset().mockResolvedValue(0);
    mockLiveSessionCreate.mockReset().mockImplementation(async (data: any) => data);
  });

  it('uses each recurring day\'s own time from day_times, not one shared time', async () => {
    mockCohortFindByPk.mockResolvedValue({
      id: 'c1',
      name: 'Test Cohort',
      start_date: '2026-08-04', // a Tuesday
      core_day: null, optional_lab_day: null, core_time: null,
      settings_json: {
        schedule: {
          recurring_days: ['Tuesday', 'Saturday'],
          core_days: ['Tuesday', 'Saturday'],
          total_sessions: 2,
          start_time: '13:00',
          end_time: '15:00', // shared fallback — should NOT be used since day_times covers both days
          day_times: { Tuesday: { start_time: '18:00', end_time: '19:30' }, Saturday: { start_time: '10:00', end_time: '11:30' } },
        },
      },
    });

    const result = await generateSessionsFromCohort('c1');

    expect(result.sessions).toHaveLength(2);
    const tue = result.sessions.find((s: any) => s.session_date === '2026-08-04');
    const sat = result.sessions.find((s: any) => s.session_date === '2026-08-08');
    expect(tue.start_time).toBe('18:00:00');
    expect(tue.end_time).toBe('19:30:00');
    expect(sat.start_time).toBe('10:00:00');
    expect(sat.end_time).toBe('11:30:00');
  });

  it('regression: with no day_times, every generated session uses the one shared start_time/end_time (pre-existing behavior unchanged)', async () => {
    mockCohortFindByPk.mockResolvedValue({
      id: 'c2',
      name: 'Legacy Cohort',
      start_date: '2026-08-06', // a Thursday
      core_day: 'Thursday', optional_lab_day: null, core_time: '1:00-3:00 PM',
      settings_json: null,
    });

    const result = await generateSessionsFromCohort('c2');

    expect(result.sessions.length).toBeGreaterThan(0);
    for (const s of result.sessions as any[]) {
      expect(s.start_time).toBe('13:00:00');
      expect(s.end_time).toBe('15:00:00');
    }
  });

  it('boundary: a recurring day present but missing from day_times falls back to the shared time for that day only', async () => {
    mockCohortFindByPk.mockResolvedValue({
      id: 'c3',
      name: 'Partial Map Cohort',
      start_date: '2026-08-04', // a Tuesday
      core_day: null, optional_lab_day: null, core_time: null,
      settings_json: {
        schedule: {
          recurring_days: ['Tuesday', 'Saturday'],
          core_days: ['Tuesday', 'Saturday'],
          total_sessions: 2,
          start_time: '13:00',
          end_time: '15:00',
          day_times: { Tuesday: { start_time: '18:00', end_time: '19:30' } }, // Saturday intentionally missing
        },
      },
    });

    const result = await generateSessionsFromCohort('c3');

    const tue = result.sessions.find((s: any) => s.session_date === '2026-08-04') as any;
    const sat = result.sessions.find((s: any) => s.session_date === '2026-08-08') as any;
    expect(tue.start_time).toBe('18:00:00'); // has its own override
    expect(sat.start_time).toBe('13:00:00'); // falls back to shared start_time
    expect(sat.end_time).toBe('15:00:00');
  });
});
