jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token') }));
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../participantService', () => ({ signParticipantJwt: jest.fn(() => 'participant-token') }));

import CommunityMember from '../../../models/CommunityMember';
import Enrollment from '../../../models/Enrollment';
import { loadStaffPortalLinkByEmail, getMgmtStatus, mintMgmtAdminToken } from '../mgmtBridgeService';
import jwt from 'jsonwebtoken';
import { MGMT_ROLES, MGMT_ROLE_DEFS, sectionsForRole } from '../mgmtRoles';

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

// Campus HQ (H2): the building needs the viewer's sections, and they must be the SAME list the admin token is
// scoped to, so the campus can never show a floor open that the admin sidebar would hide.
describe('getMgmtStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the role, its label and exactly the sections the admin token carries, for every role', async () => {
    for (const role of MGMT_ROLES) {
      cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: role });
      expect(await getMgmtStatus('e1')).toEqual({
        is_mgmt: true, role, label: MGMT_ROLE_DEFS[role].label, sections: sectionsForRole(role),
      });
    }
  });

  it('gives a participant with no community row no sections', async () => {
    cmFindOne.mockResolvedValueOnce(null);
    expect(await getMgmtStatus('e1')).toEqual({ is_mgmt: false, role: null, label: null, sections: [] });
  });

  it('gives a non-staff member no sections even when a mgmt_role is set on the row', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'member', mgmt_role: 'owner' });
    expect(await getMgmtStatus('e1')).toEqual({ is_mgmt: false, role: null, label: null, sections: [] });
  });

  it('gives an unknown mgmt_role no sections (deny by default)', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: 'not_a_real_role' });
    expect((await getMgmtStatus('e1')).sections).toEqual([]);
  });

  it('returns a copy, so a caller cannot mutate the role table', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: 'mentor' });
    const s = await getMgmtStatus('e1');
    s.sections.push('system');
    expect(sectionsForRole('mentor')).not.toContain('system');
  });
});

describe('C82: extra sections on top of the role', () => {
  beforeEach(() => jest.clearAllMocks());
  it('the portal status serves role + extras (what the building and the Dara floor read)', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: 'marketing', mgmt_extra_sections: ['internship', 'campaigns', 'bogus'] });
    expect((await getMgmtStatus('e1')).sections).toEqual(['dashboard', 'campaigns', 'brands', 'internship']);
  });
  it('a revoke (empty extras) serves the role only', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: 'marketing', mgmt_extra_sections: [] });
    expect((await getMgmtStatus('e1')).sections).toEqual(sectionsForRole('marketing'));
  });
  it('the minted admin token carries the extras and its sections include them', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: 'marketing', mgmt_extra_sections: ['internship'] });
    (Enrollment.findByPk as jest.Mock).mockResolvedValueOnce({ email: 's@example.com' });
    const minted = await mintMgmtAdminToken('e1');
    expect(minted?.sections).toEqual(['dashboard', 'campaigns', 'brands', 'internship']);
    expect((jwt.sign as jest.Mock).mock.calls[0][0]).toMatchObject({ mgmt_role: 'marketing', mgmt_extra_sections: ['internship'] });
  });
  it('no extras: no extra claim in the token', async () => {
    cmFindOne.mockResolvedValueOnce({ role: 'staff', mgmt_role: 'marketing', mgmt_extra_sections: [] });
    (Enrollment.findByPk as jest.Mock).mockResolvedValueOnce({ email: 's@example.com' });
    await mintMgmtAdminToken('e1');
    expect((jwt.sign as jest.Mock).mock.calls[0][0]).not.toHaveProperty('mgmt_extra_sections');
  });
});
