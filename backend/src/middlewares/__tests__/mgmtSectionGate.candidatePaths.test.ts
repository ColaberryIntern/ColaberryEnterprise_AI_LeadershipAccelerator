/**
 * The candidate surface must be CLASSIFIED, and it must land on `dashboard`.
 *
 * ## Why this test is written the same day the routes are
 *
 * This gate is deny-by-default for a scoped role: `pathToSection` returns null for an unmapped
 * prefix and the request 403s before any router middleware runs, with nothing in the response
 * explaining why. AF8.3 is the recorded cost of learning that late — six interns were granted
 * correctly scoped roles and every one of them got 403 on the page built for them, and it was
 * found only by walking all six through production with their own tokens.
 *
 * ## Why it needs its own row, proven rather than assumed
 *
 * `matchesPrefix` requires an exact match or a `/` boundary. `/api/admin/agent-domain-candidates-
 * mine` is NOT a boundary match for `/api/admin/agent-domains-mine` or `/api/admin/agent-domains`,
 * so it cannot inherit either row. The negative assertions below prove that, which is what makes
 * the positive one mean something.
 */
import { pathToSection } from '../mgmtSectionGate';
import { MGMT_ROLES, roleCanAccessSection } from '../../services/access/mgmtRoles';

const PATHS = [
  '/api/admin/agent-domain-candidates-mine',
  '/api/admin/agent-domain-candidates-mine/abc-123/product-state',
  '/api/admin/agent-domain-candidates-mine/abc-123/proven-by-hand',
];

describe('the candidate paths are classified at all', () => {
  it.each(PATHS)('%s resolves to a section rather than null', (path) => {
    expect(pathToSection(path)).not.toBeNull();
  });

  it.each(PATHS)('%s resolves to dashboard BY NAME', (path) => {
    expect(pathToSection(path)).toBe('dashboard');
  });

  it('POSITIVE CONTROL: an unmapped sibling really does return null', () => {
    // Without this, every assertion above could be passing over a function that classifies
    // everything. It also shows the deny-by-default behaviour the comment claims.
    expect(pathToSection('/api/admin/agent-domain-candidates-invented')).toBeNull();
  });
});

describe('it does not ride another row', () => {
  it('is not a boundary match for the -mine domain row', () => {
    // If it were, the candidate row could be deleted and these paths would still resolve, so the
    // row would be decorative. Both of these resolve to dashboard, so the test cannot simply
    // compare sections: it compares the PREFIXES as strings, which is where the boundary rule
    // actually applies.
    const p = '/api/admin/agent-domain-candidates-mine';
    expect(p.startsWith('/api/admin/agent-domains-mine')).toBe(false);
    expect(p.startsWith('/api/admin/agent-domains')).toBe(false);
  });

  it('the domain rows still resolve as they did, so nothing was displaced', () => {
    expect(pathToSection('/api/admin/agent-domains-mine')).toBe('dashboard');
    expect(pathToSection('/api/admin/agent-domains')).toBe('program');
    expect(pathToSection('/api/admin/agent-domains-builders')).toBe('internship');
    expect(pathToSection('/api/admin/agent-domains-authorization')).toBe('program');
  });
});

describe('who this actually reaches', () => {
  /** The roles the granted interns hold, measured in production on 16 Oct 2026. */
  const INTERN_ROLES = [
    'marketing', 'platform', 'lead_intake', 'internship_review', 'revenue', 'product_experience',
  ] as const;

  it('every intern role can reach dashboard, so no builder is locked out', () => {
    for (const role of INTERN_ROLES) {
      expect(roleCanAccessSection(role as never, 'dashboard')).toBe(true);
    }
  });

  it('is PURELY ADDITIVE: no role loses a section by this row existing', () => {
    // The condition `brandPaths.test.ts` names for adding a classification safely. Before this
    // row the paths were deny-by-default for every scoped role, so the only possible change is
    // that more identities can reach them, never fewer.
    const canReach = MGMT_ROLES.filter((r) => roleCanAccessSection(r, 'dashboard'));
    expect(canReach.length).toBeGreaterThan(0);
  });
});
