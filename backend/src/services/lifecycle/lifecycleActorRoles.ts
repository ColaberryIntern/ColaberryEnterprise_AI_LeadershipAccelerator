/**
 * Which DELIVERY roles an admin identity acts with on one lifecycle row.
 *
 * ## The hole this closes (L7.6 blocker B1)
 *
 * Every lifecycle authority check derived the actor's permissions with
 * `deliveryPermissionsFor([req.admin.role])`. `req.admin.role` comes from the admin JWT and is
 * one of `admin_users.role`; `ROLE_GRANTS` in `modules/delivery/deliveryRoles.ts` is keyed on the
 * DELIVERY roles. The two vocabularies do not overlap at a single point, so the lookup fell
 * through to the registry's fail-closed branch and returned `[]` for every caller.
 *
 * Measured in the production bundle rather than argued from the source: the 13 delivery roles
 * yield 180 permissions between them, and all four admin roles yield 0. Not "few" - zero. So
 * every transition was refused, every change request was refused, `permittedActions` was empty
 * on every response and `viewerPersonas` was empty for everyone, including the owner.
 *
 * ## Why this is not simply "read the real membership instead"
 *
 * That was the first design, and production disproved it on 2026-11-14 (read-only counts):
 *
 *   - 39 lifecycle rows: **28 student**, 11 delivery. `delivery_project_members` is keyed on
 *     `delivery_project_id`, so it cannot describe a student project at all - not "is empty
 *     for", cannot. That is 72% of the rows this service governs.
 *   - All 10 membership rows carry `associate_builder` (4 active, 6 revoked), across 8 projects.
 *     `associate_builder` holds no approval permission whatsoever - no `contract.approve`, no
 *     `requirement.approve`, no `architecture.approve`, no `design.approve`, no
 *     `release.approve`. The entire populated membership table is interns.
 *   - 1 of 50 `admin_users` rows resolves to a `platform_identities` row, and only through the
 *     email fallback: `platform_identity_links` holds 0 rows, so the id path is dead.
 *   - End to end - admin to identity to active membership to a project with a lifecycle row -
 *     there are **0 complete chains**.
 *
 * So membership-first reaches exactly the same zero as the bug, by a longer route. A bridge from
 * the admin vocabulary is not a shortcut around the authority; today it is the only thing that
 * resolves to a non-empty answer for any caller on any project.
 *
 * ## The resolution order, and why the bridge is second
 *
 *   1. **An active delivery membership on this project wins.** It is a deliberate, per-project
 *      statement about this person, which is the question `DeliveryProjectMember` exists to
 *      answer: "may they approve THIS design decision?"
 *   2. **Otherwise the admin identity is bridged** to exactly one delivery role, below.
 *   3. **Otherwise nothing.** Fail closed, as the registry does.
 *
 * Self-closing at the finest grain available: the condition is per actor, per project, so the
 * bridge stops firing for a person the moment a real membership is written for them - no flag to
 * remember, no global ramp to forget to remove. Note honestly that for the 28 student rows it
 * can never close, because membership cannot be expressed for them; there the bridge is the
 * mechanism, not a ramp.
 *
 * THE TRADEOFF THIS ENCODES, stated because it is a policy choice and not an obvious one: a
 * membership present on the project SHADOWS the admin bridge rather than being unioned with it.
 * The consequence is that someone who is both a platform admin and a named `associate_builder`
 * on a project acts there as an associate builder, which costs them approval authority. That is
 * 0 people today (the chain count above is zero) and it is the narrower of the two readings,
 * which is the right way to be wrong in an authorization change. The union is the alternative
 * and is a one-line change in `resolveActorRoles` if that call goes the other way.
 *
 * ## Why `mgmt_role` is read FIRST, and why reading `role` alone would widen access
 *
 * `mgmtBridgeService.mintMgmtAdminToken` sets the JWT's `role` to `'super_admin'` for the
 * `owner` management role and **`'admin'` for every other one**. A `curriculum` staff member
 * therefore arrives carrying `role: 'admin'`, and `curriculum` is one of only three management
 * roles whose sections include `program` - so they can reach these routes. A bridge keyed on
 * `role` alone would hand them `delivery_lead`: contract approval, architecture approval,
 * release approval and member management, acquired silently through a bug fix. `mgmtRoles.ts`
 * already names that failure mode - "another intern's entire domain, dressed up as scoping" -
 * so this reads `mgmt_role` first, exactly as `adminAllowedSections` does.
 *
 * ## What the bridge cannot do
 *
 * Neither bridged role carries `client.accept`; in `ROLE_GRANTS` that belongs only to
 * `client_owner` and `client_acceptance_owner`. So no amount of platform administration can
 * accept a release on a client's behalf through this path, which is the property
 * `deliveryAuthorization.ts`'s header insists on: "A platform superadmin can see that a project
 * exists; approving a client's design decision on their behalf is a different act." That is
 * asserted by a test rather than left to the reader.
 */
import type { DeliveryRole } from '../../modules/delivery/deliveryRoles';
import { DELIVERY_ROLES } from '../../modules/delivery/deliveryRoles';
import type { ProjectKind } from './lifecycleStatus';

/** The claims this resolver reads. `mgmt_role` rides on bridge-minted staff tokens. */
export interface LifecycleActor {
  id?: string;
  email?: string;
  role?: string;
  mgmt_role?: string;
}

/** Where the answer came from. Carried into the log so the two paths are distinguishable. */
export type ActorRoleSource = 'delivery_membership' | 'admin_bridge' | 'none';

export interface ActorRoles {
  roles: DeliveryRole[];
  source: ActorRoleSource;
  /** A stable, loggable reason. Never free text assembled at the call site. */
  reason: string;
}

/**
 * Management role -> delivery role.
 *
 * Only the three management roles whose sections include `program` can reach a lifecycle route
 * at all (`owner`, `admin`, `curriculum` - see `MGMT_ROLE_DEFS`). The others are listed nowhere
 * and therefore resolve to nothing, which is deliberate: a role that arrives here only because
 * someone granted it `program` through `mgmt_extra_sections` has been given a SECTION, which is
 * permission to open a surface, not authority to approve what is on it.
 */
const MGMT_ROLE_BRIDGE: Readonly<Record<string, DeliveryRole>> = {
  // Holds every section. The platform owner is the engagement owner.
  owner: DELIVERY_ROLES.DELIVERY_OWNER,
  // Everything except Inbox & Content. Runs delivery day to day, and deliberately NOT
  // `delivery_owner`: that is the only role carrying `release.deploy` and
  // `project.manage_authority`, and deploy authority should be granted by name, not inherited
  // from an administrative role through a compatibility bridge.
  admin: DELIVERY_ROLES.DELIVERY_LEAD,
  // Reaches the Program section, so it reaches these routes. Read-only here on purpose:
  // approving a contract, an architecture or a release is not curriculum work, and `observer`
  // is the registry's existing name for "may look at everything, may decide nothing".
  curriculum: DELIVERY_ROLES.OBSERVER,
};

/**
 * Legacy `admin_users.role` -> delivery role, used only when no `mgmt_role` is present.
 *
 * `sales` and `ai_staff` are absent because `adminAllowedSections` gives them no `program`
 * section, so they cannot reach a lifecycle route; 41 of the 50 production admin rows are one of
 * those two. Listing them would be granting authority to identities the gate already refuses.
 */
const ADMIN_ROLE_BRIDGE: Readonly<Record<string, DeliveryRole>> = {
  super_admin: DELIVERY_ROLES.DELIVERY_OWNER,
  admin: DELIVERY_ROLES.DELIVERY_LEAD,
};

/**
 * The bridged delivery role for an admin identity, or null.
 *
 * Pure and exported so the policy can be asserted directly, without a database. The whole point
 * of isolating it is that a reviewer can read the two tables above and the precedence rule in
 * one place and know the complete answer.
 */
export function bridgedDeliveryRole(actor: LifecycleActor | undefined): DeliveryRole | null {
  if (!actor) return null;
  // `mgmt_role` FIRST. See the header: the JWT's `role` is 'admin' for every non-owner
  // management role, so checking `role` first would silently promote scoped staff.
  if (actor.mgmt_role) return MGMT_ROLE_BRIDGE[actor.mgmt_role] ?? null;
  if (actor.role) return ADMIN_ROLE_BRIDGE[actor.role] ?? null;
  return null;
}

/** One structured line, so a reader can tell a real membership from the bridge. */
function logResolution(result: ActorRoles, context: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'backend',
      event: 'lifecycle_actor_roles_resolved',
      outcome: result.roles.length > 0 ? 'success' : 'partial',
      context: { ...context, source: result.source, reason: result.reason, roles: result.roles },
    }),
  );
}

/**
 * Active delivery memberships this identity holds on this delivery project.
 *
 * Fails closed and LOUDLY: an unreadable membership table returns no roles rather than falling
 * through to the bridge, because "I could not read the authority" must not resolve to a wider
 * answer than "the authority says no". Returns null to mean "could not tell", which the caller
 * treats as a refusal, not as an absence.
 */
async function membershipRoles(
  actor: LifecycleActor,
  deliveryProjectId: string,
): Promise<DeliveryRole[] | null> {
  try {
    const { contextFromAdminRequest } = await import('../../modules/tenancy/adminScopeBridge');
    const ctx = await contextFromAdminRequest({ id: actor.id, email: actor.email, role: actor.role });
    if (!ctx.platformIdentityId) return [];

    const { buildDeliveryContext } = await import('../../modules/delivery/deliveryAuthorization');
    const delivery = await buildDeliveryContext({
      platformIdentityId: ctx.platformIdentityId,
      deliveryProjectId,
    });
    // `buildDeliveryContext` has already dropped roles the registry does not recognise.
    return delivery.roles as DeliveryRole[];
  } catch (err) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'lifecycle_actor_membership_unreadable',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { delivery_project_id: deliveryProjectId },
      }),
    );
    return null;
  }
}

/**
 * The delivery roles this actor acts with on this project.
 *
 * `kind` is required rather than inferred: for a student project there is no delivery project id
 * to look a membership up by, and silently skipping the lookup would make the two cases
 * indistinguishable in the log.
 */
export async function resolveActorRoles(input: {
  actor: LifecycleActor | undefined;
  kind: ProjectKind;
  /** The delivery project id, when `kind` is 'delivery'. Ignored otherwise. */
  deliveryProjectId?: string | null;
}): Promise<ActorRoles> {
  const { actor, kind } = input;
  if (!actor) {
    return { roles: [], source: 'none', reason: 'no_identity' };
  }

  if (kind === 'delivery' && input.deliveryProjectId) {
    const held = await membershipRoles(actor, input.deliveryProjectId);
    if (held === null) {
      const result: ActorRoles = { roles: [], source: 'none', reason: 'membership_unreadable' };
      logResolution(result, { kind, delivery_project_id: input.deliveryProjectId });
      return result;
    }
    if (held.length > 0) {
      const result: ActorRoles = {
        roles: held,
        source: 'delivery_membership',
        reason: 'active_project_membership',
      };
      logResolution(result, { kind, delivery_project_id: input.deliveryProjectId });
      return result;
    }
  }

  const bridged = bridgedDeliveryRole(actor);
  const result: ActorRoles = bridged
    ? {
      roles: [bridged],
      source: 'admin_bridge',
      // Named so a log reader can see which table answered, and so counting how often the
      // bridge carries the system is a query rather than a guess.
      reason: actor.mgmt_role ? 'mgmt_role_bridge' : 'admin_role_bridge',
    }
    : { roles: [], source: 'none', reason: 'no_bridge_for_role' };

  logResolution(result, {
    kind,
    // The role names, never the email. These lines go to container stdout.
    mgmt_role: actor.mgmt_role ?? null,
    admin_role: actor.role ?? null,
  });
  return result;
}
