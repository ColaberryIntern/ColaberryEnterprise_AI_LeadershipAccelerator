import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityPostAttributes {
  id?: string;
  member_id: string;
  cohort_id: string;
  body: string;
  media_urls?: string[];
  category?: string | null;
  pinned?: boolean;
  like_count?: number;
  comment_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

class CommunityPost extends Model<CommunityPostAttributes> implements CommunityPostAttributes {
  declare id: string;
  declare member_id: string;
  declare cohort_id: string;
  declare body: string;
  declare media_urls: string[];
  declare category: string | null;
  declare pinned: boolean;
  declare like_count: number;
  declare comment_count: number;
  declare created_at: Date;
  declare updated_at: Date;
}

CommunityPost.init(
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
    cohort_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cohorts', key: 'id' },
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { notEmpty: true },
    },
    media_urls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    pinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    like_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    comment_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'community_posts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['cohort_id'], name: 'idx_community_posts_cohort_id' },
      { fields: ['member_id'], name: 'idx_community_posts_member_id' },
      { fields: ['category'], name: 'idx_community_posts_category' },
      { fields: ['pinned'], name: 'idx_community_posts_pinned' },
    ],
  }
);

export default CommunityPost;
