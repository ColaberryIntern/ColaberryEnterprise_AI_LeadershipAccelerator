import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface BuildLogDraftAttributes {
  id?: string;
  project_id: string;
  week_number: number;
  source_artifact_id?: string | null;
  draft_content?: Record<string, unknown> | null;
  generated_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class BuildLogDraft extends Model<BuildLogDraftAttributes> implements BuildLogDraftAttributes {
  declare id: string;
  declare project_id: string;
  declare week_number: number;
  declare source_artifact_id: string | null;
  declare draft_content: Record<string, unknown> | null;
  declare generated_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

BuildLogDraft.init(
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
    week_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    source_artifact_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'artifacts', key: 'id' },
    },
    // Holds all 4 sections (linkedin_post, video_script, architecture_update,
    // demo_summary), each independently generated/approved/posted — see
    // BuildLogSectionType in buildLogDraftService.ts. Not one flat post.
    draft_content: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'build_log_drafts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['project_id', 'week_number'], name: 'uq_build_log_drafts_project_week' },
      { fields: ['project_id'], name: 'idx_build_log_drafts_project_id' },
    ],
  }
);

export default BuildLogDraft;
