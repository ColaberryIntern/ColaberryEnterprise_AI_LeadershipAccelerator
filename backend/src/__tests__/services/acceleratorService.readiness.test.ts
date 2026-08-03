/**
 * acceleratorService.computeReadinessScore — attendance_score denominator bug.
 * Reported live: a student who attended every class held so far in a multi-week
 * program (e.g. 2 of 3 sessions actually taught) was showing single-digit
 * attendance (2 of 25 TOTAL scheduled sessions, most still in the future) instead
 * of the correct 67%. Attendance can only be measured against classes that have
 * actually happened.
 */

const mockEnrollmentFindByPk = jest.fn();
const mockLiveSessionFindAll = jest.fn();
const mockAttendanceRecordFindAll = jest.fn();
const mockAssignmentSubmissionFindAll = jest.fn();

jest.mock('../../models', () => ({
  Enrollment: { findByPk: mockEnrollmentFindByPk },
  LiveSession: { findAll: mockLiveSessionFindAll },
  AttendanceRecord: { findAll: mockAttendanceRecordFindAll },
  AssignmentSubmission: { findAll: mockAssignmentSubmissionFindAll },
}));

import { computeReadinessScore } from '../../services/acceleratorService';

function makeSession(status: string, sessionType = 'core') {
  return { status, session_type: sessionType };
}

describe('computeReadinessScore — attendance_score', () => {
  let updateMock: jest.Mock;

  beforeEach(() => {
    mockLiveSessionFindAll.mockReset();
    mockAttendanceRecordFindAll.mockReset();
    mockAssignmentSubmissionFindAll.mockReset().mockResolvedValue([]);
    updateMock = jest.fn().mockResolvedValue(undefined);
    mockEnrollmentFindByPk.mockReset().mockResolvedValue({
      id: 'e1',
      cohort_id: 'c1',
      update: updateMock,
    });
  });

  it('reproduces the reported live bug: 2 of 3 sessions actually held (out of 25 total scheduled) is 67%, not 8%', async () => {
    const sessions = [
      makeSession('completed'), makeSession('completed'), makeSession('completed'), // 3 held
      ...Array.from({ length: 22 }, () => makeSession('scheduled')), // 22 still in the future
    ];
    mockLiveSessionFindAll.mockResolvedValue(sessions);
    mockAttendanceRecordFindAll.mockResolvedValue([
      { status: 'present' }, { status: 'present' }, // attended 2 of the 3 held
    ]);

    await computeReadinessScore('e1');

    const patch = updateMock.mock.calls[0][0];
    expect(patch.attendance_score).toBeCloseTo(66.67, 1); // 2/3, not 2/25 (=8)
  });

  it('a student who attended every session held so far scores 100%, even with many future sessions still scheduled', async () => {
    mockLiveSessionFindAll.mockResolvedValue([
      makeSession('completed'), makeSession('live'),
      makeSession('scheduled'), makeSession('scheduled'), makeSession('scheduled'),
    ]);
    mockAttendanceRecordFindAll.mockResolvedValue([{ status: 'present' }, { status: 'late' }]);

    await computeReadinessScore('e1');

    expect(updateMock.mock.calls[0][0].attendance_score).toBe(100);
  });

  it('boundary: zero sessions held yet (cohort hasn\'t started) scores 0%, not NaN or an error', async () => {
    mockLiveSessionFindAll.mockResolvedValue([
      makeSession('scheduled'), makeSession('scheduled'),
    ]);
    mockAttendanceRecordFindAll.mockResolvedValue([]);

    await computeReadinessScore('e1');

    expect(updateMock.mock.calls[0][0].attendance_score).toBe(0);
  });

  it('cancelled sessions are excluded from both the numerator context and the denominator (pre-existing, unchanged behavior)', async () => {
    mockLiveSessionFindAll.mockResolvedValue([
      makeSession('completed'), makeSession('completed'),
    ]); // the query itself already excludes 'cancelled' via its where clause — this
    // asserts the query was called with that filter still intact.
    mockAttendanceRecordFindAll.mockResolvedValue([{ status: 'present' }]);

    await computeReadinessScore('e1');

    expect(mockLiveSessionFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cohort_id: 'c1' }) })
    );
    expect(updateMock.mock.calls[0][0].attendance_score).toBe(50);
  });

  it('returns null for a nonexistent enrollment without crashing', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    const result = await computeReadinessScore('missing');
    expect(result).toBeNull();
  });
});
