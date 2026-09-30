import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { BrandGovernanceRules } from '../services/content/brandGovernance';

/**
 * BrandGovernanceRule — one VERSION of one brand's governance rules.
 *
 * Rows are append-only in practice: publishing new rules inserts version N+1 and never
 * updates version N, so an approval given under N can always be read back against what N
 * actually said. Columns must match ensureBrandGovernanceSchema.ts EXACTLY.
 */

export interface BrandGovernanceRuleAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  version: number;
  rules: BrandGovernanceRules;
  published_by?: string | null;
  note?: string | null;
  created_at?: Date;
}

class BrandGovernanceRule extends Model<BrandGovernanceRuleAttributes> implements BrandGovernanceRuleAttributes {
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare version: number;
  declare rules: BrandGovernanceRules;
  declare published_by: string | null;
  declare note: string | null;
  declare created_at: Date;
}

BrandGovernanceRule.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    rules: { type: DataTypes.JSONB, allowNull: false },
    published_by: { type: DataTypes.STRING(255), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'brand_governance_rules',
    timestamps: false,
    indexes: [{ unique: true, fields: ['brand_id', 'version'] }],
  },
);

export default BrandGovernanceRule;
