import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import CommunityMember from '../../models/CommunityMember';
import Enrollment from '../../models/Enrollment';
import { signParticipantJwt } from '../participantService';
import { isMgmtRole, effectiveSections, normalizeExtraSections, MGMT_ROLE_DEFS, type SectionKey } from './mgmtRoles';

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
  /** The sections this person's admin session would be scoped to (the same `sectionsForRole` the minted admin
   *  token carries). The campus HQ building reads it to decide which floors your badge opens; it is presentation
   *  only, and `mgmtSectionGate` stays the one enforcement point. Empty for anyone who is not a mgmt user. */
  sections: SectionKey[];
}

/** C82: the management role and the extra sections granted on top of it (normalized: real keys the role does not already give). */
async function loadMgmtGrant(enrollmentId: string): Promise<{ role: string; extras: SectionKey[] } | null> {
  const member = await CommunityMember.findOne({
    where: { enrollment_id: enrollmentId },
    attributes: ['role', 'mgmt_role', 'mgmt_extra_sections'],
  });
  if (!member || member.role !== 'staff' || !isMgmtRole(member.mgmt_role)) return null;
  return { role: member.mgmt_role, extras: normalizeExtraSections(member.mgmt_role, member.mgmt_extra_sections) };
}

async function loadMgmtRole(enrollmentId: string): Promise<string | null> {
  return (await loadMgmtGrant(enrollmentId))?.role ?? null;
}

export interface StaffPortalLink {
  enrollmentId: string;
  mgmtRole: string;
}

/**
 * Find the staff/portal account linked to a legacy admin_users login, by email
 * (email is not unique on enrollments — e.g. someone can hold a prior Explorer
 * enrollment plus their staff one — so this resolves ALL enrollments for the
 * email, then picks whichever one actually carries the staff CommunityMember
 * row). Used by authenticateAdmin() to attach `portal_enrollment_id` to a
 * DIRECT admin login so "AI Training" works without the portal->Management
 * Portal round trip. Deliberately NOT used to set the `mgmt_role` JWT claim
 * itself for direct logins — adminAllowedSections() treats `mgmt_role` as an
 * override that NARROWS a session to that role's sections, so stamping it on
 * a legacy full-admin login would silently shrink their access. This link is
 * only ever consumed for "does a connected portal account exist" (the AI
 * Training bridge), never for section-scoping.
 */
export async function loadStaffPortalLinkByEmail(email: string): Promise<StaffPortalLink | null> {
  const enrollments = await Enrollment.findAll({ where: { email }, attributes: ['id'] });
  if (enrollments.length === 0) return null;
  const member = await CommunityMember.findOne({
    where: { enrollment_id: enrollments.map((e) => e.id), role: 'staff' },
    attributes: ['enrollment_id', 'mgmt_role'],
  });
  if (!member || !isMgmtRole(member.mgmt_role)) return null;
  return { enrollmentId: member.enrollment_id, mgmtRole: member.mgmt_role as string };
}

/** Does this student's account carry a management role? Drives the "Management
 *  Portal" link visibility in the student portal. */
export async function getMgmtStatus(enrollmentId: string): Promise<MgmtStatus> {
  const grant = await loadMgmtGrant(enrollmentId);
  const role = grant?.role ?? null;
  return {
    is_mgmt: !!role,
    role,
    label: role && isMgmtRole(role) ? MGMT_ROLE_DEFS[role].label : null,
    // C82: the effective sections (role + extras), the same function the admin token's sections come from
    sections: effectiveSections(role, grant?.extras),
  };
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
  const grant = await loadMgmtGrant(enrollmentId);
  const mgmt = grant?.role ?? null;
  if (!grant || !mgmt || !isMgmtRole(mgmt)) return null;

  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['email'] });
  const email = (enrollment as any)?.email || '';
  const jwtRole = mgmt === 'owner' ? 'super_admin' : 'admin';

  const admin_token = jwt.sign(
    // C82: the extras ride in the token, so every admin check stays synchronous (a revoke lags like a role change: 12 h)
    { sub: enrollmentId, email, role: jwtRole, mgmt_role: mgmt, ...(grant.extras.length ? { mgmt_extra_sections: grant.extras } : {}) },
    env.jwtSecret,
    { expiresIn: '12h' },
  );
  return { admin_token, role: mgmt, sections: effectiveSections(mgmt, grant.extras) };
}

export interface MintedPortalToken {
  portal_token: string;
}

/**
 * The reverse of mintMgmtAdminToken: from inside an admin session, a staff
 * member jumps back into their OWN student/portal account with no separate
 * login — "AI Training" in the admin nav. Re-checks live mgmt status (not
 * just the admin JWT's `mgmt_role` claim) so a role revoked mid-session can't
 * ride a stale 12h admin token back into the portal. Returns a normal,
 * full-access participant token (this is the member's own account, not a
 * read-only view of someone else's — see acceleratorService.getReadOnlyViewAsUrl
 * for that separate, unrelated impersonation path). Null if not a mgmt user.
 */
export async function mintPortalTokenForStaff(enrollmentId: string): Promise<MintedPortalToken | null> {
  const mgmt = await loadMgmtRole(enrollmentId);
  if (!mgmt || !isMgmtRole(mgmt)) return null;

  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'email', 'cohort_id'] });
  if (!enrollment) return null;

  const portal_token = signParticipantJwt({
    id: enrollment.id,
    email: (enrollment as any).email,
    cohort_id: (enrollment as any).cohort_id,
  });
  return { portal_token };
}
