import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CareerMentorScope — which learners a mentor is over.
 *
 * The second of two independent grants. `mgmt_role = 'mentor'` decides whether someone
 * may open the portfolio review surface at all; rows here decide whose portfolios they
 * see once inside. See careerMentorScopeService for why keeping them separate matters.
 *
 * Revocation stamps `revoked_at` instead of deleting the row, so "who could see whose
 * portfolio, and when" stays answerable after the fact.
 */
export type MentorScopeType = 'cohort' | 'enrollment';

class CareerMentorScope extends Model {
  declare id: string;
  /** The mentor's OWN enrollment id (staff carry one via the mgmt_role bridge). */
  declare mentor_enrollment_id: string;
  declare scope_type: MentorScopeType;
  /** A cohort id or an enrollment id, per scope_type. */
  declare scope_id: string;
  declare granted_by: string;
  declare granted_at: Date;
  declare revoked_at: Date | null;
  declare revoked_by: string | null;
  declare created_at: Date;
}

CareerMentorScope.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentor_enrollment_id: { type: DataTypes.UUID, allowNull: false },
    scope_type: { type: DataTypes.STRING(16), allowNull: false },
    scope_id: { type: DataTypes.UUID, allowNull: false },
    granted_by: { type: DataTypes.STRING(255), allowNull: false },
    granted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_by: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'career_mentor_scopes', underscored: true, timestamps: false },
);

export default CareerMentorScope;
