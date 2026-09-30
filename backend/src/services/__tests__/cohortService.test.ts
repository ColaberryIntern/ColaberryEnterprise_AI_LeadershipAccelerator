import { selectNextOpenCohort } from '../cohortService';

type C = { id: string; status: string; start_date: string; created_at?: Date };

// Fixed "now" so the tests are deterministic (matches the real 2026-07-07 state).
const NOW = new Date('2026-07-07T12:00:00Z');

describe('selectNextOpenCohort', () => {
  it('picks the soonest upcoming open cohort, not the farthest-out (the Nov-vs-Jul bug)', () => {
    const cohorts: C[] = [
      { id: 'jul', status: 'open', start_date: '2026-07-23' },
      { id: 'nov', status: 'open', start_date: '2026-11-05' },
      { id: 'apr', status: 'completed', start_date: '2026-04-14' },
    ];
    expect(selectNextOpenCohort(cohorts, NOW)?.id).toBe('jul');
  });

  it('ignores cohorts that are not open', () => {
    const cohorts: C[] = [
      { id: 'jul-closed', status: 'closed', start_date: '2026-07-23' },
      { id: 'nov', status: 'open', start_date: '2026-11-05' },
    ];
    expect(selectNextOpenCohort(cohorts, NOW)?.id).toBe('nov');
  });

  it('treats a cohort starting today as upcoming (boundary)', () => {
    const cohorts: C[] = [
      { id: 'today', status: 'open', start_date: '2026-07-07' },
      { id: 'later', status: 'open', start_date: '2026-09-01' },
    ];
    expect(selectNextOpenCohort(cohorts, NOW)?.id).toBe('today');
  });

  it('falls back to the most-recently-started open cohort when all have already started', () => {
    const cohorts: C[] = [
      { id: 'jan', status: 'open', start_date: '2026-01-10' },
      { id: 'jun', status: 'open', start_date: '2026-06-01' },
    ];
    expect(selectNextOpenCohort(cohorts, NOW)?.id).toBe('jun');
  });

  it('falls back to the most recently created cohort when none are open', () => {
    const cohorts: C[] = [
      { id: 'old', status: 'completed', start_date: '2026-01-10', created_at: new Date('2026-01-01') },
      { id: 'new', status: 'completed', start_date: '2026-03-10', created_at: new Date('2026-03-01') },
    ];
    expect(selectNextOpenCohort(cohorts, NOW)?.id).toBe('new');
  });

  it('returns null for an empty cohort list', () => {
    expect(selectNextOpenCohort([], NOW)).toBeNull();
  });

  it('does not mutate the input array order', () => {
    const cohorts: C[] = [
      { id: 'nov', status: 'open', start_date: '2026-11-05' },
      { id: 'jul', status: 'open', start_date: '2026-07-23' },
    ];
    selectNextOpenCohort(cohorts, NOW);
    expect(cohorts.map((c) => c.id)).toEqual(['nov', 'jul']);
  });
});
