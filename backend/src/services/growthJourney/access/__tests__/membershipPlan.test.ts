import { buildMembershipPlan, renderMembershipPlan, RosterValidationError, type PlanAdmin, type PlanBrand, type PlanTenant } from '../membershipPlan';

/**
 * T413 - the membership seed plan, pure. The fixture is the plan's: a roster
 * of 3 people over 7 admins - one platform super-admin (brand null, ONE row),
 * one brand admin for two brands (two rows), one tenant viewer (one row) - so
 * 3 identities, 3 links, 4 memberships and 4 lock-outs. Emails never appear in
 * anything the plan renders.
 */

const T = { colaberry: 't-colaberry', cpn: 't-cpn' };
const TENANTS: PlanTenant[] = [{ id: T.colaberry, slug: 'colaberry' }, { id: T.cpn, slug: 'cpn' }];
const BRANDS: PlanBrand[] = [
  { id: 'b-training', slug: 'colaberry-training', tenant_id: T.colaberry },
  { id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: T.colaberry },
  { id: 'b-cpn', slug: 'cpn', tenant_id: T.cpn },
];
const ADMINS: PlanAdmin[] = [
  { id: 'u-1', email: 'Ali@Colaberry.com', is_ai_operated: false },
  { id: 'u-2', email: 'ops.lead@colaberry.com', is_ai_operated: false },
  { id: 'u-3', email: 'viewer@colaberry.com', is_ai_operated: false },
  { id: 'u-4', email: 'intern.one@colaberry.com', is_ai_operated: false },
  { id: 'u-5', email: 'intern.two@colaberry.com', is_ai_operated: false },
  { id: 'u-6', email: 'cory.agent@colaberry.com', is_ai_operated: true },
  { id: 'u-7', email: 'maya.agent@colaberry.com', is_ai_operated: true },
];
const ROSTER = [
  { email: 'ali@colaberry.com', tenant_slug: 'colaberry', brand_slug: null, role: 'platform_super_admin' },
  { email: 'ops.lead@colaberry.com', tenant_slug: 'colaberry', brand_slug: 'colaberry-training', role: 'brand_admin' },
  { email: 'OPS.LEAD@colaberry.com ', tenant_slug: 'colaberry', brand_slug: 'colaberry-enterprise', role: 'brand_admin' },
  { email: 'viewer@colaberry.com', tenant_slug: 'colaberry', brand_slug: null, role: 'tenant_viewer' },
];
const plan = (over: Partial<Parameters<typeof buildMembershipPlan>[0]> = {}) =>
  buildMembershipPlan({ roster: ROSTER, admins: ADMINS, tenants: TENANTS, brands: BRANDS, membershipTableEmpty: true, ...over });

describe('the plan', () => {
  it('a roster of 3 over 7 admins plans 3 identities, 3 links, 4 memberships and 4 lock-outs', () => {
    const p = plan();
    expect(p.counts).toEqual({ identities: 3, links: 3, memberships: 4, lockouts: 4, lockouts_human: 2, lockouts_ai_operated: 2 });
    expect(p.lockout_admin_ids).toEqual(['u-4', 'u-5', 'u-6', 'u-7']);
  });

  it('the platform super-admin is ONE row with brand null - not one per brand', () => {
    const ali = plan().people.find((x) => x.admin_id === 'u-1')!;
    expect(ali.memberships).toEqual([{ tenant_id: T.colaberry, brand_id: null, role: 'platform_super_admin' }]);
  });

  it('one person with two brand rows is ONE identity and ONE link, matched case- and whitespace-insensitively', () => {
    const ops = plan().people.filter((x) => x.admin_id === 'u-2');
    expect(ops).toHaveLength(1);
    expect(ops[0].memberships).toEqual([
      { tenant_id: T.colaberry, brand_id: 'b-training', role: 'brand_admin' },
      { tenant_id: T.colaberry, brand_id: 'b-ent', role: 'brand_admin' },
    ]);
    expect(ops[0].email).toBe('ops.lead@colaberry.com');
  });

  it('a repeated roster row is one membership - de-duplicated on the service\'s own key', () => {
    const p = plan({ roster: [...ROSTER, ROSTER[3]] });
    expect(p.counts.memberships).toBe(4);
  });

  it('an admin already covered by an earlier seed is not locked out by this roster, and the ramp state is stated', () => {
    const p = plan({ alreadyCoveredAdminIds: ['u-4'], membershipTableEmpty: false });
    expect(p.counts.lockouts).toBe(3);
    expect(p.lockout_admin_ids).toEqual(['u-5', 'u-6', 'u-7']);
    expect(p.closes_ramp).toBe(false);
    expect(plan().closes_ramp).toBe(true);
  });

  it('an admin already linked to a DIFFERENT identity is a plan-time conflict - listed by id and locked out unless already covered; the same address in any case is no conflict', () => {
    const links = [
      { admin_id: 'u-2', identity_email: 'Someone.Else@colaberry.com' },
      { admin_id: 'u-1', identity_email: ' ALI@Colaberry.com ' },
    ];
    const p = plan({ existingLinks: links });
    expect(p.link_conflict_admin_ids).toEqual(['u-2']);
    expect(p.counts.lockouts).toBe(5);
    expect(p.lockout_admin_ids).toEqual(['u-2', 'u-4', 'u-5', 'u-6', 'u-7']);
    // The roster's arithmetic is unchanged - the LINK CONFLICT line says which of it will not be granted.
    expect(p.counts.memberships).toBe(4);
    expect(plan({ existingLinks: links, alreadyCoveredAdminIds: ['u-2'], membershipTableEmpty: false }).counts.lockouts).toBe(4);
    expect(plan().link_conflict_admin_ids).toEqual([]);
  });
});

describe('refused before any plan', () => {
  it('an unknown role is refused, and there is no plan at all', () => {
    expect(() => plan({ roster: [{ ...ROSTER[0], role: 'god_mode' }] })).toThrow(RosterValidationError);
    expect(() => plan({ roster: [{ ...ROSTER[0], role: 'god_mode' }] })).toThrow(/entry 1: unknown role "god_mode"/);
  });

  it('an unknown tenant, an unknown brand, a brand from another tenant and an email with no admin are each refused, all at once', () => {
    let err: RosterValidationError | null = null;
    try {
      plan({ roster: [
        { email: 'ghost@colaberry.com', tenant_slug: 'colaberry', brand_slug: null, role: 'tenant_viewer' },
        { email: 'viewer@colaberry.com', tenant_slug: 'nowhere', brand_slug: null, role: 'tenant_viewer' },
        { email: 'viewer@colaberry.com', tenant_slug: 'colaberry', brand_slug: 'no-brand', role: 'brand_admin' },
        { email: 'viewer@colaberry.com', tenant_slug: 'colaberry', brand_slug: 'cpn', role: 'brand_admin' },
      ] });
    } catch (e) {
      err = e as RosterValidationError;
    }
    expect(err).toBeInstanceOf(RosterValidationError);
    expect(err!.problems).toEqual([
      'entry 1: no admin_users row for this email',
      'entry 2: unknown tenant nowhere',
      'entry 3: unknown brand no-brand',
      'entry 4: brand cpn is not in tenant colaberry',
    ]);
    // The refusal names rows, never an address.
    expect(err!.message).not.toContain('@');
  });

  it('a malformed roster is refused: not an array, empty, a non-object row, a missing field, an extra field', () => {
    expect(() => plan({ roster: {} })).toThrow(/non-empty array/);
    expect(() => plan({ roster: [] })).toThrow(/non-empty array/);
    expect(() => plan({ roster: ['x'] })).toThrow(/entry 1: not an object/);
    expect(() => plan({ roster: [{ tenant_slug: 'colaberry', brand_slug: null, role: 'tenant_viewer' }] })).toThrow(/email missing/);
    expect(() => plan({ roster: [{ ...ROSTER[3], password: 'x' }] })).toThrow(/unexpected field\(s\) password/);
    expect(() => plan({ roster: [{ ...ROSTER[3], brand_slug: '' }] })).toThrow(/brand_slug must be a slug or null/);
  });

  it('a platform super-admin narrowed to a brand is refused - the role is cross-tenant by its own right', () => {
    expect(() => plan({ roster: [{ ...ROSTER[0], brand_slug: 'colaberry-training' }] })).toThrow(/platform_super_admin is granted with brand_slug null/);
  });
});

describe('the rendering', () => {
  it('prints the counts and the LOCK-OUT line with admin ids - never an email', () => {
    const text = renderMembershipPlan(plan()).join('\n');
    expect(text).toContain('identities: 3');
    expect(text).toContain('memberships: 4');
    expect(text).toContain('LOCK-OUT: 4 admin(s) will hold no membership after this write');
    expect(text).toContain('(2 human, 2 AI-operated)');
    expect(text).toContain('lock-out admin ids: u-4, u-5, u-6, u-7');
    expect(text).toContain('tenant_memberships is EMPTY now: this write closes the migration ramp for EVERY admin');
    expect(text).not.toContain('@');
    expect(text.toLowerCase()).not.toContain('colaberry.com');
    expect(text).not.toContain('LINK CONFLICT');
    const conflicted = renderMembershipPlan(plan({ existingLinks: [{ admin_id: 'u-2', identity_email: 'someone.else@colaberry.com' }] })).join('\n');
    expect(conflicted).toContain('LINK CONFLICT: 1 admin(s) already linked to a different identity - the link stays, and their memberships above will NOT be granted: u-2');
    expect(conflicted).toContain('LOCK-OUT: 5 admin(s)');
    expect(conflicted).not.toContain('@');
  });

  it('the title follows the mode, and a closed ramp is stated as such', () => {
    expect(renderMembershipPlan(plan())[0]).toBe('membership seed plan (dry run — nothing written)');
    expect(renderMembershipPlan(plan(), 'write')[0]).toBe('membership seed (writing)');
    expect(renderMembershipPlan(plan({ membershipTableEmpty: false })).join('\n')).toContain('already has rows: the ramp is closed');
  });
});
