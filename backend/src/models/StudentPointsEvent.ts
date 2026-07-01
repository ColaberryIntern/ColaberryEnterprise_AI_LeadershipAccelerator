import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface StudentPointsEventAttributes {
  id?: string;
  enrollment_id: string;
  event_type: string;
  event_key: string;
  points?: number;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Append-only points ledger. One row per earned event. Guests start with zero
 * rows (0 points) and earn minimal points through engagement. Idempotency is
 * enforced by the unique (enrollment_id, event_key) index.
 */
class StudentPointsEvent extends Model<StudentPointsEventAttributes> implements StudentPointsEventAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare event_type: string;
  declare event_key: string;
  declare points: number;
  declare metadata: any;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentPointsEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    event_type: { type: DataTypes.STRING(60), allowNull: false },
    // Idempotency key within an enrollment. Defaults to event_type for once-only
    // events; repeatable events pass a unique suffix (e.g. `open_house_rsvp:<id>`).
    event_key: { type: DataTypes.STRING(120), allowNull: false },
    points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'student_points_events',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['enrollment_id'] },
      { unique: true, fields: ['enrollment_id', 'event_key'], name: 'student_points_events_unique' },
    ],
  }
);

export default StudentPointsEvent;
