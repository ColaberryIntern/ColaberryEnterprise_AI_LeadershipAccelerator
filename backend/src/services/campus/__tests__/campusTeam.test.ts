/**
 * C6 team lookup: the organization the viewer manages (the existing resolveManagedOrg rule via managedOrgIdFor), and its
 * owner plus every roster member with a linked enrollment.
 */
let mockOrgId: string | null = 'org-1';
let mockOrg: { id: string; name: string; has_real_name: boolean } | null = null;
jest.mock('../../portalSettingsService', () => ({ managedOrgIdFor: jest.fn(async () => mockOrgId), managedOrgFor: jest.fn(async () => mockOrg) }));
jest.mock('../../../models', () => ({
  Organization: { findByPk: jest.fn() },
  OrgMember: { findAll: jest.fn() },
}));

import { Organization, OrgMember } from '../../../models';
import { managedOrgIdFor } from '../../portalSettingsService';
import { teamEnrollmentIdsFor, teamSummaryFor } from '../campusTeam';

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgId = 'org-1';
  mockOrg = { id: 'org-1', name: 'Acme Logistics', has_real_name: true };
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

describe('teamSummaryFor (C23 WP-9)', () => {
  it('a real company name and the team WITHOUT the viewer (the owner here)', async () => {
    expect(await teamSummaryFor('owner-1')).toEqual({ company: 'Acme Logistics', team_size: 2 });
  });

  it('a manager who is not the owner: the owner counts, the viewer does not', async () => {
    expect(await teamSummaryFor('m-1')).toEqual({ company: 'Acme Logistics', team_size: 2 });
  });

  it('the org name is only the fallback to a person\'s name: no company shown, the team still counted', async () => {
    mockOrg = { id: 'org-1', name: 'Dana Reyes', has_real_name: false };
    expect(await teamSummaryFor('owner-1')).toEqual({ company: null, team_size: 2 });
  });

  it('manages nothing: no company, a team of 0, no roster query', async () => {
    mockOrg = null;
    expect(await teamSummaryFor('viewer')).toEqual({ company: null, team_size: 0 });
    expect(OrgMember.findAll).not.toHaveBeenCalled();
  });

  it('nobody else yet (a solo owner): a team of 0', async () => {
    (OrgMember.findAll as jest.Mock).mockResolvedValue([]);
    expect((await teamSummaryFor('owner-1')).team_size).toBe(0);
  });

  it('a database failure propagates (the route answers 500)', async () => {
    (OrgMember.findAll as jest.Mock).mockRejectedValue(new TypeError('db down'));
    await expect(teamSummaryFor('owner-1')).rejects.toThrow('db down');
  });
});
