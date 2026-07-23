import { Enrollment, Cohort } from '../../models';
import { isStaffEnrollment } from './staffAccess';
import { activeCompEnrollmentIds } from '../subscriptionService';
import { env } from '../../config/env';

/**
 * contentEntitlement — the CURRICULUM paywall predicate: does an enrollment get
 * the FULL 12-week curriculum, or only the free "Week 0" preview?
 *
 * This is the launch access contract: register free -> enroll free (pick a cohort)
 * -> PAY -> see all 12 weeks. Access is keyed on PAYMENT, not on which cohort the
 * student sits in.
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
type EntitlementEnrollment = { payment_status?: string | null } | null | undefined;
type EntitlementCohort = { cohort_type?: string | null } | null | undefined;

/**
 * PURE paywall rule. "Full curriculum access" is the OR of:
 *   - PAID:      enrollment.payment_status === 'paid'  (a paid subscription/invoice)
 *   - comped:    an active admin "Free Access" comp subscription (roleInfo.hasActiveComp)
 *   - staff:     community_members.role === 'staff' (roleInfo.isStaff)
 *   - business:  the enrollment sits in a private business/owner workspace cohort
 *                (cohort_type='business') — the internal owner accounts (Ali, Ram)
 *
 * Everyone else — guests (free self-serve signups), explorers (open-house
 * prospects), and enrolled-but-UNPAID members — is on the free preview tier and
 * sees Week 0 only. A missing enrollment yields `false`.
 */
export function hasFullCurriculumAccess(
  enrollment: EntitlementEnrollment,
  cohort: EntitlementCohort,
  roleInfo?: ContentAccessRoleInfo | null,
): boolean {
  if (!enrollment) return false;
  const paid = enrollment.payment_status === 'paid';
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
      attributes: ['id', 'payment_status', 'enrollment_type', 'cohort_id'],
    });
    if (!enrollment) return false;

    // Legacy path — the paywall is dark; preserve the explorer-only Week-0 gate.
    if (!env.contentPaidGateEnabled) {
      const isExplorer = (enrollment as any).enrollment_type === 'explorer';
      return isExplorer && process.env.EXPLORER_WEEK0_ONLY !== 'false';
    }

    const cohort = enrollment.cohort_id
      ? await Cohort.findByPk(enrollment.cohort_id, { attributes: ['id', 'cohort_type'] })
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
    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'payment_status', 'cohort_id'] });
    if (!enrollment) return { isStaff: false, hasFullAccess: true };
    const cohort = enrollment.cohort_id
      ? await Cohort.findByPk(enrollment.cohort_id, { attributes: ['id', 'cohort_type'] })
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
