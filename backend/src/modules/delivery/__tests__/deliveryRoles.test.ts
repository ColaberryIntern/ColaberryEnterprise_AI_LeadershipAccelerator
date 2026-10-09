/**
 * Contract tests for the delivery role registry.
 *
 * These pin the separations that the whole authorization model rests on — the ones that
 * would be quietly lost by a well-meaning "simplify the grants" refactor.
 */
import fs from 'fs';
import path from 'path';
import {
  ALL_DELIVERY_ROLES,
  DELIVERY_ROLES,
  deliveryPermissionsFor,
  deliveryRoleGrants,
  isClientOnly,
  isClientSideRole,
  isKnownDeliveryRole,
  rolesHaveDeliveryPermission,
  rolesWithDeliveryPermission,
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

describe('rolesWithDeliveryPermission is the INVERSE of the grant table', () => {
  // Acceptance item 4 of P5-T2, and it is asserted BOTH WAYS on purpose. A one-directional
  // check ("every role returned is known") passes for a function that returns nothing, and a
  // "next actor" that silently resolves to nobody is worse than an error: the UI would render a
  // blank where a name belongs and nobody would know a permission had been missed.

  it('ROUND-TRIPS against deliveryRoleGrants for every role and every permission', () => {
    // THE REAL ASSERTION. Not "the inverse looks plausible" but "role is in inverse(p) exactly
    // when p is in grants(role)", checked over the whole cross product. Derived from the two
    // functions rather than from a hand-written expectation, so there is nothing to drift.
    const everyPermission = [...new Set(
      ALL_DELIVERY_ROLES.flatMap((role) => [...deliveryRoleGrants(role)]),
    )];

    let pairsChecked = 0;
    for (const permission of everyPermission) {
      const holders = rolesWithDeliveryPermission(permission);
      for (const role of ALL_DELIVERY_ROLES) {
        const grantsIt = deliveryRoleGrants(role).includes(permission);
        expect(holders.includes(role)).toBe(grantsIt);
        pairsChecked += 1;
      }
    }

    // Non-vacuity, twice. Without these the loop above holds for an empty permission set, which
    // is exactly how a derived check ends up proving nothing.
    expect(everyPermission.length).toBeGreaterThan(10);
    expect(pairsChecked).toBe(everyPermission.length * ALL_DELIVERY_ROLES.length);
  });

  it('every role in ALL_DELIVERY_ROLES is reachable through the inverse', () => {
    // The other direction: a role the inverse can never return is a role no stage could ever
    // name as its next actor. There is no exclusion list because no role needs one — every one
    // of the thirteen holds at least a read. If that changes, this test is where it surfaces,
    // and the fix is to name the excluded role here with a reason rather than to loosen this.
    const reachable = new Set(
      [...new Set(ALL_DELIVERY_ROLES.flatMap((r) => [...deliveryRoleGrants(r)]))]
        .flatMap((p) => [...rolesWithDeliveryPermission(p)]),
    );
    const unreachable = ALL_DELIVERY_ROLES.filter((r) => !reachable.has(r));

    expect(unreachable).toEqual([]);
    expect(reachable.size).toBe(ALL_DELIVERY_ROLES.length);
  });

  it('returns ONLY known roles, never a key that is in the table but not the registry', () => {
    // `ROLE_GRANTS` is `Record<string, ...>`, so a typo key would sit in it silently. The inverse
    // iterates `ALL_DELIVERY_ROLES` rather than the table's keys precisely so such a key can
    // never be surfaced as an actor — this asserts that choice rather than trusting it.
    for (const permission of ['project.write', 'design.approve', 'story.read'] as const) {
      for (const role of rolesWithDeliveryPermission(permission)) {
        expect(isKnownDeliveryRole(role)).toBe(true);
      }
    }
  });

  it('SOURCE: the inverse iterates the REGISTRY, not the grant table keys', () => {
    // A SOURCE-LEVEL ASSERTION, and it is deliberate rather than lazy. `ROLE_GRANTS` is
    // `Record<string, ...>` and module-private, so a typo key would sit in it silently and no
    // test could inject one. Iterating `ALL_DELIVERY_ROLES` makes surfacing such a key
    // IMPOSSIBLE BY CONSTRUCTION — but the two collections are identical today, so swapping
    // one for the other changes no answer and a behavioural test cannot tell them apart. I
    // mutated it to `Object.keys(ROLE_GRANTS)` and all 39 tests passed.
    //
    // This repo already uses source assertions for exactly this shape: `projectLifecycleRoutes`
    // checks its own text because a guard that is present-but-not-applied passes a behavioural
    // test. Same reasoning. What it buys is that the day the table gains a key the registry
    // does not have, the construction is still safe — rather than safe only by coincidence.
    const src = fs.readFileSync(path.join(__dirname, '..', 'deliveryRoles.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function rolesWithDeliveryPermission'));
    const impl = body.slice(0, body.indexOf('}') + 1);

    expect(impl).toContain('ALL_DELIVERY_ROLES.filter');
    expect(impl).not.toContain('Object.keys');
    // POSITIVE CONTROL: the slice really did capture the implementation, not an empty string
    // or the whole file — which is how a source assertion usually manages to prove nothing.
    expect(impl).toContain('includes(permission)');
    expect(impl.length).toBeLessThan(600);
  });

  it('POSITIVE CONTROL: a permission nobody holds returns an empty list, not every role', () => {
    // Without this, the round-trip above would also pass for a function returning
    // ALL_DELIVERY_ROLES unconditionally when the permission is unrecognised.
    const held = rolesWithDeliveryPermission(
      'nonexistent.permission' as unknown as Parameters<typeof rolesWithDeliveryPermission>[0],
    );
    expect(held).toEqual([]);
  });

  it('is ordered by ALL_DELIVERY_ROLES, so the next actor does not reorder between deploys', () => {
    const holders = rolesWithDeliveryPermission('story.read');
    const expectedOrder = ALL_DELIVERY_ROLES.filter((r) => holders.includes(r));
    expect([...holders]).toEqual([...expectedOrder]);
    // Non-vacuity: a read permission should be widely held, so this is not comparing two
    // empty lists.
    expect(holders.length).toBeGreaterThan(1);
  });
});
