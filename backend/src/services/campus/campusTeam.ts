import { Organization, OrgMember } from '../../models';
import { managedOrgIdFor } from '../portalSettingsService';

/**
 * The team a business viewer manages (Colaberry Campus C6): the enrollment ids of the organization's owner and every roster
 * member with a linked enrollment. "Manages" is the existing rule (portalSettingsService.resolveManagedOrg: the owned org
 * first, else a manager membership), via managedOrgIdFor, so there is one definition. Throws on a database failure; the caller
 * fails closed.
 */
export async function teamEnrollmentIdsFor(viewerEnrollmentId: string): Promise<Set<string>> {
  const orgId = await managedOrgIdFor(viewerEnrollmentId);
  const team = new Set<string>();
  if (!orgId) return team;
  const [org, members] = await Promise.all([
    Organization.findByPk(orgId, { attributes: ['id', 'owner_enrollment_id'] }),
    OrgMember.findAll({ where: { org_id: orgId }, attributes: ['enrollment_id'] }),
  ]);
  const owner = org?.owner_enrollment_id;
  if (owner) team.add(owner);
  for (const m of members) if (m.enrollment_id) team.add(m.enrollment_id);
  return team;
}
