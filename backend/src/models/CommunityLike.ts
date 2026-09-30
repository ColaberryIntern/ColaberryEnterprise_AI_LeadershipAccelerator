import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CommunityLikeableType = 'post' | 'comment';

export interface CommunityLikeAttributes {
  id?: string;
  member_id: string;
  likeable_type: CommunityLikeableType;
  likeable_id: string;
  created_at?: Date;
}

// 1 like = 1 point (BUILD_SPEC §6.A). The unique (member_id, likeable_type,
// likeable_id) constraint is the idempotency mechanism for this side effect —
// callers must insert with ON CONFLICT DO NOTHING rather than checking-then-
// inserting, per root CLAUDE.md's idempotency rule.
class CommunityLike extends Model<CommunityLikeAttributes> implements CommunityLikeAttributes {
  declare id: string;
  declare member_id: string;
  declare likeable_type: CommunityLikeableType;
  declare likeable_id: string;
  declare created_at: Date;
}

CommunityLike.init(
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
    likeable_type: {
      type: DataTypes.ENUM('post', 'comment'),
      allowNull: false,
    },
    likeable_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'community_likes',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['member_id', 'likeable_type', 'likeable_id'],
        name: 'uq_community_likes_member_target',
      },
      { fields: ['likeable_type', 'likeable_id'], name: 'idx_community_likes_target' },
    ],
  }
);

export default CommunityLike;
