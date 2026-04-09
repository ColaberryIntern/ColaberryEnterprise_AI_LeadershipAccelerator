import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class BposStepExecution extends Model {
  declare id: string;
  declare process_id: string;
  declare project_id: string;
  declare step_key: string;
  declare step_label: string;
  declare prompt_target: string;
  declare execution_source: string;
  declare metrics_before: Record<string, any>;
  declare metrics_after: Record<string, any>;
  declare status: string;
  declare regressions_detected: any[];
  declare structural_issues: any[];
  declare user_feedback: string;
  declare started_at: Date;
  declare completed_at: Date;
  declare duration_ms: number;
}

BposStepExecution.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    process_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'capabilities', key: 'id' } },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    step_key: { type: DataTypes.STRING(50), allowNull: false },
    step_label: { type: DataTypes.STRING(255), allowNull: true },
    prompt_target: { type: DataTypes.STRING(50), allowNull: true },
    execution_source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'copy_prompt' },
    metrics_before: { type: DataTypes.JSONB, allowNull: true },
    metrics_after: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'started' },
    regressions_detected: { type: DataTypes.JSONB, defaultValue: [] },
    structural_issues: { type: DataTypes.JSONB, defaultValue: [] },
    user_feedback: { type: DataTypes.STRING(20), allowNull: true },
    started_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: 'bpos_step_executions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['process_id'] },
      { fields: ['project_id'] },
      { fields: ['step_key'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default BposStepExecution;
