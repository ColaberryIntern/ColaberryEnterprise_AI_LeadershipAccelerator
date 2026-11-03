/**
 * WHO may approve a blueprint.
 *
 * ## Why this exists
 *
 * Acceptance row LC-10 requires an "authorized human" to approve. Until now only the first half
 * was true: `approved_by_role` was recorded into a nullable column and **nothing ever compared
 * it**, so the limb was satisfied by bookkeeping rather than by enforcement. Phase 7 recorded that
 * as an outstanding blocker and L5.3 / L9.7 both hang on it.
 *
 * ## Why it was safe to arm, measured rather than assumed
 *
 * Arming an authorization gate usually needs a `LIVE_SINCE` cutoff, because it otherwise refuses
 * the legacy population — that is exactly why the story authorization gate stays unarmed, with 62
 * legacy student builds behind it.
 *
 * This gate needs no cutoff. Measured read-only on production 2026-11-03:
 *
 *   blueprint_approvals          0 rows
 *   admin_users by role          ai_staff 35, admin 7, sales 6, super_admin 2  (50, none NULL)
 *
 * **Zero approvals exist**, so there is no historical row to invalidate and no in-flight approver
 * to lock out. And every admin carries a non-null role, so nobody is refused for a MISSING role —
 * only for one that is not permitted. The two gates are not symmetric and must not be reasoned
 * about together.
 *
 * ## The role set is a DECISION, not a default
 *
 * `super_admin` only — Ali, 2026-11-03, chosen over `admin + super_admin` when shown the counts.
 * That is **2 of 50 admins**. The trade-off was stated at the time and accepted: it is the
 * tightest reading of "authorized human", and it means blueprint approval is unavailable when
 * neither super_admin is around. Widening it is a one-line change to the array below, but it is
 * an authorization policy change and belongs to the DRI, not to whoever is next in this file.
 */

/** Roles permitted to approve a blueprint. Ali, 2026-11-03. See the header before changing. */
export const BLUEPRINT_APPROVER_ROLES: readonly string[] = ['super_admin'];

export type ApproverRoleRefusal = 'approver_role_missing' | 'approver_role_not_permitted';

/**
 * Thrown when the approving session's role is absent or not permitted.
 *
 * Carries a stable `refusal` string so a caller can branch and a log line can be classified,
 * rather than anyone matching on the message text — the repo's observability rules require a
 * stable `error_class`, and `Error` alone is not an acceptable classification.
 */
export class ApproverRoleError extends Error {
  readonly refusal: ApproverRoleRefusal;

  /** The role that was offered, for the audit trail. Never widened into a hint about valid ones. */
  readonly offeredRole: string | null;

  constructor(refusal: ApproverRoleRefusal, offeredRole: string | null) {
    super(
      refusal === 'approver_role_missing'
        ? 'the approving session carries no role, so it cannot be an authorized human'
        : 'the approving session\'s role is not permitted to approve a blueprint',
    );
    this.name = 'ApproverRoleError';
    this.refusal = refusal;
    this.offeredRole = offeredRole;
  }
}

/**
 * `null` when the role may approve, otherwise the refusal reason.
 *
 * Comparison is exact after trimming surrounding whitespace. It deliberately does NOT lowercase
 * or strip inner characters: normalising would LOOSEN an allowlist, and a role arriving in an
 * unexpected shape should be refused rather than coerced into a match. Our roles come from
 * `admin_users.role` and are lowercase snake_case, so the strict comparison costs nothing real
 * and fails closed if that ever stops being true.
 */
export function evaluateApproverRole(role: string | null | undefined): ApproverRoleRefusal | null {
  if (role === null || role === undefined) return 'approver_role_missing';
  const trimmed = String(role).trim();
  if (trimmed === '') return 'approver_role_missing';
  if (!BLUEPRINT_APPROVER_ROLES.includes(trimmed)) return 'approver_role_not_permitted';
  return null;
}

/** Throws `ApproverRoleError` unless the role may approve. */
export function assertApproverRole(role: string | null | undefined): void {
  const refusal = evaluateApproverRole(role);
  if (refusal) throw new ApproverRoleError(refusal, role == null ? null : String(role));
}
