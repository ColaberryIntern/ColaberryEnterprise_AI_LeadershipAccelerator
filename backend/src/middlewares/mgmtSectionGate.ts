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
const PATH_SECTION: Array<[string, SectionKey]> = [
  ['/api/admin/dashboard', 'dashboard'],
  ['/api/admin/trust', 'trust'],
  ['/api/admin/war-room', 'war_room'],
  ['/api/admin/revenue', 'revenue'], ['/api/admin/refunds', 'revenue'], ['/api/admin/pipeline', 'revenue'],
  ['/api/admin/opportunities', 'revenue'], ['/api/admin/leads', 'revenue'], ['/api/admin/funnel', 'revenue'],
  ['/api/admin/campaigns', 'campaigns'], ['/api/admin/communications', 'campaigns'],
  ['/api/admin/marketing', 'campaigns'], ['/api/admin/visitors', 'campaigns'],
  // Explorer Growth OS Command Center (spec §27; §1381 assigns it
  // `section: 'campaigns'` explicitly, so no new section key is needed).
  //
  // This row grants nobody new access, and that is not a reason to omit it. No
  // scoped role holds 'campaigns' — the surface is owner + admin with or
  // without this line. It earns its place because an UNMAPPED path is a latent
  // 403: the day 'campaigns' is granted to a scoped role, an unclassified path
  // would deny them with an error message nothing in the code explains.
  // Classified paths fail predictably. The case-studies row below is the
  // receipt for learning that the expensive way.
  ['/api/admin/explorer-growth', 'campaigns'],
  ['/api/admin/sources', 'lead_ingestion'], ['/api/admin/ingest-logs', 'lead_ingestion'],
  ['/api/admin/routing-rules', 'lead_ingestion'], ['/api/admin/autonomous', 'lead_ingestion'],
  ['/api/admin/inbox', 'inbox_content'], ['/api/admin/content-queue', 'inbox_content'],
  ['/api/admin/accelerator', 'program'], ['/api/admin/community', 'program'], ['/api/admin/orchestration', 'program'],
  ['/api/admin/workforce', 'program'], ['/api/admin/brain', 'program'], ['/api/admin/projects', 'program'],
  ['/api/admin/cohorts', 'program'], ['/api/admin/curriculum', 'program'], ['/api/admin/components', 'program'],
  ['/api/admin/composer', 'program'], ['/api/admin/capabilities', 'program'], ['/api/admin/recipes', 'program'],
  ['/api/admin/feed-control', 'program'],
  // Case Study OS (spec §20). Same section as '/api/admin/projects': a Case
  // Study is the publishable projection of a platform Project, so the roles that
  // manage Projects manage these. Without this row the gate is deny-by-default
  // and every scoped mgmt token 403s here while legacy admin passes.
  ['/api/admin/case-studies', 'program'],
  // Cert Prep instructor/admin surface. Same section as '/api/admin/curriculum'
  // and '/api/admin/cohorts': approving practice questions and verifying a
  // student's build evidence is programme work, done by the roles that already
  // manage curriculum. Registered here BEFORE the routes exist, for the reason
  // the case-studies row above documents — an unmapped path is deny-by-default
  // for every scoped mgmt token, failing with an error nothing explains.
  ['/api/admin/cert-prep', 'program'],
  ['/api/admin/ceo', 'intelligence'], ['/api/admin/cb-system', 'intelligence'], ['/api/admin/intelligence', 'intelligence'],
  ['/api/admin/insights', 'intelligence'], ['/api/admin/governance', 'intelligence'],
  ['/api/admin/tickets', 'system'], ['/api/admin/reports', 'system'], ['/api/admin/settings', 'system'],
  ['/api/admin/students', 'students'], // Support role's read-only student-story surface
];

// Section-agnostic admin endpoints every mgmt role may hit (identity, not data).
const AGNOSTIC = ['/api/admin/me', '/api/admin/login', '/api/admin/logout'];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

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
      res.status(403).json({ error: 'You do not have access to this section.' });
      return;
    }
    return next(); // everything else (mapped-allowed or unmapped cross-cutting) is fine
  }

  // Scoped role (curriculum/revenue/admissions/support): allow ONLY its sections.
  if (section && allowed.includes(section)) return next();
  res.status(403).json({ error: 'You do not have access to this section.' });
}
