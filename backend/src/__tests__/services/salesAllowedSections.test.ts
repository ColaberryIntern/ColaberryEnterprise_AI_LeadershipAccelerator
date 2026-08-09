/**
 * The 'sales' role's admin-section scope.
 *
 * Before 2026-08-09 `adminAllowedSections` fell through to `[]` for 'sales', so
 * the four reps provisioned against the requireSalesOrAdmin lead routes logged
 * in to an empty sidebar with no route to the lead queue. These tests pin the
 * new scope and, just as importantly, pin that granting it did not widen anyone
 * else — this function is what both requireSection() and GET /api/admin/me read.
 */
import { adminAllowedSections } from '../../middlewares/authMiddleware';
import {
  ALL_SECTIONS,
  MGMT_ROLE_DEFS,
  sectionsForRole,
  type SectionKey,
} from '../../services/access/mgmtRoles';

describe('adminAllowedSections', () => {
  it('scopes a sales login to the leads section and nothing else', () => {
    expect(adminAllowedSections({ role: 'sales' })).toEqual(['leads']);
  });

  it('keeps sales out of every other section', () => {
    const granted = adminAllowedSections({ role: 'sales' });
    const denied = ALL_SECTIONS.filter((s) => s !== 'leads');
    for (const section of denied) {
      expect(granted).not.toContain(section);
    }
    // Named explicitly so a future section rename cannot quietly widen this.
    for (const section of ['revenue', 'campaigns', 'lead_ingestion', 'system', 'intelligence'] as SectionKey[]) {
      expect(granted).not.toContain(section);
    }
  });

  it('leaves legacy full admins on every section', () => {
    expect(adminAllowedSections({ role: 'admin' })).toEqual(ALL_SECTIONS);
    expect(adminAllowedSections({ role: 'super_admin' })).toEqual(ALL_SECTIONS);
  });

  it('still denies an unknown role everything', () => {
    expect(adminAllowedSections({ role: 'participant' })).toEqual([]);
    expect(adminAllowedSections({ role: '' })).toEqual([]);
  });

  it('lets a mgmt_role claim win over the account role', () => {
    // A bridge-minted staff token carries mgmt_role; that must scope the
    // session even if the underlying admin_users row says something broader.
    expect(adminAllowedSections({ role: 'admin', mgmt_role: 'support' })).toEqual(['students']);
    expect(adminAllowedSections({ role: 'sales', mgmt_role: 'revenue' })).toEqual(
      sectionsForRole('revenue')
    );
  });
});

describe('leads section wiring', () => {
  it('is a real section key, so requireSection can gate on it', () => {
    expect(ALL_SECTIONS).toContain('leads');
  });

  it('is held by every role that already saw the Revenue group', () => {
    // Leads and Pipeline moved from the 'revenue' section to 'leads'. Any role
    // that could see them before must still see them, or this is a regression.
    for (const role of ['owner', 'admin', 'revenue'] as const) {
      const sections = MGMT_ROLE_DEFS[role].sections;
      expect(sections).toContain('leads');
    }
  });

  it('is not handed to roles that never had Revenue', () => {
    for (const role of ['curriculum', 'admissions', 'support', 'community_organizer'] as const) {
      expect(MGMT_ROLE_DEFS[role].sections).not.toContain('leads');
    }
  });
});
