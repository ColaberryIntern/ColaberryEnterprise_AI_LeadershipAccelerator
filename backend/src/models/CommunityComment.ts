import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityCommentAttributes {
  id?: string;
  post_id: string;
  member_id: string;
  parent_comment_id?: string | null;
  body: string;
  created_at?: Date;
  updated_at?: Date;
}

class CommunityComment extends Model<CommunityCommentAttributes> implements CommunityCommentAttributes {
  declare id: string;
  declare post_id: string;
  declare member_id: string;
  declare parent_comment_id: string | null;
  declare body: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CommunityComment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    post_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'community_posts', key: 'id' },
    },
    member_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'community_members', key: 'id' },
    },
    parent_comment_id: {
      // One level deep only (comment -> reply), per BUILD_SPEC §7. A reply
      // pointing at another reply is a modeling error, not enforced by the DB
      // (self-referential depth checks are app-layer, per the KB Ops precedent
      // of keeping CHECK constraints to simple, DB-native conditions).
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'community_comments', key: 'id' },
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { notEmpty: true },
    },
  },
  {
    sequelize,
    tableName: 'community_comments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['post_id'], name: 'idx_community_comments_post_id' },
      { fields: ['member_id'], name: 'idx_community_comments_member_id' },
      { fields: ['parent_comment_id'], name: 'idx_community_comments_parent_id' },
    ],
  }
);

export default CommunityComment;
