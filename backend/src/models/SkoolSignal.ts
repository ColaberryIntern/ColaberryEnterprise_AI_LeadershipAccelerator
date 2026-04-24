import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SkoolCategory = 'dev-help' | 'leads-help' | 'hiring' | 'builds' | 'introductions' | 'announcements';
export type SkoolSignalStatus = 'new' | 'assigned' | 'responded' | 'skipped' | 'expired';

interface SkoolSignalAttributes {
  id?: string;
  post_url: string;
  post_title?: string;
  post_body_preview?: string;
  author_name?: string;
  author_profile_url?: string;
  category?: SkoolCategory;
  comment_count?: number;
  like_count?: number;
  priority_score?: number;
  status?: SkoolSignalStatus;
  detected_at?: Date;
  created_at?: Date;
}

class SkoolSignal extends Model<SkoolSignalAttributes> implements SkoolSignalAttributes {
  declare id: string;
  declare post_url: string;
  declare post_title: string;
  declare post_body_preview: string;
  declare author_name: string;
  declare author_profile_url: string;
  declare category: SkoolCategory;
  declare comment_count: number;
  declare like_count: number;
  declare priority_score: number;
  declare status: SkoolSignalStatus;
  declare detected_at: Date;
  declare created_at: Date;
}

SkoolSignal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    post_url: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    post_title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    post_body_preview: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    author_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    author_profile_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    comment_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    like_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    priority_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'new',
    },
    detected_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'skool_signals',
    timestamps: false,
    indexes: [
      { fields: ['category'] },
      { fields: ['status'] },
      { fields: ['priority_score'] },
      { fields: ['created_at'] },
    ],
  }
);

export default SkoolSignal;
