import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ProjectArtifactAttributes {
  id?: string;
  project_id: string;
  artifact_definition_id: string;
  submission_id: string;
  artifact_category?: string;
  artifact_stage?: string;
  version: number;
  created_at?: Date;
}

class ProjectArtifact extends Model<ProjectArtifactAttributes> implements ProjectArtifactAttributes {
  declare id: string;
  declare project_id: string;
  declare artifact_definition_id: string;
  declare submission_id: string;
  declare artifact_category: string;
  declare artifact_stage: string;
  declare version: number;
  declare created_at: Date;
}

ProjectArtifact.init(
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
    artifact_definition_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    submission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assignment_submissions', key: 'id' },
    },
    artifact_category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    artifact_stage: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'project_artifacts',
    timestamps: false,
  }
);

export default ProjectArtifact;
