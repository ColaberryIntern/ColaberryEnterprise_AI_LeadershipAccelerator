import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * canonicalOpportunityId (op:gov:<hex>) -> an existing gov-<uuid> delivery project, recorded as its own fact so
 * the delivery project is NEVER renamed or auto-qualified by the link (mirrors DeliveryProjectSourceLink). UNIQUE
 * on the canonical id: one opportunity maps to one project. Schema: db/ensureGovQualificationSchema.ts.
 */
export interface GovOpportunityAliasAttributes {
  id?: string;
  delivery_project_id: string;
  canonical_opportunity_id: string;
  linked_by_identity_id?: string | null;
  link_reason: string;
  created_at?: Date;
}

class GovOpportunityAlias extends Model<GovOpportunityAliasAttributes> implements GovOpportunityAliasAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare canonical_opportunity_id: string;
  declare linked_by_identity_id: string | null;
  declare link_reason: string;
  declare created_at: Date;
}

GovOpportunityAlias.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    canonical_opportunity_id: { type: DataTypes.TEXT, allowNull: false },
    linked_by_identity_id: { type: DataTypes.TEXT, allowNull: true },
    link_reason: { type: DataTypes.TEXT, allowNull: false },
  },
  { sequelize, tableName: 'gov_opportunity_aliases', timestamps: true, updatedAt: false, underscored: true },
);

export default GovOpportunityAlias;
