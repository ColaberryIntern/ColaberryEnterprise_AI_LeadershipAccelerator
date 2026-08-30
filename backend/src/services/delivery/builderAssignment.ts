import { Op } from 'sequelize';
import {
  assessOverload,
  type ActiveOverride,
  type OverloadAssessment,
} from './capacityOverride';
import { DELIVERY_ROLES, isClientSideRole } from '../../modules/delivery/deliveryRoles';

/**
 * builderAssignment — the first code path that actually consults the Gate 12 capacity model.
 *
 * ## Why this exists
 *
 * Gate 12 built `assessOverload`, `decideCapacityOverride` and
 * `effectiveMaxParallelProjects`, tested them thoroughly, and **nothing ever called
 * them**. A guard with no caller does not guard: before this, a builder could be put on
 * a hundred projects and no code path would object, because no code path assigned anyone
 * at all — the only writer of `delivery_project_members` was a dev seed script.
 *
 * E2E scenario C asserts that *the fourth concurrent assignment is refused*. That was
 * unobservable, not because the logic was wrong, but because there was no assignment to
 * refuse.
 *
 * ## The cap is read, never assumed
 *
 * `max_parallel_projects` comes from the builder's `BuilderAuthorityProfile`. A builder
 * with no profile is **refused rather than defaulted**: an unassessed person having no
 * cap is exactly backwards, and picking a number here would invent an authority decision
 * that nobody made.
 *
 * ## Only builder-side roles count toward the cap
 *
 * A client reviewer on twelve projects is not overloaded — they are a client. Counting
 * every membership would make the cap meaningless for anyone who is also a stakeholder
 * somewhere.
 */

export type AssignmentRefusalReason =
  | 'no_authority_profile'
  | 'client_side_role'
  | 'already_assigned'
  | 'overloaded';

export interface AssignmentRefusal {
  assigned: false;
  reason: AssignmentRefusalReason;
  message: string;
  assessment?: OverloadAssessment;
}

export interface AssignmentSuccess {
  assigned: true;
  membershipId: string;
  assessment: OverloadAssessment;
}

export type AssignmentOutcome = AssignmentRefusal | AssignmentSuccess;

/** Roles that consume a builder's parallel-project capacity. */
export const CAPACITY_CONSUMING_ROLES: readonly string[] = [
  DELIVERY_ROLES.BUILDER,
  DELIVERY_ROLES.ASSOCIATE_BUILDER,
  DELIVERY_ROLES.ARCHITECT,
];

export function consumesCapacity(role: string): boolean {
  return CAPACITY_CONSUMING_ROLES.includes(role);
}

/**
 * The override in force for a builder right now, or null.
 *
 * Reads the most recently granted un-revoked row whose expiry is still ahead. Expiry is
 * re-checked by `effectiveMaxParallelProjects` against the caller's `now`, so a row that
 * lapses between this query and that check still falls back correctly — the query is a
 * narrowing, not the decision.
 */
export async function activeOverrideFor(
  builderIdentityId: string,
  now: Date,
  models: any,
): Promise<ActiveOverride | null> {
  const row = await models.DeliveryCapacityOverride.findOne({
    where: {
      builder_identity_id: builderIdentityId,
      revoked_at: null,
      expires_at: { [Op.gt]: now },
    },
    order: [['created_at', 'DESC']],
  });
  if (!row) return null;
  return {
    overrideMaxParallelProjects: row.override_max_parallel_projects,
    expiresAt: row.expires_at,
  };
}

/**
 * Assign a builder to a project, consulting the capacity model first.
 *
 * Returns a refusal rather than throwing, because "this person is at capacity" is an
 * ordinary answer a caller must render, not an exceptional condition.
 */
export async function assignBuilderToProject(input: {
  projectId: string;
  builderIdentityId: string;
  role: string;
  actorIdentityId: string;
  now?: Date;
  models: any;
}): Promise<AssignmentOutcome> {
  const now = input.now ?? new Date();
  const { models } = input;

  if (isClientSideRole(input.role)) {
    // Gate 10's line, enforced at the point it can be crossed: a client-side role is not
    // an assignment of work and must not travel through the builder path.
    return {
      assigned: false,
      reason: 'client_side_role',
      message: 'That is a client-side role. Add client participants through the client path.',
    };
  }

  const existing = await models.DeliveryProjectMember.findOne({
    where: {
      delivery_project_id: input.projectId,
      platform_identity_id: input.builderIdentityId,
      delivery_role: input.role,
    },
  });
  if (existing) {
    // Idempotent: re-assigning the same person to the same role is a no-op rather than a
    // second row, which would make the capacity count wrong and revocation ambiguous.
    return {
      assigned: false,
      reason: 'already_assigned',
      message: 'That builder already holds that role on this project.',
    };
  }

  const profile = await models.BuilderAuthorityProfile.findOne({
    where: { platform_identity_id: input.builderIdentityId },
  });
  if (!profile) {
    return {
      assigned: false,
      reason: 'no_authority_profile',
      message:
        'That builder has no Builder Authority Profile, so their capacity is unknown. Assess them first.',
    };
  }

  let assessment: OverloadAssessment = {
    overloaded: false,
    activeProjects: 0,
    effectiveMax: profile.max_parallel_projects,
    reliesOnOverride: false,
  };

  if (consumesCapacity(input.role)) {
    // Count only capacity-consuming memberships. A client reviewer on twelve projects is
    // not overloaded, they are a client.
    const activeProjects = await models.DeliveryProjectMember.count({
      where: {
        platform_identity_id: input.builderIdentityId,
        delivery_role: { [Op.in]: CAPACITY_CONSUMING_ROLES },
        status: 'active',
      },
    });

    const override = await activeOverrideFor(input.builderIdentityId, now, models);

    // The assignment being considered is the (activeProjects + 1)th. Assessing the
    // current count would let every builder land exactly one over their cap.
    assessment = assessOverload({
      activeProjects: activeProjects + 1,
      baseMaxParallelProjects: profile.max_parallel_projects,
      override,
      now,
    });

    if (assessment.overloaded) {
      return {
        assigned: false,
        reason: 'overloaded',
        message: `That builder is at capacity: ${assessment.activeProjects - 1} active, cap ${assessment.effectiveMax}.`,
        assessment,
      };
    }
  }

  const membership = await models.DeliveryProjectMember.create({
    delivery_project_id: input.projectId,
    platform_identity_id: input.builderIdentityId,
    delivery_role: input.role,
    granted_by_identity_id: input.actorIdentityId,
  });

  // Recorded whether or not it relied on an override, because "within capacity" and
  // "within capacity only because someone signed an exception" are different facts and a
  // lead reading this later should not have to reconstruct which it was.
  await models.DeliveryEvent.create({
    delivery_project_id: input.projectId,
    event_type: 'builder_assigned',
    actor_identity_id: input.actorIdentityId,
    outcome: 'success',
    context: {
      builder_identity_id: input.builderIdentityId,
      role: input.role,
      active_projects: assessment.activeProjects,
      effective_max: assessment.effectiveMax,
      relies_on_override: assessment.reliesOnOverride,
    },
  }).catch(() => {
    // The assignment already happened. Losing the event is bad; undoing a completed,
    // capacity-checked assignment because bookkeeping failed would be worse.
  });

  return { assigned: true, membershipId: membership.id, assessment };
}
