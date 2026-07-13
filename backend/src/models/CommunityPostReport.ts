import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityPostReportAttributes {
  id?: string;
  post_id: string;
  reporter_member_id: string;
  reason?: string | null;
  created_at?: Date;
}

class CommunityPostReport extends Model<CommunityPostReportAttributes> implements CommunityPostReportAttributes {
  declare id: string;
  declare post_id: string;
  declare reporter_member_id: string;
  declare reason: string | null;
  declare created_at: Date;
}

CommunityPostReport.init(
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
    reporter_member_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'community_members', key: 'id' },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'community_post_reports',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['post_id', 'reporter_member_id'], name: 'uq_community_post_reports_post_reporter' },
      { fields: ['post_id'], name: 'idx_community_post_reports_post_id' },
    ],
  }
);

export default CommunityPostReport;
