import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A student's membership of a cohort OTHER than the one on their enrollment.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `Enrollment` carries exactly one `cohort_id`, and that column is the student's
 * academic/training cohort. Joining the AI Internship must not disturb it — the
 * requirement is "moving from a class KEEPS the class enrollment and adds the
 * internship on top."
 *
 * The alternative considered and rejected was a SECOND active enrollment row.
 * `docs/INTERNSHIP_ENROLLMENT_AUDIT.md` costed that: it makes every intern trip
 * `duplicateAccountSweepService.findCrossCohortDuplicates` (which withdraws a
 * row and moves its points and credits), it breaks comp entitlement, and it puts
 * `participantService.pickBestEnrollment` — whose choice becomes the session JWT
 * — in the position of picking between two legitimate rows. See
 * `docs/AI_INTERNSHIP_DISCOVERY.md` §3.2 and `db/ensureInternshipSchema.ts`.
 *
 * A membership row keeps "one enrollment per person" true, so none of that
 * machinery has to learn a new case.
 *
 * ── IDEMPOTENCY ────────────────────────────────────────────────────────────
 *
 * Uniqueness is enforced by a PARTIAL UNIQUE INDEX on
 * `(enrollment_id, cohort_id, membership_type) WHERE status = 'active'`, not by
 * a check in application code. Approval and its webhook can both fire, and can
 * both retry; the database refusing the second row is the only version of that
 * guarantee that survives concurrency.
 */
export type CohortMembershipType = 'internship';
export type CohortMembershipStatus = 'active' | 'completed' | 'withdrawn' | 'removed';

class CohortMembership extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare cohort_id: string;
  declare membership_type: CohortMembershipType;
  declare status: CohortMembershipStatus;
  declare joined_at: Date | null;
  declare completed_at: Date | null;
  /** Admin identity that approved it. Never an AI actor — see the state machine. */
  declare approved_by: string | null;
  declare source_application_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CohortMembership.init(
  {
    id:                    { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id:         { type: DataTypes.UUID, allowNull: false },
    cohort_id:             { type: DataTypes.UUID, allowNull: false },
    membership_type:       { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'internship' },
    status:                { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    joined_at:             { type: DataTypes.DATE, allowNull: true },
    completed_at:          { type: DataTypes.DATE, allowNull: true },
    approved_by:           { type: DataTypes.STRING(255), allowNull: true },
    source_application_id: { type: DataTypes.UUID, allowNull: true },
    created_at:            { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:            { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cohort_memberships',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CohortMembership;
