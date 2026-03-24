import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpenclawLearningType = 'tone_effectiveness' | 'platform_timing' | 'topic_resonance' | 'risk_pattern' | 'tech_update' | 'content_effectiveness' | 'topic_performance' | 'platform_tone_combo';

interface OpenclawLearningAttributes {
  id?: string;
  learning_type: OpenclawLearningType;
  platform?: string;
  metric_key: string;
  metric_value: number;
  sample_size?: number;
  confidence?: number;
  insight?: string;
  applied?: boolean;
  details?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class OpenclawLearning extends Model<OpenclawLearningAttributes> implements OpenclawLearningAttributes {
  declare id: string;
  declare learning_type: OpenclawLearningType;
  declare platform: string;
  declare metric_key: string;
  declare metric_value: number;
  declare sample_size: number;
  declare confidence: number;
  declare insight: string;
  declare applied: boolean;
  declare details: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenclawLearning.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    learning_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    metric_key: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    metric_value: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
    },
    sample_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    confidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    insight: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    applied: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    details: {
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
    tableName: 'openclaw_learning',
    timestamps: false,
    indexes: [
      { fields: ['learning_type'] },
      { fields: ['platform'] },
      { fields: ['metric_key'] },
      { fields: ['created_at'] },
    ],
  }
);

export default OpenclawLearning;
