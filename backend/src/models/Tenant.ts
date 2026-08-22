import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Tenant — the hard data and security ownership boundary of the ecosystem.
 *
 * A tenant is NOT a theme and NOT a brand. Colaberry is one tenant that owns two
 * brands (Enterprise and Training); CPN is a separate legal entity and therefore a
 * separate tenant even though it runs on the same platform. Anything a tenant owns
 * must be unreachable by an operator of another tenant, regardless of how the ID was
 * obtained.
 *
 * `slug` rather than `id` is the stable identifier used by seeds, backfills and
 * configuration. Deterministic slugs mean the seed is idempotent and the same tenant
 * has the same identity in dev, preview and production without shipping UUIDs around.
 */
export type TenantType = 'commercial' | 'nonprofit' | 'platform';
export type TenantStatus = 'active' | 'suspended' | 'archived';

export const TENANT_TYPES: readonly TenantType[] = ['commercial', 'nonprofit', 'platform'];
export const TENANT_STATUSES: readonly TenantStatus[] = ['active', 'suspended', 'archived'];

export interface TenantAttributes {
  id?: string;
  slug: string;
  name: string;
  /**
   * Coarse classification only. Business rules must NOT be derived wholesale from
   * this field — a nonprofit tenant that later runs a commercial programme would
   * otherwise require a schema change. Policy lives in configuration services.
   */
  tenant_type: TenantType;
  status?: TenantStatus;
  legal_name?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class Tenant extends Model<TenantAttributes> implements TenantAttributes {
  declare id: string;
  declare slug: string;
  declare name: string;
  declare tenant_type: TenantType;
  declare status: TenantStatus;
  declare legal_name: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Tenant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    slug: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tenant_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'commercial',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    legal_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tenants',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['slug'], name: 'tenants_slug_unique' },
      { fields: ['status'], name: 'idx_tenants_status' },
    ],
  }
);

export default Tenant;
