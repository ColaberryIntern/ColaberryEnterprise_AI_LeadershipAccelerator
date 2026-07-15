import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class ArchitectEvaluation extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare week_number: number;
  declare overall_score: number | null;
  declare progress_summary: string | null;
  declare strengths: string[];
  declare next_steps: string[];
  declare technical_gaps: string[];
  declare raw_response: Record<string, unknown> | null;
  declare evaluated_at: Date;
  declare created_at: Date;
}

ArchitectEvaluation.init(
  {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id:    { type: DataTypes.UUID, allowNull: false },
    week_number:      { type: DataTypes.INTEGER, allowNull: false },
    overall_score:    { type: DataTypes.INTEGER, allowNull: true },
    progress_summary: { type: DataTypes.TEXT, allowNull: true },
    strengths:        { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    next_steps:       { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    technical_gaps:   { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    raw_response:     { type: DataTypes.JSONB, allowNull: true },
    evaluated_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'architect_evaluations',
    timestamps: false,
    indexes: [{ unique: true, fields: ['enrollment_id', 'week_number'], name: 'uq_architect_eval_enrollment_week' }],
  }
);

export default ArchitectEvaluation;
