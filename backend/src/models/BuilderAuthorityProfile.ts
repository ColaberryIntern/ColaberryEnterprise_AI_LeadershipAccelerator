import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * BuilderAuthorityProfile — what one builder is trusted to do without a second party.
 *
 * MASTER PLAN §Gate 2: "No authority based solely on time-in-program." So this table
 * deliberately has no notion of cohort week, enrollment duration, or attendance. It is
 * set from delivered evidence (Gate 11's Experience Ledger) and carries
 * `last_evaluated_at` so a stale profile is visible as stale rather than quietly trusted
 * forever.
 *
 * IT CAPS, IT NEVER GRANTS. A profile cannot give an identity a permission their delivery
 * role does not carry — `deliveryAuthorization.authorizeAction()` checks the permission
 * first and only then applies the ceiling. An intern holding `story.execute` with
 * `max_risk_without_review = 'R1'` may execute R0 and R1 stories, and an R2 story becomes
 * a **review requirement rather than a refusal**. That distinction is the point: it lets
 * an associate drive real work they cannot unilaterally land, instead of being blocked
 * from touching it at all.
 *
 * SCOPED TO AN IDENTITY, NOT A PROJECT. Authority is a property of the person's
 * demonstrated capability, so it travels with them across projects. Per-project limits
 * are expressed through delivery roles instead.
 */
export interface BuilderAuthorityProfileAttributes {
  id?: string;
  platform_identity_id: string;
  /** Free-form level label for display. Authority is decided by the fields below, not this. */
  builder_level?: string | null;
  /** Project classes this builder may work in. Empty = none, which is the safe default. */
  allowed_project_classes?: string[] | null;
  max_parallel_projects?: number;
  /** Highest delivery risk level executable without a second party. */
  max_risk_without_review?: string;
  client_interaction_allowed?: boolean;
  release_authority?: boolean;
  /** When the evidence behind this profile was last reviewed. Null = never evaluated. */
  last_evaluated_at?: Date | null;
  evaluated_by_identity_id?: string | null;
  /** Why this level was granted — evidence references, not prose. */
  evidence_summary?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class BuilderAuthorityProfile
  extends Model<BuilderAuthorityProfileAttributes>
  implements BuilderAuthorityProfileAttributes
{
  declare id: string;
  declare platform_identity_id: string;
  declare builder_level: string | null;
  declare allowed_project_classes: string[] | null;
  declare max_parallel_projects: number;
  declare max_risk_without_review: string;
  declare client_interaction_allowed: boolean;
  declare release_authority: boolean;
  declare last_evaluated_at: Date | null;
  declare evaluated_by_identity_id: string | null;
  declare evidence_summary: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

BuilderAuthorityProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    platform_identity_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    builder_level: { type: DataTypes.STRING(40), allowNull: true },
    allowed_project_classes: { type: DataTypes.JSONB, allowNull: true },
    // Every default below is the least-privileged value. A profile row that exists but
    // has never been evaluated must not confer more than no row at all.
    max_parallel_projects: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    max_risk_without_review: {
      type: DataTypes.STRING(4),
      allowNull: false,
      defaultValue: 'R0',
    },
    client_interaction_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    release_authority: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    last_evaluated_at: { type: DataTypes.DATE, allowNull: true },
    evaluated_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    evidence_summary: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'builder_authority_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['platform_identity_id'],
        name: 'builder_authority_profiles_identity_unique',
      },
    ],
  },
);

export default BuilderAuthorityProfile;
