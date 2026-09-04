/**
 * learnerContextService — attendance consumer, Reese Agentic AI Employee
 * mission, Checkpoint B's first real reliability-gate consumer. Pins the
 * fail-closed contract at the service layer (not just the pure formatter):
 * a quarantined/degraded cohort attendance metric means the real
 * AttendanceRecord/LiveSession queries are never even issued, and the
 * honest exclusion reason from the registry flows through untouched. This
 * file only covers what this checkpoint added — the rest of
 * getLearnerContext() (persona/competency/assessments/project/memory) is
 * pre-existing, untested code, grandfathered per CLAUDE.md until touched.
 */
const mockEnrollmentFindByPk = jest.fn();
jest.mock('../../models', () => ({ Enrollment: { findByPk: (...a: any[]) => mockEnrollmentFindByPk(...a) } }));

const mockCohortFindByPk = jest.fn();
jest.mock('../../models/Cohort', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockCohortFindByPk(...a) } }));

const mockProfileFindOne = jest.fn();
jest.mock('../../models/UserCurriculumProfile', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockProfileFindOne(...a) } }));

const mockAttemptFindAll = jest.fn();
jest.mock('../../models/AssessmentAttempt', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockAttemptFindAll(...a) } }));

const mockAttendanceFindAll = jest.fn();
jest.mock('../../models/AttendanceRecord', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockAttendanceFindAll(...a) } }));

const mockLiveSessionFindAll = jest.fn();
jest.mock('../../models/LiveSession', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockLiveSessionFindAll(...a) } }));

const mockMemoryFindOne = jest.fn();
jest.mock('../../models/LearnerMemory', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockMemoryFindOne(...a) } }));

const mockGetSkillGenome = jest.fn();
jest.mock('../skillGenomeService', () => ({ getSkillGenome: (...a: any[]) => mockGetSkillGenome(...a) }));

const mockGetProjectByEnrollment = jest.fn();
jest.mock('../projectService', () => ({ getProjectByEnrollment: (...a: any[]) => mockGetProjectByEnrollment(...a) }));

const mockGetReliabilityStatus = jest.fn();
jest.mock('../metricReliabilityService', () => ({ getReliabilityStatus: (...a: any[]) => mockGetReliabilityStatus(...a) }));

import { getLearnerContext } from '../learnerContextService';

const ENROLLMENT_ID = 'enrollment-1';
const COHORT_ID = 'cohort-9';

beforeEach(() => {
  jest.clearAllMocks();
  mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Sofia Chen', status: 'active', readiness_score: 42, cohort_id: COHORT_ID });
  mockCohortFindByPk.mockResolvedValue({ name: 'July 2026' });
  mockProfileFindOne.mockResolvedValue(null);
  mockAttemptFindAll.mockResolvedValue([]);
  mockMemoryFindOne.mockResolvedValue(null);
  mockGetSkillGenome.mockResolvedValue(null);
  mockGetProjectByEnrollment.mockResolvedValue(null);
  mockGetReliabilityStatus.mockResolvedValue({ status: 'healthy', severity: null, reason: null, declaredAt: null, recordId: null });
  mockLiveSessionFindAll.mockResolvedValue([]);
  mockAttendanceFindAll.mockResolvedValue([]);
});

describe('getLearnerContext — attendance', () => {
  it('happy path: healthy metric status leads to a real query, and real present/late counts are rolled up against sessions actually held', async () => {
    mockLiveSessionFindAll.mockResolvedValue([
      { status: 'completed' }, { status: 'completed' }, { status: 'live' }, { status: 'scheduled' }, { status: 'cancelled' },
    ]);
    mockAttendanceFindAll.mockResolvedValue([{ status: 'present' }, { status: 'late' }, { status: 'absent' }]);

    const ctx = await getLearnerContext(ENROLLMENT_ID);

    expect(mockGetReliabilityStatus).toHaveBeenCalledWith('attendance', 'attendance.*', { scopeType: 'cohort', scopeValue: COHORT_ID });
    expect(ctx.attendance).toEqual({
      sessions_present: 2, // present + late
      sessions_held_so_far: 3, // completed + live, scheduled/cancelled excluded
      attendance_pct: (2 / 3) * 100,
      reliable: true,
      excluded_reason: null,
    });
  });

  it('fail-closed: a quarantined metric means AttendanceRecord/LiveSession are never queried at all, and the real reason flows through', async () => {
    mockGetReliabilityStatus.mockResolvedValue({
      status: 'quarantined', severity: 'high', reason: 'Check-in system missing students since Monday', declaredAt: new Date(), recordId: 'rec-1',
    });

    const ctx = await getLearnerContext(ENROLLMENT_ID);

    expect(mockLiveSessionFindAll).not.toHaveBeenCalled();
    expect(mockAttendanceFindAll).not.toHaveBeenCalled();
    expect(ctx.attendance).toEqual({
      sessions_present: 0,
      sessions_held_so_far: 0,
      attendance_pct: null,
      reliable: false,
      excluded_reason: 'Check-in system missing students since Monday',
    });
  });

  it('fail-closed: a degraded (not fully quarantined) metric is still excluded, not quietly trusted', async () => {
    mockGetReliabilityStatus.mockResolvedValue({
      status: 'degraded', severity: 'low', reason: 'Intermittent sync failures observed', declaredAt: new Date(), recordId: 'rec-2',
    });

    const ctx = await getLearnerContext(ENROLLMENT_ID);

    expect(mockAttendanceFindAll).not.toHaveBeenCalled();
    expect(ctx.attendance?.reliable).toBe(false);
  });

  it('honesty boundary: no sessions held yet returns a real null pct, never a fabricated 0%', async () => {
    mockLiveSessionFindAll.mockResolvedValue([]);
    mockAttendanceFindAll.mockResolvedValue([]);

    const ctx = await getLearnerContext(ENROLLMENT_ID);

    expect(ctx.attendance).toEqual({ sessions_present: 0, sessions_held_so_far: 0, attendance_pct: null, reliable: true, excluded_reason: null });
  });

  it('fail-safe: a reliability-check failure never breaks the whole mentor-context assembly — attendance stays null, everything else still resolves', async () => {
    mockGetReliabilityStatus.mockRejectedValue(new Error('DB connection lost'));

    const ctx = await getLearnerContext(ENROLLMENT_ID);

    expect(ctx.attendance).toBeNull();
    expect(ctx.identity.full_name).toBe('Sofia Chen');
  });

  it('no cohort_id on the enrollment means attendance is never queried (nothing to scope the reliability check to)', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Guest Student', status: 'active', readiness_score: null, cohort_id: null });

    const ctx = await getLearnerContext(ENROLLMENT_ID);

    expect(mockGetReliabilityStatus).not.toHaveBeenCalled();
    expect(ctx.attendance).toBeNull();
  });
});
