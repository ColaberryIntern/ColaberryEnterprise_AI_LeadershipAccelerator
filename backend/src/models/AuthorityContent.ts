import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AuthorityContentStatus = 'draft' | 'approved' | 'posted' | 'archived';
export type AuthorityContentSourceType = 'signal_synthesis' | 'trend_topic' | 'manual';

interface AuthorityContentAttributes {
  id?: string;
  source_type?: AuthorityContentSourceType;
  source_signal_ids?: string[];
  platform?: string;
  title?: string;
  content: string;
  tone?: string;
  short_id?: string;
  tracked_url?: string;
  utm_params?: Record<string, string>;
  status?: AuthorityContentStatus;
  posted_at?: Date;
  post_url?: string;
  performance_metrics?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class AuthorityContent extends Model<AuthorityContentAttributes> implements AuthorityContentAttributes {
  declare id: string;
  declare source_type: AuthorityContentSourceType;
  declare source_signal_ids: string[];
  declare platform: string;
  declare title: string;
  declare content: string;
  declare tone: string;
  declare short_id: string;
  declare tracked_url: string;
  declare utm_params: Record<string, string>;
  declare status: AuthorityContentStatus;
  declare posted_at: Date;
  declare post_url: string;
  declare performance_metrics: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

AuthorityContent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    source_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'signal_synthesis',
    },
    source_signal_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'linkedin',
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'professional',
    },
    short_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },
    tracked_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    utm_params: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    posted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    post_url: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    performance_metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'openclaw_authority_content',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['platform'] },
      { fields: ['created_at'] },
      { fields: ['short_id'], unique: true, name: 'idx_authority_content_short_id' },
    ],
  }
);

export default AuthorityContent;
