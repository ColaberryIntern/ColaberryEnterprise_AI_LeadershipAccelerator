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
