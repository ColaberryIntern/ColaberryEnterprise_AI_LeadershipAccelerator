/**
 * acceleratorService.getClassDashboard / computeTrendDirection — the new
 * per-cohort analytics endpoint. No historical score-snapshot table exists in
 * this codebase (confirmed at DISCOVER), so trends are derived from
 * session-ordered attendance/submission data, not a fabricated history — these
 * tests cover that derivation directly.
 */

const mockCohortFindByPk = jest.fn();
const mockEnrollmentFindAll = jest.fn();
const mockLiveSessionFindAll = jest.fn();
const mockAttendanceRecordFindAll = jest.fn();
const mockAssignmentSubmissionFindAll = jest.fn();

jest.mock('../../models', () => ({
  Cohort: { findByPk: mockCohortFindByPk },
  Enrollment: { findAll: mockEnrollmentFindAll },
  LiveSession: { findAll: mockLiveSessionFindAll },
  AttendanceRecord: { findAll: mockAttendanceRecordFindAll },
  AssignmentSubmission: { findAll: mockAssignmentSubmissionFindAll },
}));

import { computeTrendDirection, getClassDashboard } from '../../services/acceleratorService';

describe('computeTrendDirection', () => {
  it('a clearly-improving series (last points well above earlier ones) reports up', () => {
    expect(computeTrendDirection([40, 42, 41, 80, 85, 90])).toBe('up');
  });

  it('a clearly-declining series reports down', () => {
    expect(computeTrendDirection([90, 88, 85, 40, 35, 30])).toBe('down');
  });

  it('a series within the threshold reports flat, not a false up/down', () => {
    expect(computeTrendDirection([70, 71, 69, 70, 72, 71])).toBe('flat');
  });

  it('boundary: fewer than 2 data points reports flat, never crashes', () => {
    expect(computeTrendDirection([])).toBe('flat');
    expect(computeTrendDirection([55])).toBe('flat');
  });

  it('boundary: exactly 2 points compares them directly', () => {
    expect(computeTrendDirection([50, 90])).toBe('up');
    expect(computeTrendDirection([90, 50])).toBe('down');
  });
});

describe('getClassDashboard', () => {
  beforeEach(() => {
    mockCohortFindByPk.mockReset();
    mockEnrollmentFindAll.mockReset();
    mockLiveSessionFindAll.mockReset();
    mockAttendanceRecordFindAll.mockReset();
    mockAssignmentSubmissionFindAll.mockReset();
  });

  it('returns null for a nonexistent cohort', async () => {
    mockCohortFindByPk.mockResolvedValue(null);
    const result = await getClassDashboard('missing');
    expect(result).toBeNull();
  });

  it('a cohort with zero completed sessions returns an empty series and flat trends, not an error', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'c1' });
    mockEnrollmentFindAll.mockResolvedValue([
      { id: 'e1', full_name: 'A', readiness_score: 50, prework_score: 50, attendance_score: 50, assignment_score: 50, maturity_level: 1 },
    ]);
    mockLiveSessionFindAll.mockResolvedValue([{ id: 's1', session_number: 1, title: 'Week 1', status: 'scheduled' }]); // not yet happened
    mockAttendanceRecordFindAll.mockResolvedValue([]);
    mockAssignmentSubmissionFindAll.mockResolvedValue([]);

    const result = await getClassDashboard('c1');

    expect(result!.session_series).toEqual([]);
    expect(result!.kpis.avg_attendance.trend).toBe('flat');
    expect(result!.kpis.avg_assignment.trend).toBe('flat');
  });

  it('happy path: 2+ completed sessions produce a correctly-ordered series matching session_number', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'c1' });
    mockEnrollmentFindAll.mockResolvedValue([
      { id: 'e1', full_name: 'Alice', readiness_score: 80, prework_score: 90, attendance_score: 100, assignment_score: 70, maturity_level: 2 },
      { id: 'e2', full_name: 'Bob', readiness_score: 40, prework_score: 30, attendance_score: 20, assignment_score: 50, maturity_level: 1 },
    ]);
    mockLiveSessionFindAll.mockResolvedValue([
      { id: 's1', session_number: 1, title: 'Week 1', status: 'completed' },
      { id: 's2', session_number: 2, title: 'Week 2', status: 'completed' },
    ]);
    mockAttendanceRecordFindAll.mockResolvedValue([
      { enrollment_id: 'e1', session_id: 's1', status: 'present' },
      { enrollment_id: 'e2', session_id: 's1', status: 'absent' },
      { enrollment_id: 'e1', session_id: 's2', status: 'present' },
      { enrollment_id: 'e2', session_id: 's2', status: 'present' },
    ]);
    mockAssignmentSubmissionFindAll.mockResolvedValue([]);

    const result = await getClassDashboard('c1');

    expect(result!.session_series).toHaveLength(2);
    expect(result!.session_series[0]).toMatchObject({ session_number: 1, attendance_rate: 50 }); // 1 of 2 present
    expect(result!.session_series[1]).toMatchObject({ session_number: 2, attendance_rate: 100 }); // 2 of 2 present
    expect(result!.students).toHaveLength(2);
  });

  it('submission series excludes non-session-tied prework rows and unreviewed/null-score rows from the completion count', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'c1' });
    mockEnrollmentFindAll.mockResolvedValue([{ id: 'e1', full_name: 'Alice', readiness_score: 50, prework_score: 50, attendance_score: 50, assignment_score: 50, maturity_level: 1 }]);
    mockLiveSessionFindAll.mockResolvedValue([{ id: 's1', session_number: 1, title: 'Week 1', status: 'completed' }]);
    mockAttendanceRecordFindAll.mockResolvedValue([]);
    mockAssignmentSubmissionFindAll.mockResolvedValue([
      // prework — NOT session-tied, must not appear in the per-session series
      { enrollment_id: 'e1', session_id: null, assignment_type: 'prework_intake', status: 'reviewed', score: 100 },
      // session-tied but unreviewed — must not count toward completion
      { enrollment_id: 'e1', session_id: 's1', assignment_type: 'build_lab', status: 'submitted', score: null },
      // session-tied and reviewed with a score — counts
      { enrollment_id: 'e1', session_id: 's1', assignment_type: 'evidence', status: 'reviewed', score: 95 },
    ]);

    const result = await getClassDashboard('c1');

    // 1 of 2 session-tied submissions is reviewed+scored -> 50%
    expect(result!.session_series[0].submission_rate).toBe(50);
    // prework counted separately, out of enrollments.length * 2 = 2 slots, 1 submitted -> 50%
    expect(result!.kpis.prework_completion_rate).toBe(50);
  });

  it('per-student attendance_trend is derived from that student\'s own session-ordered records, not the cohort aggregate', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'c1' });
    mockEnrollmentFindAll.mockResolvedValue([{ id: 'e1', full_name: 'Alice', readiness_score: 50, prework_score: 50, attendance_score: 50, assignment_score: 50, maturity_level: 1 }]);
    mockLiveSessionFindAll.mockResolvedValue([
      { id: 's1', session_number: 1, title: 'Week 1', status: 'completed' },
      { id: 's2', session_number: 2, title: 'Week 2', status: 'completed' },
    ]);
    // Alice missed session 1 entirely (no record = not-attended) then attended session 2
    mockAttendanceRecordFindAll.mockResolvedValue([
      { enrollment_id: 'e1', session_id: 's2', status: 'present' },
    ]);
    mockAssignmentSubmissionFindAll.mockResolvedValue([]);

    const result = await getClassDashboard('c1');

    expect(result!.students[0].attendance_trend).toBe('up'); // 0 -> 100 is a clear improvement
  });
});
