/** ReflectionEntry — a student's captured signals from the weekly "Week in Review"
 *  Reflection card. One row per (card, enrollment); re-submitting UPDATES in place
 *  (upsert), so the table is idempotent. program_id + week are denormalized for
 *  later cohort/week analytics without a join.
 *
 *  These are the STRATEGIC signals the reflection captures (not graded): a
 *  readiness self-rating, where the student will apply the week's skill, and the
 *  direction they're heading — downstream consumers are the spaced-review
 *  scheduler, mentor focus, sponsor/employer ROI, and the career-path recommender.
 *  `answers` is a forward-compatible catch-all (e.g. application_text, flagged
 *  concepts) so new signals never need a migration. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ReflectionSignals {
  application_text?: string | null;   // optional "what would you build?" free text
  flagged_concepts?: string[];        // concepts the student marked "still shaky"
  [key: string]: unknown;             // forward-compatible
}

class ReflectionEntry extends Model {
  declare id: string;
  declare card_id: string;
  declare enrollment_id: string;
  declare program_id: string | null;
  declare week: number | null;
  declare readiness: number | null;   // 1..5 (null = skipped)
  declare application: string | null;  // chip value, e.g. "at_my_job"
  declare direction: string | null;    // chip value, e.g. "ai_architect"
  declare note: string | null;         // the biggest-insight / free-text takeaway
  declare answers: ReflectionSignals;
  declare created_at: Date;
  declare updated_at: Date;
}

ReflectionEntry.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  card_id: { type: DataTypes.UUID, allowNull: false },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  program_id: { type: DataTypes.UUID, allowNull: true },
  week: { type: DataTypes.INTEGER, allowNull: true },
  readiness: { type: DataTypes.INTEGER, allowNull: true },
  application: { type: DataTypes.STRING(64), allowNull: true },
  direction: { type: DataTypes.STRING(64), allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
  answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { sequelize, modelName: 'ReflectionEntry', tableName: 'reflection_entries', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export default ReflectionEntry;
