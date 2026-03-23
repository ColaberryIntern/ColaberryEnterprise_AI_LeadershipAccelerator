import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ProjectSystemContractAttributes {
  id?: string;
  project_id: string;
  contract_json: Record<string, any>;
  validation_status?: string;
  readiness_status?: string;
  locked_at?: Date | null;
  created_at?: Date;
}

class ProjectSystemContract extends Model<ProjectSystemContractAttributes> implements ProjectSystemContractAttributes {
  declare id: string;
  declare project_id: string;
  declare contract_json: Record<string, any>;
  declare validation_status: string;
  declare readiness_status: string;
  declare locked_at: Date | null;
  declare created_at: Date;
}

ProjectSystemContract.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'projects', key: 'id' } },
    contract_json: { type: DataTypes.JSONB, allowNull: false },
    validation_status: { type: DataTypes.STRING(30), allowNull: true },
    readiness_status: { type: DataTypes.STRING(30), allowNull: true },
    locked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'project_system_contracts',
    timestamps: false,
    indexes: [{ fields: ['project_id'], unique: true }],
  }
);

export default ProjectSystemContract;
