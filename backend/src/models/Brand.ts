import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Brand — a public identity owned by a tenant.
 *
 * Separate from Tenant because one tenant legitimately runs several brands:
 * Colaberry owns both `colaberry-enterprise` and `colaberry-training`, which share a
 * legal entity, a lead pool and an operator roster but have different audiences,
 * different domains and different sending identities. Collapsing brand into tenant
 * would force either duplicate tenants (breaking the shared lead pool) or a single
 * brand (breaking sender separation).
 *
 * Uniqueness is on (tenant_id, slug), not on slug alone, so two tenants may both have
 * a brand called `main` without colliding.
 */
export type BrandStatus = 'active' | 'inactive';

export const BRAND_STATUSES: readonly BrandStatus[] = ['active', 'inactive'];

export interface BrandAttributes {
  id?: string;
  tenant_id: string;
  slug: string;
  name: string;
  status?: BrandStatus;
  default_public_url?: string | null;
  /** Key into the application's theme registry. Themes themselves are app-owned. */
  default_theme_key?: string | null;
  support_email?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class Brand extends Model<BrandAttributes> implements BrandAttributes {
  declare id: string;
  declare tenant_id: string;
  declare slug: string;
  declare name: string;
  declare status: BrandStatus;
  declare default_public_url: string | null;
  declare default_theme_key: string | null;
  declare support_email: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Brand.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    slug: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    default_public_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    default_theme_key: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    support_email: {
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
    tableName: 'brands',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['tenant_id', 'slug'], name: 'brands_tenant_slug_unique' },
      { fields: ['status'], name: 'idx_brands_status' },
    ],
  }
);

export default Brand;
