import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Lightweight "who's in this room right now" heartbeat. A client viewing a room
// (or in its video call) upserts its row every ~30s; the live count per room is
// the number of distinct enrollments whose last_seen_at is within the freshness
// window (see roomPresenceService). No websockets — same poll model as chat.
export interface RoomPresenceAttributes {
  id?: string;
  room_id: string;
  enrollment_id: string;
  in_video?: boolean;
  last_seen_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class RoomPresence extends Model<RoomPresenceAttributes> implements RoomPresenceAttributes {
  declare id: string;
  declare room_id: string;
  declare enrollment_id: string;
  declare in_video: boolean;
  declare last_seen_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomPresence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    in_video: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'room_presence',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['room_id', 'enrollment_id'], name: 'room_presence_unique' },
      { fields: ['room_id', 'last_seen_at'], name: 'idx_room_presence_room_seen' },
    ],
  }
);

export default RoomPresence;
