/**
 * careerMentorScopeService — who may review whose portfolio.
 *
 * Ali, 2026-08-25: "mentors should be able to see all the projects and details that they
 * are over" and "mentor privilege can be controlled by admin".
 *
 * TWO SEPARATE GRANTS, and conflating them would be the bug:
 *
 *   1. `mgmt_role = 'mentor'`  -> may they open the review surface at all
 *   2. `career_mentor_scopes`  -> WHOSE portfolios they see inside it
 *
 * A section grant on its own would let any mentor read every learner on the platform.
 * The scope table is what makes "the learners they are over" mean something.
 *
 * Admins and owners are unscoped by design: they are the ones who grant mentor scope in
 * the first place, so gating them behind it would be circular.
 */
import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import CareerMentorScope from '../../models/CareerMentorScope';

export type ReviewerKind = 'admin' | 'mentor' | 'none';

export interface ReviewerIdentity {
  /** Admin-token subject, used for the audit trail on a decision. */
  sub: string;
  email?: string | null;
  role?: string;
  mgmt_role?: string | null;
  /** The staff member's own enrollment id, when the token was bridge-minted. */
  enrollmentId?: string | null;
}

const UNSCOPED_ROLES = new Set(['admin', 'super_admin']);
const UNSCOPED_MGMT = new Set(['owner', 'admin']);

/** What kind of reviewer is this caller? */
export function reviewerKind(id: ReviewerIdentity): ReviewerKind {
  if (UNSCOPED_ROLES.has(id.role || '') || UNSCOPED_MGMT.has(id.mgmt_role || '')) return 'admin';
  if (id.mgmt_role === 'mentor') return 'mentor';
  return 'none';
}

/**
 * The enrollment ids a reviewer may see.
 *
 * Returns `null` for an unscoped admin, meaning "no filter" — deliberately distinct from
 * `[]`, which means "a mentor with no grants, who must see NOTHING". Collapsing those two
 * into an empty array is the classic way a scoped surface accidentally shows everything,
 * so callers are forced to handle the difference.
 */
export async function visibleEnrollmentIds(id: ReviewerIdentity): Promise<string[] | null> {
  const kind = reviewerKind(id);
  if (kind === 'admin') return null;
  if (kind !== 'mentor' || !id.enrollmentId) return [];

  const scopes = await CareerMentorScope.findAll({
    where: { mentor_enrollment_id: id.enrollmentId, revoked_at: { [Op.is]: null } as any },
    raw: true,
  }) as unknown as Array<{ scope_type: string; scope_id: string }>;

  if (!scopes.length) return [];

  const direct = scopes.filter((s) => s.scope_type === 'enrollment').map((s) => s.scope_id);
  const cohortIds = scopes.filter((s) => s.scope_type === 'cohort').map((s) => s.scope_id);

  if (!cohortIds.length) return [...new Set(direct)];

  const inCohorts = await Enrollment.findAll({
    where: { cohort_id: { [Op.in]: cohortIds } },
    attributes: ['id'],
    raw: true,
  }) as unknown as Array<{ id: string }>;

  return [...new Set([...direct, ...inCohorts.map((e) => e.id)])];
}

/** May this reviewer act on this specific learner? */
export async function canReview(id: ReviewerIdentity, enrollmentId: string): Promise<boolean> {
  const visible = await visibleEnrollmentIds(id);
  if (visible === null) return true;      // unscoped admin
  return visible.includes(enrollmentId);
}

export interface GrantInput {
  mentorEnrollmentId: string;
  scopeType: 'cohort' | 'enrollment';
  scopeId: string;
  grantedBy: string;
}

/**
 * Admin grants a mentor scope. Idempotent: re-granting something already live returns the
 * existing row rather than creating a duplicate that would then need revoking twice.
 */
export async function grantScope(input: GrantInput): Promise<{ granted: boolean }> {
  const existing = await CareerMentorScope.findOne({
    where: {
      mentor_enrollment_id: input.mentorEnrollmentId,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      revoked_at: { [Op.is]: null } as any,
    },
  });
  if (existing) return { granted: false };

  await CareerMentorScope.create({
    mentor_enrollment_id: input.mentorEnrollmentId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    granted_by: input.grantedBy,
  } as any);
  return { granted: true };
}

/**
 * Admin revokes a scope. Stamps `revoked_at` rather than deleting: "who could see whose
 * portfolio, and when" is exactly the question that gets asked months later.
 */
export async function revokeScope(
  mentorEnrollmentId: string,
  scopeType: 'cohort' | 'enrollment',
  scopeId: string,
  revokedBy: string,
): Promise<{ revoked: boolean }> {
  const row = await CareerMentorScope.findOne({
    where: {
      mentor_enrollment_id: mentorEnrollmentId,
      scope_type: scopeType,
      scope_id: scopeId,
      revoked_at: { [Op.is]: null } as any,
    },
  });
  if (!row) return { revoked: false };
  await row.update({ revoked_at: new Date(), revoked_by: revokedBy });
  return { revoked: true };
}

/** Every live grant for one mentor, for the admin screen that manages them. */
export async function listScopes(mentorEnrollmentId: string) {
  const rows = await CareerMentorScope.findAll({
    where: { mentor_enrollment_id: mentorEnrollmentId, revoked_at: { [Op.is]: null } as any },
    order: [['granted_at', 'DESC']],
    raw: true,
  }) as unknown as Array<{ scope_type: string; scope_id: string; granted_at: Date; granted_by: string }>;
  return rows.map((r) => ({
    scope_type: r.scope_type, scope_id: r.scope_id, granted_at: r.granted_at, granted_by: r.granted_by,
  }));
}
