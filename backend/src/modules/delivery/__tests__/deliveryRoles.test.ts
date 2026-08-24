/**
 * Contract tests for the delivery role registry.
 *
 * These pin the separations that the whole authorization model rests on — the ones that
 * would be quietly lost by a well-meaning "simplify the grants" refactor.
 */
import {
  ALL_DELIVERY_ROLES,
  DELIVERY_ROLES,
  deliveryPermissionsFor,
  deliveryRoleGrants,
  isClientOnly,
  isClientSideRole,
  isKnownDeliveryRole,
  rolesHaveDeliveryPermission,
} from '../deliveryRoles';

describe('unknown roles grant nothing', () => {
  it.each([['nonsense'], [''], ['tenant_admin'], ['admin'], ['DELIVERY_OWNER']])(
    '%p grants no permissions',
    (role) => {
      expect(deliveryRoleGrants(role)).toEqual([]);
      expect(isKnownDeliveryRole(role)).toBe(false);
    },
  );

  it('a tenant role is not a delivery role — the two registries are separate', () => {
    // Holding tenant_admin must not confer delivery authority. Master plan §4.
    expect(deliveryRoleGrants('tenant_admin')).toEqual([]);
    expect(deliveryRoleGrants('platform_super_admin')).toEqual([]);
  });

  it('every declared role is known and grants at least a read', () => {
    ALL_DELIVERY_ROLES.forEach((role) => {
      expect(isKnownDeliveryRole(role)).toBe(true);
      expect(deliveryRoleGrants(role)).toContain('project.read');
    });
  });
});

describe('client roles cannot build', () => {
  const CLIENT_ROLES = [
    DELIVERY_ROLES.CLIENT_OWNER,
    DELIVERY_ROLES.CLIENT_REVIEWER,
    DELIVERY_ROLES.CLIENT_ACCEPTANCE_OWNER,
  ];

  it.each(CLIENT_ROLES)('%s cannot execute a story', (role) => {
    // Master plan §5.1: the client talks to Project AI, never directly to the worker.
    expect(deliveryRoleGrants(role)).not.toContain('story.execute');
  });

  it.each(CLIENT_ROLES)('%s cannot write requirements or architecture', (role) => {
    const grants = deliveryRoleGrants(role);
    expect(grants).not.toContain('requirement.write');
    expect(grants).not.toContain('architecture.write');
  });

  it.each(CLIENT_ROLES)('%s cannot read architecture or agent internals', (role) => {
    const grants = deliveryRoleGrants(role);
    expect(grants).not.toContain('architecture.read');
    expect(grants).not.toContain('agent.read');
  });

  it.each(CLIENT_ROLES)('%s cannot manage members', (role) => {
    expect(deliveryRoleGrants(role)).not.toContain('project.manage_members');
  });

  it('a client reviewer can comment but not approve', () => {
    const grants = deliveryRoleGrants(DELIVERY_ROLES.CLIENT_REVIEWER);
    expect(grants).toContain('design.comment');
    expect(grants).not.toContain('design.approve');
    expect(grants).not.toContain('client.accept');
  });
});

describe('only client-side roles can accept a release', () => {
  it('client.accept is held by exactly the two client decision roles', () => {
    const holders = ALL_DELIVERY_ROLES.filter((r) =>
      deliveryRoleGrants(r).includes('client.accept'),
    );
    expect(holders.sort()).toEqual(
      [DELIVERY_ROLES.CLIENT_OWNER, DELIVERY_ROLES.CLIENT_ACCEPTANCE_OWNER].sort(),
    );
  });

  it('a delivery owner cannot accept on the client’s behalf', () => {
    expect(deliveryRoleGrants(DELIVERY_ROLES.DELIVERY_OWNER)).not.toContain('client.accept');
  });
});

describe('separation of duties', () => {
  it('a security reviewer can approve architecture but not write it', () => {
    // A reviewer who can author what they review is not a reviewer.
    const grants = deliveryRoleGrants(DELIVERY_ROLES.SECURITY_REVIEWER);
    expect(grants).toContain('architecture.approve');
    expect(grants).not.toContain('architecture.write');
  });

  it('a QA reviewer can review and verify but not execute', () => {
    const grants = deliveryRoleGrants(DELIVERY_ROLES.QA_REVIEWER);
    expect(grants).toContain('story.review');
    expect(grants).toContain('evidence.verify');
    expect(grants).not.toContain('story.execute');
  });

  it('only the delivery owner can deploy', () => {
    const holders = ALL_DELIVERY_ROLES.filter((r) =>
      deliveryRoleGrants(r).includes('release.deploy'),
    );
    expect(holders).toEqual([DELIVERY_ROLES.DELIVERY_OWNER]);
  });

  it('an associate builder cannot author architecture; a builder can', () => {
    expect(deliveryRoleGrants(DELIVERY_ROLES.ASSOCIATE_BUILDER)).not.toContain(
      'architecture.write',
    );
    expect(deliveryRoleGrants(DELIVERY_ROLES.BUILDER)).toContain('architecture.write');
  });

  it('an observer can only read', () => {
    deliveryRoleGrants(DELIVERY_ROLES.OBSERVER).forEach((p) => expect(p).toMatch(/\.read$/));
  });
});

describe('permission aggregation across multiple roles', () => {
  it('a person holding two roles gets the union', () => {
    const perms = deliveryPermissionsFor([
      DELIVERY_ROLES.OBSERVER,
      DELIVERY_ROLES.DESIGN_REVIEWER,
    ]);
    expect(perms).toContain('design.approve');
    expect(perms).toContain('story.read');
  });

  it('de-duplicates overlapping grants', () => {
    const perms = deliveryPermissionsFor([DELIVERY_ROLES.BUILDER, DELIVERY_ROLES.OBSERVER]);
    expect(perms.length).toBe(new Set(perms).size);
  });

  it('an unknown role alongside a real one adds nothing', () => {
    const real = deliveryPermissionsFor([DELIVERY_ROLES.BUILDER]);
    const withJunk = deliveryPermissionsFor([DELIVERY_ROLES.BUILDER, 'superuser']);
    expect(withJunk.sort()).toEqual(real.sort());
  });

  it('an empty role list carries no permission', () => {
    expect(rolesHaveDeliveryPermission([], 'project.read')).toBe(false);
    expect(deliveryPermissionsFor([])).toEqual([]);
  });
});

describe('client-side detection drives which projection is served', () => {
  it('identifies the three client roles', () => {
    expect(isClientSideRole(DELIVERY_ROLES.CLIENT_OWNER)).toBe(true);
    expect(isClientSideRole(DELIVERY_ROLES.CLIENT_REVIEWER)).toBe(true);
    expect(isClientSideRole(DELIVERY_ROLES.CLIENT_ACCEPTANCE_OWNER)).toBe(true);
    expect(isClientSideRole(DELIVERY_ROLES.BUILDER)).toBe(false);
  });

  it('someone holding BOTH a client and an internal role is not client-only', () => {
    // Serving them the client projection would hide work they are entitled to see.
    expect(isClientOnly([DELIVERY_ROLES.CLIENT_OWNER, DELIVERY_ROLES.BUILDER])).toBe(false);
  });

  it('no roles at all is not client-only — it is no access', () => {
    expect(isClientOnly([])).toBe(false);
  });
});
