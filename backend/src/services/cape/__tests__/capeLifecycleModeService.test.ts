import { getLifecycleMode } from '../capeLifecycleModeService';
import { getLearnerState } from '../capeLearnerStateService';
import { sequelize } from '../../../config/database';

jest.mock('../capeLearnerStateService', () => ({ getLearnerState: jest.fn() }));
// sequelize.query is spied on (not wholesale-mocked) since config/database's
// real instance shape is needed elsewhere in this module's import chain —
// same convention as todayFeedComposer.capeFlagOn.test.ts.
const mockQuery = jest.spyOn(sequelize, 'query');

const mockGetLearnerState = getLearnerState as unknown as jest.Mock;

function state(overrides: Record<string, any> = {}) {
  return {
    enrollment_id: 'enr-1', skills: [], overall_placement: 0, overall_proficiency: 0,
    goal: null, role: null, industry: null, has_resume: false, recent_failure: false,
    learner_state_version: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-08-04T12:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getLifecycleMode — boundary cases', () => {
  it('brand-new learner: no resume, zero placement, NO impressions ever served (null days) -> foundation, NEVER returning_after_absence', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: false, overall_placement: 0 }));
    mockQuery.mockResolvedValueOnce([{ last_served: null }] as any);

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.mode).toBe('foundation');
    expect(result.days_since_last_activity).toBeNull();
  });

  it('returning_after_absence takes PRIORITY over every other signal — even an architect-track learner gets the gentle restart after 14+ days', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: true, overall_placement: 90, overall_proficiency: 80 }));
    mockQuery.mockResolvedValueOnce([{ last_served: new Date('2026-07-20T00:00:00.000Z') }] as any); // 15 days before NOW

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.mode).toBe('returning_after_absence');
    expect(result.days_since_last_activity).toBe(15);
  });

  it('13 days since last activity does NOT trigger returning_after_absence (boundary: just under the 14-day threshold)', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: false, overall_placement: 0 }));
    mockQuery.mockResolvedValueOnce([{ last_served: new Date('2026-07-22T12:00:00.000Z') }] as any); // exactly 13 days before NOW

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.days_since_last_activity).toBe(13);
    expect(result.mode).toBe('foundation');
  });

  it('experienced_cold_start: has resume, low verified proficiency', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: true, overall_placement: 55, overall_proficiency: 10 }));
    mockQuery.mockResolvedValueOnce([{ last_served: new Date('2026-08-04T00:00:00.000Z') }] as any);

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.mode).toBe('experienced_cold_start');
  });

  it('architect_track: high verified proficiency', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: true, overall_proficiency: 70 }));
    mockQuery.mockResolvedValueOnce([{ last_served: new Date('2026-08-04T00:00:00.000Z') }] as any);

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.mode).toBe('architect_track');
  });

  it('active_builder: default fallback (some evidence, mid-range proficiency)', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: true, overall_placement: 40, overall_proficiency: 35 }));
    mockQuery.mockResolvedValueOnce([{ last_served: new Date('2026-08-04T00:00:00.000Z') }] as any);

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.mode).toBe('active_builder');
  });

  it('failure/boundary: the activity-lookup query throwing fails soft to null days (never blocks classification, never throws)', async () => {
    mockGetLearnerState.mockResolvedValue(state({ has_resume: false, overall_placement: 0 }));
    mockQuery.mockRejectedValueOnce(new Error('connection timeout'));

    const result = await getLifecycleMode('enr-1', NOW);
    expect(result.days_since_last_activity).toBeNull();
    expect(result.mode).toBe('foundation');
  });

  it('propagates a genuine getLearnerState failure (the skill ledger is not optional input)', async () => {
    mockGetLearnerState.mockRejectedValue(new Error('skill ledger read failed'));
    await expect(getLifecycleMode('enr-1', NOW)).rejects.toThrow('skill ledger read failed');
  });
});
