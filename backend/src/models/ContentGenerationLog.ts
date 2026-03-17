import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ContentGenerationLogAttributes {
  id: string;
  lesson_id: string;
  enrollment_id: string | null;
  generation_type: 'participant_content' | 'admin_structure' | 'admin_blueprint' | 'admin_simulation';
  step: string;
  inputs_hash: string;
  model_used: string | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  token_count: number | null;
  success: boolean;
  retry_count: number;
  error_message: string | null;
  cache_hit: boolean;
  created_at?: Date;
}

export class ContentGenerationLog extends Model<ContentGenerationLogAttributes> implements ContentGenerationLogAttributes {
  declare id: string;
  declare lesson_id: string;
  declare enrollment_id: string | null;
  declare generation_type: 'participant_content' | 'admin_structure' | 'admin_blueprint' | 'admin_simulation';
  declare step: string;
  declare inputs_hash: string;
  declare model_used: string | null;
  declare duration_ms: number | null;
  declare prompt_tokens: number | null;
  declare completion_tokens: number | null;
  declare token_count: number | null;
  declare success: boolean;
  declare retry_count: number;
  declare error_message: string | null;
  declare cache_hit: boolean;
  declare created_at: Date;
}

ContentGenerationLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    lesson_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    generation_type: {
      type: DataTypes.ENUM('participant_content', 'admin_structure', 'admin_blueprint', 'admin_simulation'),
      allowNull: false,
    },
    step: { type: DataTypes.STRING(100), allowNull: false },
    inputs_hash: { type: DataTypes.STRING(64), allowNull: false },
    model_used: { type: DataTypes.STRING(100), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    prompt_tokens: { type: DataTypes.INTEGER, allowNull: true },
    completion_tokens: { type: DataTypes.INTEGER, allowNull: true },
    token_count: { type: DataTypes.INTEGER, allowNull: true },
    success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    retry_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    cache_hit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'content_generation_logs',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default ContentGenerationLog;
