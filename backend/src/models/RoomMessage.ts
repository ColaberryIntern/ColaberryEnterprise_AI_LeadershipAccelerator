import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Canonical room conversation message (threads, edits, soft-delete, moderation,
// and the help-loop question status). This is the shared model the spec calls
// for so official class chat and community chat can eventually converge; for
// this release it backs community rooms only (existing SessionChatMessage is
// left untouched). enrollment_id is nullable to allow system/host messages.
export type RoomMessageKind = 'message' | 'system' | 'pin' | 'poll' | 'question';
export type RoomQuestionStatus = 'open' | 'answered' | 'verified' | 'added_to_kb';
export type RoomMessageModerationState = 'visible' | 'flagged' | 'hidden' | 'removed';

export interface RoomMessageAttributes {
  id?: string;
  room_id: string;
  booking_id?: string | null;
  enrollment_id?: string | null;
  sender_name: string;
  content: string;
  thread_root_id?: string | null;
  kind?: RoomMessageKind;
  question_status?: RoomQuestionStatus | null;
  moderation_state?: RoomMessageModerationState;
  edited_at?: Date | null;
  deleted_at?: Date | null;
  metadata?: Record<string, unknown>;
  created_at?: Date;
}

class RoomMessage extends Model<RoomMessageAttributes> implements RoomMessageAttributes {
  declare id: string;
  declare room_id: string;
  declare booking_id: string | null;
  declare enrollment_id: string | null;
  declare sender_name: string;
  declare content: string;
  declare thread_root_id: string | null;
  declare kind: RoomMessageKind;
  declare question_status: RoomQuestionStatus | null;
  declare moderation_state: RoomMessageModerationState;
  declare edited_at: Date | null;
  declare deleted_at: Date | null;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
}

RoomMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: false },
    booking_id: { type: DataTypes.UUID, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    sender_name: { type: DataTypes.STRING(120), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    thread_root_id: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'message' },
    question_status: { type: DataTypes.STRING(20), allowNull: true },
    moderation_state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'visible' },
    edited_at: { type: DataTypes.DATE, allowNull: true },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'room_messages',
    // Append-log: created_at only (edits tracked via edited_at, not updated_at).
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['room_id', 'created_at'], name: 'idx_room_messages_room_created' },
      { fields: ['thread_root_id'], name: 'idx_room_messages_thread' },
    ],
  }
);

export default RoomMessage;
