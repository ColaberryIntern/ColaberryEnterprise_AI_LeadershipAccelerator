import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ProjectRiskAttributes {
  id?: string;
  project_id: string;
  risk_level: string;
  risk_type: string;
  reason: string;
  confidence: number;
  suggested_action?: string;
  created_at?: Date;
}

class ProjectRisk extends Model<ProjectRiskAttributes> implements ProjectRiskAttributes {
  declare id: string;
  declare project_id: string;
  declare risk_level: string;
  declare risk_type: string;
  declare reason: string;
  declare confidence: number;
  declare suggested_action: string;
  declare created_at: Date;
}

ProjectRisk.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    risk_level: { type: DataTypes.STRING(20), allowNull: false },
    risk_type: { type: DataTypes.STRING(50), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    suggested_action: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'project_risks',
    timestamps: false,
    indexes: [{ fields: ['project_id'] }, { fields: ['risk_level'] }],
  }
);

export default ProjectRisk;
