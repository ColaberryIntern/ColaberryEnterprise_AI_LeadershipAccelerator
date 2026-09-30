import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryProjectMember — project-scoped membership and role.
 *
 * DELIBERATELY SEPARATE FROM TenantMembership. Master plan §4: "Tenant roles remain
 * tenant roles. Do not jam delivery roles into tenantRoles.ts unless they truly grant
 * tenant-wide authority." The two answer different questions:
 *
 *   TenantMembership  — may this identity act inside this tenant at all?
 *   DeliveryProjectMember — may they approve THIS design decision?
 *
 * Both must pass, tenant first. Checking tenant first means a foreign caller is denied
 * and audited *before* the delivery layer reveals whether the project exists, which is
 * what master plan §8 scenario F ("denied without enumeration") requires.
 *
 * Holding `platform.cross_tenant` grants nothing here. A platform superadmin can see that
 * a project exists; approving a client's design decision on their behalf is a different
 * act and is not implied by being an operator.
 *
 * The role vocabulary lives in one registry (`modules/delivery/deliveryRoles.ts`, Gate 2)
 * for the same reason `tenantRoles.ts` exists: scattered `role === 'client'` comparisons
 * are how authorization drifts apart in a codebase this size.
 */
export type DeliveryMemberStatus = 'active' | 'revoked';

export const DELIVERY_MEMBER_STATUSES: readonly DeliveryMemberStatus[] = ['active', 'revoked'];

export interface DeliveryProjectMemberAttributes {
  id?: string;
  delivery_project_id: string;
  platform_identity_id: string;
  /**
   * Validated against the Gate 2 delivery role registry at the service boundary rather
   * than by a database enum: master plan §69's white-label test requires that adding a
   * role is a data change, not a migration.
   */
  delivery_role: string;
  status?: DeliveryMemberStatus;
  granted_by_identity_id?: string | null;
  granted_at?: Date;
  revoked_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryProjectMember
  extends Model<DeliveryProjectMemberAttributes>
  implements DeliveryProjectMemberAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare platform_identity_id: string;
  declare delivery_role: string;
  declare status: DeliveryMemberStatus;
  declare granted_by_identity_id: string | null;
  declare granted_at: Date;
  declare revoked_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryProjectMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    platform_identity_id: { type: DataTypes.UUID, allowNull: false },
    delivery_role: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    granted_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    granted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_project_members',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // One row per (project, identity, role). Re-granting a role an identity already
      // holds is an idempotent no-op rather than a second row that would make revocation
      // ambiguous — revoke which one?
      {
        unique: true,
        fields: ['delivery_project_id', 'platform_identity_id', 'delivery_role'],
        name: 'delivery_project_members_unique_active',
      },
      { fields: ['platform_identity_id', 'status'], name: 'idx_delivery_members_identity' },
    ],
  },
);

export default DeliveryProjectMember;
