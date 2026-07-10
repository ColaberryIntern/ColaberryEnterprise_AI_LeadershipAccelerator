import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ShowcaseArtifactType = 'demo_video' | 'explainer_podcast' | 'one_pager_infographic' | 'ppt';
export type ShowcaseArtifactStatus = 'scaffolded' | 'drafted' | 'reviewed' | 'published';

export interface ShowcaseArtifactAttributes {
  id?: string;
  project_id: string;
  artifact_type: ShowcaseArtifactType;
  status?: ShowcaseArtifactStatus;
  draft_content?: Record<string, unknown> | null;
  portfolio_slot?: string | null;
  generated_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class ShowcaseArtifact extends Model<ShowcaseArtifactAttributes> implements ShowcaseArtifactAttributes {
  declare id: string;
  declare project_id: string;
  declare artifact_type: ShowcaseArtifactType;
  declare status: ShowcaseArtifactStatus;
  declare draft_content: Record<string, unknown> | null;
  declare portfolio_slot: string | null;
  declare generated_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ShowcaseArtifact.init(
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
    artifact_type: {
      type: DataTypes.ENUM('demo_video', 'explainer_podcast', 'one_pager_infographic', 'ppt'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('scaffolded', 'drafted', 'reviewed', 'published'),
      allowNull: false,
      defaultValue: 'scaffolded',
    },
    draft_content: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    portfolio_slot: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'showcase_artifacts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['project_id', 'artifact_type'], name: 'uq_showcase_artifacts_project_type' },
      { fields: ['project_id'], name: 'idx_showcase_artifacts_project_id' },
    ],
  }
);

export default ShowcaseArtifact;
