import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface StudentNavigationEventAttributes {
  id?: string;
  enrollment_id: string;
  lesson_id?: string | null;
  event_type: string;
  page?: string | null;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class StudentNavigationEvent extends Model<StudentNavigationEventAttributes> implements StudentNavigationEventAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare lesson_id: string | null;
  declare event_type: string;
  declare page: string | null;
  declare duration_ms: number | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

StudentNavigationEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    lesson_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    event_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    page: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'student_navigation_events',
    timestamps: false,
    indexes: [
      { fields: ['enrollment_id', 'created_at'] },
      { fields: ['lesson_id', 'event_type'] },
    ],
  }
);

export default StudentNavigationEvent;
