/**
 * capacityOverride — the delivery lead's override of a builder's parallel-responsibility
 * cap. PURE, no I/O.
 *
 * Master plan §Gate 12: *"Builder Authority Profile controls max parallel responsibility.
 * Delivery lead may override with reason and audit."*
 *
 * Gate 2's `builderAuthority.checkCapacity` already returns a decision rather than
 * throwing, precisely so an override is possible. This module is that override, and it is
 * built around one observation:
 *
 * ## An override with no expiry is not an override, it is a new cap
 *
 * The failure is mundane and universal. Someone is over capacity during a crunch, a lead
 * grants an exception, the crunch passes, and nobody remembers to remove it. Six months
 * later the person is permanently carrying eight projects and the authority profile that
 * said four is decorative. Nothing was decided — it just never got undone.
 *
 * So every override is **time-bounded**, states an **explicit new maximum** rather than
 * "unlimited", and cannot exceed an absolute ceiling no matter who signs it. Expiry is
 * required at creation, not offered as an option, because the version of this that gets
 * left on forever is always the one where expiry was optional.
 */

export interface CapacityOverrideRequest {
  builderIdentityId: string;
  /** The lead granting it. An override is an act by a named person. */
  grantedByIdentityId: string;
  /** The cap from the builder's authority profile. */
  baseMaxParallelProjects: number;
  /** The new maximum. Must be explicit — never "unlimited". */
  overrideMaxParallelProjects: number;
  /** Why, in words a reviewer could evaluate later. */
  reason: string;
  /** When it stops. Required. */
  expiresAt: Date;
  /** Evaluated against this. Passed in so the module stays pure and testable. */
  now: Date;
}

/**
 * The hard ceiling no override may cross.
 *
 * A number rather than a policy sentence, because "use judgement" is not a control. Chosen
 * as double the highest authority-profile cap the system issues: enough headroom for a
 * genuine crunch, not enough to quietly restructure someone's workload permanently.
 */
export const ABSOLUTE_MAX_PARALLEL_PROJECTS = 8;

/** Longest an override may run before it must be re-argued. */
export const MAX_OVERRIDE_DAYS = 30;

const MIN_REASON_LENGTH = 20;

export interface OverrideRefusal {
  rule: string;
  detail: string;
}

export type OverrideDecision =
  | { granted: true; effectiveMax: number; expiresAt: Date; auditRequired: true }
  | { granted: false; refusals: OverrideRefusal[] };

/**
 * Evaluate an override request.
 *
 * `auditRequired` is `true` in the type itself rather than a boolean the caller computes.
 * An override that is not recorded did not happen, and making the flag unconditional means
 * no call site can accidentally skip it.
 */
export function decideCapacityOverride(
  request: CapacityOverrideRequest,
): OverrideDecision {
  const refusals: OverrideRefusal[] = [];
  const add = (rule: string, detail: string) => refusals.push({ rule, detail });

  if (!request.grantedByIdentityId) {
    add('granter_unknown', 'An override must record who granted it.');
  }

  if (!request.reason || request.reason.trim().length < MIN_REASON_LENGTH) {
    add(
      'reason_insufficient',
      'An override needs a reason a reviewer could evaluate months later, not a placeholder.',
    );
  }

  if (request.overrideMaxParallelProjects <= request.baseMaxParallelProjects) {
    add(
      'override_not_an_increase',
      `Override max (${request.overrideMaxParallelProjects}) does not exceed the profile cap ` +
        `(${request.baseMaxParallelProjects}); there is nothing to override.`,
    );
  }

  if (request.overrideMaxParallelProjects > ABSOLUTE_MAX_PARALLEL_PROJECTS) {
    add(
      'exceeds_absolute_ceiling',
      `No override may exceed ${ABSOLUTE_MAX_PARALLEL_PROJECTS} parallel projects, whoever ` +
        'signs it.',
    );
  }

  if (!request.expiresAt) {
    add('expiry_required', 'An override with no expiry is not an override, it is a new cap.');
  } else {
    if (request.expiresAt.getTime() <= request.now.getTime()) {
      add('expiry_in_past', 'An override cannot expire before it starts.');
    }
    const days = (request.expiresAt.getTime() - request.now.getTime()) / 86_400_000;
    if (days > MAX_OVERRIDE_DAYS) {
      add(
        'expiry_too_far',
        `An override may run at most ${MAX_OVERRIDE_DAYS} days before it must be re-argued ` +
          `(requested ${Math.round(days)}).`,
      );
    }
  }

  if (refusals.length > 0) return { granted: false, refusals };

  return {
    granted: true,
    effectiveMax: request.overrideMaxParallelProjects,
    expiresAt: request.expiresAt,
    auditRequired: true,
  };
}

export interface ActiveOverride {
  overrideMaxParallelProjects: number;
  expiresAt: Date;
}

/**
 * The cap in force right now.
 *
 * An expired override falls back to the profile cap silently and automatically — the
 * expiry does the work, so nobody has to remember to revoke anything. That is the whole
 * reason expiry is mandatory.
 */
export function effectiveMaxParallelProjects(
  baseMax: number,
  override: ActiveOverride | null,
  now: Date,
): number {
  if (!override) return baseMax;
  if (override.expiresAt.getTime() <= now.getTime()) return baseMax;
  return Math.min(override.overrideMaxParallelProjects, ABSOLUTE_MAX_PARALLEL_PROJECTS);
}

export interface OverloadAssessment {
  overloaded: boolean;
  activeProjects: number;
  effectiveMax: number;
  /** True when the builder is only within capacity because of an override. */
  reliesOnOverride: boolean;
}

/**
 * Is this builder overloaded, accounting for any override in force?
 *
 * `reliesOnOverride` is surfaced separately because "within capacity" and "within capacity
 * only because someone signed an exception three weeks ago" are different situations, and
 * a lead planning next week's work should not have to go looking to tell them apart.
 */
export function assessOverload(input: {
  activeProjects: number;
  baseMaxParallelProjects: number;
  override: ActiveOverride | null;
  now: Date;
}): OverloadAssessment {
  const effectiveMax = effectiveMaxParallelProjects(
    input.baseMaxParallelProjects,
    input.override,
    input.now,
  );

  return {
    overloaded: input.activeProjects > effectiveMax,
    activeProjects: input.activeProjects,
    effectiveMax,
    reliesOnOverride:
      effectiveMax > input.baseMaxParallelProjects &&
      input.activeProjects > input.baseMaxParallelProjects,
  };
}
