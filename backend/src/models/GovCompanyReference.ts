import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** A reusable, human-approved past-performance reference (Proposal Studio P5 library). Tenant-scoped.
 *  Schema: db/ensureGovCompanyLibrarySchema.ts. */
export interface GovCompanyReferenceAttributes {
  id?: string;
  tenant_id: string;
  client: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  contract_value: string | null;
  dates: string | null;
  scope: string | null;
  approved: boolean;
  approved_by_identity_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovCompanyReference extends Model<GovCompanyReferenceAttributes> implements GovCompanyReferenceAttributes {
  declare id: string;
  declare tenant_id: string;
  declare client: string;
  declare contact: string | null;
  declare phone: string | null;
  declare email: string | null;
  declare contract_value: string | null;
  declare dates: string | null;
  declare scope: string | null;
  declare approved: boolean;
  declare approved_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovCompanyReference.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    client: { type: DataTypes.TEXT, allowNull: false },
    contact: { type: DataTypes.TEXT, allowNull: true },
    phone: { type: DataTypes.TEXT, allowNull: true },
    email: { type: DataTypes.TEXT, allowNull: true },
    contract_value: { type: DataTypes.TEXT, allowNull: true },
    dates: { type: DataTypes.TEXT, allowNull: true },
    scope: { type: DataTypes.TEXT, allowNull: true },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'GovCompanyReference', tableName: 'gov_company_references', timestamps: false },
);

export default GovCompanyReference;
