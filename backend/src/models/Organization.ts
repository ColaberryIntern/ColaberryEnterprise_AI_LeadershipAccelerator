import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Organization — a free-trial management account. One row per company that a
 * manager registers. The manager keeps their own free student enrollment (dual
 * account); `owner_enrollment_id` links the org back to that enrollment. The
 * roster of teammates lives in `org_members`.
 */
/** Lifecycle of a business account. 'active' is the only state that can sign in. */
export type OrganizationStatus = 'active' | 'suspended';

export const ORGANIZATION_STATUSES: readonly OrganizationStatus[] = ['active', 'suspended'];

export interface OrganizationAttributes {
  id?: string;
  name: string;
  owner_enrollment_id: string;
  // Opt-in: when true, anyone assigned the community 'staff' role is auto-added to
  // this org's roster (and removed on demotion). Default off.
  auto_staff_sync?: boolean;
  /**
   * Enable/disable for the account. Defaults to 'active' so every row that
   * existed before this column keeps working without a backfill.
   */
  status?: OrganizationStatus;
  status_changed_at?: Date | null;
  /** Admin email that last changed the status. Audit, not authorization. */
  status_changed_by?: string | null;
  /**
   * The lead this account came from, when there is one. Nullable and
   * deliberately unconstrained: registration writes the org and the lead through
   * two independent calls, and the "skip" path creates an account with no lead at
   * all, so an org must remain creatable without one.
   */
  lead_id?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

class Organization extends Model<OrganizationAttributes> implements OrganizationAttributes {
  declare id: string;
  declare name: string;
  declare owner_enrollment_id: string;
  declare auto_staff_sync: boolean;
  declare status: OrganizationStatus;
  declare status_changed_at: Date | null;
  declare status_changed_by: string | null;
  declare lead_id: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    owner_enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // one management account per manager enrollment (idempotent register)
      references: { model: 'enrollments', key: 'id' },
    },
    auto_staff_sync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    status_changed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status_changed_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'organizations',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['owner_enrollment_id'], name: 'organizations_owner_enrollment_unique' },
    ],
  }
);

export default Organization;
