import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Colaberry Commons — a Room is the core object of the community area: a
// persistent identity that can carry a text channel, scheduled/live meetings,
// an audience/privacy policy, hosts, and a link to a cohort/project/module or
// an official LiveSession. It is deliberately NOT the existing CommunityEvent
// (per-cohort calendar) or CommunityPost (feed) — this is the Rooms layer.
export type RoomCategory =
  | 'start_here' | 'your_cohort' | 'build_together' | 'career_cert'
  | 'live_now' | 'demos_events' | 'social' | 'private_rooms';
export type RoomType = 'persistent' | 'scheduled' | 'private_shell';
export type RoomPrivacy = 'public' | 'cohort' | 'invite_only' | 'private';
export type RoomStatus = 'active' | 'archived' | 'locked' | 'removed';

export interface CommunityRoomAttributes {
  id?: string;
  slug: string;
  name: string;
  category?: RoomCategory;
  room_type?: RoomType;
  privacy?: RoomPrivacy;
  status?: RoomStatus;
  description?: string | null;
  topic?: string | null;
  capacity?: number | null;
  owner_enrollment_id?: string | null;
  linked_cohort_id?: string | null;
  linked_project_id?: string | null;
  linked_module_id?: string | null;
  linked_live_session_id?: string | null;
  is_system?: boolean;
  created_by?: string;
  is_video?: boolean;
  always_open?: boolean;
  meeting_link?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
}

class CommunityRoom extends Model<CommunityRoomAttributes> implements CommunityRoomAttributes {
  declare id: string;
  declare slug: string;
  declare name: string;
  declare category: RoomCategory;
  declare room_type: RoomType;
  declare privacy: RoomPrivacy;
  declare status: RoomStatus;
  declare description: string | null;
  declare topic: string | null;
  declare capacity: number | null;
  declare owner_enrollment_id: string | null;
  declare linked_cohort_id: string | null;
  declare linked_project_id: string | null;
  declare linked_module_id: string | null;
  declare linked_live_session_id: string | null;
  declare is_system: boolean;
  declare created_by: string;
  declare is_video: boolean;
  declare always_open: boolean;
  declare meeting_link: string | null;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

CommunityRoom.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(140), allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    category: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'social' },
    room_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'persistent' },
    privacy: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'public' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    description: { type: DataTypes.TEXT, allowNull: true },
    topic: { type: DataTypes.STRING(255), allowNull: true },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    owner_enrollment_id: { type: DataTypes.UUID, allowNull: true },
    linked_cohort_id: { type: DataTypes.UUID, allowNull: true },
    linked_project_id: { type: DataTypes.UUID, allowNull: true },
    linked_module_id: { type: DataTypes.UUID, allowNull: true },
    linked_live_session_id: { type: DataTypes.UUID, allowNull: true },
    is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_by: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'system' },
    is_video: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    always_open: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    meeting_link: { type: DataTypes.STRING(600), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'community_rooms',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['slug'], name: 'community_rooms_slug_unique' },
      { fields: ['linked_cohort_id'], name: 'idx_community_rooms_cohort' },
      { fields: ['category'], name: 'idx_community_rooms_category' },
      { fields: ['privacy', 'status'], name: 'idx_community_rooms_privacy_status' },
    ],
  }
);

export default CommunityRoom;
