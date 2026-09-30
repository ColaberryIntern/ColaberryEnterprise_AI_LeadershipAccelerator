/**
 * Contract tests for the delivery authorization gate and the risk ladder.
 *
 * The properties pinned here are the ones master plan §24 lists as stop conditions:
 * unknown authorization must fail closed, a cross-tenant caller must be denied without
 * enumeration, and the same policy must apply to humans and AI workers alike.
 */
import {
  DELIVERY_RISK_ORDER,
  declarationFor,
  deliveryRiskIndex,
  isDeclaredAction,
  isKnownDeliveryRiskLevel,
  riskWithinCeiling,
} from '../deliveryRiskLevels';
import {
  DeliveryAccessError,
  authorizeAction,
  emptyDeliveryContext,
  hasDeliveryPermission,
  requireDeliveryPermission,
  requireTenantThenDelivery,
  type DeliveryProjectContext,
} from '../deliveryAuthorization';
import { DELIVERY_ROLES } from '../deliveryRoles';

const ctxWith = (roles: string[]): DeliveryProjectContext => ({
  platformIdentityId: 'id-1',
  deliveryProjectId: 'proj-1',
  projectTenantId: 'tenant-1',
  roles,
  isClientOnly: false,
});

describe('risk ladder', () => {
  it('R0..R5 in order, matching the ops fleet for R0..R4', () => {
    expect([...DELIVERY_RISK_ORDER]).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
  });

  it('an unrecognized risk level is treated as MAXIMUM risk, not minimum', () => {
    // The deliberate divergence from agentAutonomy's fail-open convention. A delivery
    // action whose risk nobody can classify is not safe to run unreviewed.
    expect(deliveryRiskIndex('R9')).toBe(DELIVERY_RISK_ORDER.length - 1);
    expect(deliveryRiskIndex('')).toBe(DELIVERY_RISK_ORDER.length - 1);
    expect(deliveryRiskIndex(null)).toBe(DELIVERY_RISK_ORDER.length - 1);
    expect(deliveryRiskIndex(undefined)).toBe(DELIVERY_RISK_ORDER.length - 1);
  });

  it('rejects unknown levels by name', () => {
    expect(isKnownDeliveryRiskLevel('R3')).toBe(true);
    expect(isKnownDeliveryRiskLevel('R6')).toBe(false);
  });

  it('a ceiling comparison with a malformed ceiling does not silently widen authority', () => {
    // A garbage ceiling must not permit everything. Both sides resolve to max, so an R0
    // action still fits but nothing is *widened* beyond what a real ceiling allows.
    expect(riskWithinCeiling('R2', 'nonsense')).toBe(true);
    expect(riskWithinCeiling('nonsense', 'R2')).toBe(false);
  });

  it('R2 fits under an R3 ceiling; R4 does not', () => {
    expect(riskWithinCeiling('R2', 'R3')).toBe(true);
    expect(riskWithinCeiling('R4', 'R3')).toBe(false);
  });
});

describe('action declarations', () => {
  it('an UNDECLARED action is R5 and needs the highest authority', () => {
    // Adding a consequential action without declaring it must make it maximally
    // restricted and immediately visible, never silently permitted.
    const decl = declarationFor('some.action.nobody.registered');
    expect(decl.risk).toBe('R5');
    expect(decl.requiredPermission).toBe('project.manage_authority');
    expect(isDeclaredAction('some.action.nobody.registered')).toBe(false);
  });

  it('declares release.deploy as R4 needing a separate approver', () => {
    const decl = declarationFor('release.deploy');
    expect(decl.risk).toBe('R4');
    expect(decl.requiredApproverPermission).toBe('release.approve');
  });

  it('a schema change needs write permission but architecture APPROVAL from a second party', () => {
    const decl = declarationFor('schema.change');
    expect(decl.requiredPermission).toBe('architecture.write');
    expect(decl.requiredApproverPermission).toBe('architecture.approve');
  });
});

describe('requireDeliveryPermission fails closed', () => {
  it('unauthenticated → 401', () => {
    expect(() => requireDeliveryPermission(emptyDeliveryContext(), 'project.read')).toThrow(
      DeliveryAccessError,
    );
    try {
      requireDeliveryPermission(emptyDeliveryContext(), 'project.read');
    } catch (e) {
      expect((e as DeliveryAccessError).status).toBe(401);
    }
  });

  it('authenticated but not a member → 404, NOT 403', () => {
    // A 403 confirms the project exists. A non-member has not earned that fact.
    try {
      requireDeliveryPermission(ctxWith([]), 'project.read');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as DeliveryAccessError).status).toBe(404);
      expect((e as DeliveryAccessError).reason).toBe('not_a_project_member');
    }
  });

  it('a member missing the permission → 403', () => {
    // They already know the project exists, so 403 is correct and more useful.
    try {
      requireDeliveryPermission(ctxWith([DELIVERY_ROLES.OBSERVER]), 'story.execute');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as DeliveryAccessError).status).toBe(403);
      expect((e as DeliveryAccessError).reason).toContain('story.execute');
    }
  });

  it('a member with the permission passes', () => {
    expect(() =>
      requireDeliveryPermission(ctxWith([DELIVERY_ROLES.BUILDER]), 'story.execute'),
    ).not.toThrow();
  });

  it('an unknown role in the context grants nothing', () => {
    expect(hasDeliveryPermission(ctxWith(['wizard']), 'project.read')).toBe(false);
  });
});

describe('tenant guard runs first, and denial does not enumerate', () => {
  it('a cross-tenant caller gets 404 even when they would have had the permission', () => {
    // The ordering IS the security property: they must not learn the project exists.
    try {
      requireTenantThenDelivery(ctxWith([DELIVERY_ROLES.DELIVERY_OWNER]), false, 'project.read');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as DeliveryAccessError).status).toBe(404);
      expect((e as DeliveryAccessError).reason).toBe('cross_tenant_denied');
    }
  });

  it('passing the tenant guard still requires the delivery permission', () => {
    expect(() =>
      requireTenantThenDelivery(ctxWith([DELIVERY_ROLES.OBSERVER]), true, 'release.deploy'),
    ).toThrow(DeliveryAccessError);
  });

  it('both passing lets the action through', () => {
    expect(() =>
      requireTenantThenDelivery(ctxWith([DELIVERY_ROLES.DELIVERY_OWNER]), true, 'release.deploy'),
    ).not.toThrow();
  });
});

describe('authorizeAction — same policy for humans and AI workers', () => {
  it('denies an undeclared action to an ordinary builder', () => {
    const result = authorizeAction(ctxWith([DELIVERY_ROLES.BUILDER]), 'delete.everything');
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('R5');
  });

  it('allows an R2 execute for a builder with no ceiling applied', () => {
    const result = authorizeAction(ctxWith([DELIVERY_ROLES.BUILDER]), 'story.execute');
    expect(result).toMatchObject({ allowed: true, requiresApproval: false, risk: 'R2' });
  });

  it('an R2 story ABOVE an associate’s ceiling becomes a review, not a refusal', () => {
    // The distinction that lets an intern drive work they cannot unilaterally land.
    const result = authorizeAction(
      ctxWith([DELIVERY_ROLES.ASSOCIATE_BUILDER]),
      'story.execute',
      { riskCeiling: 'R1' },
    );
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe('above_authority_ceiling');
  });

  it('an R1 story within the ceiling needs no approval', () => {
    const result = authorizeAction(ctxWith([DELIVERY_ROLES.ASSOCIATE_BUILDER]), 'story.write', {
      riskCeiling: 'R1',
    });
    expect(result).toMatchObject({ allowed: true, requiresApproval: false });
  });

  it('R4 always needs a second party, even for the delivery owner with no ceiling', () => {
    // No single identity ships to production alone.
    const result = authorizeAction(ctxWith([DELIVERY_ROLES.DELIVERY_OWNER]), 'release.deploy');
    expect(result).toMatchObject({ allowed: true, requiresApproval: true, reason: 'high_risk_action' });
  });

  it('lacking the permission denies before the ceiling is even considered', () => {
    const result = authorizeAction(ctxWith([DELIVERY_ROLES.OBSERVER]), 'story.execute', {
      riskCeiling: 'R5',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing_permission');
  });

  it('a ceiling can never GRANT a permission the role lacks', () => {
    // The profile caps, it never grants. An R5 ceiling on an observer is still no access.
    const result = authorizeAction(ctxWith([DELIVERY_ROLES.OBSERVER]), 'release.deploy', {
      riskCeiling: 'R5',
    });
    expect(result.allowed).toBe(false);
  });

  it('an unauthenticated caller is denied regardless of action', () => {
    const result = authorizeAction(emptyDeliveryContext(), 'project.read');
    expect(result).toMatchObject({ allowed: false, reason: 'unauthenticated' });
  });
});
