import {
  MGMT_ROLES,
  roleCanAccessSection,
  sectionsForRole,
  ALL_SECTIONS,
} from '../mgmtRoles';

/**
 * mgmt-portal M0 — the Interns hub's two gated tabs.
 *
 * `agents` and `gov_contracts` are their own management sections so the hub (at
 * /admin/internship, behind the `internship` section) can show the Agents and Gov Contracts
 * tabs to management WITHOUT handing them to Admissions, who holds `internship` only to run
 * the application queue. This is the AF2.3 trap in miniature: the quiet failure mode is a
 * later edit granting one of these to a scoped role "for convenience", so the invariant is
 * asserted by name here rather than left to a diff to catch.
 */
describe('mgmt-portal M0 Interns hub sections', () => {
  it('registers both tab sections', () => {
    expect(ALL_SECTIONS).toContain('agents');
    expect(ALL_SECTIONS).toContain('gov_contracts');
  });

  it('owner and admin reach both tabs', () => {
    for (const section of ['agents', 'gov_contracts'] as const) {
      expect(roleCanAccessSection('owner', section)).toBe(true);
      expect(roleCanAccessSection('admin', section)).toBe(true);
    }
  });

  it('NO scoped role reaches either tab — Admissions included', () => {
    const scoped = MGMT_ROLES.filter((r) => r !== 'owner' && r !== 'admin');
    for (const role of scoped) {
      expect(roleCanAccessSection(role, 'agents')).toBe(false);
      expect(roleCanAccessSection(role, 'gov_contracts')).toBe(false);
    }
    // Named explicitly: Admissions (Dhee) runs the application queue and must not pick up the
    // agent build surfaces or the government delivery projects by holding `internship`.
    expect(sectionsForRole('admissions')).not.toContain('agents');
    expect(sectionsForRole('admissions')).not.toContain('gov_contracts');
  });
});
