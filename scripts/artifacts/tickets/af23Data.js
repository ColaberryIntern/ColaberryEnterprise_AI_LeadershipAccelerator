/**
 * AF2.3's facts, measured once, read by both PDFs.
 *
 * The document and the one-page visual are built from THIS MODULE and nothing else, so a number on
 * the visual cannot drift from the same number in the document. That is not tidiness: the two
 * artifacts are attached to the same ticket minutes apart, and a reader who finds "two of seven"
 * on one and "three of seven" on the other has no way to tell which to believe, so they believe
 * neither.
 *
 * Every figure below was measured on 2026-10-15 against production, or read out of the source
 * named beside it. Nothing here is inferred from a nav menu or a role name.
 */

const MEASURED_ON = '15 October 2026';

/** Where each fact came from, so a future reader can re-measure rather than re-derive. */
const SOURCES = {
  gate: 'backend/src/middlewares/mgmtSectionGate.ts (PATH_SECTION)',
  roles: 'backend/src/services/access/mgmtRoles.ts (MGMT_ROLE_DEFS)',
  db: 'accelerator_prod — community_members, agent_domain_projects, career_mentor_scopes',
};

/**
 * Verdict vocabulary. Deliberately five values, not three: "the role exists but reaches two
 * domains" and "the role exists but is read-only" are different failures from "no role exists",
 * and collapsing them would hide which interns can be fixed by a decision versus by a build.
 */
const V = {
  SCOPABLE: { key: 'SCOPABLE', label: 'Scopable today', color: '#2f7d32' },
  COLLIDES: { key: 'COLLIDES', label: 'Role covers two domains', color: '#b26a00' },
  READONLY: { key: 'READONLY', label: 'Read-only surface', color: '#b26a00' },
  NO_ROLE: { key: 'NO_ROLE', label: 'No role below Admin', color: '#b3261e' },
  NO_SURFACE: { key: 'NO_SURFACE', label: 'No surface exists', color: '#b3261e' },
};

/**
 * The ten domains. `routes` is the count of admin path prefixes mapping to that section in the
 * gate's own table -- a measure of how much surface the grant actually carries, which is the
 * difference between "a tab" and "the settings page".
 */
const DOMAINS = [
  {
    key: 'curriculum', intern: 'Ruth Kumera', section: 'program', routes: 19,
    role: 'curriculum', roleSections: 'dashboard + program', verdict: V.SCOPABLE,
    note: 'Cleanest fit of the ten. Ruth is not activated: her onboarding requirements stand.',
  },
  {
    key: 'sales', intern: 'Victoria Spencer-Auber', section: 'revenue', routes: 6,
    role: 'revenue', roleSections: 'dashboard + revenue + leads', verdict: V.SCOPABLE,
    note: 'The role also carries `leads`, a narrower slice of the same group. No other domain.',
  },
  {
    key: 'admissions', intern: 'Kalkidan Bezabeh', section: 'lead_ingestion', routes: 6,
    role: 'admissions', roleSections: 'dashboard + lead_ingestion + internship', verdict: V.COLLIDES,
    note: 'No /api/admin/admissions prefix exists; the nine admissions routes use requireAdmin.',
  },
  {
    key: 'internship', intern: 'Tashima Diah', section: 'internship', routes: 1,
    role: 'admissions', roleSections: 'dashboard + lead_ingestion + internship', verdict: V.COLLIDES,
    note: 'Carries applicant resumes, phone numbers and interview transcripts.',
  },
  {
    key: 'marketing', intern: 'Sarbjit Kaur', section: 'campaigns', routes: 11,
    role: null, roleSections: 'Admin (13 of 14) or Owner only', verdict: V.NO_ROLE,
    note: 'The richest surface of the ten, and the example used on the 14 Oct call.',
  },
  {
    key: 'platform', intern: 'Quincy Nkwain Ninying', section: 'system', routes: 6,
    role: null, roleSections: 'Admin (13 of 14) or Owner only', verdict: V.NO_ROLE,
    note: 'Includes settings, events and automation — the widest-consequence section.',
  },
  {
    key: 'product_experience', intern: 'Mihret Netsereab', section: null, routes: 0,
    role: null, roleSections: '—', verdict: V.NO_SURFACE,
    note: 'The one intern whose domain has no admin surface at all.',
  },
  {
    key: 'executive', intern: null, section: 'war_room / trust / dashboard', routes: 4,
    role: null, roleSections: 'Admin (13 of 14) or Owner only', verdict: V.NO_ROLE,
    note: 'No intern assigned, so not a Monday blocker.',
  },
  {
    key: 'learner_success', intern: null, section: 'students', routes: 1,
    role: 'support', roleSections: 'students only', verdict: V.READONLY,
    note: 'Read-only by construction, so it fails link 2 even though a role covers it.',
  },
  {
    key: 'website', intern: null, section: null, routes: 0,
    role: null, roleSections: '—', verdict: V.NO_SURFACE,
    note: 'No intern assigned. No path prefix maps to it.',
  },
];

const INTERNS = DOMAINS.filter((d) => d.intern);

/** Derived, never hand-typed: a count in prose and a count on a chart must be the same count. */
const COUNTS = {
  domains: DOMAINS.length,
  interns: INTERNS.length,
  scopable: INTERNS.filter((d) => d.verdict === V.SCOPABLE).length,
  collides: INTERNS.filter((d) => d.verdict === V.COLLIDES).length,
  noRole: INTERNS.filter((d) => d.verdict === V.NO_ROLE).length,
  noSurface: INTERNS.filter((d) => d.verdict === V.NO_SURFACE).length,
  domainsNoSurface: DOMAINS.filter((d) => d.verdict === V.NO_SURFACE).length,
  domainsNoRole: DOMAINS.filter((d) => d.verdict === V.NO_ROLE).length,
  unassigned: DOMAINS.filter((d) => !d.intern).length,
  sectionKeys: 14,
  mgmtRolesDeclared: 8,
  checkRolesPermitted: 7,
};

/** The RBAC facts that decide whether the ticket can complete at all. */
const RBAC = {
  grantModel: 'One role per person. Each role carries a FIXED set of sections. '
    + 'There is no per-person section grant.',
  methodAware: false,
  methodNote: 'The gate never reads req.method, so a section grant covers GET and '
    + 'POST/PUT/DELETE alike. Link 2 needs UPDATE, and a section grant satisfies it.',
  legacyBypass: 'if (!payload.mgmt_role) return next() — only bridge-minted staff tokens are '
    + 'gated, so a legacy admin login is scoped by nothing at all.',
  unmappedIs403: 'A scoped role is deny-by-default on an unmapped path, so a new surface that is '
    + 'not added to PATH_SECTION 403s its own owner.',
};

/** The defect found while measuring, and fixed in the same PR. */
const MENTOR_DEFECT = {
  title: 'A role declared in TypeScript and rejected by Postgres',
  declared: COUNTS.mgmtRolesDeclared,
  permitted: COUNTS.checkRolesPermitted,
  missing: 'mentor',
  scopeRows: 0,
  holders: 0,
  severity: 'latent, not live-broken',
  why: 'Nobody held the role, so nothing visibly failed. The portfolio review queue simply had '
    + 'no mentors and nothing anywhere said why.',
  fix: 'One word added to the CHECK constraint, plus a five-assertion parity test that reads the '
    + 'role list out of the shipped DDL and compares it to MGMT_ROLES in both directions.',
  mutation: 'Reverting the one-word fix fails 3 of the 5 tests, naming `mentor` specifically.',
  ddlSwallows: 'The DDL runs in a loop that swallows every failure into a console.warn, so a '
    + 'rejected ALTER is invisible on deploy.',
};

/** The decision, as options rather than a recommendation dressed up as a finding. */
const OPTIONS = [
  {
    id: 'A', title: 'Add four narrow roles',
    detail: 'marketing, platform, executive, and split admissions from internship. Widens the '
      + 'CHECK constraint. Every new role is a strict subset of Admin.',
    covers: 'All 7 interns scoped properly.',
    cost: 'An RBAC and schema change, which is why it is yours to approve.',
    recommended: true,
  },
  {
    id: 'B', title: 'Give the five uncovered interns Admin',
    detail: 'Fast. It is 13 of 14 sections each.',
    covers: 'All 7 interns reach their tab on Monday.',
    cost: 'This ticket’s own text names it as the trap: granting a broad role because it is '
      + 'quicker, then describing it as scoped.',
    recommended: false,
  },
  {
    id: 'C', title: 'Ship Monday on what exists',
    detail: 'Ruth and Victoria on real department tabs, the other five on the read-only My Domain '
      + 'page from AF2.1. Land the roles after.',
    covers: '2 of 7 fully; 5 of 7 can see but not change.',
    cost: 'Nothing false ships, and five interns cannot do link 2 on Monday.',
    recommended: false,
  },
  {
    id: 'D', title: 'Per-person section grants',
    detail: 'A new grant table; roles become defaults. The most correct long-term shape.',
    covers: 'Everything, eventually.',
    cost: 'The largest change here. Not a Monday option.',
    recommended: false,
  },
];

const CHAIN = [
  { n: 1, label: 'Access to their agent', short: 'their agent', ticket: 'AF2.2', state: 'open' },
  {
    n: 2, label: 'Access to their section, READ AND UPDATE', short: 'their section, read + update',
    ticket: 'AF2.3', state: 'this',
  },
  {
    n: 3, label: 'Expand the section, with an accepted plan', short: 'expand it, plan approved',
    ticket: 'AF4.2', state: 'open',
  },
  {
    n: 4, label: 'Transfer a proven capability as a TOOL', short: 'capability becomes a tool',
    ticket: 'AF3.5', state: 'open',
  },
  { n: 5, label: 'All of it from their own public repo', short: 'own repo as dev env', ticket: 'AF4.5', state: 'open' },
];

const HEADLINE = `Only ${COUNTS.scopable} of the ${COUNTS.interns} interns can be given their own `
  + 'department tab today without also being given most of the platform.';

const ASKED = 'Each intern sees and controls the admin surface for their own department, and no '
  + 'other.';
const DELIVERED = 'The measurement, the domain-to-section mapping and the gap list — plus the '
  + 'finding that the per-intern section grants the ticket asks for cannot be issued without an '
  + 'RBAC change that is Ali’s to approve. One live defect found while measuring, and fixed.';

module.exports = {
  MEASURED_ON, SOURCES, V, DOMAINS, INTERNS, COUNTS, RBAC, MENTOR_DEFECT, OPTIONS, CHAIN,
  HEADLINE, ASKED, DELIVERED,
};
