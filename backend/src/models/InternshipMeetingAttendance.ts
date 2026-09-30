import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One intern's attendance at one required-meeting occurrence.
 *
 * The required meetings are standing weekly rooms (the Monday standup and the
 * public AI sessions), so attendance is keyed by (enrollment, meeting_key,
 * session_date) — one row per person per meeting per week. The join click is the
 * capture point: when an intern opens the meeting's room from their internship
 * view, we record it, the same deterministic proxy the room-booking attendee uses
 * (a persistent video-room join records nothing durable on its own).
 *
 * `meeting_key` is the meeting's stable identifier (its day), not the room slug —
 * several public meetings share one room, so the room could not tell them apart.
 */
class InternshipMeetingAttendance extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare meeting_key: string;
  /** The occurrence date (the meeting's local day), so each week is its own row. */
  declare session_date: string;
  declare joined_at: Date;
  declare source: string;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipMeetingAttendance.init(
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    meeting_key:   { type: DataTypes.TEXT, allowNull: false },
    session_date:  { type: DataTypes.DATEONLY, allowNull: false },
    joined_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    source:        { type: DataTypes.TEXT, allowNull: false, defaultValue: 'join_click' },
    created_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_meeting_attendance',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipMeetingAttendance;
