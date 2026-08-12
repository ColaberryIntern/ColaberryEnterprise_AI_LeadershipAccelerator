import { Enrollment, Cohort } from '../../models';
import { isStaffEnrollment } from './staffAccess';
import { activeCompEnrollmentIds } from '../subscriptionService';
import { hasCohortStarted } from '../cohortService';
import { env } from '../../config/env';

/**
 * contentEntitlement — the CURRICULUM paywall predicate: does an enrollment get
 * the FULL 12-week curriculum, or only the free "Week 0" preview?
 *
 * This is the launch access contract: register free -> enroll free (pick a cohort)
 * -> PAY -> see all 12 weeks, once the cohort's class actually starts. Access is
 * keyed on PAYMENT + the cohort having started (Ali decision, BC #10160497402,
 * relayed 2026-08-04) — a paid-but-not-yet-started enrollment stays on the free
 * preview until class begins. See hasCohortStarted (cohortService.ts).
 *
 * Deliberately STRICTER than `requireBuildEntitlement.isBuildEntitled`: that gate
 * treats accelerator-cohort membership as entitled (so invoice/net-terms students
 * can build while billing is pending). Here, an enrolled-but-unpaid member
 * (e.g. July 2026, payment_status='pending') stays gated to the free preview until
 * they pay — that IS the paywall. The two predicates intentionally differ.
 *
 * FLAG-GATED, DEFAULT OFF (`env.contentPaidGateEnabled` <- CONTENT_PAID_GATE_ENABLED).
 * Flag off => legacy behavior is preserved byte-for-byte (gate only
 * enrollment_type='explorer', honoring EXPLORER_WEEK0_ONLY). Flip to true at launch
 * — together with the enrollment migration — to enforce the payment paywall.
 */

/** Resolved role/entitlement signals the pure rule reasons over (plain data so the
 *  predicate stays pure + unit-testable with no I/O). */
export interface ContentAccessRoleInfo {
  /** community_members.role === 'staff' (services/access/staffAccess). */
  isStaff?: boolean;
  /** An active admin-granted "Free Access" comp subscription
   *  (plan='comp', status='active'; subscriptionService.activeCompEnrollmentIds). */
  hasActiveComp?: boolean;
}

// Minimal structural shapes so callers/tests need not build Sequelize instances.
type EntitlementEnrollment = {
  payment_status?: string | null;
  /** Nullable future-dated access gate (Enrollment.access_starts_at). Set + in the
   *  future => full access is deferred regardless of payment/comp/staff/business
   *  status below; used for a postponed-cohort-move scenario where the student
   *  keeps free-tier access but full access shouldn't unlock early. */
  access_starts_at?: string | Date | null;
} | null | undefined;
type EntitlementCohort = { cohort_type?: string | null; start_date?: string | Date | null } | null | undefined;

function isAccessStartDeferred(accessStartsAt: string | Date | null | undefined, now: Date): boolean {
  if (!accessStartsAt) return false;
  const gate = new Date(accessStartsAt);
  if (Number.isNaN(gate.getTime())) return false;
  // Compare by calendar day (DATEONLY column) so "today" already counts as unlocked.
  const today = new Date(now.toISOString().slice(0, 10));
  const gateDay = new Date(gate.toISOString().slice(0, 10));
  return gateDay > today;
}

/**
 * PURE paywall rule. "Full curriculum access" is the OR of:
 *   - PAID:      enrollment.payment_status === 'paid' AND the cohort's class has
 *                actually started (hasCohortStarted) — paying reserves the spot,
 *                access unlocks at class start, not at payment.
 *   - comped:    an active admin "Free Access" comp subscription (roleInfo.hasActiveComp)
 *   - staff:     community_members.role === 'staff' (roleInfo.isStaff)
 *   - business:  the enrollment sits in a private business/owner workspace cohort
 *                (cohort_type='business') — the internal owner accounts (Ali, Ram)
 * ...UNLESS `access_starts_at` is set to a future date, which overrides all of the
 * above and defers full access until that date (free-tier/Week-0 access is
 * untouched either way — this only ever narrows access, never widens it).
 *
 * Everyone else — guests (free self-serve signups), explorers (open-house
 * prospects), enrolled-but-UNPAID members, and paid members whose cohort hasn't
 * started yet — is on the free preview tier and sees Week 0 only. A missing
 * enrollment yields `false`.
 */
export function hasFullCurriculumAccess(
  enrollment: EntitlementEnrollment,
  cohort: EntitlementCohort,
  roleInfo?: ContentAccessRoleInfo | null,
  now: Date = new Date(),
): boolean {
  if (!enrollment) return false;
  // MERGE RESOLUTION: two DELIBERATE and DIFFERENT gates, both kept.
  //  - isAccessStartDeferred: per-student deferral (postponed cohort move) — main.
  //  - hasCohortStarted: the general paywall rule, paid access does not unlock
  //    until the cohort actually starts (Ali decision, BC #10160497402,
  //    relayed 2026-08-04) — staging.
  // Neither supersedes the other, so full access requires both to pass.
  if (isAccessStartDeferred(enrollment.access_starts_at, now)) return false;
  const paid = enrollment.payment_status === 'paid' && hasCohortStarted(cohort);
  const comped = roleInfo?.hasActiveComp === true;
  const staff = roleInfo?.isStaff === true;
  const business = String(cohort?.cohort_type ?? '').toLowerCase() === 'business';
  return paid || comped || staff || business;
}

/**
 * Should this enrollment be gated to the free Week-0 preview (vs the full 12 weeks)?
 *
 * Flag OFF (default): legacy — gate ONLY `enrollment_type='explorer'`, honoring
 *   EXPLORER_WEEK0_ONLY. Byte-identical to pre-paywall behavior; nothing else moves.
 * Flag ON (CONTENT_PAID_GATE_ENABLED=true): gate anyone WITHOUT full curriculum
 *   access — guests, explorers, AND enrolled-but-unpaid members.
 *
 * Failure-first: on any infra/DB error this FAILS OPEN (returns false = not gated),
 * so a possibly-paying member is never wrongly locked out over a transient hiccup.
 */
export async function isFreePreviewTier(enrollmentId: string): Promise<boolean> {
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId, {
      attributes: ['id', 'payment_status', 'enrollment_type', 'cohort_id', 'access_starts_at'],
    });
    if (!enrollment) return false;

    // Legacy path — the paywall is dark; preserve the explorer-only Week-0 gate.
    if (!env.contentPaidGateEnabled) {
      const isExplorer = (enrollment as any).enrollment_type === 'explorer';
      return isExplorer && process.env.EXPLORER_WEEK0_ONLY !== 'false';
    }

    const cohort = enrollment.cohort_id
      ? await Cohort.findByPk(enrollment.cohort_id, { attributes: ['id', 'cohort_type', 'start_date'] })
      : null;
    // isStaffEnrollment fails SAFE to false internally; a comp-lookup error rejects
    // and is caught below (fail open).
    const [isStaff, compIds] = await Promise.all([
      isStaffEnrollment(enrollmentId),
      activeCompEnrollmentIds([enrollmentId]),
    ]);
    const full = hasFullCurriculumAccess(enrollment, cohort, {
      isStaff,
      hasActiveComp: compIds.has(enrollmentId),
    });
    return !full;
  } catch (err: any) {
    console.warn('[contentEntitlement] isFreePreviewTier failed open:', err?.message);
    return false;
  }
}

/**
 * Page-level content gate (Classroom / Projects / Cert Prep) — DELIBERATELY a
 * separate flag from `contentPaidGateEnabled` above (different blast radius:
 * this blocks whole pages behind <PageGate>, that one filters weeks inside the
 * Timeline feed + backstops card opens; independent rollback/staging). Always
 * computes the MODERN rule (no legacy explorer-only branch) — gated only by its
 * own flag, so its correctness never depends on CONTENT_PAID_GATE_ENABLED's
 * rollout state elsewhere. Fails OPEN on any error or when the flag is off
 * (dark-ship: zero behavior change until explicitly turned on).
 */
export async function resolveContentPageAccess(enrollmentId: string): Promise<{ isStaff: boolean; hasFullAccess: boolean }> {
  if (!env.contentPageGateEnabled) return { isStaff: false, hasFullAccess: true };
  try {
    if (!enrollmentId) return { isStaff: false, hasFullAccess: true };
    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'payment_status', 'cohort_id', 'access_starts_at'] });
    if (!enrollment) return { isStaff: false, hasFullAccess: true };
    const cohort = enrollment.cohort_id
      ? await Cohort.findByPk(enrollment.cohort_id, { attributes: ['id', 'cohort_type', 'start_date'] })
      : null;
    const [isStaff, compIds] = await Promise.all([
      isStaffEnrollment(enrollmentId),
      activeCompEnrollmentIds([enrollmentId]),
    ]);
    const hasFullAccess = hasFullCurriculumAccess(enrollment, cohort, { isStaff, hasActiveComp: compIds.has(enrollmentId) });
    return { isStaff, hasFullAccess };
  } catch (err: any) {
    console.warn('[contentEntitlement] resolveContentPageAccess failed open:', err?.message);
    return { isStaff: false, hasFullAccess: true };
  }
}
