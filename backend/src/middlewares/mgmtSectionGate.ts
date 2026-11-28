import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { adminAllowedSections, type AuthPayload } from './authMiddleware';
import { ALL_SECTIONS, type SectionKey } from '../services/access/mgmtRoles';

/**
 * mgmtSectionGate — global RBAC gate for the management portal.
 *
 * Bridge-minted staff tokens carry `mgmt_role` and are minted with role 'admin'
 * (or 'super_admin' for owner) so they pass the per-route `requireAdmin`. This
 * gate — mounted ONCE before all admin sub-routers — is what actually caps a
 * scoped role to its sections, by mapping the request path to a section and
 * checking it against the role's allowed sections. Deny-by-default for scoped
 * roles: an unmapped path is 403 for them (a forgotten mapping breaks a widget,
 * never opens a hole). Legacy admins (no mgmt_role) and owner pass untouched.
 */

// Admin API path prefix → section key. Longest-meaningful prefixes; matched with
// a segment boundary so '/api/admin/community' never captures '/communications'.
import { PATH_SECTION } from './mgmtSectionPaths';

// Section-agnostic admin endpoints every mgmt role may hit (identity, not data).
const AGNOSTIC = [
  '/api/admin/me',
  '/api/admin/login',
  '/api/admin/logout',
  // The one DATA path here, and a deliberate exception rather than an oversight.
  // This table maps ONE section per path, and the People roster legitimately
  // serves five: leads, revenue, students, program and career_review. Mapping it
  // to any single one 403s the other four - picking 'students' locks out the
  // revenue and admissions roles that personScope says should see people.
  //
  // It is NOT ungated. peopleRoutes re-checks with hasAnyPersonScope(), which is
  // STRICTER than any single section here (it denies community_organizer, who
  // holds 'dashboard'), and peopleService applies the row-level lifecycle scope
  // inside the SQL so a caller only receives the stages their sections grant.
  // The coarse check moves to the route because the route can express what this
  // table cannot.
  '/api/admin/people',
  // Campus HQ: the Management Portal's presence heartbeat. About the CALLER only (the enrollment comes from the token),
  // writes their own online time and HQ floor, returns no data. Every admin identity needs it, like /api/admin/me.
  '/api/admin/campus/here',
];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

/**
 * The sentence a person reads, and the code a program reads. Both, because they answer
 * different questions and conflating them is what caused the bug below.
 *
 * MIHRET NETSEREAB, 2 Nov 2026, sent a screenshot of /admin/dashboard under a scoped role: TEN
 * red banners, every one of them this sentence, stacked over every tile on the page.
 *
 * Nothing was broken. The dashboard fires thirteen requests in one `Promise.allSettled`, a
 * scoped role is refused about ten of them, and the page handles that correctly by simply not
 * rendering those widgets. What produced the wall was `frontend/src/utils/api.ts`, whose response
 * interceptor raises a global toast for EVERY 4xx carrying a server message. So the one case
 * where a 403 is the system working as designed was reported ten times as a failure.
 *
 * A client cannot tell that case apart by matching on English. `code` lets it: an expected
 * section refusal on a background fetch is not an error for a scoped user, while any OTHER 403
 * still is. `error` is unchanged so nothing already reading the sentence breaks.
 */
export const SECTION_DENIED = 'You do not have access to this section.';
export const SECTION_DENIED_CODE = 'section_not_permitted';

/** The section a request path belongs to, or null if unmapped. */
export function pathToSection(path: string): SectionKey | null {
  for (const [prefix, section] of PATH_SECTION) {
    if (matchesPrefix(path, prefix)) return section;
  }
  return null;
}

export function mgmtSectionGate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next(); // no token — requireAdmin will 401

  let payload: AuthPayload;
  try {
    payload = jwt.verify(authHeader.split(' ')[1], env.jwtSecret) as AuthPayload;
  } catch {
    return next(); // bad token — requireAdmin will 401
  }

  // Only bridge-minted staff tokens are gated. Legacy admins pass untouched.
  if (!payload.mgmt_role) return next();

  const allowed = adminAllowedSections(payload);
  if (allowed.length >= ALL_SECTIONS.length) return next(); // owner — everything

  if (AGNOSTIC.some((p) => matchesPrefix(req.path, p))) return next();

  const section = pathToSection(req.path);
  const isBroad = payload.mgmt_role === 'admin'; // near-full: deny only forbidden-mapped

  if (isBroad) {
    // Admin (all-but-inbox): deny only a path mapped to a section they lack.
    if (section && !allowed.includes(section)) {
      res.status(403).json({ error: SECTION_DENIED, code: SECTION_DENIED_CODE });
      return;
    }
    return next(); // everything else (mapped-allowed or unmapped cross-cutting) is fine
  }

  // Scoped role (curriculum/revenue/admissions/support): allow ONLY its sections.
  if (section && allowed.includes(section)) return next();
  res.status(403).json({ error: SECTION_DENIED, code: SECTION_DENIED_CODE });
}
