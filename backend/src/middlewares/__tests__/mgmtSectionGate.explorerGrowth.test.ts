import { pathToSection } from '../mgmtSectionGate';
import {
  MGMT_ROLES,
  roleCanAccessSection,
  sectionsForRole,
  type MgmtRole,
} from '../../services/access/mgmtRoles';

/**
 * The Explorer Growth Command Center's RBAC classification.
 *
 * WHAT THIS ROW DOES, stated precisely, because an earlier draft of the plan
 * got it wrong and claimed the opposite.
 *
 * Mapping `/api/admin/explorer-growth` to 'campaigns' does NOT admit the scoped
 * management roles. Not one of them holds 'campaigns':
 *
 *   curriculum          dashboard, program
 *   revenue             dashboard, revenue, leads
 *   admissions          dashboard, lead_ingestion
 *   support             students
 *   mentor              dashboard, career_review
 *   community_organizer dashboard
 *
 * Only `owner` (which short-circuits in the gate before the map is consulted)
 * and `admin` (whose grant is every section except inbox_content) can reach it.
 * That is the correct audience for an operator surface, and widening it would
 * be an RBAC posture change, not a mapping detail.
 *
 * So the row is a DEFENSIVE CLASSIFICATION. Its value is that an unmapped path
 * is a latent 403 — the day someone grants 'campaigns' to a scoped role, an
 * unclassified path denies them for a reason nothing in the code explains.
 *
 * These tests therefore prove the two things that are actually provable, rather
 * than the stronger-sounding thing that is not: every Command Center path
 * classifies, and the set of roles holding that section is pinned so that
 * changing it later is a visible diff rather than a silent widening of who can
 * read learner data.
 */

const PREFIX = '/api/admin/explorer-growth';

/** A concrete id, because the gate matches real request paths, not route patterns. */
const ID = '3f7c1e90-2b4a-4d55-9a1e-6c8b0d2f4a71';

/** The twelve in-scope GET routes from spec §27, as they arrive at the gate. */
const IN_SCOPE = [
  `${PREFIX}/summary`,
  `${PREFIX}/distribution`,
  `${PREFIX}/learners`,
  `${PREFIX}/learners/${ID}`,
  `${PREFIX}/learners/${ID}/signals`,
  `${PREFIX}/learners/${ID}/decisions`,
  `${PREFIX}/learners/${ID}/scores`,
  `${PREFIX}/decisions`,
  `${PREFIX}/decisions/${ID}`,
  `${PREFIX}/shadow`,
  `${PREFIX}/content`,
  `${PREFIX}/eligibility/${ID}`,
];

describe('every Command Center path classifies as campaigns', () => {
  it('covers all twelve in-scope routes', () => {
    // Guards the list itself. T004 asserts the same twelve on the router; if the
    // two ever disagree, one of them is testing a surface that does not exist.
    expect(IN_SCOPE).toHaveLength(12);
  });

  it.each(IN_SCOPE)('%s -> campaigns', (path) => {
    // Fails if the PATH_SECTION row is removed: an unmapped path returns null,
    // not 'campaigns'. This is the assertion the row exists for.
    expect(pathToSection(path)).toBe('campaigns');
  });

  it('classifies the bare prefix too', () => {
    expect(pathToSection(PREFIX)).toBe('campaigns');
  });

  it("classifies EPIC 12's routes as well, though Phase A does not build them", () => {
    // Prefix matching means /forecast and /experiments are already classified.
    // Worth pinning: when EPIC 12 adds them they inherit the correct section
    // rather than silently arriving unmapped.
    expect(pathToSection(`${PREFIX}/forecast`)).toBe('campaigns');
    expect(pathToSection(`${PREFIX}/experiments`)).toBe('campaigns');
  });

  it('classifies the Phase B write paths, so they cannot arrive unmapped', () => {
    expect(pathToSection(`${PREFIX}/mode`)).toBe('campaigns');
    expect(pathToSection(`${PREFIX}/content/refresh`)).toBe('campaigns');
  });
});

describe('the prefix respects the segment boundary', () => {
  it('does not capture a lookalike sibling', () => {
    // The table's own header warns that '/api/admin/community' must never
    // capture '/communications'. Same hazard, same guard: a prefix match without
    // a boundary would classify an unrelated future router by accident.
    expect(pathToSection('/api/admin/explorer-growth-legacy')).toBeNull();
    expect(pathToSection('/api/admin/explorer-growthx')).toBeNull();
  });

  it('does not classify an unrelated admin path', () => {
    expect(pathToSection('/api/admin/explorer')).toBeNull();
  });
});

describe('exactly which roles hold campaigns — pinned, not assumed', () => {
  const HOLDERS: MgmtRole[] = ['owner', 'admin'];

  it('is owner and admin, and nobody else', () => {
    // The load-bearing assertion in this file. If a future change grants
    // 'campaigns' to a scoped role, this fails and the diff has to say so out
    // loud — which is the point, because that role would gain read access to
    // every learner's scores, signals and decision history.
    const holders = MGMT_ROLES.filter((r) => roleCanAccessSection(r, 'campaigns'));
    expect([...holders].sort()).toEqual([...HOLDERS].sort());
  });

  it.each(['curriculum', 'revenue', 'admissions', 'support', 'mentor', 'community_organizer'])(
    'scoped role %s does NOT hold campaigns',
    (role) => {
      // Named individually rather than derived, so the failure message says
      // which role changed instead of only that the set did.
      expect(roleCanAccessSection(role, 'campaigns')).toBe(false);
    },
  );

  it('admin holds it explicitly, not merely by the gate\'s broad branch', () => {
    // The gate lets mgmt_role 'admin' through unmapped paths via `isBroad`. That
    // is a separate mechanism. This asserts the section grant itself, so the
    // classification stays correct even if the isBroad shortcut is ever removed.
    expect(sectionsForRole('admin')).toContain('campaigns');
  });

  it('owner holds every section, including this one', () => {
    expect(roleCanAccessSection('owner', 'campaigns')).toBe(true);
  });

  it('an unknown role holds nothing — deny by default', () => {
    expect(roleCanAccessSection('not-a-role', 'campaigns')).toBe(false);
    expect(sectionsForRole(undefined)).toEqual([]);
  });
});
