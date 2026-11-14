import {
  bridgedDeliveryRole,
  resolveActorRoles,
} from '../lifecycleActorRoles';
import {
  DELIVERY_ROLES,
  deliveryPermissionsFor,
  deliveryRoleGrants,
} from '../../../modules/delivery/deliveryRoles';
import { permittedActionsForRoles } from '../lifecycleActions';
import { personasForRoles } from '../lifecyclePersonas';
import { MGMT_ROLES, MGMT_ROLE_DEFS } from '../../access/mgmtRoles';
import { adminAllowedSections } from '../../../middlewares/authMiddleware';

/**
 * L7.6 blocker B1 — the lifecycle authority derivation, which resolved to nothing for every
 * identity the platform can mint.
 *
 * ## Why the first test asserts the DEFECT
 *
 * A test that only shows the new path working cannot tell a fix from a function that was always
 * going to return something. So the suite opens by calling the old expression and asserting it is
 * empty, then shows the resolved path is not. That is the control in the other direction, and
 * without it "the owner now has permissions" is a claim about this test's own fixtures.
 *
 * ## The identity shapes are DERIVED, not listed
 *
 * The bridge must cover exactly the identities that can reach a lifecycle route and no others.
 * "Can reach" is not a judgement — `requireSection('program')` delegates to
 * `adminAllowedSections`, so the test asks that function and `MGMT_ROLE_DEFS` directly. A new
 * management role granted the Program section, or an existing one losing it, fails this suite
 * rather than silently acquiring or keeping lifecycle authority.
 */

jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  contextFromAdminRequest: jest.fn(),
}));
jest.mock('../../../modules/delivery/deliveryAuthorization', () => ({
  buildDeliveryContext: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const scopeBridge = require('../../../modules/tenancy/adminScopeBridge');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deliveryAuth = require('../../../modules/delivery/deliveryAuthorization');

/** Silence the resolver's structured lines, and keep them for the assertions that read them. */
function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const log = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])); });
  const err = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])); });
  return { lines, restore: () => { log.mockRestore(); err.mockRestore(); } };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the identity resolves to nothing, which is production's state for 49 of 50 admin
  // rows. Tests that need a membership override this.
  scopeBridge.contextFromAdminRequest.mockResolvedValue({ platformIdentityId: null });
  deliveryAuth.buildDeliveryContext.mockResolvedValue({ roles: [] });
});

describe('THE DEFECT: an admin role is not a delivery role', () => {
  // The four role values an admin JWT can carry, from the mint paths and the production
  // admin_users census (35 ai_staff, 7 admin, 6 sales, 2 super_admin).
  const ADMIN_ROLE_VALUES = ['super_admin', 'admin', 'sales', 'ai_staff'];

  it('every admin role value resolves to ZERO delivery permissions', () => {
    for (const role of ADMIN_ROLE_VALUES) {
      expect(deliveryPermissionsFor([role])).toEqual([]);
    }
  });

  it('CONTROL: the delivery roles resolve to many, so the zero above is the vocabularies and not a broken helper', () => {
    const total = Object.values(DELIVERY_ROLES)
      .reduce((n, role) => n + deliveryRoleGrants(role).length, 0);
    // 180 at the time of writing. Asserted as a floor, because the exact number moving is a
    // grant-table change and belongs to that table's own test, not here.
    expect(total).toBeGreaterThan(100);
    expect(deliveryPermissionsFor([DELIVERY_ROLES.DELIVERY_OWNER]).length).toBeGreaterThan(10);
  });

  it('so the OLD derivation served an empty action list and no persona to the owner', () => {
    expect(permittedActionsForRoles(['super_admin'])).toEqual([]);
    expect(personasForRoles(['super_admin'])).toEqual([]);
  });
});

describe('the bridge covers exactly the identities that can reach a lifecycle route', () => {
  it('every management role holding the Program section has a bridged delivery role', () => {
    const reaching = MGMT_ROLES.filter((r) => MGMT_ROLE_DEFS[r].sections.includes('program'));
    // Guards the guard: if this list were empty the loop below would assert nothing.
    expect(reaching.length).toBeGreaterThan(0);
    for (const mgmt of reaching) {
      expect(bridgedDeliveryRole({ role: 'admin', mgmt_role: mgmt })).not.toBeNull();
    }
  });

  it('and every management role WITHOUT it is bridged to nothing — fail closed', () => {
    const notReaching = MGMT_ROLES.filter((r) => !MGMT_ROLE_DEFS[r].sections.includes('program'));
    expect(notReaching.length).toBeGreaterThan(0);
    for (const mgmt of notReaching) {
      expect(bridgedDeliveryRole({ role: 'admin', mgmt_role: mgmt })).toBeNull();
    }
  });

  it('every legacy admin role holding the Program section is bridged, and the others are not', () => {
    for (const role of ['super_admin', 'admin', 'sales', 'ai_staff']) {
      const reaches = adminAllowedSections({ role }).includes('program');
      const bridged = bridgedDeliveryRole({ role });
      expect(bridged === null).toBe(!reaches);
    }
  });
});

describe('mgmt_role takes precedence, because `role` cannot tell these identities apart', () => {
  it('a curriculum staff token carries role=admin and must NOT get delivery_lead', () => {
    // `mintMgmtAdminToken`: the JWT role is 'super_admin' for owner and 'admin' for every other
    // management role. Reading `role` first is therefore a privilege escalation, and this is the
    // assertion that catches it.
    expect(bridgedDeliveryRole({ role: 'admin', mgmt_role: 'curriculum' }))
      .toBe(DELIVERY_ROLES.OBSERVER);
    expect(bridgedDeliveryRole({ role: 'admin', mgmt_role: 'curriculum' }))
      .not.toBe(DELIVERY_ROLES.DELIVERY_LEAD);
  });

  it('curriculum may look but may approve nothing', () => {
    const roles = [bridgedDeliveryRole({ role: 'admin', mgmt_role: 'curriculum' })!];
    expect(permittedActionsForRoles(roles)).toEqual([]);
    expect(deliveryPermissionsFor(roles)).toContain('project.read');
  });

  it('an unlisted management role is refused even though its token says role=admin', () => {
    // `marketing` can arrive here only via a `mgmt_extra_sections` grant of 'program'. That is a
    // section grant — permission to open a surface — not authority over what is on it.
    expect(bridgedDeliveryRole({ role: 'admin', mgmt_role: 'marketing' })).toBeNull();
  });

  it('owner and the legacy super_admin reach delivery_owner; a legacy admin stops at delivery_lead', () => {
    expect(bridgedDeliveryRole({ role: 'super_admin', mgmt_role: 'owner' }))
      .toBe(DELIVERY_ROLES.DELIVERY_OWNER);
    expect(bridgedDeliveryRole({ role: 'super_admin' })).toBe(DELIVERY_ROLES.DELIVERY_OWNER);
    expect(bridgedDeliveryRole({ role: 'admin' })).toBe(DELIVERY_ROLES.DELIVERY_LEAD);
  });

  it('delivery_lead deliberately lacks deploy and authority management', () => {
    const lead = deliveryRoleGrants(DELIVERY_ROLES.DELIVERY_LEAD);
    expect(lead).not.toContain('release.deploy');
    expect(lead).not.toContain('project.manage_authority');
    // CONTROL: delivery_owner has both, so the absence above is the role and not a typo in the
    // permission names.
    const owner = deliveryRoleGrants(DELIVERY_ROLES.DELIVERY_OWNER);
    expect(owner).toContain('release.deploy');
    expect(owner).toContain('project.manage_authority');
  });
});

describe('NO bridged identity can accept a release on the client\'s behalf', () => {
  it('client.accept is unreachable through every bridgeable identity', () => {
    const identities = [
      ...MGMT_ROLES.map((mgmt_role) => ({ role: 'admin', mgmt_role })),
      { role: 'super_admin' }, { role: 'admin' }, { role: 'sales' }, { role: 'ai_staff' },
    ];
    let bridgedCount = 0;
    for (const actor of identities) {
      const role = bridgedDeliveryRole(actor);
      if (!role) continue;
      bridgedCount += 1;
      expect(deliveryPermissionsFor([role])).not.toContain('client.accept');
    }
    // Guards the guard: an empty loop would pass vacuously.
    expect(bridgedCount).toBeGreaterThan(0);
    // CONTROL: the permission exists and IS reachable, by the client roles it belongs to.
    expect(deliveryPermissionsFor([DELIVERY_ROLES.CLIENT_ACCEPTANCE_OWNER])).toContain('client.accept');
  });
});

describe('resolveActorRoles', () => {
  it('an owner now holds the approval actions that were previously all refused', async () => {
    const c = captureLogs();
    try {
      const got = await resolveActorRoles({ actor: { role: 'super_admin', email: 'x@example.com' }, kind: 'student' });
      expect(got.source).toBe('admin_bridge');
      expect(got.roles).toEqual([DELIVERY_ROLES.DELIVERY_OWNER]);
      expect(permittedActionsForRoles(got.roles)).toContain('approve_blueprint');
      expect(personasForRoles(got.roles).length).toBeGreaterThan(0);
    } finally { c.restore(); }
  });

  it('no identity resolves to nothing, and never throws', async () => {
    const got = await resolveActorRoles({ actor: undefined, kind: 'student' });
    expect(got).toEqual({ roles: [], source: 'none', reason: 'no_identity' });
  });

  it('a STUDENT project never consults delivery membership — it cannot describe one', async () => {
    const c = captureLogs();
    try {
      await resolveActorRoles({ actor: { role: 'admin' }, kind: 'student', deliveryProjectId: 'ignored' });
      // IDENTITY RESOLUTION is the assertion, not just the membership read. Mutation testing
      // caught this: asserting only on `buildDeliveryContext` let the guard be removed
      // undetected, because `contextFromAdminRequest` returns no identity in this fixture and
      // the membership read is never reached. The first call in the chain is the one to watch.
      expect(scopeBridge.contextFromAdminRequest).not.toHaveBeenCalled();
      expect(deliveryAuth.buildDeliveryContext).not.toHaveBeenCalled();
    } finally { c.restore(); }
  });

  it('an ACTIVE membership shadows the bridge, so a narrower per-project grant is not widened', async () => {
    scopeBridge.contextFromAdminRequest.mockResolvedValue({ platformIdentityId: 'pi-1' });
    deliveryAuth.buildDeliveryContext.mockResolvedValue({ roles: [DELIVERY_ROLES.ASSOCIATE_BUILDER] });

    const c = captureLogs();
    try {
      const got = await resolveActorRoles({ actor: { role: 'super_admin' }, kind: 'delivery', deliveryProjectId: 'dp-1' });
      expect(got.source).toBe('delivery_membership');
      expect(got.roles).toEqual([DELIVERY_ROLES.ASSOCIATE_BUILDER]);
      // The consequence, asserted rather than described: an associate builder approves nothing.
      expect(permittedActionsForRoles(got.roles)).not.toContain('approve_blueprint');
    } finally { c.restore(); }
  });

  it('a resolvable identity with NO membership falls through to the bridge', async () => {
    scopeBridge.contextFromAdminRequest.mockResolvedValue({ platformIdentityId: 'pi-1' });
    deliveryAuth.buildDeliveryContext.mockResolvedValue({ roles: [] });

    const c = captureLogs();
    try {
      const got = await resolveActorRoles({ actor: { role: 'super_admin' }, kind: 'delivery', deliveryProjectId: 'dp-1' });
      expect(got.source).toBe('admin_bridge');
      expect(got.roles).toEqual([DELIVERY_ROLES.DELIVERY_OWNER]);
    } finally { c.restore(); }
  });

  it('AN UNREADABLE MEMBERSHIP TABLE FAILS CLOSED and does not fall back to the bridge', async () => {
    // The load-bearing one. "I could not read the authority" must never resolve to a WIDER answer
    // than "the authority says no" — otherwise a database hiccup hands an admin delivery_owner on
    // a project where a membership might have said associate_builder.
    scopeBridge.contextFromAdminRequest.mockRejectedValue(
      Object.assign(new Error('relation "platform_identities" does not exist'), { name: 'DatabaseError' }),
    );

    const c = captureLogs();
    try {
      const got = await resolveActorRoles({ actor: { role: 'super_admin' }, kind: 'delivery', deliveryProjectId: 'dp-1' });
      expect(got).toEqual({ roles: [], source: 'none', reason: 'membership_unreadable' });
      expect(permittedActionsForRoles(got.roles)).toEqual([]);
      const failure = c.lines.map((l) => JSON.parse(l))
        .find((l) => l.event === 'lifecycle_actor_membership_unreadable');
      expect(failure).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'Error' });
    } finally { c.restore(); }
  });

  it('logs the source so a reader can count how often the bridge carries the system', async () => {
    const c = captureLogs();
    try {
      // The actor CARRIES an email, which is the only way the redaction claim below means
      // anything. Mutation testing caught this too: with an email-less fixture, a line that
      // leaked `actor_email` leaked a null and the assertion passed.
      await resolveActorRoles({
        actor: { role: 'admin', mgmt_role: 'curriculum', email: 'staffer@example.test' },
        kind: 'student',
      });
      const line = c.lines.map((l) => JSON.parse(l))
        .find((l) => l.event === 'lifecycle_actor_roles_resolved');
      expect(line).toMatchObject({
        context: { source: 'admin_bridge', reason: 'mgmt_role_bridge', mgmt_role: 'curriculum' },
      });
      // No email in the line. These go to container stdout.
      expect(JSON.stringify(line)).not.toContain('staffer@example.test');
      expect(JSON.stringify(line)).not.toContain('@');
    } finally { c.restore(); }
  });
});
