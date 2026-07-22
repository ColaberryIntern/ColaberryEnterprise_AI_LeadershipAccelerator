import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import CommunityMember from '../../models/CommunityMember';
import Enrollment from '../../models/Enrollment';
import { isMgmtRole, sectionsForRole, MGMT_ROLE_DEFS, type SectionKey } from './mgmtRoles';

/**
 * The student→admin session bridge. A staff member with a management role opens
 * the admin portal from INSIDE their student session (no separate credentials):
 * the frontend calls mint() and gets a short-lived admin token scoped to their
 * mgmt role. Only community role 'staff' + a valid mgmt_role qualifies.
 */

export interface MgmtStatus {
  is_mgmt: boolean;
  role: string | null;
  label: string | null;
}

async function loadMgmtRole(enrollmentId: string): Promise<string | null> {
  const member = await CommunityMember.findOne({
    where: { enrollment_id: enrollmentId },
    attributes: ['role', 'mgmt_role'],
  });
  if (!member || member.role !== 'staff' || !isMgmtRole(member.mgmt_role)) return null;
  return member.mgmt_role;
}

/** Does this student's account carry a management role? Drives the "Management
 *  Portal" link visibility in the student portal. */
export async function getMgmtStatus(enrollmentId: string): Promise<MgmtStatus> {
  const role = await loadMgmtRole(enrollmentId);
  return { is_mgmt: !!role, role, label: role && isMgmtRole(role) ? MGMT_ROLE_DEFS[role].label : null };
}

export interface MintedMgmtToken {
  admin_token: string;
  role: string;
  sections: SectionKey[];
}

/**
 * Mint a scoped admin JWT for a staff member. Returns null if they are not a
 * mgmt user. The JWT's `role` is 'super_admin' for owner and 'admin' for every
 * other role, so the token passes the per-route `requireAdmin` that guards each
 * admin router. The real scoping is done by `mgmtSectionGate` (mounted globally
 * ahead of the sub-routers), which reads `mgmt_role` and caps the request to the
 * sections that adminAllowedSections()/sectionsForRole() permit. Short-lived.
 */
export async function mintMgmtAdminToken(enrollmentId: string): Promise<MintedMgmtToken | null> {
  const mgmt = await loadMgmtRole(enrollmentId);
  if (!mgmt || !isMgmtRole(mgmt)) return null;

  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['email'] });
  const email = (enrollment as any)?.email || '';
  const jwtRole = mgmt === 'owner' ? 'super_admin' : 'admin';

  const admin_token = jwt.sign(
    { sub: enrollmentId, email, role: jwtRole, mgmt_role: mgmt },
    env.jwtSecret,
    { expiresIn: '12h' },
  );
  return { admin_token, role: mgmt, sections: sectionsForRole(mgmt) };
}
