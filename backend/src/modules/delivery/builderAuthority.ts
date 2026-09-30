/**
 * builderAuthority — resolve what a builder may do without a second party.
 *
 * The rule this module exists to enforce: **a profile caps, it never grants.** Nothing
 * here can give an identity a permission their delivery role does not carry. The caller
 * checks the permission first (`deliveryAuthorization.authorizeAction`) and passes the
 * ceiling from here as a constraint on top.
 *
 * ABSENCE IS THE MOST RESTRICTIVE CASE, not an exemption. An identity with no profile row
 * gets `NO_AUTHORITY` below — R0 only, one project, no client contact, no release
 * authority. Master plan §5.6: unknown authorization fails closed. The alternative,
 * treating "no row" as unrestricted, would mean every new account started as a senior
 * builder.
 */

import BuilderAuthorityProfile from '../../models/BuilderAuthorityProfile';
import { isKnownDeliveryRiskLevel, type DeliveryRiskLevel } from './deliveryRiskLevels';

export interface ResolvedBuilderAuthority {
  platformIdentityId: string | null;
  builderLevel: string | null;
  allowedProjectClasses: string[];
  maxParallelProjects: number;
  maxRiskWithoutReview: DeliveryRiskLevel;
  clientInteractionAllowed: boolean;
  releaseAuthority: boolean;
  lastEvaluatedAt: Date | null;
  /** True when no profile exists, or one exists but has never been evaluated. */
  isUnevaluated: boolean;
}

/** The floor. Applied whenever a profile is missing, unreadable, or unevaluated. */
export const NO_AUTHORITY: ResolvedBuilderAuthority = {
  platformIdentityId: null,
  builderLevel: null,
  allowedProjectClasses: [],
  maxParallelProjects: 1,
  maxRiskWithoutReview: 'R0',
  clientInteractionAllowed: false,
  releaseAuthority: false,
  lastEvaluatedAt: null,
  isUnevaluated: true,
};

function logFailure(context: Record<string, unknown>, err: unknown): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'builder_authority_lookup_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { ...context, message: err instanceof Error ? err.message : String(err) },
    }),
  );
}

/**
 * Resolve an identity's authority.
 *
 * A stored `max_risk_without_review` that is not a recognised level is discarded in
 * favour of R0. A typo in an authority column must not widen authority — and because
 * `deliveryRiskIndex()` already treats unknown levels as maximum risk, leaving it in
 * place would make every action appear to exceed the ceiling instead, which is a
 * confusing failure rather than a safe one.
 */
export async function resolveBuilderAuthority(
  platformIdentityId: string | null,
): Promise<ResolvedBuilderAuthority> {
  if (!platformIdentityId) return NO_AUTHORITY;

  let profile: BuilderAuthorityProfile | null = null;
  try {
    profile = await BuilderAuthorityProfile.findOne({
      where: { platform_identity_id: platformIdentityId },
    });
  } catch (err) {
    // Fail closed: an unreadable profile proves nothing about authority.
    logFailure({ platform_identity_id: platformIdentityId }, err);
    return { ...NO_AUTHORITY, platformIdentityId };
  }

  if (!profile) return { ...NO_AUTHORITY, platformIdentityId };

  const storedRisk = profile.max_risk_without_review;
  const maxRisk: DeliveryRiskLevel =
    storedRisk && isKnownDeliveryRiskLevel(storedRisk) ? storedRisk : 'R0';

  // An unevaluated profile is treated as the floor regardless of what its columns say.
  // A row created by a fixture or a partial import must not confer authority nobody
  // reviewed — `last_evaluated_at` is the signal that a human stood behind these values.
  if (!profile.last_evaluated_at) {
    return {
      ...NO_AUTHORITY,
      platformIdentityId,
      builderLevel: profile.builder_level ?? null,
    };
  }

  return {
    platformIdentityId,
    builderLevel: profile.builder_level ?? null,
    allowedProjectClasses: profile.allowed_project_classes ?? [],
    maxParallelProjects: profile.max_parallel_projects ?? 1,
    maxRiskWithoutReview: maxRisk,
    clientInteractionAllowed: Boolean(profile.client_interaction_allowed),
    releaseAuthority: Boolean(profile.release_authority),
    lastEvaluatedAt: profile.last_evaluated_at,
    isUnevaluated: false,
  };
}

/** May this builder work in this project class? Empty allow-list means no. */
export function mayWorkInProjectClass(
  authority: ResolvedBuilderAuthority,
  projectClass: string,
): boolean {
  return authority.allowedProjectClasses.includes(projectClass);
}

export interface CapacityDecision {
  withinCapacity: boolean;
  activeProjects: number;
  maxParallelProjects: number;
}

/**
 * Capacity check for master plan §Gate 12's overload guard.
 *
 * Returns a decision rather than throwing: a delivery lead may override it with a
 * recorded reason, so the caller needs the numbers, not an exception.
 */
export function checkCapacity(
  authority: ResolvedBuilderAuthority,
  activeProjects: number,
): CapacityDecision {
  return {
    withinCapacity: activeProjects < authority.maxParallelProjects,
    activeProjects,
    maxParallelProjects: authority.maxParallelProjects,
  };
}
