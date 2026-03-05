import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface AttendanceRecordAttributes {
  id?: string;
  enrollment_id: string;
  session_id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  join_time?: Date;
  leave_time?: Date;
  duration_minutes?: number;
  marked_by: 'system' | 'admin' | 'self';
  notes?: string;
  created_at?: Date;
}

class AttendanceRecord extends Model<AttendanceRecordAttributes> implements AttendanceRecordAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare session_id: string;
  declare status: 'present' | 'absent' | 'excused' | 'late';
  declare join_time: Date;
  declare leave_time: Date;
  declare duration_minutes: number;
  declare marked_by: 'system' | 'admin' | 'self';
  declare notes: string;
  declare created_at: Date;
}

AttendanceRecord.init(
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
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'live_sessions', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM('present', 'absent', 'excused', 'late'),
      allowNull: false,
      defaultValue: 'absent',
    },
    join_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    leave_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    marked_by: {
      type: DataTypes.ENUM('system', 'admin', 'self'),
      allowNull: false,
      defaultValue: 'admin',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'attendance_records',
    timestamps: false,
  }
);

export default AttendanceRecord;
