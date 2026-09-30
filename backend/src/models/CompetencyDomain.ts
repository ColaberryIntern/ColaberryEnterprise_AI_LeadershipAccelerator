import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CompetencyDomain — a promotion-relevant skill domain with a confidence
 * threshold and a weight toward Architect Readiness. Seeded from the program's
 * core competency domains; the Competency Engine scores students against these.
 */
export interface CompetencyDomainAttributes {
  id?: string;
  program_id?: string | null;
  domain_id: string;             // 'prompt_engineering', 'architecture', ...
  name: string;
  description?: string | null;
  confidence_threshold?: number; // mastery bar (0..1)
  weight?: number;               // contribution to readiness
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CompetencyDomain extends Model<CompetencyDomainAttributes> implements CompetencyDomainAttributes {
  declare id: string;
  declare program_id: string | null;
  declare domain_id: string;
  declare name: string;
  declare description: string | null;
  declare confidence_threshold: number;
  declare weight: number;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CompetencyDomain.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    program_id: { type: DataTypes.UUID, allowNull: true },
    domain_id: { type: DataTypes.STRING(60), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    confidence_threshold: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.7 },
    weight: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1.0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'competency_domains',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['program_id', 'domain_id'] }, { fields: ['is_active'] }],
  }
);

export default CompetencyDomain;
