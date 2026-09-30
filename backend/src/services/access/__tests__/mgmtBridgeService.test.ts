jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token') }));
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../participantService', () => ({ signParticipantJwt: jest.fn(() => 'participant-token') }));

import CommunityMember from '../../../models/CommunityMember';
import Enrollment from '../../../models/Enrollment';
import { loadStaffPortalLinkByEmail } from '../mgmtBridgeService';

const cmFindOne = CommunityMember.findOne as jest.Mock;
const enrollFindAll = Enrollment.findAll as jest.Mock;

describe('loadStaffPortalLinkByEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the email has no enrollments at all', async () => {
    enrollFindAll.mockResolvedValue([]);
    expect(await loadStaffPortalLinkByEmail('nobody@colaberry.com')).toBeNull();
    expect(cmFindOne).not.toHaveBeenCalled();
  });

  it('returns null when enrollments exist but none has a staff CommunityMember', async () => {
    enrollFindAll.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    cmFindOne.mockResolvedValue(null);
    expect(await loadStaffPortalLinkByEmail('student@colaberry.com')).toBeNull();
  });

  it('returns null when the linked CommunityMember has an invalid mgmt_role', async () => {
    enrollFindAll.mockResolvedValue([{ id: 'e1' }]);
    cmFindOne.mockResolvedValue({ enrollment_id: 'e1', mgmt_role: 'not_a_real_role' });
    expect(await loadStaffPortalLinkByEmail('half-set@colaberry.com')).toBeNull();
  });

  it('picks the ONE enrollment (of several under the same email) that carries the staff role', async () => {
    // Mirrors the real Kes case: two enrollments share an email, only one is staff.
    enrollFindAll.mockResolvedValue([{ id: 'old-enrollment' }, { id: 'active-enrollment' }]);
    cmFindOne.mockResolvedValue({ enrollment_id: 'active-enrollment', mgmt_role: 'admin' });

    const link = await loadStaffPortalLinkByEmail('kes@colaberry.com');

    expect(link).toEqual({ enrollmentId: 'active-enrollment', mgmtRole: 'admin' });
    expect(enrollFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'kes@colaberry.com' } }));
    expect(cmFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { enrollment_id: ['old-enrollment', 'active-enrollment'], role: 'staff' },
    }));
  });

  it('a curriculum-scoped link still resolves — the caller decides not to use it for section scoping', async () => {
    enrollFindAll.mockResolvedValue([{ id: 'e1' }]);
    cmFindOne.mockResolvedValue({ enrollment_id: 'e1', mgmt_role: 'curriculum' });
    expect(await loadStaffPortalLinkByEmail('swati@colaberry.com')).toEqual({ enrollmentId: 'e1', mgmtRole: 'curriculum' });
  });
});
