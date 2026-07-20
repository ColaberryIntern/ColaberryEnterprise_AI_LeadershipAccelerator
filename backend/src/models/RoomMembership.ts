import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Membership of a CommunityRoom: role, access state, and per-room notification
// preference. UNIQUE(room_id, enrollment_id) makes join idempotent.
export type RoomRole = 'owner' | 'host' | 'cohost' | 'moderator' | 'member' | 'invited';
export type RoomAccessState = 'invited' | 'requested' | 'active' | 'removed' | 'blocked' | 'left';
export type RoomNotificationPref = 'all' | 'mentions' | 'highlights' | 'muted';

export interface RoomMembershipAttributes {
  id?: string;
  room_id: string;
  enrollment_id: string;
  role?: RoomRole;
  access_state?: RoomAccessState;
  notification_pref?: RoomNotificationPref;
  invited_by?: string | null;
  joined_at?: Date | null;
  left_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class RoomMembership extends Model<RoomMembershipAttributes> implements RoomMembershipAttributes {
  declare id: string;
  declare room_id: string;
  declare enrollment_id: string;
  declare role: RoomRole;
  declare access_state: RoomAccessState;
  declare notification_pref: RoomNotificationPref;
  declare invited_by: string | null;
  declare joined_at: Date | null;
  declare left_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomMembership.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'member' },
    access_state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    notification_pref: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'mentions' },
    invited_by: { type: DataTypes.UUID, allowNull: true },
    joined_at: { type: DataTypes.DATE, allowNull: true },
    left_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'room_memberships',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['room_id', 'enrollment_id'], name: 'room_memberships_unique' },
      { fields: ['enrollment_id'], name: 'idx_room_memberships_enrollment' },
    ],
  }
);

export default RoomMembership;
