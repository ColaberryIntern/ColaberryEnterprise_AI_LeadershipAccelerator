import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TimelineCardProgress — per-student instance of a TimelineCard.
 *
 * Supersedes LessonInstance. One row per (card_id, enrollment_id); the
 * unique constraint makes initialization idempotent. State machine mirrors
 * the legacy one: locked -> available -> in_progress -> completed.
 */

export type TimelineCardStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface TimelineCardProgressAttributes {
  id?: string;
  card_id: string;
  enrollment_id: string;
  status: TimelineCardStatus;
  student_progress?: any;   // responses / structured input / quiz / reflection
  evidence?: any;           // pointers into evidence_records
  analytics?: any;          // time-on-card, attempts, dropoff
  quiz_score?: number | null;
  attempts?: number;
  started_at?: Date | null;
  completed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class TimelineCardProgress
  extends Model<TimelineCardProgressAttributes>
  implements TimelineCardProgressAttributes {
  declare id: string;
  declare card_id: string;
  declare enrollment_id: string;
  declare status: TimelineCardStatus;
  declare student_progress: any;
  declare evidence: any;
  declare analytics: any;
  declare quiz_score: number | null;
  declare attempts: number;
  declare started_at: Date | null;
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

TimelineCardProgress.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    card_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'timeline_cards', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'locked' },
    student_progress: { type: DataTypes.JSONB, allowNull: true },
    evidence: { type: DataTypes.JSONB, allowNull: true },
    analytics: { type: DataTypes.JSONB, allowNull: true },
    quiz_score: { type: DataTypes.FLOAT, allowNull: true },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'timeline_card_progress',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['card_id', 'enrollment_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['card_id'] },
      { fields: ['status'] },
    ],
  }
);

export default TimelineCardProgress;
