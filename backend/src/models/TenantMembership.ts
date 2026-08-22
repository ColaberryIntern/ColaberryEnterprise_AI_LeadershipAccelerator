import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TenantMembership — what a person is allowed to do inside a tenant.
 *
 * This is the authorization spine of the ecosystem. "Has an admin token" must stop
 * meaning "can see everything": an operator sees a tenant's data because a membership
 * row says so, and platform-wide visibility is itself an explicit role rather than an
 * accident of being an admin.
 *
 * `brand_id` is nullable and means "all brands in this tenant" when null. A Colaberry
 * tenant admin needs both Enterprise and Training; a brand-scoped marketer needs one.
 *
 * Roles are compared through the central registry in `tenantRoles.ts`, never by inline
 * string comparison in a controller. Scattered `role === 'admin'` checks are how
 * authorization drifts apart across a codebase this size.
 */
export type TenantMembershipStatus = 'invited' | 'active' | 'suspended';

export const TENANT_MEMBERSHIP_STATUSES: readonly TenantMembershipStatus[] = [
  'invited',
  'active',
  'suspended',
];

export interface TenantMembershipAttributes {
  id?: string;
  platform_identity_id: string;
  tenant_id: string;
  /** null = every brand in the tenant. */
  brand_id?: string | null;
  role: string;
  status?: TenantMembershipStatus;
  /** Optional per-membership overrides on top of the role's default grants. */
  permissions?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class TenantMembership extends Model<TenantMembershipAttributes> implements TenantMembershipAttributes {
  declare id: string;
  declare platform_identity_id: string;
  declare tenant_id: string;
  declare brand_id: string | null;
  declare role: string;
  declare status: TenantMembershipStatus;
  declare permissions: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

TenantMembership.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    platform_identity_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'platform_identities', key: 'id' },
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    brand_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
    },
    role: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'invited',
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tenant_memberships',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['platform_identity_id', 'tenant_id'], name: 'idx_tenant_memberships_identity_tenant' },
      { fields: ['tenant_id', 'status'], name: 'idx_tenant_memberships_tenant_status' },
    ],
  }
);

export default TenantMembership;
