import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CommunityPresenceStatus = 'online' | 'away' | 'offline';

export interface CommunityMemberAttributes {
  id?: string;
  enrollment_id: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  level?: number;
  points?: number;
  presence_status?: CommunityPresenceStatus;
  last_active_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommunityMember extends Model<CommunityMemberAttributes> implements CommunityMemberAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare display_name: string;
  declare avatar_url: string | null;
  declare bio: string | null;
  declare level: number;
  declare points: number;
  declare presence_status: CommunityPresenceStatus;
  declare last_active_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CommunityMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'enrollments', key: 'id' },
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    avatar_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    presence_status: {
      // 'online'/'away' are P2 (websocket presence layer, spec §6.A/§8) — the
      // column exists now so the schema doesn't need a breaking change later;
      // v1 writers only ever set 'offline'.
      type: DataTypes.ENUM('online', 'away', 'offline'),
      allowNull: false,
      defaultValue: 'offline',
    },
    last_active_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'community_members',
    timestamps: true,
    underscored: true,
    // Sequelize's auto-timestamps default to camelCase JS attribute names
    // (createdAt/updatedAt) even with underscored:true (that only renames the
    // DB column). This class declares snake_case created_at/updated_at, so
    // without this override those fields silently read as undefined.
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['enrollment_id'], name: 'uq_community_members_enrollment' },
      { fields: ['points'], name: 'idx_community_members_points' },
    ],
  }
);

export default CommunityMember;
