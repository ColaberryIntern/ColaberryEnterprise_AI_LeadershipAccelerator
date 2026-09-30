import { Request, Response, NextFunction } from 'express';
import { Organization, OrgMember } from '../models';

// Resolved organization instance attached to the request by requireOrgManager.
type OrganizationInstance = InstanceType<typeof Organization>;
type OrgMemberInstance = InstanceType<typeof OrgMember>;

declare global {
  namespace Express {
    interface Request {
      org?: OrganizationInstance;
    }
  }
}

/**
 * Resolve the organization the authenticated caller MANAGES and attach it as
 * `req.org`. A manager is either the org owner (organizations.owner_enrollment_id)
 * or an OrgMember row with role='manager'. 403 when the caller manages no org.
 *
 * MUST run after `requireParticipant` (reads `req.participant.sub`).
 *
 * TENANCY (Gate 5). This path needs no tenant filter, and that is a property of how it
 * resolves rather than an oversight: the org is derived from the AUTHENTICATED enrollment,
 * never from a route parameter, so a manager can only ever reach the org they own or
 * manage. There is no id for a caller to substitute. That is why the admin surface
 * (`adminOrgService`) required explicit scoping while this one did not.
 *
 * KNOWN LIMIT, recorded rather than fixed. If one person ever manages orgs in two
 * different tenants, this returns the OLDEST — deterministically, but without regard to
 * which brand's site the request arrived on. It cannot happen today: every organization
 * belongs to Colaberry Enterprise (verified in production, 6 of 6). Fixing it properly
 * means resolving against the request's brand context, which is only meaningful once a
 * second tenant actually owns an org, so it is deferred with the rest of Gate 5's
 * multi-tenant-org work rather than guessed at now.
 */
export async function requireOrgManager(req: Request, res: Response, next: NextFunction): Promise<void> {
  const enrollmentId = req.participant?.sub;
  if (!enrollmentId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    // Prefer the owned org; fall back to a manager-role membership.
    let org: OrganizationInstance | null = await Organization.findOne({
      where: { owner_enrollment_id: enrollmentId },
      order: [['created_at', 'ASC']],
    });

    if (!org) {
      const membership: OrgMemberInstance | null = await OrgMember.findOne({
        where: { enrollment_id: enrollmentId, role: 'manager' },
      });
      if (membership) {
        org = await Organization.findByPk(membership.org_id);
      }
    }

    if (!org) {
      res.status(403).json({ error: 'You do not manage an organization' });
      return;
    }

    req.org = org;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Assert an enrollment belongs to an organization's roster. Returns the matching
 * OrgMember row, or throws a 404-tagged error the controller maps to a response.
 * Used to scope per-member drill-downs so a manager can only read their own org.
 */
export async function assertMemberInOrg(orgId: string, enrollmentId: string): Promise<OrgMemberInstance> {
  const member = await OrgMember.findOne({ where: { org_id: orgId, enrollment_id: enrollmentId } });
  if (!member) {
    throw Object.assign(new Error('Member not found in organization'), { status: 404 });
  }
  return member;
}
