import { pathToSection } from '../mgmtSectionGate';
import { MGMT_ROLES, roleCanAccessSection, type SectionKey } from '../../services/access/mgmtRoles';

/**
 * M3 harden — the Interns hub's two new tab routes are classified, mapped to their OWN sections,
 * and management-only. This ties the route paths to the access model: `internsHubSections.test.ts`
 * asserts the section GRANTS (owner/admin hold agents + gov_contracts, no scoped role does); this
 * asserts the route PATHS resolve to those sections (no latent 403, no prefix shadow) and that the
 * gate therefore denies every scoped role — the two halves that make the tab actually safe.
 */
describe('M3 Interns hub tab routes — classified and management-only', () => {
  it('maps the two tab list paths to their own sections (no latent 403)', () => {
    expect(pathToSection('/api/admin/gov-contracts')).toBe('gov_contracts');
    expect(pathToSection('/api/admin/agent-factory')).toBe('agents');
  });

  it('gov-contracts is NOT swallowed by /api/admin/factory (program)', () => {
    // matchesPrefix is '/'-boundary, so the factory→program row cannot capture this distinct prefix.
    expect(pathToSection('/api/admin/gov-contracts')).not.toBe('program');
  });

  it('agent-factory is NOT swallowed by the /api/admin/agent-domains rows (program / dashboard)', () => {
    expect(pathToSection('/api/admin/agent-factory')).not.toBe('program');
    expect(pathToSection('/api/admin/agent-factory')).not.toBe('dashboard');
  });

  it('owner and admin reach all three hub tabs (Interns + Agents + Gov Contracts)', () => {
    for (const section of ['internship', 'agents', 'gov_contracts'] as const) {
      expect(roleCanAccessSection('owner', section)).toBe(true);
      expect(roleCanAccessSection('admin', section)).toBe(true);
    }
  });

  it('NO scoped role reaches the Agents or Gov Contracts routes (deny-by-default)', () => {
    const govSection = pathToSection('/api/admin/gov-contracts') as SectionKey;
    const agentsSection = pathToSection('/api/admin/agent-factory') as SectionKey;
    const scoped = MGMT_ROLES.filter((r) => r !== 'owner' && r !== 'admin');
    for (const role of scoped) {
      expect(roleCanAccessSection(role, govSection)).toBe(false);
      expect(roleCanAccessSection(role, agentsSection)).toBe(false);
    }
  });

  it('Admissions reaches the Interns application queue but NOT the two new tabs', () => {
    // The exact separation the hub was designed for: Dhee runs the application queue and must not
    // pick up the agent build surfaces or the government delivery projects.
    expect(roleCanAccessSection('admissions', 'internship')).toBe(true);
    expect(roleCanAccessSection('admissions', 'gov_contracts')).toBe(false);
    expect(roleCanAccessSection('admissions', 'agents')).toBe(false);
  });
});
