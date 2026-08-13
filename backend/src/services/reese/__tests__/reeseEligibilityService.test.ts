/**
 * Reese Phase 2 — pilot-cohort eligibility gate tests. This is the boundary
 * the task brief explicitly requires be unit-tested: a student in the pilot
 * cohort is eligible, an otherwise-identical student outside it is not, and
 * every ambiguous/missing-data case fails CLOSED (not open) since this gates
 * autonomous outbound contact with a real person.
 */
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findByPk: jest.fn() }));

import AiAgent from '../../../models/AiAgent';
import Enrollment from '../../../models/Enrollment';
import { getPilotCohortIds, isEligibleForAutonomousOutreach } from '../reeseEligibilityService';
import { REESE_AGENT_NAME } from '../reeseIdentitySeed';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockEnrollmentFindByPk = Enrollment.findByPk as unknown as jest.Mock;

const PILOT_COHORT_ID = 'cohort-july-2026';
const OTHER_COHORT_ID = 'cohort-november-2026';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPilotCohortIds', () => {
  it('reads the real pilot_cohort_ids array off the Reese AiAgent registry row', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: [PILOT_COHORT_ID] } });
    const ids = await getPilotCohortIds();
    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: REESE_AGENT_NAME } });
    expect(ids).toEqual([PILOT_COHORT_ID]);
  });

  it('fail-closed: returns [] (not a thrown error, not a fabricated default) when no AiAgent row exists', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    expect(await getPilotCohortIds()).toEqual([]);
  });

  it('fail-closed: returns [] when config.pilot_cohort_ids is missing entirely', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: {} });
    expect(await getPilotCohortIds()).toEqual([]);
  });

  it('fail-closed: returns [] when config.pilot_cohort_ids is not an array (defensive against malformed JSONB)', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: 'not-an-array' } });
    expect(await getPilotCohortIds()).toEqual([]);
  });

  it('filters out non-string / empty entries rather than passing malformed ids through', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: [PILOT_COHORT_ID, '', null, 42] } });
    expect(await getPilotCohortIds()).toEqual([PILOT_COHORT_ID]);
  });
});

describe('isEligibleForAutonomousOutreach — the boundary the task brief requires', () => {
  beforeEach(() => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: [PILOT_COHORT_ID] } });
  });

  it('IN pilot cohort + active -> eligible', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e1', cohort_id: PILOT_COHORT_ID, status: 'active' });
    const result = await isEligibleForAutonomousOutreach('e1');
    expect(result).toEqual({ eligible: true, reason: 'in_pilot_cohort_and_active' });
  });

  it('OUT of pilot cohort (identical signal scenario, different cohort_id) -> NOT eligible, real reason, no ambiguity', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e2', cohort_id: OTHER_COHORT_ID, status: 'active' });
    const result = await isEligibleForAutonomousOutreach('e2');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_in_pilot_cohort');
  });

  it('in pilot cohort but withdrawn -> not eligible', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e3', cohort_id: PILOT_COHORT_ID, status: 'withdrawn' });
    const result = await isEligibleForAutonomousOutreach('e3');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('enrollment_status_withdrawn');
  });

  it('enrollment not found -> not eligible (never throws for a bad id)', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    const result = await isEligibleForAutonomousOutreach('nonexistent');
    expect(result).toEqual({ eligible: false, reason: 'enrollment_not_found' });
  });

  it('cohort_id is null (free/guest account) -> not eligible, not a crash', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e4', cohort_id: null, status: 'active' });
    const result = await isEligibleForAutonomousOutreach('e4');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_in_pilot_cohort');
  });

  it('fail-closed: no pilot cohort configured at all -> NOBODY is eligible, even an otherwise-perfect active student', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: {} });
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'e5', cohort_id: PILOT_COHORT_ID, status: 'active' });
    const result = await isEligibleForAutonomousOutreach('e5');
    expect(result).toEqual({ eligible: false, reason: 'no_pilot_cohort_configured' });
    // Fail-closed also means it never even needs to look up the enrollment —
    // cheap short-circuit, and proves the gate really is closed by default.
    expect(mockEnrollmentFindByPk).not.toHaveBeenCalled();
  });
});
