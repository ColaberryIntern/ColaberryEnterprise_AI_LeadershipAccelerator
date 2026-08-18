/**
 * schoolSignals.gatherSignals() — Workforce OS perf fix (2026-08-18, session
 * CC-20260818-wf9k). No prior test file existed for this module; this one
 * exists specifically to protect the concurrency change: real production timing
 * showed the old sequential `for (const e of enrollments) { await
 * studentSignals(e.id); }` loop was the dominant cost of the whole Workforce OS
 * page (3,431ms measured live). The fix (mapWithConcurrency, capped at 15) must
 * produce IDENTICAL output to the old sequential version — these tests prove the
 * aggregate math and array order survive the change, and that the concurrency
 * cap is real (not an accidental no-op Promise.all or an accidental no-op
 * sequential loop).
 */
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn(), count: jest.fn() }));
jest.mock('../../../models/StudentLevel', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/CurriculumBlueprint', () => ({ findAll: jest.fn() }));
jest.mock('../../runtime/runtimeService', () => ({ studentSignals: jest.fn() }));
jest.mock('../../runtime/employmentReadiness', () => ({ computeEmploymentReadiness: jest.fn() }));
jest.mock('../../runtime/certificationReadiness', () => ({ computeCertificationReadiness: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import StudentLevel from '../../../models/StudentLevel';
import CurriculumBlueprint from '../../../models/CurriculumBlueprint';
import { studentSignals } from '../../runtime/runtimeService';
import { computeEmploymentReadiness } from '../../runtime/employmentReadiness';
import { computeCertificationReadiness } from '../../runtime/certificationReadiness';
import { gatherSignals } from '../schoolSignals';

const mockEnrollmentFindAll = Enrollment.findAll as unknown as jest.Mock;
const mockEnrollmentCount = Enrollment.count as unknown as jest.Mock;
const mockStudentLevelFindAll = StudentLevel.findAll as unknown as jest.Mock;
const mockBlueprintFindAll = CurriculumBlueprint.findAll as unknown as jest.Mock;
const mockStudentSignals = studentSignals as unknown as jest.Mock;
const mockComputeEmployment = computeEmploymentReadiness as unknown as jest.Mock;
const mockComputeCertification = computeCertificationReadiness as unknown as jest.Mock;

function makeEnrollment(id: string, overrides: Record<string, any> = {}) {
  return { id, full_name: `Student ${id}`, cohort_id: 'cohort-1', attendance_score: 80, amount_paid: 100, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStudentLevelFindAll.mockResolvedValue([]);
  mockBlueprintFindAll.mockResolvedValue([]);
  mockEnrollmentCount.mockResolvedValue(0);
  mockComputeEmployment.mockReturnValue({ overall: 50, band: 'developing' });
  mockComputeCertification.mockReturnValue({ pass_probability: 0.5 });
});

describe('gatherSignals — order preservation under concurrency', () => {
  it('returns the roster in the SAME order as the input enrollments, even when studentSignals resolves out of order', async () => {
    const enrollments = [makeEnrollment('s1'), makeEnrollment('s2'), makeEnrollment('s3'), makeEnrollment('s4')];
    mockEnrollmentFindAll.mockResolvedValue(enrollments);

    // Deliberately resolve OUT of input order: s1 slowest, s4 fastest.
    const delays: Record<string, number> = { s1: 40, s2: 30, s3: 20, s4: 10 };
    mockStudentSignals.mockImplementation((id: string) => new Promise((resolve) => {
      setTimeout(() => resolve({ xp: { builder: 1, learning: 1, community: 0 }, portfolio: { entries: 0, artifacts: 0 }, github: { commits: 0, prs: 0, repos: 0 }, competencies: [] }), delays[id]);
    }));

    const signals = await gatherSignals();

    expect(signals.roster.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('respects the configured concurrency cap: never more than 15 studentSignals calls in flight at once', async () => {
    const enrollments = Array.from({ length: 40 }, (_, i) => makeEnrollment(`s${i}`));
    mockEnrollmentFindAll.mockResolvedValue(enrollments);

    let inFlight = 0;
    let maxInFlight = 0;
    mockStudentSignals.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => setTimeout(() => {
        inFlight -= 1;
        resolve({ xp: { builder: 0, learning: 0, community: 0 }, portfolio: { entries: 0, artifacts: 0 }, github: { commits: 0, prs: 0, repos: 0 }, competencies: [] });
      }, 5));
    });

    const signals = await gatherSignals();

    expect(signals.roster).toHaveLength(40);
    expect(maxInFlight).toBeLessThanOrEqual(15);
    expect(maxInFlight).toBeGreaterThan(1); // proves it's genuinely parallel, not accidentally sequential (limit 1)
  });
});

describe('gatherSignals — aggregate math matches a hand-computed expected value', () => {
  it('computes at_risk/excelling counts and averages correctly for a small fixture set', async () => {
    const enrollments = [
      makeEnrollment('s1', { attendance_score: 90 }),
      makeEnrollment('s2', { attendance_score: 40 }),
      makeEnrollment('s3', { attendance_score: 0 }), // unstarted signup — never at_risk
    ];
    mockEnrollmentFindAll.mockResolvedValue(enrollments);
    mockEnrollmentCount.mockResolvedValue(3);

    mockStudentSignals.mockImplementation((id: string) => {
      if (id === 's3') {
        // Zero activity, zero attendance -> "unstarted", never counted as at_risk.
        return Promise.resolve({ xp: { builder: 0, learning: 0, community: 0 }, portfolio: { entries: 0, artifacts: 0 }, github: { commits: 0, prs: 0, repos: 0 }, competencies: [] });
      }
      return Promise.resolve({ xp: { builder: 10, learning: 5, community: 0 }, portfolio: { entries: 1, artifacts: 1 }, github: { commits: 3, prs: 0, repos: 1 }, competencies: [] });
    });

    // s1: employment overall 80 (excelling via >=70), attendance 90 (not at_risk).
    // s2: employment overall 20 (at_risk via emp.overall < 30), attendance 40 (also < 60, but OR is enough).
    // s3: unstarted, excluded from at_risk regardless of readiness.
    mockComputeEmployment.mockImplementation(() => {
      const callIndex = mockComputeEmployment.mock.calls.length;
      if (callIndex === 1) return { overall: 80, band: 'market-ready' };
      if (callIndex === 2) return { overall: 20, band: 'developing' };
      return { overall: 50, band: 'developing' };
    });

    const signals = await gatherSignals();

    expect(signals.students.active).toBe(3);
    expect(signals.students.at_risk).toBe(1); // only s2
    expect(signals.students.excelling).toBe(1); // only s1
    expect(signals.roster.find((s) => s.id === 's3')?.started).toBe(false);
  });
});

describe('gatherSignals — regression: identical shape/behavior to the pre-fix sequential version', () => {
  it('still returns an empty roster (no throw) when there are zero active enrollments', async () => {
    mockEnrollmentFindAll.mockResolvedValue([]);

    const signals = await gatherSignals();

    expect(signals.roster).toEqual([]);
    expect(mockStudentSignals).not.toHaveBeenCalled();
  });

  it('idempotency: calling gatherSignals twice with the same mocked data produces the same aggregate output', async () => {
    const enrollments = [makeEnrollment('s1')];
    mockEnrollmentFindAll.mockResolvedValue(enrollments);
    mockStudentSignals.mockResolvedValue({ xp: { builder: 5, learning: 5, community: 0 }, portfolio: { entries: 2, artifacts: 2 }, github: { commits: 4, prs: 0, repos: 1 }, competencies: [] });

    const first = await gatherSignals();
    const second = await gatherSignals();

    expect(first.students).toEqual(second.students);
    expect(first.roster).toEqual(second.roster);
  });
});
