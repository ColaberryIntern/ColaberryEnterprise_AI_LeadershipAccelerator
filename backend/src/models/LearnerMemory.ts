/**
 * LearnerMemory — the durable, evolving profile the AI Mentor builds of a student
 * over weeks. One row per enrollment, rewritten (evolved, not replaced) by the
 * nightly learnerMemoryWriter. Created by ensureRuntimeSchema.
 *
 * Idempotency: `last_distilled_on` (a date) gates the writer to at most one
 * distillation per enrollment per day; `last_turn_at` marks the newest mentor
 * turn already folded in, so a re-run with no new activity is a no-op.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class LearnerMemory extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare summary: string | null;
  declare misconceptions: string[];
  declare goals: string | null;
  declare strengths: string[];
  declare last_distilled_on: string | null; // YYYY-MM-DD
  declare last_turn_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

LearnerMemory.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  enrollment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  summary: { type: DataTypes.TEXT, allowNull: true },
  misconceptions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  goals: { type: DataTypes.TEXT, allowNull: true },
  strengths: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  last_distilled_on: { type: DataTypes.DATEONLY, allowNull: true },
  last_turn_at: { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize, modelName: 'LearnerMemory', tableName: 'learner_memory',
  underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
});

export default LearnerMemory;
