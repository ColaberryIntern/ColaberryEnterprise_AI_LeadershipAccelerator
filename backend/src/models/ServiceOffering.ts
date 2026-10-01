import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A Colaberry service offering — one capability the company can propose against a government opportunity. Owned by
 * Enterprise, tenant-scoped. RETIRED via a status flip, never hard-deleted. JSONB arrays (keywords/naics/psc) are
 * `any` by repo convention (shape validated in the service/route, not the ORM). Schema: db/ensureServiceOfferingSchema.ts.
 */
export interface ServiceOfferingAttributes {
  id?: string;
  tenant_id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  keywords_json?: any;
  naics_codes_json?: any;
  psc_codes_json?: any;
  past_performance?: string | null;
  owner?: string | null;
  status?: string;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ServiceOffering extends Model<ServiceOfferingAttributes> implements ServiceOfferingAttributes {
  declare id: string;
  declare tenant_id: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string | null;
  declare category: string | null;
  declare keywords_json: any;
  declare naics_codes_json: any;
  declare psc_codes_json: any;
  declare past_performance: string | null;
  declare owner: string | null;
  declare status: string;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ServiceOffering.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    category: { type: DataTypes.TEXT, allowNull: true },
    keywords_json: { type: DataTypes.JSONB, allowNull: true },
    naics_codes_json: { type: DataTypes.JSONB, allowNull: true },
    psc_codes_json: { type: DataTypes.JSONB, allowNull: true },
    past_performance: { type: DataTypes.TEXT, allowNull: true },
    owner: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
    created_by: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'service_offerings', timestamps: true, underscored: true },
);

export default ServiceOffering;
