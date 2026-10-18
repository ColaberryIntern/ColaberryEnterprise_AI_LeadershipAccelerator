/**
 * C6 team lookup: the organization the viewer manages (the existing resolveManagedOrg rule via managedOrgIdFor), and its
 * owner plus every roster member with a linked enrollment.
 */
let mockOrgId: string | null = 'org-1';
jest.mock('../../portalSettingsService', () => ({ managedOrgIdFor: jest.fn(async () => mockOrgId) }));
jest.mock('../../../models', () => ({
  Organization: { findByPk: jest.fn() },
  OrgMember: { findAll: jest.fn() },
}));

import { Organization, OrgMember } from '../../../models';
import { managedOrgIdFor } from '../../portalSettingsService';
import { teamEnrollmentIdsFor } from '../campusTeam';

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgId = 'org-1';
  (Organization.findByPk as jest.Mock).mockResolvedValue({ id: 'org-1', owner_enrollment_id: 'owner-1' });
  (OrgMember.findAll as jest.Mock).mockResolvedValue([{ enrollment_id: 'm-1' }, { enrollment_id: null }, { enrollment_id: 'm-2' }]);
});

describe('teamEnrollmentIdsFor', () => {
  it('owner plus every member with a linked enrollment (invited-only rows skipped)', async () => {
    expect(Array.from(await teamEnrollmentIdsFor('viewer')).sort()).toEqual(['m-1', 'm-2', 'owner-1']);
    expect(managedOrgIdFor).toHaveBeenCalledWith('viewer');
    expect((OrgMember.findAll as jest.Mock).mock.calls[0][0].where).toEqual({ org_id: 'org-1' });
  });

  it('manages nothing: an empty team, no roster query', async () => {
    mockOrgId = null;
    expect((await teamEnrollmentIdsFor('viewer')).size).toBe(0);
    expect(OrgMember.findAll).not.toHaveBeenCalled();
  });

  it('a database failure propagates (the caller names nobody)', async () => {
    (OrgMember.findAll as jest.Mock).mockRejectedValue(new TypeError('db down'));
    await expect(teamEnrollmentIdsFor('viewer')).rejects.toThrow('db down');
  });
});
