import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// RSVP / waitlist / approval / attendance / feedback for one booking occurrence.
// UNIQUE(booking_id, enrollment_id) makes RSVP idempotent.
export type RoomRsvpState = 'none' | 'going' | 'waitlisted' | 'declined' | 'invited';
export type RoomApprovalState = 'auto' | 'pending' | 'approved' | 'rejected';
export type RoomAttendanceSource = 'intent' | 'meet' | 'host';

export interface RoomBookingAttendeeAttributes {
  id?: string;
  booking_id: string;
  enrollment_id: string;
  rsvp_state?: RoomRsvpState;
  approval_state?: RoomApprovalState;
  attended?: boolean;
  attendance_source?: RoomAttendanceSource | null;
  joined_at?: Date | null;
  waitlist_position?: number | null;
  feedback_rating?: number | null;
  feedback_text?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class RoomBookingAttendee extends Model<RoomBookingAttendeeAttributes> implements RoomBookingAttendeeAttributes {
  declare id: string;
  declare booking_id: string;
  declare enrollment_id: string;
  declare rsvp_state: RoomRsvpState;
  declare approval_state: RoomApprovalState;
  declare attended: boolean;
  declare attendance_source: RoomAttendanceSource | null;
  declare joined_at: Date | null;
  declare waitlist_position: number | null;
  declare feedback_rating: number | null;
  declare feedback_text: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomBookingAttendee.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    booking_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    rsvp_state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none' },
    approval_state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'auto' },
    attended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    attendance_source: { type: DataTypes.STRING(20), allowNull: true },
    joined_at: { type: DataTypes.DATE, allowNull: true },
    waitlist_position: { type: DataTypes.INTEGER, allowNull: true },
    feedback_rating: { type: DataTypes.INTEGER, allowNull: true },
    feedback_text: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'room_booking_attendees',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['booking_id', 'enrollment_id'], name: 'room_booking_attendees_unique' },
      { fields: ['enrollment_id'], name: 'idx_room_booking_attendees_enrollment' },
    ],
  }
);

export default RoomBookingAttendee;
