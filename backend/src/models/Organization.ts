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
  /**
   * The manager enrollment that owns this organization, when there is one.
   *
   * Nullable since 2026-08-23 (ESC-1, Gate 0 SCHEMA_CONFLICTS C-02). This table
   * originally modelled only "a manager's management account", so an owner was mandatory
   * and unique. A commercial client company has an acceptance owner who never enrolled in
   * anything, and master plan §6 hangs the whole delivery ownership chain off
   * Organization — so the constraint blocked client delivery entirely.
   *
   * A null owner means "not a management account". Read `organization_type` to tell the
   * two apart rather than inferring it from this field being null.
   */
  owner_enrollment_id?: string | null;
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
  tenant_id?: string | null;
  brand_id?: string | null;
  /** enterprise_customer | community_partner | church | nonprofit_partner | client | internal | sponsor */
  organization_type?: string | null;
  lead_id?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

class Organization extends Model<OrganizationAttributes> implements OrganizationAttributes {
  declare id: string;
  declare name: string;
  declare owner_enrollment_id: string | null;
  declare auto_staff_sync: boolean;
  declare status: OrganizationStatus;
  declare status_changed_at: Date | null;
  declare status_changed_by: string | null;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare organization_type: string | null;
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
      // Relaxed by ESC-1 (2026-08-23) so a client organization can exist without an
      // enrollment. NOT NULL was the only thing blocking that.
      allowNull: true,
      // KEPT deliberately. PostgreSQL treats NULLs as distinct in a unique index, so any
      // number of null-owner client organizations are still permitted. And this is what
      // makes registerManager()'s findOrCreate race-safe: without it, two simultaneous
      // registrations for one manager can both find nothing and both insert.
      unique: true,
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
    // --- multi-tenant ecosystem context ---------------------------------------
    // Declared because the DDL adds these columns and Sequelize only touches
    // attributes the model knows about. A column in Postgres but not here reads
    // back undefined and silently drops writes.
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    organization_type: { type: DataTypes.STRING(40), allowNull: true },
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
