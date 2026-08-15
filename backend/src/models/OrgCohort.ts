import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * OrgCohort — the link between a business account and a cohort.
 *
 * WHY THIS EXISTS. Before this table there was no relationship between an
 * organization and a cohort anywhere in the schema: `Cohort` has no `org_id`,
 * `Organization` has no `cohort_id`, and no join table existed. The only path was
 * transitive and per-person (`org_members.enrollment_id -> enrollments.cohort_id`),
 * and registration sets `cohort_id` to null, so every member of a newly registered
 * organization had no cohort at all. "Which cohorts is this company in?" was not a
 * question the database could answer.
 *
 * WHY A JOIN TABLE rather than a column on either side. A company sponsors
 * several cohorts over time, and a cohort carries people from several companies.
 * That is many-to-many in reality; modelling it as a column on `organizations`
 * would need a rewrite the first time a company enrolled a second cohort, and a
 * column on `cohorts` would be wrong immediately, since cohorts are already shared.
 *
 * WHAT IT DOES NOT DO. Adding a cohort here does NOT move any person into it.
 * Per-person placement stays on `enrollments.cohort_id`, which is what the
 * classroom, timeline and attendance surfaces read. This row records the
 * company-level relationship (and how many seats were sponsored); moving members
 * is a separate, explicit action, because silently reassigning someone's cohort
 * would change what curriculum they see.
 */
export interface OrgCohortAttributes {
  id?: string;
  org_id: string;
  cohort_id: string;
  /** Seats the company committed to, when tracked. Null means "not specified". */
  seats_sponsored?: number | null;
  /** Admin email that created the link. Audit, not authorization. */
  added_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class OrgCohort extends Model<OrgCohortAttributes> implements OrgCohortAttributes {
  declare id: string;
  declare org_id: string;
  declare cohort_id: string;
  declare seats_sponsored: number | null;
  declare added_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

OrgCohort.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
    },
    cohort_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cohorts', key: 'id' },
    },
    seats_sponsored: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    added_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'org_cohorts',
    timestamps: true,
    underscored: true,
    indexes: [
      // Linking the same cohort twice is the obvious double-click, so it is a
      // no-op at the database level rather than a duplicate row.
      { unique: true, fields: ['org_id', 'cohort_id'], name: 'idx_org_cohorts_unique' },
      { fields: ['cohort_id'], name: 'idx_org_cohorts_cohort' },
    ],
  },
);

export default OrgCohort;
