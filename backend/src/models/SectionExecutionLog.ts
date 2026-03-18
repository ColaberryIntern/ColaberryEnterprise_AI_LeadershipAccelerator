import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ExecutionStatus = 'success' | 'partial' | 'failed';

export interface SectionExecutionLogAttributes {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  section_id: string | null;
  mini_section_id: string | null;
  prompt_template: string | null;
  resolved_prompt: string;
  variables_required: string[];
  variables_provided: Record<string, string>;
  variables_missing_runtime: string[];
  output_text: string;
  output_tokens: number;
  latency_ms: number;
  execution_status: ExecutionStatus;
  error_message: string | null;
  quality_score: number | null;
  coherence_score: number | null;
  goal_alignment_score: number | null;
  model_used: string | null;
  cache_hit: boolean;
  created_at?: Date;
}

export class SectionExecutionLog extends Model<SectionExecutionLogAttributes> implements SectionExecutionLogAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare lesson_id: string;
  declare section_id: string | null;
  declare mini_section_id: string | null;
  declare prompt_template: string | null;
  declare resolved_prompt: string;
  declare variables_required: string[];
  declare variables_provided: Record<string, string>;
  declare variables_missing_runtime: string[];
  declare output_text: string;
  declare output_tokens: number;
  declare latency_ms: number;
  declare execution_status: ExecutionStatus;
  declare error_message: string | null;
  declare quality_score: number | null;
  declare coherence_score: number | null;
  declare goal_alignment_score: number | null;
  declare model_used: string | null;
  declare cache_hit: boolean;
  declare created_at: Date;
}

SectionExecutionLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    lesson_id: { type: DataTypes.UUID, allowNull: false },
    section_id: { type: DataTypes.UUID, allowNull: true },
    mini_section_id: { type: DataTypes.UUID, allowNull: true },
    prompt_template: { type: DataTypes.TEXT, allowNull: true },
    resolved_prompt: { type: DataTypes.TEXT, allowNull: false },
    variables_required: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    variables_provided: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    variables_missing_runtime: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    output_text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    output_tokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    latency_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    execution_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'success',
    },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    quality_score: { type: DataTypes.INTEGER, allowNull: true },
    coherence_score: { type: DataTypes.INTEGER, allowNull: true },
    goal_alignment_score: { type: DataTypes.INTEGER, allowNull: true },
    model_used: { type: DataTypes.STRING(100), allowNull: true },
    cache_hit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'section_execution_logs',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['enrollment_id'] },
      { fields: ['lesson_id'] },
      { fields: ['mini_section_id'] },
      { fields: ['execution_status'] },
      { fields: ['created_at'] },
      { fields: ['lesson_id', 'execution_status'] },
    ],
  }
);

export default SectionExecutionLog;
