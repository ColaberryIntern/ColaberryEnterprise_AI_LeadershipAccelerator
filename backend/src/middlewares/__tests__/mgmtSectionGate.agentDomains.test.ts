/**
 * AF8.3 — the Agent Factory domain surfaces must be CLASSIFIED, and `-mine` must be reachable.
 *
 * ## How this was found, and why no test caught it first
 *
 * Six interns were granted correctly scoped roles and every one of them got **403 on the page
 * built for them**. Nothing in the route file hints at it: `agentDomainRoutes.ts` carried
 * `requireSection('program')`, which reads as a deliberate decision rather than a mistake.
 *
 * The refusal happened earlier. `/api/admin/agent-domains*` was absent from `PATH_SECTION`, so
 * `pathToSection` returned null, and for a scoped role the gate is deny-by-default — it 403s
 * before any router middleware runs. `mgmtSectionGate.unlistedPaths.test.ts` exists for exactly
 * this failure and could not catch it, because it asserts a hand-listed set and these routes
 * landed after that list was written.
 *
 * It was found by WALKING ALL SIX INTERNS THROUGH PRODUCTION with their own minted tokens. No
 * amount of reading would have produced it: the data was right, the roles were right, the route
 * looked right, and the answer was still 403.
 *
 * ## Why `-mine` is 'dashboard' and its sibling is not
 *
 * `-mine` is SELF-SCOPED: it resolves the caller's identity from their verified token and
 * returns only the domains they own, and an owner of nothing gets an empty list. Its safety is
 * in the query. `-provisioned` returns all ten to anyone who reaches it, so it stays on
 * 'program'. The difference is what the handler gives back, not who is asking.
 */
import { pathToSection } from '../mgmtSectionGate';
import { MGMT_ROLES, roleCanAccessSection, sectionsForRole } from '../../services/access/mgmtRoles';

/** The roles the six granted interns actually hold, measured in production on 16 Oct 2026. */
const INTERN_ROLES = [
  'marketing', 'platform', 'lead_intake', 'internship_review', 'revenue', 'product_experience',
] as const;

describe('AF8.3 agent domain routes are classified at all', () => {
  it('maps every agent-domain path, so none is a latent 403', () => {
    for (const path of [
      '/api/admin/agent-domains-mine',
      '/api/admin/agent-domains-provisioned',
      '/api/admin/agent-domains',
      '/api/admin/agent-domains/marketing',
    ]) {
      expect(pathToSection(path)).not.toBeNull();
    }
  });

  it('the hyphen sibling is NOT swallowed by the shorter row', () => {
    // `matchesPrefix` needs an exact match or a '/' boundary. If that ever loosens to a plain
    // `startsWith`, '-mine' silently becomes 'program' and all six interns are locked out again
    // with nothing in the diff to show it.
    expect(pathToSection('/api/admin/agent-domains-mine')).toBe('dashboard');
    expect(pathToSection('/api/admin/agent-domains-provisioned')).toBe('program');
    expect(pathToSection('/api/admin/agent-domains')).toBe('program');
  });
});

describe('AF8.3 every intern can reach My Domain', () => {
  const mine = pathToSection('/api/admin/agent-domains-mine') as string;

  it.each(INTERN_ROLES)('%s can reach the My Domain section', (role) => {
    // The assertion that would have failed before this change, for all six.
    expect(roleCanAccessSection(role, mine)).toBe(true);
  });

  it('every mgmt role can, EXCEPT support, which holds no landing page at all', () => {
    // A seventh intern with a new role must not rediscover this, so the assertion is over every
    // role rather than over the six that happen to exist today.
    //
    // `support` is the one exception and it is deliberate, not an oversight: its sections are
    // `['students']` and nothing else — "NO normal admin nav; only the read-only student-story
    // surface". It carries no `dashboard`, so it cannot reach My Domain, which is correct —
    // a support user owns no domain and would get an empty list anyway.
    //
    // Named explicitly rather than filtered by a predicate, so that if some future role also
    // loses `dashboard` this fails and someone has to decide whether that was intended.
    const without = MGMT_ROLES.filter((r) => !roleCanAccessSection(r, mine));
    expect(without).toEqual(['support']);
    expect(sectionsForRole('support')).toEqual(['students']);
  });

  it('but NOT the all-ten surface, unless they hold program', () => {
    // The scoping that still matters. If this ever passes for an intern role, `-provisioned`
    // has started handing every domain to someone who owns one of them.
    const provisioned = pathToSection('/api/admin/agent-domains-provisioned') as string;
    for (const role of INTERN_ROLES) {
      expect(roleCanAccessSection(role, provisioned)).toBe(false);
    }
    expect(roleCanAccessSection('curriculum', provisioned)).toBe(true);
  });

  it('and the per-domain detail and coverage routes are reachable TOO', () => {
    // Kalkidan Bezabeh, 5 Nov 2026, 9:10 AM CT: `/api/admin/agent-domains/admissions` and its
    // `/coverage` both answer 403 `section_not_permitted` for a builder, and STORY-000's panels
    // 2, 3 and 4 have no other source. The test above proved those paths are CLASSIFIED; being
    // classified to a section she does not hold is exactly as blocking as not being classified
    // at all, which is why it passed throughout.
    //
    // Note there is no new PATH_SECTION row behind these. `matchesPrefix` needs an exact match
    // or a '/' boundary, so the existing `-mine` row covers both — and this asserts that rather
    // than leaving it to be inferred from the matcher.
    for (const path of [
      '/api/admin/agent-domains-mine/admissions',
      '/api/admin/agent-domains-mine/admissions/coverage',
      '/api/admin/agent-domains-mine/product_experience/coverage',
    ]) {
      expect(pathToSection(path)).toBe('dashboard');
    }
    for (const role of INTERN_ROLES) {
      expect(roleCanAccessSection(role, 'dashboard')).toBe(true);
    }
  });

  it('and the UNSCOPED per-domain routes are still program, which is the point', () => {
    // The fix adds routes; it does not re-section the old ones. Those take the domain key from
    // the PATH and check no ownership, so moving them to a section a builder holds would hand
    // every builder all ten domains and each one's accountable human. If this ever flips, the
    // disclosure the new routes exist to avoid has been introduced by the back door.
    expect(pathToSection('/api/admin/agent-domains/admissions')).toBe('program');
    expect(pathToSection('/api/admin/agent-domains/admissions/coverage')).toBe('program');
    for (const role of INTERN_ROLES) {
      expect(roleCanAccessSection(role, 'program')).toBe(false);
    }
  });

  it('reaching My Domain does not widen anything else', () => {
    // 'dashboard' is a landing section and must stay one. If it ever starts carrying data
    // surfaces, this route's gate becomes a back door for every scoped role on the platform.
    for (const role of INTERN_ROLES) {
      const sections = sectionsForRole(role);
      expect(sections).toContain('dashboard');
      // Each intern role is still small: a landing page plus their own domain, nothing more.
      expect(sections.length).toBeLessThanOrEqual(3);
    }
  });
});
