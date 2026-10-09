import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Reese ticket follow-up (2026-10-02). One row = one student_support ticket Reese
// has ever followed up on because the conversation went quiet (she spoke last, no
// reply from the student for QUIET_THRESHOLD_DAYS — see reeseTicketFollowUpService.ts).
// A completely separate population from ReeseOutreach (autonomous-outreach-originated
// tickets, own table reese_autonomous_outreach) — this table only ever covers
// reactive student_support tickets, which had NO follow-up mechanism at all before
// this. Mirrors ReeseOutreach.ts's real shape where it applies.
//
// `room_id` carries no FK reference: RoomMembership.room_id (the closest real
// precedent in this codebase) also declares none at the Sequelize/DDL level, so this
// matches established practice rather than guessing an unconfirmed rooms table name.
//
// attempt_count resets to 0 the moment the student replies (see reeseReplyService.ts's
// reset-on-reply hook) — it counts CONSECUTIVE unanswered follow-ups since the
// student's last real engagement, not a lifetime total.
export type ReeseTicketFollowUpStatus = 'active' | 'escalated';

export interface ReeseTicketFollowUpAttributes {
  id?: string;
  ticket_id: string;
  room_id: string;
  student_enrollment_id: string;
  attempt_count?: number;
  status?: ReeseTicketFollowUpStatus;
  last_followup_at?: Date | null;
  created_at?: Date;
}

class ReeseTicketFollowUp extends Model<ReeseTicketFollowUpAttributes> implements ReeseTicketFollowUpAttributes {
  declare id: string;
  declare ticket_id: string;
  declare room_id: string;
  declare student_enrollment_id: string;
  declare attempt_count: number;
  declare status: ReeseTicketFollowUpStatus;
  declare last_followup_at: Date | null;
  declare created_at: Date;
}

ReeseTicketFollowUp.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'tickets', key: 'id' } },
    room_id: { type: DataTypes.UUID, allowNull: false },
    student_enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    last_followup_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'reese_ticket_follow_ups',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'], unique: true },
      { fields: ['room_id'] },
      { fields: ['status'] },
      { fields: ['last_followup_at'] },
    ],
  },
);

export default ReeseTicketFollowUp;
