import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * dead_letter_jobs (TBI T002 / P1-5) — durable record of a background job that failed
 * repeatedly and was NOT silently swallowed. Written by deadLetterService.wrapWithDeadLetter
 * once a job's consecutive-failure count crosses the exhaustion threshold, instead of the
 * bare console.error pattern most cron jobs in aiOpsScheduler.ts used before this change.
 */
interface DeadLetterJobAttributes {
  id?: string;
  job_name: string;
  label: string | null;
  consecutive_failures: number;
  error_message: string;
  error_class: string;
  error_stack: string | null;
  context: Record<string, any> | null;
  resolved: boolean;
  resolved_at: Date | null;
  created_at?: Date;
}

class DeadLetterJob extends Model<DeadLetterJobAttributes> implements DeadLetterJobAttributes {
  declare id: string;
  declare job_name: string;
  declare label: string | null;
  declare consecutive_failures: number;
  declare error_message: string;
  declare error_class: string;
  declare error_stack: string | null;
  declare context: Record<string, any> | null;
  declare resolved: boolean;
  declare resolved_at: Date | null;
  declare created_at: Date;
}

DeadLetterJob.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    job_name: { type: DataTypes.STRING(100), allowNull: false },
    label: { type: DataTypes.STRING(200), allowNull: true },
    consecutive_failures: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_message: { type: DataTypes.TEXT, allowNull: false },
    error_class: { type: DataTypes.STRING(100), allowNull: false },
    error_stack: { type: DataTypes.TEXT, allowNull: true },
    context: { type: DataTypes.JSONB, allowNull: true },
    resolved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'dead_letter_jobs',
    timestamps: false,
    indexes: [
      { fields: ['job_name'] },
      { fields: ['created_at'] },
      { fields: ['resolved'] },
    ],
  }
);

export default DeadLetterJob;
