import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { Enrollment, Cohort } from '../models';
import { isStaffEnrollment } from '../services/access/staffAccess';
import { activeCompEnrollmentIds } from '../services/subscriptionService';

/**
 * requireBuildEntitlement — the paid/entitlement gate on the build + evidence
 * subsystem (the `/api/portal/project*` routes: setup, architect-build, compile,
 * verify, progression-evaluate, build-session, telemetry, capabilities,
 * visual-review, ...). Business rule (Option A anti-cheat): evidence that promotes
 * a learner toward Architect must be produced from a PAID seat, so a genuine free
 * Explorer cannot cheat their way up the ladder. Learning + community routes are
 * NOT gated — they live on other mounts.
 *
 * FLAG-GATED, DEFAULT OFF (`env.buildPaidGateEnabled` ← `BUILD_PAID_GATE_ENABLED`).
 * When the flag is off the middleware is inert (`next()` immediately), so merging
 * or deploying it changes NOTHING until an environment sets
 * `BUILD_PAID_GATE_ENABLED=true`. Note the inverted default vs the points flag.
 *
 * MUST run AFTER `requireParticipant` (reads `req.participant.sub`, the enrollment id).
 *
 * Failure-first: the entitlement lookup is wrapped; on an unexpected infra/DB
 * error it LOGS (structured, stable `error_class: 'EntitlementLookupError'`) and
 * FAILS OPEN (`next()`) — a possibly-paying user is never blocked by an infra
 * hiccup. A 402 is returned ONLY for a CONFIRMED non-entitled enrollment. No
 * secrets are logged (only the enrollment UUID).
 */

/** Resolved role/entitlement signals the pure rule reasons over. Kept as plain
 *  data so `isBuildEntitled` is a pure, unit-testable function with no I/O. */
export interface BuildEntitlementRoleInfo {
  /** community_members.role === 'staff' — a privileged internal role
   *  (see services/access/staffAccess.isStaffEnrollment). */
  isStaff?: boolean;
  /** An active admin-granted "Free Access" comp subscription (plan='comp',
   *  status='active'; see subscriptionService.activeCompEnrollmentIds). */
  hasActiveComp?: boolean;
}

// Minimal structural shapes so callers and tests need not build full Sequelize
// instances to reason about entitlement.
type EntitlementEnrollment = { payment_status?: string | null } | null | undefined;
type EntitlementCohort = { cohort_type?: string | null } | null | undefined;

/**
 * PURE entitlement rule. "Entitled to build" is the OR of five signals:
 *   - PAID:            enrollment.payment_status === 'paid'
 *   - admin-comped:    an active "Free Access" comp subscription (roleInfo.hasActiveComp)
 *   - staff/privileged: community_members.role === 'staff' (roleInfo.isStaff)
 *   - sponsor seat:    the enrollment sits in a cohort_type='sponsor' cohort
 *   - accelerator seat: the enrollment sits in a cohort_type='accelerator' cohort — the
 *                       paid program. Billing may be 'pending' (invoice / net-terms /
 *                       sponsor-funded) while the student is legitimately building, so
 *                       cohort membership (not the billing state) is the access signal.
 *
 * Only a genuine free Explorer (unpaid, non-comped, non-staff, non-sponsor,
 * non-accelerator) is NOT entitled. A missing enrollment yields `false` here; the
 * middleware makes the separate fail-open decision for the "row genuinely absent" anomaly.
 */
export function isBuildEntitled(
  enrollment: EntitlementEnrollment,
  cohort: EntitlementCohort,
  roleInfo: BuildEntitlementRoleInfo | null | undefined,
): boolean {
  if (!enrollment) return false;
  const paid = enrollment.payment_status === 'paid';
  const comped = roleInfo?.hasActiveComp === true;
  const staff = roleInfo?.isStaff === true;
  const cohortType = String(cohort?.cohort_type ?? '').toLowerCase();
  const sponsorSeat = cohortType === 'sponsor';
  // Accelerator-cohort members are enrolled in the paid program; billing may sit at
  // payment_status='pending' (invoice / net-terms / sponsor-funded) while they are
  // legitimately building. Cohort membership IS the access signal — every
  // non-accelerator/non-sponsor cohort (the free 'explorer' cohort, demo, or untagged)
  // is still gated. (Prod 2026-07-21: 103 accelerator/pending students would otherwise
  // be wrongly 402'd.) OPS INVARIANT: free/demo/open-house cohorts must NOT carry
  // cohort_type='accelerator', or they would silently gain build access.
  const acceleratorCohort = cohortType === 'accelerator';
  return paid || comped || staff || sponsorSeat || acceleratorCohort;
}

// The 402 body returned to a confirmed free Explorer. Stable shape the frontend
// keys the upgrade prompt off of.
const NOT_ENTITLED_BODY = {
  error: 'build_requires_paid',
  message: 'Building projects requires a paid seat. Join to start building.',
  upgrade: { reason: 'build_gated', cta: 'join_to_build' },
} as const;

/**
 * Resolved entitlement for one enrollment, with the reason a caller can log.
 *
 *   confirmed_entitled     the pure rule said yes
 *   confirmed_not_entitled the pure rule said no (a genuine free Explorer)
 *   enrollment_missing     no row — a data anomaly, treated as entitled (fail open)
 *   lookup_failed          infra/DB error — treated as entitled (fail open)
 *
 * `entitled` is what a display or a gate should act on; `reason` is what it should
 * say in its log line. Only `confirmed_not_entitled` may ever produce a 402 or a
 * "join the program" prompt.
 */
export interface BuildEntitlementResolution {
  entitled: boolean;
  reason: 'confirmed_entitled' | 'confirmed_not_entitled' | 'enrollment_missing' | 'lookup_failed';
}

/**
 * Look up everything `isBuildEntitled` needs for one enrollment and apply the
 * rule. Shared by the route gate below and by any surface that has to decide
 * whether to invite someone to JOIN the program (the Points page's "Become an AI
 * Builder" card, the HUD's "Build to unlock" line). Before 2026-09-16 those
 * surfaces had no entitlement input at all and showed the join prompt to paying
 * cohort students at the AI Enabled ceiling.
 *
 * Failure-first, same policy as the gate: a missing row or a lookup error FAILS
 * OPEN to `entitled: true`. Telling a free Explorer to "ship a build" is a small
 * lie they will meet again at the 402; telling a paying student to "join" is the
 * bug this exists to remove.
 */
export async function resolveBuildEntitlement(enrollmentId: string): Promise<BuildEntitlementResolution> {
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId, {
      attributes: ['id', 'payment_status', 'cohort_id'],
    });
    if (!enrollment) {
      logGate('build_entitlement_enrollment_missing', enrollmentId);
      return { entitled: true, reason: 'enrollment_missing' };
    }

    const cohort = enrollment.cohort_id
      ? await Cohort.findByPk(enrollment.cohort_id, { attributes: ['id', 'cohort_type'] })
      : null;

    // isStaffEnrollment fails SAFE to false internally (never throws); a comp
    // lookup DB error rejects and is caught below → fail open.
    const [isStaff, compIds] = await Promise.all([
      isStaffEnrollment(enrollmentId),
      activeCompEnrollmentIds([enrollmentId]),
    ]);

    const entitled = isBuildEntitled(enrollment, cohort, {
      isStaff,
      hasActiveComp: compIds.has(enrollmentId),
    });
    return { entitled, reason: entitled ? 'confirmed_entitled' : 'confirmed_not_entitled' };
  } catch (err: any) {
    // Failure-first: an infra/DB error must NEVER block a possibly-paying user.
    // Structured log with a stable error_class, then fail OPEN.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'build_entitlement_check_failed',
      error_class: 'EntitlementLookupError',
      outcome: 'fail_open',
      context: { enrollment_id: enrollmentId, message: err?.message },
    }));
    return { entitled: true, reason: 'lookup_failed' };
  }
}

export async function requireBuildEntitlement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Flag OFF → inert. Ships dark; nothing changes until BUILD_PAID_GATE_ENABLED=true.
  if (!env.buildPaidGateEnabled) {
    next();
    return;
  }

  const enrollmentId = req.participant?.sub;
  // This runs after requireParticipant, so `sub` should be set. If it somehow is
  // not, fail OPEN — enforcing auth is requireParticipant's job, not this gate's.
  if (!enrollmentId) {
    next();
    return;
  }

  const { entitled } = await resolveBuildEntitlement(enrollmentId);
  if (entitled) {
    next();
    return;
  }

  // CONFIRMED non-entitled (genuine free Explorer) → 402 with upgrade payload.
  res.status(402).json(NOT_ENTITLED_BODY);
}

// Structured warn for the "enrollment row absent" fail-open branch. enrollment_id
// is a UUID (not a secret); nothing sensitive is logged.
function logGate(event: string, enrollmentId: string): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service: 'backend',
    event,
    outcome: 'fail_open',
    context: { enrollment_id: enrollmentId },
  }));
}
