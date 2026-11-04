import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** A reusable, human-approved company fact (Proposal Studio P5 library). Tenant-scoped. Only approved rows feed the
 *  grounding builder. Schema: db/ensureGovCompanyLibrarySchema.ts. */
export interface GovCompanyFactAttributes {
  id?: string;
  tenant_id: string;
  key: string;
  value: string;
  source: string | null;
  approved: boolean;
  approved_by_identity_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovCompanyFact extends Model<GovCompanyFactAttributes> implements GovCompanyFactAttributes {
  declare id: string;
  declare tenant_id: string;
  declare key: string;
  declare value: string;
  declare source: string | null;
  declare approved: boolean;
  declare approved_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovCompanyFact.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    key: { type: DataTypes.TEXT, allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
    source: { type: DataTypes.TEXT, allowNull: true },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'GovCompanyFact', tableName: 'gov_company_facts', timestamps: false },
);

export default GovCompanyFact;
