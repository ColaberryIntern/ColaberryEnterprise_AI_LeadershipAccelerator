/**
 * acceleratorService.listSubmissionsByEnrollment — the person-scoped submissions
 * read path the Admin Accelerator UI now consumes (Submissions folds into the
 * Participants drill-down instead of being a session-scoped standalone tab). The
 * function itself already existed and was already fully wired
 * (route/controller/service) before this test file — this only adds the missing
 * coverage a plan audit found was absent.
 */

const mockFindAll = jest.fn();

jest.mock('../../models', () => ({
  AssignmentSubmission: { findAll: mockFindAll },
  LiveSession: {},
  Enrollment: {},
}));

import { listSubmissionsByEnrollment } from '../../services/acceleratorService';

describe('listSubmissionsByEnrollment', () => {
  beforeEach(() => {
    mockFindAll.mockReset();
  });

  it('happy path: returns all submissions for the enrollment across multiple sessions, with the session join populated', async () => {
    mockFindAll.mockResolvedValue([
      { id: 's1', enrollment_id: 'e1', session_id: 'sess-1', assignment_type: 'build_lab', status: 'reviewed', score: 90, session: { id: 'sess-1', session_number: 2, title: 'Week 2' } },
      { id: 's2', enrollment_id: 'e1', session_id: 'sess-2', assignment_type: 'evidence', status: 'submitted', score: null, session: { id: 'sess-2', session_number: 3, title: 'Week 3' } },
    ]);

    const result = await listSubmissionsByEnrollment('e1');

    expect(result).toHaveLength(2);
    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enrollment_id: 'e1' },
        include: expect.arrayContaining([expect.objectContaining({ as: 'session' })]),
      })
    );
  });

  it('an enrollment with zero submissions returns an empty array, not null/error', async () => {
    mockFindAll.mockResolvedValue([]);
    const result = await listSubmissionsByEnrollment('e-none');
    expect(result).toEqual([]);
  });

  it('a submission with session_id: null (e.g. prework_intake) is still included — the session join does not error on a null association', async () => {
    mockFindAll.mockResolvedValue([
      { id: 's3', enrollment_id: 'e1', session_id: null, assignment_type: 'prework_intake', status: 'reviewed', score: 100, session: null },
    ]);

    const result = await listSubmissionsByEnrollment('e1');

    expect(result).toHaveLength(1);
    expect((result[0] as any).session).toBeNull();
  });

  it('scopes strictly to the given enrollment_id (never leaks another enrollment\'s rows)', async () => {
    mockFindAll.mockResolvedValue([]);
    await listSubmissionsByEnrollment('e-specific');
    expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { enrollment_id: 'e-specific' } }));
  });
});
