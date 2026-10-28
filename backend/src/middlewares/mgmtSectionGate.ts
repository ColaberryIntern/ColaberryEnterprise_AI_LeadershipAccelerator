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
  // Commercialization Command Center (C8.2). Classified in the same change that mounts
  // the router, because this gate is deny-by-default: an unmapped prefix 403s a scoped
  // revenue identity with nothing in the response explaining why.
  ['/api/admin/commercialization', 'revenue'],
  ['/api/admin/campaigns', 'campaigns'], ['/api/admin/communications', 'campaigns'],
  // BEFORE the broad marketing row below, deliberately: pathToSection returns the FIRST
  // match in array order, not the longest prefix, so a narrower path placed after it is
  // never reached. This one is the catalog of connectors a brand can post through, which
  // is brand configuration rather than campaign tooling.
  ['/api/admin/marketing/connectors', 'brands'],
  ['/api/admin/marketing', 'campaigns'], ['/api/admin/visitors', 'campaigns'],
  // Brand administration (brands, their domains, sender profiles, send readiness).
  //
  // Classified the day the routes landed, not later, because THIS GATE IS
  // DENY-BY-DEFAULT for a scoped role: an unmapped path reaches the final
  // `res.status(403)` below with no row explaining why. Brand admin governs the
  // sending identity behind campaigns and communications, both already 'campaigns',
  // so it belongs to the same section rather than a new key.
  // Brand administration moved OUT of 'campaigns' into its own key on 2026-10-16 (Ali, option 2).
  // A brand here is a website the platform publishes to, and the product-experience intern's job
  // is checking those websites — so it gained a reader with no business in campaign tooling.
  //
  // `brandPaths.test.ts` argued against this and named the condition that makes it safe: every
  // role that legitimately reaches campaign tooling must be edited IN THE SAME CHANGE, or it
  // silently loses the surface. `owner` and `admin` are derived from ALL_SECTIONS and pick the
  // key up automatically; `marketing` now lists 'brands' explicitly. Nobody loses brands.
  ['/api/admin/brands', 'brands'],
  // The accounts a brand posts AS. Unmapped until 19 Oct, and because this gate is
  // deny-by-default that meant the Channels tab answered 'You do not have access to this
  // section' for EVERY scoped role, not just one: only legacy full admins, who skip the
  // gate entirely, could ever load it. Found live in an intern session.
  //
  // Filed under 'brands' because that is what these are: the destinations a brand
  // publishes to, configured on the brand setup page. The prefix also covers
  // /status, /:id and /:id/select.
  //
  // NOT widened here: /api/admin/marketing/connect/* and /marketing/linkedin/*, which
  // run the OAuth handshake that mints a real publishing credential. Reading a brand's
  // configuration and granting it the right to post are different decisions.
  ['/api/admin/channel-accounts', 'brands'],
  // Marketing content composer (drafts, variants, validation). Same section as the campaigns
  // and brands it publishes for. Mapped the day the routes landed, for the reason the brands
  // row above gives. NOTE the prefix matcher is boundary-aware, so this does not swallow
  // /api/admin/content-queue, which stays inbox_content.
  ['/api/admin/content', 'campaigns'],
  // Publishing queue and receipts (T026): the same surface the composer submits into.
  ['/api/admin/publishing', 'campaigns'],
  // Landing page authoring (brief -> draft -> preview -> publish at /p/:brand/:slug). Mapped the
  // day the routes landed, for the reason the brands row above gives: these are the destinations
  // campaigns point at, so they belong to the same section rather than a new key.
  ['/api/admin/landing-pages', 'campaigns'],
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
  // Growth Journey OS (Phase 6, T604): the multi-brand framework Explorer Growth became the
  // first programme on, so it is the same section for the same reason - it governs who may be
  // contacted on behalf of which brand, which is campaigns work. DEFENSIVE in the same way as
  // the row above: no scoped role holds 'campaigns' today, so this admits nobody new, and the
  // day one does, a classified path fails predictably rather than 403ing for a reason nothing
  // in the code explains. It covers `/status` too (the matcher is '/'-delimited), which is
  // deliberate - an always-readable registry is still campaigns data.
  ['/api/admin/growth-journey', 'campaigns'],
  ['/api/admin/sources', 'lead_ingestion'], ['/api/admin/ingest-logs', 'lead_ingestion'],
  ['/api/admin/routing-rules', 'lead_ingestion'], ['/api/admin/autonomous', 'lead_ingestion'],
  ['/api/admin/inbox', 'inbox_content'], ['/api/admin/content-queue', 'inbox_content'],
  ['/api/admin/accelerator', 'program'], ['/api/admin/community', 'program'], ['/api/admin/orchestration', 'program'],
  ['/api/admin/workforce', 'program'], ['/api/admin/brain', 'program'], ['/api/admin/projects', 'program'],
  // AI Project Factory Command Center (Phase 3): a delivery contract is program-domain work, the
  // same section as /api/admin/projects. Mapped the day the route landed; an unmapped path is a latent 403.
  ['/api/admin/factory', 'program'],
  // Agent Factory domain surfaces. UNMAPPED until 2026-10-16, which made them a latent 403 for
  // every scoped role — the exact failure `mgmtSectionGate.unlistedPaths.test.ts` exists to
  // catch, and it caught nobody here because these routes landed after that sweep.
  //
  // Found by walking all six interns through production with their own tokens for AF8.3: every
  // one of them got 403 on the page AF2.1 built FOR THEM. Not inferable from the route file,
  // which carries `requireSection('program')` and looks deliberate; the refusal happens earlier,
  // in this table, because `pathToSection` returned null and a scoped role is deny-by-default.
  //
  // TWO ROWS, NOT ONE, and the split is the point:
  //
  //   -mine        is SELF-SCOPED. It resolves the caller's own identity from their verified
  //                token and returns only the domains they own — an owner of nothing gets an
  //                empty list. Its safety lives in the query, not in the gate, so gating it on
  //                a section no intern holds protected nothing and blocked everyone. 'dashboard'
  //                is the one section every mgmt role carries.
  //
  //   the rest     return ALL TEN domains regardless of caller, so they stay on 'program'.
  //
  // These are siblings separated by a hyphen, not a slash, and `matchesPrefix` requires an exact
  // match or a '/' boundary — so the 'program' row below cannot swallow '-mine'.
  ['/api/admin/agent-domains-mine', 'dashboard'],
  ['/api/admin/agent-domains-provisioned', 'program'],
  ['/api/admin/agent-domains', 'program'],
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
  // Milestone-ladder recompute (routes/admin/certificationAdminRoutes). Re-ranks
  // students against curriculum + project + certification milestones — programme
  // work, same section as cert-prep and projects. Registered with the route.
  ['/api/admin/progression', 'program'],
  // AI Internship application review. Its OWN section rather than 'program':
  // the queue carries an applicant's resume, phone number and interview
  // transcript, so reviewing an application is a materially wider grant than
  // editing curriculum and the two should not travel together. Registered here
  // with the routes, for the reason the case-studies row above documents — an
  // unmapped path is deny-by-default for every scoped mgmt token, and
  // 'admissions' (Dhee) is exactly such a token.
  ['/api/admin/internship', 'internship'],
  // CAPE — the Architecture Skills taxonomy (skill definitions, evidence-band
  // weights) and the Feed Control governance board built on it. Programme work:
  // it defines what students are measured on, so it belongs with curriculum.
  // This row was missing while BOTH /admin/cape-settings and
  // /admin/feed-control-governance were live surfaces calling /api/admin/cape/*
  // — exactly the latent 403 the two comments above describe, where the page
  // renders for a scoped mgmt identity and then 403s on every call. Found when
  // Feed Control Governance was folded into the Curriculum surface and its
  // route lost its nav entry, which turned the gap from latent into live.
  ['/api/admin/cape', 'program'],
  ['/api/admin/ceo', 'intelligence'], ['/api/admin/cb-system', 'intelligence'], ['/api/admin/intelligence', 'intelligence'],
  ['/api/admin/insights', 'intelligence'], ['/api/admin/governance', 'intelligence'],
  ['/api/admin/tickets', 'system'], ['/api/admin/reports', 'system'], ['/api/admin/settings', 'system'],
  ['/api/admin/students', 'students'], // Support role's read-only student-story surface

  // ── Surfaces with no sidebar entry ──────────────────────────────────────
  //
  // Twelve admin routes had no nav entry, so the frontend's sectionForPath()
  // returned null and ProtectedRoute admitted every mgmt-role identity, while
  // this gate denied them by default. A mentor could open /admin/apollo and get
  // a page that 403d on every call with nothing explaining why.
  //
  // These rows are the backend half of the fix; the frontend half is
  // UNLISTED_PATH_SECTIONS in adminNav.ts, and a test asserts the two agree.
  // As the explorer-growth row above already argues: an UNMAPPED path is a
  // latent 403, and classified paths fail predictably.
  ['/api/admin/apollo', 'lead_ingestion'],
  ['/api/admin/import', 'lead_ingestion'],
  ['/api/admin/tracking-estate', 'campaigns'],
  ['/api/admin/executive-narrative', 'dashboard'],
  // Unified project lifecycle (docs/project-lifecycle/architecture.md). A project's lifecycle is
  // program-domain work, the same section as the delivery contracts and projects it governs.
  //
  // Mapped the day the routes landed, for the reason the rows above give: THIS GATE IS
  // DENY-BY-DEFAULT, so an unmapped path reaches the final 403 with nothing explaining why. There
  // is no frontend route yet (Phase 5 adds the review page), so there is deliberately no
  // UNLISTED_PATH_SECTIONS twin — that list pairs FRONTEND routes lacking a sidebar entry with a
  // section, and this is an API-only surface for now.
  ['/api/admin/project-lifecycle', 'program'],
  // Audit ledger — classified from what it returns (event_type, actor,
  // entity_type, entity_id, payload), not from its name.
  ['/api/admin/events', 'system'],
  ['/api/admin/work-ledger-health', 'system'],
  ['/api/admin/automation', 'system'],
  ['/api/admin/agent-orphans', 'intelligence'],
  ['/api/admin/knowledge-ops', 'intelligence'],
];

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
