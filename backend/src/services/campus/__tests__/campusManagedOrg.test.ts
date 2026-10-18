/**
 * C6 "manages an organization" is the EXISTING rule, run for real (only the models are mocked): the owned org first, else a
 * manager membership; a plain member manages nothing. campusTeam uses exactly this (managedOrgIdFor), so the team-only rule
 * cannot drift into a narrower or wider copy.
 */
jest.mock('../../../models', () => ({
  Enrollment: { findByPk: jest.fn() }, OnboardingProfile: {}, Cohort: {},
  Organization: { findOne: jest.fn(), findByPk: jest.fn() },
  OrgMember: { findOne: jest.fn(), findAll: jest.fn() },
}));

import { Organization, OrgMember } from '../../../models';
import { managedOrgIdFor, isOrgManager } from '../../portalSettingsService';
import { teamEnrollmentIdsFor } from '../campusTeam';

const orgFindOne = Organization.findOne as jest.Mock;
const orgByPk = Organization.findByPk as jest.Mock;
const memberFindOne = OrgMember.findOne as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  orgFindOne.mockResolvedValue(null);
  memberFindOne.mockResolvedValue(null);
  orgByPk.mockImplementation(async (id: string) => ({ id, name: 'Org ' + id, owner_enrollment_id: 'owner-' + id }));
  (OrgMember.findAll as jest.Mock).mockResolvedValue([]);
});

describe('managedOrgIdFor (the real resolveManagedOrg rule)', () => {
  it('owns org A and also manages org B: returns A (the owned org wins)', async () => {
    orgFindOne.mockResolvedValue({ id: 'A', name: 'Org A' });
    memberFindOne.mockResolvedValue({ org_id: 'B' });
    await expect(managedOrgIdFor('viewer')).resolves.toBe('A');
    expect(memberFindOne).not.toHaveBeenCalled();
  });

  it('owns nothing but holds a manager membership in B: returns B, asked as role manager', async () => {
    memberFindOne.mockResolvedValue({ org_id: 'B' });
    await expect(managedOrgIdFor('viewer')).resolves.toBe('B');
    expect(memberFindOne.mock.calls[0][0]).toEqual({ where: { enrollment_id: 'viewer', role: 'manager' } });
  });

  it('only a plain member (no manager row matches): manages nothing, and the team is empty', async () => {
    await expect(managedOrgIdFor('viewer')).resolves.toBeNull();
    await expect(isOrgManager('viewer')).resolves.toBe(false);
    expect((await teamEnrollmentIdsFor('viewer')).size).toBe(0);
    expect(OrgMember.findAll).not.toHaveBeenCalled();
  });

  it('the team for a managed org: its owner plus its linked roster', async () => {
    memberFindOne.mockResolvedValue({ org_id: 'B' });
    (OrgMember.findAll as jest.Mock).mockResolvedValue([{ enrollment_id: 'viewer' }, { enrollment_id: 'teammate' }, { enrollment_id: null }]);
    expect(Array.from(await teamEnrollmentIdsFor('viewer')).sort()).toEqual(['owner-B', 'teammate', 'viewer']);
  });
});
