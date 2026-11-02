import { Organization, OrgMember } from '../../models';
import { managedOrgFor, managedOrgIdFor } from '../portalSettingsService';

/** The owner plus every roster member with a linked enrollment, for one organization. */
async function teamOfOrg(orgId: string): Promise<Set<string>> {
  const [org, members] = await Promise.all([
    Organization.findByPk(orgId, { attributes: ['id', 'owner_enrollment_id'] }),
    OrgMember.findAll({ where: { org_id: orgId }, attributes: ['enrollment_id'] }),
  ]);
  const team = new Set<string>();
  const owner = org?.owner_enrollment_id;
  if (owner) team.add(owner);
  for (const m of members) if (m.enrollment_id) team.add(m.enrollment_id);
  return team;
}

/**
 * The team a business viewer manages (Colaberry Campus C6): the enrollment ids of the organization's owner and every roster
 * member with a linked enrollment. "Manages" is the existing rule (portalSettingsService.resolveManagedOrg: the owned org
 * first, else a manager membership), via managedOrgIdFor, so there is one definition. Throws on a database failure; the caller
 * fails closed.
 */
export async function teamEnrollmentIdsFor(viewerEnrollmentId: string): Promise<Set<string>> {
  const orgId = await managedOrgIdFor(viewerEnrollmentId);
  return orgId ? teamOfOrg(orgId) : new Set<string>();
}

export interface CampusTeamSummary { company: string | null; team_size: number }

/**
 * C23 WP-9: the partner's company and how many people are on their team, for "Partner visit · Acme" and "2 of your 9 people".
 * The company is the org name only when it is a real one (not the fallback to the person's own name, the same has_real_name
 * Settings shows); team_size counts the team WITHOUT the viewer, because the campus never counts you among "your people".
 * Someone who manages nothing gets { company: null, team_size: 0 }. Seats are not here: no Sponsor row links to an
 * organization, so there is no true seat count to give. Throws on a database failure.
 */
export async function teamSummaryFor(viewerEnrollmentId: string): Promise<CampusTeamSummary> {
  const org = await managedOrgFor(viewerEnrollmentId);
  if (!org) return { company: null, team_size: 0 };
  const team = await teamOfOrg(org.id);
  team.delete(viewerEnrollmentId);
  const name = String(org.name ?? '').trim();
  return { company: org.has_real_name && name ? name.slice(0, 120) : null, team_size: team.size };
}
