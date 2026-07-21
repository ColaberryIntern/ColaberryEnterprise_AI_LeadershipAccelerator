jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));

import { isStaffEnrollment } from '../staffAccess';
import CommunityMember from '../../../models/CommunityMember';

const findOne = CommunityMember.findOne as jest.Mock;

describe('isStaffEnrollment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('happy path: true when the enrollment maps to a staff member', async () => {
    findOne.mockResolvedValue({ role: 'staff' });
    await expect(isStaffEnrollment('e1')).resolves.toBe(true);
    // Looks up by enrollment_id, reading only the role column.
    expect(findOne.mock.calls[0][0]).toEqual({ where: { enrollment_id: 'e1' }, attributes: ['role'] });
  });

  it('non-staff roles are not staff', async () => {
    findOne.mockResolvedValue({ role: 'student' });
    await expect(isStaffEnrollment('e1')).resolves.toBe(false);
    findOne.mockResolvedValue({ role: 'mentor' });
    await expect(isStaffEnrollment('e1')).resolves.toBe(false);
  });

  it('boundary: no member row → false (never unlock a non-member)', async () => {
    findOne.mockResolvedValue(null);
    await expect(isStaffEnrollment('e1')).resolves.toBe(false);
  });

  it('boundary: empty enrollmentId short-circuits to false without a query', async () => {
    await expect(isStaffEnrollment('')).resolves.toBe(false);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('failure path: a lookup error fails SAFE to false (never unlock on a DB blip)', async () => {
    findOne.mockRejectedValue(new Error('db down'));
    await expect(isStaffEnrollment('e1')).resolves.toBe(false);
  });
});
