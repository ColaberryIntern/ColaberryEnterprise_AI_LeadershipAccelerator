import { parseCoreTime, resolveSchedule } from '../sessionGenerationService';

// Live Sessions build-out (Session CC-20260721-s7h4). Pure-logic coverage for the
// schedule-reconciliation added in Phase 1: parseCoreTime + resolveSchedule.

describe('parseCoreTime', () => {
  it('parses "1:00–3:00 PM CT" (en-dash, single trailing meridiem) to 24h', () => {
    expect(parseCoreTime('1:00–3:00 PM CT')).toEqual({ start_time: '13:00', end_time: '15:00' });
  });

  it('parses a hyphen + EST variant identically', () => {
    expect(parseCoreTime('1:00-3:00 PM EST')).toEqual({ start_time: '13:00', end_time: '15:00' });
  });

  it('honors both meridiems when the span crosses noon', () => {
    expect(parseCoreTime('10:00 AM–12:00 PM')).toEqual({ start_time: '10:00', end_time: '12:00' });
  });

  it('parses an all-morning span', () => {
    expect(parseCoreTime('9:00 AM - 11:00 AM')).toEqual({ start_time: '09:00', end_time: '11:00' });
  });

  it('handles the 12 AM midnight boundary', () => {
    expect(parseCoreTime('12:00 AM - 1:00 AM')).toEqual({ start_time: '00:00', end_time: '01:00' });
  });

  it('falls back to 13:00–15:00 for undefined input', () => {
    expect(parseCoreTime(undefined)).toEqual({ start_time: '13:00', end_time: '15:00' });
  });

  it('falls back for an unparseable string', () => {
    expect(parseCoreTime('TBD')).toEqual({ start_time: '13:00', end_time: '15:00' });
  });
});

describe('resolveSchedule', () => {
  it('prefers an explicit settings_json.schedule', () => {
    const cohort = {
      core_day: 'Thursday',
      settings_json: {
        schedule: {
          recurring_days: ['Monday'],
          core_days: ['Monday'],
          start_time: '09:00',
          end_time: '11:00',
          total_sessions: 5,
        },
      },
    };
    expect(resolveSchedule(cohort)).toEqual({
      recurring_days: ['Monday'],
      core_days: ['Monday'],
      start_time: '09:00',
      end_time: '11:00',
      total_sessions: 5,
    });
  });

  it('fills missing explicit times from core_time', () => {
    const cohort = {
      core_time: '2:00–4:00 PM CT',
      settings_json: { schedule: { recurring_days: ['Monday'], total_sessions: 5 } },
    };
    const s = resolveSchedule(cohort);
    expect(s.start_time).toBe('14:00');
    expect(s.end_time).toBe('16:00');
    expect(s.total_sessions).toBe(5);
  });

  it('derives a two-day schedule from top-level fields (the seedCohorts shape)', () => {
    const cohort = {
      core_day: 'Thursday',
      optional_lab_day: 'Tuesday',
      core_time: '1:00–3:00 PM CT',
      settings_json: null,
    };
    expect(resolveSchedule(cohort)).toEqual({
      recurring_days: ['Thursday', 'Tuesday'],
      core_days: ['Thursday'],
      start_time: '13:00',
      end_time: '15:00',
      total_sessions: 24, // 2 days × 12 program weeks
    });
  });

  it('derives a core-only schedule (12 sessions) when there is no lab day', () => {
    const cohort = { core_day: 'Thursday', core_time: '1:00–3:00 PM CT' };
    const s = resolveSchedule(cohort);
    expect(s.recurring_days).toEqual(['Thursday']);
    expect(s.total_sessions).toBe(12);
  });

  it('returns an empty, non-generatable schedule for a cohort with no schedule fields', () => {
    const s = resolveSchedule({});
    expect(s.recurring_days).toEqual([]);
    expect(s.total_sessions).toBe(0);
  });
});
