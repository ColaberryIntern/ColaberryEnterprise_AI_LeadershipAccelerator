import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A SEPARATE build authorization — required before any solution-build work and distinct from the qualification
 * approval. A named approver (approver_identity_id), an explicit scope, a rationale, and a resource limit. A
 * pursuit approval alone never authorizes a build; the build gate (services/factory/buildAuthorization) refuses
 * unless a non-revoked row exists here for the delivery project. Schema: db/ensureGovQualificationSchema.ts.
 */
export interface BuildAuthorizationAttributes {
  id?: string;
  gov_qualification_id?: string | null;
  delivery_project_id: string;
  approver_identity_id: string;
  scope: string;
  rationale?: string | null;
  resource_limit: string;
  revoked_at?: Date | null;
  created_at?: Date;
}

class BuildAuthorization extends Model<BuildAuthorizationAttributes> implements BuildAuthorizationAttributes {
  declare id: string;
  declare gov_qualification_id: string | null;
  declare delivery_project_id: string;
  declare approver_identity_id: string;
  declare scope: string;
  declare rationale: string | null;
  declare resource_limit: string;
  declare revoked_at: Date | null;
  declare created_at: Date;
}

BuildAuthorization.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    gov_qualification_id: { type: DataTypes.UUID, allowNull: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    approver_identity_id: { type: DataTypes.TEXT, allowNull: false },
    scope: { type: DataTypes.TEXT, allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    resource_limit: { type: DataTypes.TEXT, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'build_authorizations', timestamps: true, updatedAt: false, underscored: true },
);

export default BuildAuthorization;
