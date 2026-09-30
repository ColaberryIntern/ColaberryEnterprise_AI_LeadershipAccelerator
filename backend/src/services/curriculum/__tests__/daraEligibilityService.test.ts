/**
 * Dara v2 Phase 5 — pilot-cohort eligibility gate for targeted research.
 * Mirrors reeseEligibilityService.test.ts's real, proven boundary set: a
 * student in the pilot cohort is eligible, an otherwise-identical student
 * outside it is not, and every ambiguous/missing-data case fails CLOSED.
 */
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findByPk: jest.fn() }));

import AiAgent from '../../../models/AiAgent';
import Enrollment from '../../../models/Enrollment';
import { getDaraPilotCohortIds, isEligibleForTargetedResearch } from '../daraEligibilityService';
import { DARA_AGENT_NAME } from '../daraIdentitySeed';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockEnrollmentFindByPk = Enrollment.findByPk as unknown as jest.Mock;

const PILOT_COHORT_ID = 'cohort-july-2026';
const OTHER_COHORT_ID = 'cohort-november-2026';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDaraPilotCohortIds', () => {
  it('reads the real pilot_cohort_ids array off Dara\'s own AiAgent registry row', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: [PILOT_COHORT_ID] } });
    const ids = await getDaraPilotCohortIds();
    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: DARA_AGENT_NAME } });
    expect(ids).toEqual([PILOT_COHORT_ID]);
  });

  it('fail-closed: returns [] (not a thrown error, not a fabricated default) when no AiAgent row exists', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    expect(await getDaraPilotCohortIds()).toEqual([]);
  });

  it('fail-closed: returns [] when config.pilot_cohort_ids is missing entirely (the real, current state of Dara\'s row)', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: {} });
    expect(await getDaraPilotCohortIds()).toEqual([]);
  });

  it('fail-closed: returns [] when config.pilot_cohort_ids is not an array (defensive against malformed JSONB)', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: 'not-an-array' } });
    expect(await getDaraPilotCohortIds()).toEqual([]);
  });

  it('filters out non-string / empty entries rather than passing malformed ids through', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: [PILOT_COHORT_ID, '', null, 42] } });
    expect(await getDaraPilotCohortIds()).toEqual([PILOT_COHORT_ID]);
  });
});

describe('isEligibleForTargetedResearch', () => {
  beforeEach(() => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: [PILOT_COHORT_ID] } });
  });

  it('IN pilot cohort + active -> eligible', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e1', cohort_id: PILOT_COHORT_ID, status: 'active' });
    const result = await isEligibleForTargetedResearch('e1');
    expect(result).toEqual({ eligible: true, reason: 'in_pilot_cohort_and_active' });
  });

  it('OUT of pilot cohort (identical signal scenario, different cohort_id) -> NOT eligible, real reason, no ambiguity', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e2', cohort_id: OTHER_COHORT_ID, status: 'active' });
    const result = await isEligibleForTargetedResearch('e2');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_in_pilot_cohort');
  });

  it('in pilot cohort but withdrawn -> not eligible', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e3', cohort_id: PILOT_COHORT_ID, status: 'withdrawn' });
    const result = await isEligibleForTargetedResearch('e3');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('enrollment_status_withdrawn');
  });

  it('enrollment not found -> not eligible (never throws for a bad id)', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    const result = await isEligibleForTargetedResearch('nonexistent');
    expect(result).toEqual({ eligible: false, reason: 'enrollment_not_found' });
  });

  it('cohort_id is null -> not eligible, not a crash', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e4', cohort_id: null, status: 'active' });
    const result = await isEligibleForTargetedResearch('e4');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_in_pilot_cohort');
  });

  it('fail-closed: no pilot cohort configured at all (Dara\'s real, current default) -> NOBODY is eligible, even an otherwise-perfect active student', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: {} });
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e5', cohort_id: PILOT_COHORT_ID, status: 'active' });
    const result = await isEligibleForTargetedResearch('e5');
    expect(result).toEqual({ eligible: false, reason: 'no_pilot_cohort_configured' });
    expect(mockEnrollmentFindByPk).not.toHaveBeenCalled();
  });
});
