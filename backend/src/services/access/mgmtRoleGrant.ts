/**
 * mgmtRoleGrant — who may hand out which management role.
 *
 * ## The hole this closes
 *
 * `PATCH /api/admin/community/members/:memberId/mgmt-role` was guarded by `requireAdmin` alone.
 * For a bridge-minted staff token, `mgmtSectionGate` maps `/api/admin/community` to the `program`
 * section, so any scoped role holding `program` (today: `curriculum`, and `admin`) reached the
 * route that writes `mgmt_role`. From there a holder could set any staff member's role to `owner`,
 * including their own, and `owner` is the only role that reaches `inbox_content`.
 *
 * So the narrowest intern-facing role on the platform was one request away from Ali's inbox.
 * Reported by Quincy on 2026-10-26 while building Ellis's access watch, found by reading
 * `communityMemberRoutes.ts` against `mgmtSectionGate.ts` rather than by trying it.
 *
 * ## The rule, and why it is a subset test rather than "owner only"
 *
 * The obvious fix is to make the route owner-only. That closes the hole and also takes role
 * administration away from every legacy full admin who does it today, which is a second, silent
 * change to someone else's working surface.
 *
 * The property actually wanted is **no escalation**: you may not grant access you do not hold,
 * and you may not take away access you could not grant. Expressed as a subset test over sections,
 * that is one comparison, and it needs no list of privileged roles to be kept in step with
 * `MGMT_ROLE_DEFS` as roles are added. A legacy admin and `owner` both hold `ALL_SECTIONS`, so
 * both keep working exactly as before; `curriculum` can still assign `curriculum`, which is not
 * an escalation; nobody can reach `owner` from below.
 *
 * **Both directions are checked.** The role being granted must be within the caller's authority,
 * and so must the role the target holds right now. Checking only the new role would still let a
 * `curriculum` holder clear the owner's role, which is a takeover by subtraction rather than
 * addition.
 */
import { sectionsForRole, type MgmtRole, type SectionKey } from './mgmtRoles';

export interface GrantRequest {
  /** The caller's own allowed sections, from `adminAllowedSections(payload)`. */
  callerSections: SectionKey[];
  /** The role the target holds right now, or null when they hold none. */
  currentRole: string | null;
  /** The role being assigned, or null to clear it. */
  newRole: string | null;
  /** C82: the extra sections the target holds right now (their access is role + extras, so a removal counts them too). */
  currentExtras?: readonly string[];
}

export interface GrantVerdict {
  allowed: boolean;
  /** Set when `allowed` is false: a message safe to return to the caller. */
  reason?: string;
  /** Set when `allowed` is false: the role that exceeded the caller's authority. */
  blockedBy?: string;
}

/**
 * Is every section this role grants also held by the caller?
 *
 * Clearing a role (null) grants nothing, so it is vacuously within anyone's authority as the NEW
 * role. It is the CURRENT role that makes a removal consequential, and that is checked separately.
 */
function withinAuthority(callerSections: SectionKey[], role: string | null): boolean {
  if (role === null) return true;
  const granted = sectionsForRole(role as MgmtRole);
  // An unknown role resolves to no sections. `sectionsForRole` denies by default, and the route
  // rejects unknown role names with a 400 before reaching here, so this stays a subset test
  // rather than a second validation path that could disagree with it.
  const held = new Set<string>(callerSections);
  return granted.every((section) => held.has(section));
}

/**
 * May this caller move the target from `currentRole` to `newRole`?
 *
 * Pure: no database, no request object, no token parsing. The route supplies the caller's sections
 * from the verified token, which keeps this testable without standing up express or a JWT.
 */
export function canGrantMgmtRole(req: GrantRequest): GrantVerdict {
  if (!withinAuthority(req.callerSections, req.newRole)) {
    return {
      allowed: false,
      blockedBy: req.newRole ?? undefined,
      reason: 'You cannot assign a management role that grants more access than your own.',
    };
  }

  if (!withinAuthority(req.callerSections, req.currentRole) || !allHeld(req.callerSections, req.currentExtras ?? [])) {
    return {
      allowed: false,
      blockedBy: req.currentRole ?? undefined,
      reason: 'You cannot change the management role of someone who holds more access than you.',
    };
  }

  return { allowed: true };
}

function allHeld(callerSections: SectionKey[], sections: readonly string[]): boolean {
  const held = new Set<string>(callerSections);
  return sections.every((section) => held.has(section));
}

export interface ExtrasRequest {
  callerSections: SectionKey[];
  /** The target's management role (extras only ever apply on top of one). */
  role: string | null;
  currentExtras: readonly string[];
  newExtras: readonly string[];
}

/**
 * C82 (H4 option A): may this caller set the target's extra sections? The same no-escalation rule as roles, in both directions:
 * every extra granted must be a section the caller holds, and the target's CURRENT access (role + current extras) must be within
 * the caller's, so nobody below can grant themselves or others more, or strip someone who holds more. Pure, as canGrantMgmtRole.
 */
export function canGrantExtraSections(req: ExtrasRequest): GrantVerdict {
  const over = req.newExtras.find((x) => !req.callerSections.includes(x as SectionKey));
  if (over) return { allowed: false, blockedBy: over, reason: 'You cannot grant a section you do not hold yourself.' };
  if (!withinAuthority(req.callerSections, req.role) || !allHeld(req.callerSections, req.currentExtras)) {
    return { allowed: false, blockedBy: req.role ?? undefined, reason: 'You cannot change the sections of someone who holds more access than you.' };
  }
  return { allowed: true };
}
