import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** A reusable, human-approved key-personnel record (Proposal Studio P5 library). Tenant-scoped.
 *  Schema: db/ensureGovCompanyLibrarySchema.ts. */
export interface GovCompanyPersonnelAttributes {
  id?: string;
  tenant_id: string;
  name: string;
  role: string | null;
  resume_html: string | null;
  approved: boolean;
  approved_by_identity_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovCompanyPersonnel extends Model<GovCompanyPersonnelAttributes> implements GovCompanyPersonnelAttributes {
  declare id: string;
  declare tenant_id: string;
  declare name: string;
  declare role: string | null;
  declare resume_html: string | null;
  declare approved: boolean;
  declare approved_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovCompanyPersonnel.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.TEXT, allowNull: false },
    role: { type: DataTypes.TEXT, allowNull: true },
    resume_html: { type: DataTypes.TEXT, allowNull: true },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'GovCompanyPersonnel', tableName: 'gov_company_personnel', timestamps: false },
);

export default GovCompanyPersonnel;
