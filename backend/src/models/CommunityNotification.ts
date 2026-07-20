import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CommunityNotificationType = 'mention' | 'reply';
export type CommunityNotificationSourceType = 'post' | 'comment';

export interface CommunityNotificationAttributes {
  id?: string;
  member_id: string;
  actor_member_id?: string | null;
  notification_type: CommunityNotificationType;
  source_type: CommunityNotificationSourceType;
  source_id: string;
  read_at?: Date | null;
  created_at?: Date;
}

// In-app notification feed (REQ-C6). Written in real time alongside the
// existing mention validation in communityService.ts::createPost/createComment
// — one row per (recipient, mention event), so re-processing the same post
// never happens since posts/comments are created exactly once.
class CommunityNotification
  extends Model<CommunityNotificationAttributes>
  implements CommunityNotificationAttributes
{
  declare id: string;
  declare member_id: string;
  declare actor_member_id: string | null;
  declare notification_type: CommunityNotificationType;
  declare source_type: CommunityNotificationSourceType;
  declare source_id: string;
  declare read_at: Date | null;
  declare created_at: Date;
}

CommunityNotification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    member_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'community_members', key: 'id' },
    },
    actor_member_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'community_members', key: 'id' },
    },
    notification_type: {
      type: DataTypes.ENUM('mention', 'reply'),
      allowNull: false,
    },
    source_type: {
      type: DataTypes.ENUM('post', 'comment'),
      allowNull: false,
    },
    source_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'community_notifications',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [{ fields: ['member_id', 'created_at'], name: 'idx_community_notifications_member_created' }],
  }
);

export default CommunityNotification;
