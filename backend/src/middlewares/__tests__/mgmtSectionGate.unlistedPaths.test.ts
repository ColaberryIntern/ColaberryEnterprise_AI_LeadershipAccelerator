import { pathToSection } from '../mgmtSectionGate';

/**
 * The nine admin surfaces that had no sidebar entry, and the reason they now
 * have a section.
 *
 * Before this, `sectionForPath()` returned null for each and the two gates
 * disagreed: ProtectedRoute's `allowed = section ? canSection(section) :
 * !isScopedRep` ADMITTED every mgmt-role identity, while this gate is
 * deny-by-default and 403d them. A mentor could open /admin/apollo and get a
 * shell that failed every call with nothing explaining why.
 *
 * This list is the contract between the two halves. Its twin lives in
 * `frontend/src/components/Layout/adminNav.ts` as UNLISTED_PATH_SECTIONS, and
 * the frontend cannot import backend code — so the pairs are restated here
 * deliberately, and drift between them is what this suite exists to catch.
 */
const UNLISTED: ReadonlyArray<readonly [string, string, string]> = [
  // [ frontend route, api prefix, section ]
  ['/admin/apollo', '/api/admin/apollo', 'lead_ingestion'],
  ['/admin/import', '/api/admin/import', 'lead_ingestion'],
  ['/admin/tracking-estate', '/api/admin/tracking-estate', 'campaigns'],
  ['/admin/executive-narrative', '/api/admin/executive-narrative', 'dashboard'],
  ['/admin/events', '/api/admin/events', 'system'],
  ['/admin/work-ledger-health', '/api/admin/work-ledger-health', 'system'],
  ['/admin/automation', '/api/admin/automation', 'system'],
  ['/admin/agent-orphans', '/api/admin/agent-orphans', 'intelligence'],
  ['/admin/knowledge-ops', '/api/admin/knowledge-ops', 'intelligence'],
  // Folded into the Accelerator page's tabs on 2026-09-08 and dropped from the
  // Program nav group. Routes and pages are unchanged; only the sidebar entry
  // is gone, which is precisely what moves them into this contract. Each is
  // paired with the API prefix its page actually calls — Community Roles talks
  // to /api/admin/community, not to a /community-roles endpoint, so the pair is
  // not a naming echo and cannot be derived from the route.
  ['/admin/community-roles', '/api/admin/community', 'program'],
  ['/admin/cert-prep', '/api/admin/cert-prep', 'program'],
  ['/admin/case-studies', '/api/admin/case-studies', 'program'],
  ['/admin/projects', '/api/admin/projects', 'program'],
  // The governance board reads the CAPE surface, whose prefix was itself
  // unmapped until this change — see the '/api/admin/cape' row in the gate.
  ['/admin/feed-control-governance', '/api/admin/feed-control', 'program'],
  ['/admin/feed-control-governance', '/api/admin/cape', 'program'],
  // Architecture Skills became the Curriculum page's tab in the same pass and
  // reads the same CAPE surface.
  ['/admin/cape-settings', '/api/admin/cape', 'program'],
];

describe('mgmtSectionGate — previously unmapped admin surfaces', () => {
  it('classifies every one of them', () => {
    // An unmapped path is a latent 403: the day its section is granted to a
    // scoped role, the request still fails with an error nothing explains.
    for (const [, apiPath, section] of UNLISTED) {
      expect(pathToSection(apiPath)).toBe(section);
    }
  });

  it('classifies their sub-paths to the same section', () => {
    // Detail and action routes must not fall off the map.
    for (const [, apiPath, section] of UNLISTED) {
      expect(pathToSection(`${apiPath}/123`)).toBe(section);
      expect(pathToSection(`${apiPath}/some/deeper/route`)).toBe(section);
    }
  });

  it('does not claim a neighbouring path that merely shares a prefix', () => {
    // The match is '/'-delimited, so '/api/admin/events' must not swallow
    // '/api/admin/eventsomething'.
    expect(pathToSection('/api/admin/eventsomething')).not.toBe('system');
    expect(pathToSection('/api/admin/importer')).not.toBe('lead_ingestion');
  });

  it('leaves the three retired surfaces unmapped', () => {
    // /admin/refactored/* and /admin/va-erp were retired rather than adopted:
    // each documented itself as a prototype or demo-scope surface. The VA ERP
    // BACKEND is still mounted and still fails open — any admin not listed in
    // VA_ERP_ROLE_ASSIGNMENTS defaults to 'system_admin' — so it should not
    // acquire a section here as though it were a supported surface.
    expect(pathToSection('/api/admin/va-erp/dashboard')).toBeNull();
    expect(pathToSection('/api/refactored/client/projects')).toBeNull();
  });
});
