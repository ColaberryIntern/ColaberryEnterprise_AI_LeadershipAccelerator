/**
 * Dara v2 Phase 5 — targeted research sweep. Proves the real safety
 * boundaries: fail-closed with no pilot cohort, re-verified eligibility per
 * candidate (never trusts the candidate query alone), no signal -> no flag,
 * an already-open flag for the same student is never duplicated, and the
 * per-sweep cap is honored.
 */
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/WorkforceTask', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../daraEligibilityService', () => ({ getDaraPilotCohortIds: jest.fn(), isEligibleForTargetedResearch: jest.fn() }));
jest.mock('../daraSignalService', () => ({ evaluateCertificationRiskSignal: jest.fn() }));
jest.mock('../../reese/resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import WorkforceTask from '../../../models/WorkforceTask';
import { getDaraPilotCohortIds, isEligibleForTargetedResearch } from '../daraEligibilityService';
import { evaluateCertificationRiskSignal } from '../daraSignalService';
import { resolveStudentDisplayName } from '../../reese/resolveStudentDisplayName';
import { runDaraTargetedResearchSweep, MAX_FLAGGED_PER_SWEEP } from '../daraResearchService';

const mockEnrollmentFindAll = Enrollment.findAll as unknown as jest.Mock;
const mockTaskFindOne = WorkforceTask.findOne as unknown as jest.Mock;
const mockTaskCreate = WorkforceTask.create as unknown as jest.Mock;
const mockGetPilotCohortIds = getDaraPilotCohortIds as unknown as jest.Mock;
const mockIsEligible = isEligibleForTargetedResearch as unknown as jest.Mock;
const mockEvaluateSignal = evaluateCertificationRiskSignal as unknown as jest.Mock;
const mockResolveStudentDisplayName = resolveStudentDisplayName as unknown as jest.Mock;

const enrollment = (id: string) => ({ id });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPilotCohortIds.mockResolvedValue(['cohort-1']);
  mockEnrollmentFindAll.mockResolvedValue([enrollment('e1')]);
  mockIsEligible.mockResolvedValue({ eligible: true, reason: 'in_pilot_cohort_and_active' });
  mockEvaluateSignal.mockResolvedValue({ type: 'certification_readiness_risk', passProbability: 0.4, weakDomains: ['Testing'] });
  mockTaskFindOne.mockResolvedValue(null);
  mockTaskCreate.mockResolvedValue({ id: 'task-1' });
  mockResolveStudentDisplayName.mockResolvedValue('Jordan Rivera');
});

describe('runDaraTargetedResearchSweep', () => {
  it('fail-closed: no pilot cohort configured -> does not run, never even queries candidates', async () => {
    mockGetPilotCohortIds.mockResolvedValue([]);

    const result = await runDaraTargetedResearchSweep();

    expect(result).toEqual({ ran: false, flagged: 0, skipped: {}, reason: 'no_pilot_cohort_configured' });
    expect(mockEnrollmentFindAll).not.toHaveBeenCalled();
  });

  it('happy path: an eligible, at-risk student with no existing open flag gets a real WorkforceTask, keyed on a stable per-student rec key', async () => {
    const result = await runDaraTargetedResearchSweep();

    expect(result.ran).toBe(true);
    expect(result.flagged).toBe(1);
    expect(mockTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
      employee_slug: 'certification',
      status: 'assigned',
      approver: 'chief_of_staff',
      source_rec_key: 'dara.certification_risk.e1', // gitleaks:allow — a dedup key string, not a secret
    }));
    expect(mockTaskCreate.mock.calls[0][0].title).toContain('Jordan Rivera');
  });

  it('re-verifies eligibility PER candidate independently — never trusts the candidate query alone (same shape as Reese\'s own sweep)', async () => {
    await runDaraTargetedResearchSweep();

    expect(mockIsEligible).toHaveBeenCalledWith('e1');
  });

  it('boundary: candidate fails the independent eligibility re-check -> skipped, never flagged, never even evaluates a signal', async () => {
    mockIsEligible.mockResolvedValue({ eligible: false, reason: 'enrollment_status_withdrawn' });

    const result = await runDaraTargetedResearchSweep();

    expect(result.flagged).toBe(0);
    expect(result.skipped).toEqual({ enrollment_status_withdrawn: 1 });
    expect(mockEvaluateSignal).not.toHaveBeenCalled();
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('boundary: no signal for an eligible student -> skipped, no fabricated flag', async () => {
    mockEvaluateSignal.mockResolvedValue(null);

    const result = await runDaraTargetedResearchSweep();

    expect(result.flagged).toBe(0);
    expect(result.skipped).toEqual({ no_signal: 1 });
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('idempotency: an already-OPEN flag for the same student\'s rec key is never duplicated', async () => {
    mockTaskFindOne.mockResolvedValue({ id: 'existing-task-1' });

    const result = await runDaraTargetedResearchSweep();

    expect(result.flagged).toBe(0);
    expect(result.skipped).toEqual({ already_flagged_open: 1 });
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('per-sweep cap: stops creating new flags once MAX_FLAGGED_PER_SWEEP is reached, rest counted as skipped', async () => {
    const candidates = Array.from({ length: MAX_FLAGGED_PER_SWEEP + 2 }, (_, i) => enrollment(`e${i}`));
    mockEnrollmentFindAll.mockResolvedValue(candidates);

    const result = await runDaraTargetedResearchSweep();

    expect(result.flagged).toBe(MAX_FLAGGED_PER_SWEEP);
    expect(mockTaskCreate).toHaveBeenCalledTimes(MAX_FLAGGED_PER_SWEEP);
    expect(result.skipped.sweep_cap_reached).toBe(2);
  });

  it('priority reflects real signal severity: a very low pass probability gets high priority, a moderate one gets medium', async () => {
    mockEvaluateSignal.mockResolvedValue({ type: 'certification_readiness_risk', passProbability: 0.1, weakDomains: ['Testing'] });

    await runDaraTargetedResearchSweep();

    expect(mockTaskCreate.mock.calls[0][0].priority).toBe('high');
  });
});
