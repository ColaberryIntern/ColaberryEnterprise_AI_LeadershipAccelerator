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
  verification_status?: string;
  verification_confidence?: number;
  verification_notes?: string;
  last_verified_at?: Date;
  semantic_status?: string | null;
  semantic_confidence?: number;
  semantic_reasoning?: string | null;
  semantic_last_checked?: Date | null;
  capability_id?: string | null;
  feature_id?: string | null;
  is_active?: boolean;
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
  declare verification_status: string;
  declare verification_confidence: number;
  declare verification_notes: string;
  declare last_verified_at: Date;
  declare semantic_status: string | null;
  declare semantic_confidence: number;
  declare semantic_reasoning: string | null;
  declare semantic_last_checked: Date | null;
  declare capability_id: string | null;
  declare feature_id: string | null;
  declare is_active: boolean;
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
    verification_status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'not_verified',
    },
    verification_confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    verification_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    semantic_status: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    semantic_confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    semantic_reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    semantic_last_checked: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    capability_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'capabilities', key: 'id' },
    },
    feature_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'features', key: 'id' },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
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
      { fields: ['capability_id'] },
      { fields: ['feature_id'] },
      {
        unique: true,
        fields: ['project_id', 'requirement_key'],
        name: 'requirements_maps_unique_key',
      },
    ],
  }
);

export default RequirementsMap;
