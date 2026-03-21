import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface RequirementsMapAttributes {
  id?: string;
  project_id: string;
  requirement_key: string;
  requirement_text: string;
  source_artifact_id?: string | null;
  github_file_paths?: string[];
  confidence_score?: number;
  status?: string;
  verified_by?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class RequirementsMap extends Model<RequirementsMapAttributes> implements RequirementsMapAttributes {
  declare id: string;
  declare project_id: string;
  declare requirement_key: string;
  declare requirement_text: string;
  declare source_artifact_id: string | null;
  declare github_file_paths: string[];
  declare confidence_score: number;
  declare status: string;
  declare verified_by: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

RequirementsMap.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    },
    requirement_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    requirement_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    source_artifact_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    github_file_paths: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    confidence_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'unmatched',
    },
    verified_by: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'requirements_maps',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['project_id'] },
      { fields: ['source_artifact_id'] },
      { fields: ['status'] },
      {
        unique: true,
        fields: ['project_id', 'requirement_key'],
        name: 'requirements_maps_unique_key',
      },
    ],
  }
);

export default RequirementsMap;
