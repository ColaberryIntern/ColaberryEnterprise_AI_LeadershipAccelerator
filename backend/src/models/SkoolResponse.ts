import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SkoolResponseType = 'reply' | 'new_post';
export type SkoolPostStatus = 'draft' | 'approved' | 'posted' | 'failed';

interface SkoolResponseAttributes {
  id?: string;
  signal_id?: string;
  response_type?: SkoolResponseType;
  category?: string;
  title?: string;
  body: string;
  tone?: string;
  quality_score?: number;
  post_status?: SkoolPostStatus;
  posted_at?: Date;
  post_url?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class SkoolResponse extends Model<SkoolResponseAttributes> implements SkoolResponseAttributes {
  declare id: string;
  declare signal_id: string;
  declare response_type: SkoolResponseType;
  declare category: string;
  declare title: string;
  declare body: string;
  declare tone: string;
  declare quality_score: number;
  declare post_status: SkoolPostStatus;
  declare posted_at: Date;
  declare post_url: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

SkoolResponse.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    signal_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'skool_signals', key: 'id' },
    },
    response_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    quality_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    post_status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    posted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    post_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'skool_responses',
    timestamps: false,
    indexes: [
      { fields: ['post_status'] },
      { fields: ['signal_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default SkoolResponse;
