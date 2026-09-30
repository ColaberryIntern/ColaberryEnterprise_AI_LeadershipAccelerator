import Enrollment from '../../../models/Enrollment';
import CareerMentorScope from '../../../models/CareerMentorScope';
import {
  reviewerKind, visibleEnrollmentIds, canReview, grantScope, revokeScope, listScopes,
} from '../careerMentorScopeService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/CareerMentorScope', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

const scopeFindAll = CareerMentorScope.findAll as unknown as jest.Mock;
const scopeFindOne = CareerMentorScope.findOne as unknown as jest.Mock;
const scopeCreate = CareerMentorScope.create as unknown as jest.Mock;
const enrollFindAll = Enrollment.findAll as unknown as jest.Mock;

const MENTOR = { sub: 'm1', email: 'mentor@colaberry.com', role: 'staff', mgmt_role: 'mentor', enrollmentId: 'mentor-enr' };

beforeEach(() => {
  jest.clearAllMocks();
  scopeFindAll.mockResolvedValue([]);
  enrollFindAll.mockResolvedValue([]);
  scopeFindOne.mockResolvedValue(null);
});

describe('reviewerKind', () => {
  it.each(['admin', 'super_admin'])('treats platform role %s as an unscoped admin', (role) => {
    expect(reviewerKind({ sub: 'a', role })).toBe('admin');
  });

  it.each(['owner', 'admin'])('treats mgmt_role %s as an unscoped admin', (mgmt_role) => {
    expect(reviewerKind({ sub: 'a', role: 'staff', mgmt_role })).toBe('admin');
  });

  it('treats mgmt_role mentor as a SCOPED mentor', () => {
    expect(reviewerKind(MENTOR)).toBe('mentor');
  });

  it.each(['support', 'revenue', 'curriculum', 'community_organizer', undefined])(
    'gives no review access to %s',
    (mgmt_role) => {
      expect(reviewerKind({ sub: 'x', role: 'staff', mgmt_role: mgmt_role as any })).toBe('none');
    },
  );

  it('gives a plain participant no review access', () => {
    expect(reviewerKind({ sub: 'p', role: 'participant' })).toBe('none');
  });
});

describe('visibleEnrollmentIds — null and [] mean different things', () => {
  it('returns NULL for an admin, meaning no filter', async () => {
    await expect(visibleEnrollmentIds({ sub: 'a', role: 'super_admin' })).resolves.toBeNull();
  });

  /**
   * THE test in this file. A mentor with no grants must see NOTHING. If this ever
   * returned null instead of [], the queue would read "no filter" and show that mentor
   * every learner on the platform — the exact failure the two-grant design exists to
   * prevent.
   */
  it('returns [] for a mentor with NO grants, never null', async () => {
    scopeFindAll.mockResolvedValue([]);
    const r = await visibleEnrollmentIds(MENTOR);
    expect(r).toEqual([]);
    expect(r).not.toBeNull();
  });

  it('returns [] for a mentor whose token carries no enrollment id', async () => {
    const r = await visibleEnrollmentIds({ ...MENTOR, enrollmentId: null });
    expect(r).toEqual([]);
    expect(scopeFindAll).not.toHaveBeenCalled();
  });

  it('resolves direct enrollment grants', async () => {
    scopeFindAll.mockResolvedValue([
      { scope_type: 'enrollment', scope_id: 'e1' },
      { scope_type: 'enrollment', scope_id: 'e2' },
    ]);
    await expect(visibleEnrollmentIds(MENTOR)).resolves.toEqual(['e1', 'e2']);
    // No cohort grants, so it must not go looking for cohort members.
    expect(enrollFindAll).not.toHaveBeenCalled();
  });

  it('expands a cohort grant to that cohort\'s learners', async () => {
    scopeFindAll.mockResolvedValue([{ scope_type: 'cohort', scope_id: 'c1' }]);
    enrollFindAll.mockResolvedValue([{ id: 'e7' }, { id: 'e8' }]);
    await expect(visibleEnrollmentIds(MENTOR)).resolves.toEqual(['e7', 'e8']);
  });

  it('merges cohort and direct grants without duplicates', async () => {
    scopeFindAll.mockResolvedValue([
      { scope_type: 'enrollment', scope_id: 'e7' },
      { scope_type: 'cohort', scope_id: 'c1' },
    ]);
    enrollFindAll.mockResolvedValue([{ id: 'e7' }, { id: 'e8' }]);
    const r = await visibleEnrollmentIds(MENTOR);
    expect(r!.sort()).toEqual(['e7', 'e8']);
  });
});

describe('canReview', () => {
  it('lets an admin act on anyone', async () => {
    await expect(canReview({ sub: 'a', role: 'admin' }, 'anybody')).resolves.toBe(true);
  });

  it('lets a mentor act on a learner in scope', async () => {
    scopeFindAll.mockResolvedValue([{ scope_type: 'enrollment', scope_id: 'e1' }]);
    await expect(canReview(MENTOR, 'e1')).resolves.toBe(true);
  });

  it('REFUSES a mentor on a learner outside their scope', async () => {
    scopeFindAll.mockResolvedValue([{ scope_type: 'enrollment', scope_id: 'e1' }]);
    await expect(canReview(MENTOR, 'someone-elses-learner')).resolves.toBe(false);
  });

  it('refuses a mentor with no grants at all', async () => {
    scopeFindAll.mockResolvedValue([]);
    await expect(canReview(MENTOR, 'e1')).resolves.toBe(false);
  });
});

describe('grant and revoke — admin controls mentor privilege', () => {
  it('grants a new scope', async () => {
    scopeFindOne.mockResolvedValue(null);
    scopeCreate.mockResolvedValue({});
    await expect(grantScope({
      mentorEnrollmentId: 'mentor-enr', scopeType: 'cohort', scopeId: 'c1', grantedBy: 'ali@colaberry.com',
    })).resolves.toEqual({ granted: true });
  });

  it('IDEMPOTENT: re-granting a live scope creates no second row', async () => {
    scopeFindOne.mockResolvedValue({ id: 'existing' });
    await expect(grantScope({
      mentorEnrollmentId: 'mentor-enr', scopeType: 'cohort', scopeId: 'c1', grantedBy: 'ali@colaberry.com',
    })).resolves.toEqual({ granted: false });
    expect(scopeCreate).not.toHaveBeenCalled();
  });

  it('revoking STAMPS the row rather than deleting it', async () => {
    const row: any = { update: jest.fn().mockResolvedValue(undefined) };
    scopeFindOne.mockResolvedValue(row);
    await expect(revokeScope('mentor-enr', 'cohort', 'c1', 'ali@colaberry.com')).resolves.toEqual({ revoked: true });
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ revoked_by: 'ali@colaberry.com' }));
    // "who could see whose portfolio, and when" must stay answerable.
    expect(row.destroy).toBeUndefined();
  });

  it('revoking something not granted is a no-op, not an error', async () => {
    scopeFindOne.mockResolvedValue(null);
    await expect(revokeScope('mentor-enr', 'cohort', 'nope', 'ali@colaberry.com')).resolves.toEqual({ revoked: false });
  });

  it('lists only live grants for the admin screen', async () => {
    scopeFindAll.mockResolvedValue([
      { scope_type: 'cohort', scope_id: 'c1', granted_at: new Date(), granted_by: 'ali@colaberry.com' },
    ]);
    const r = await listScopes('mentor-enr');
    expect(r).toHaveLength(1);
    expect(scopeFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mentor_enrollment_id: 'mentor-enr' }),
    }));
  });
});
