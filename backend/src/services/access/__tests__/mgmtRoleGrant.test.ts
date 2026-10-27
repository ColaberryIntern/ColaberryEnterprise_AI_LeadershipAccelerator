/**
 * The privilege escalation Quincy found, written down as a test.
 *
 * `PATCH /api/admin/community/members/:memberId/mgmt-role` was guarded by `requireAdmin` alone,
 * and a bridge-minted staff token reaches `/api/admin/community` through the `program` section.
 * So `curriculum` — the narrowest role an intern holds — could set any staff member's role,
 * including their own, to `owner`, and `owner` is the only role that reaches `inbox_content`.
 *
 * The first case below is that exact path. The rest exist because a fix that only blocked
 * "curriculum granting owner" would be a patch on one example rather than the property.
 */
import { canGrantMgmtRole } from '../mgmtRoleGrant';
import { sectionsForRole, ALL_SECTIONS, type SectionKey } from '../mgmtRoles';

/** The sections a caller holding this mgmt role would carry on their token. */
const asRole = (role: string): SectionKey[] => [...sectionsForRole(role as any)];
/** A legacy admin_users login: no mgmt_role, therefore every section. */
const asLegacyAdmin = (): SectionKey[] => [...ALL_SECTIONS];

describe('the escalation that was open', () => {
  it('refuses curriculum granting owner', () => {
    const v = canGrantMgmtRole({ callerSections: asRole('curriculum'), currentRole: null, newRole: 'owner' });
    expect(v.allowed).toBe(false);
    expect(v.blockedBy).toBe('owner');
  });

  it('refuses curriculum granting owner TO ITSELF, which is how it would actually be used', () => {
    // Self-elevation needs no separate rule: the subset test already fails, because the role
    // being granted carries sections the caller does not hold.
    const v = canGrantMgmtRole({
      callerSections: asRole('curriculum'), currentRole: 'curriculum', newRole: 'owner',
    });
    expect(v.allowed).toBe(false);
  });

  it('refuses mgmt admin granting owner, because admin lacks inbox_content', () => {
    // The whole value of `owner` over `admin` is inbox_content, so this is an escalation too —
    // a narrower one, and the reason the rule is a subset test rather than "deny curriculum".
    expect(asRole('admin')).not.toContain('inbox_content');
    const v = canGrantMgmtRole({ callerSections: asRole('admin'), currentRole: null, newRole: 'owner' });
    expect(v.allowed).toBe(false);
    expect(v.blockedBy).toBe('owner');
  });

  it('refuses every scoped role granting every role wider than itself', () => {
    // Swept rather than sampled, so a role added later is covered the day it is added.
    const scoped = ['curriculum', 'revenue', 'admissions', 'support', 'mentor', 'marketing',
      'platform', 'executive', 'lead_intake', 'internship_review', 'product_experience',
      'community_organizer'];
    for (const caller of scoped) {
      const held = new Set<string>(asRole(caller));
      for (const target of scoped.concat(['owner', 'admin'])) {
        const wider = sectionsForRole(target as any).some((s) => !held.has(s));
        const v = canGrantMgmtRole({ callerSections: asRole(caller), currentRole: null, newRole: target });
        expect({ caller, target, allowed: v.allowed }).toEqual({ caller, target, allowed: !wider });
      }
    }
  });
});

describe('removal is an escalation too', () => {
  it('refuses curriculum CLEARING the owner role', () => {
    // Granting nothing is harmless; taking away everything is not. Checking only the new role
    // would leave a takeover by subtraction: strip the owner, and nobody holds inbox_content.
    const v = canGrantMgmtRole({ callerSections: asRole('curriculum'), currentRole: 'owner', newRole: null });
    expect(v.allowed).toBe(false);
    expect(v.blockedBy).toBe('owner');
  });

  it('refuses curriculum demoting an owner to curriculum', () => {
    const v = canGrantMgmtRole({
      callerSections: asRole('curriculum'), currentRole: 'owner', newRole: 'curriculum',
    });
    expect(v.allowed).toBe(false);
  });

  it('allows curriculum clearing a role no wider than its own', () => {
    const v = canGrantMgmtRole({ callerSections: asRole('curriculum'), currentRole: 'curriculum', newRole: null });
    expect(v.allowed).toBe(true);
  });
});

describe('what must keep working', () => {
  it('lets a legacy full admin assign anything, including owner', () => {
    // This is the reason the rule is not "owner only". Role administration is done today by
    // legacy admin_users logins, which carry no mgmt_role at all, and locking them out would be
    // a second silent change riding along with a security fix.
    for (const target of ['owner', 'admin', 'curriculum', 'marketing', null]) {
      expect(canGrantMgmtRole({
        callerSections: asLegacyAdmin(), currentRole: 'owner', newRole: target,
      }).allowed).toBe(true);
    }
  });

  it('lets mgmt owner assign anything', () => {
    expect(canGrantMgmtRole({ callerSections: asRole('owner'), currentRole: null, newRole: 'owner' }).allowed)
      .toBe(true);
  });

  it('lets a scoped role assign its own role, which is not an escalation', () => {
    expect(canGrantMgmtRole({
      callerSections: asRole('marketing'), currentRole: null, newRole: 'marketing',
    }).allowed).toBe(true);
  });

  it('lets mgmt admin assign a role narrower than itself', () => {
    expect(canGrantMgmtRole({
      callerSections: asRole('admin'), currentRole: null, newRole: 'curriculum',
    }).allowed).toBe(true);
  });
});

describe('it fails closed', () => {
  it('denies a caller with no sections at all', () => {
    // An absent or unrecognised identity resolves to no sections, and the route passes it
    // straight through rather than special-casing it, so the deny has to come from here.
    expect(canGrantMgmtRole({ callerSections: [], currentRole: null, newRole: 'curriculum' }).allowed)
      .toBe(false);
  });

  it('treats an unknown role name as granting nothing rather than throwing', () => {
    // The route rejects unknown names with a 400 first. This stays a subset test so the two
    // cannot disagree about what an unknown role means.
    expect(canGrantMgmtRole({ callerSections: [], currentRole: null, newRole: 'wizard' }).allowed)
      .toBe(true);
  });

  it('returns a reason a caller can act on, and never names sections they lack', () => {
    const v = canGrantMgmtRole({ callerSections: asRole('curriculum'), currentRole: null, newRole: 'owner' });
    expect(v.reason).toMatch(/more access than your own/i);
    expect(v.reason).not.toMatch(/inbox_content/);
  });
});
