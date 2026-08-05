import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CommunityCommentStatus = 'visible' | 'removed';

export interface CommunityCommentAttributes {
  id?: string;
  post_id: string;
  member_id: string;
  parent_comment_id?: string | null;
  body: string;
  status?: CommunityCommentStatus;
  removed_at?: Date | null;
  removed_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CommunityComment extends Model<CommunityCommentAttributes> implements CommunityCommentAttributes {
  declare id: string;
  declare post_id: string;
  declare member_id: string;
  declare parent_comment_id: string | null;
  declare body: string;
  declare status: CommunityCommentStatus;
  declare removed_at: Date | null;
  declare removed_by: string | null;
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
    // Moderation soft-delete (Community Organizer role) — mirrors CommunityPost's
    // status/removed_at/removed_by. A removed comment stays in the DB for audit
    // but is filtered out of listComments().
    status: {
      type: DataTypes.ENUM('visible', 'removed'),
      allowNull: false,
      defaultValue: 'visible',
    },
    removed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    removed_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'community_comments',
    timestamps: true,
    underscored: true,
    // See CommunityMember.ts — without this, Sequelize's auto-timestamp JS
    // attributes are createdAt/updatedAt (camelCase), not the snake_case
    // names this class declares, and created_at/updated_at read undefined.
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['post_id'], name: 'idx_community_comments_post_id' },
      { fields: ['member_id'], name: 'idx_community_comments_member_id' },
      { fields: ['parent_comment_id'], name: 'idx_community_comments_parent_id' },
    ],
  }
);

export default CommunityComment;
