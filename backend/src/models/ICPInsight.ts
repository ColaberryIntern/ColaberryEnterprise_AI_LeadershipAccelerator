import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ICPInsightAttributes {
  id?: string;
  dimension_type: string;
  dimension_value: string;
  campaign_type: string;
  metric_name: string;
  metric_value: number;
  sample_size: number;
  confidence: number;
  period_start: Date;
  period_end: Date;
  computed_at?: Date;
  metadata?: Record<string, any>;
}

class ICPInsight extends Model<ICPInsightAttributes> implements ICPInsightAttributes {
  declare id: string;
  declare dimension_type: string;
  declare dimension_value: string;
  declare campaign_type: string;
  declare metric_name: string;
  declare metric_value: number;
  declare sample_size: number;
  declare confidence: number;
  declare period_start: Date;
  declare period_end: Date;
  declare computed_at: Date;
  declare metadata: Record<string, any>;
}

ICPInsight.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    dimension_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    dimension_value: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    campaign_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'all',
    },
    metric_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    metric_value: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: false,
      defaultValue: 0,
    },
    sample_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    confidence: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0,
    },
    period_start: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    period_end: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    computed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'icp_insights',
    timestamps: false,
    indexes: [
      { fields: ['dimension_type', 'dimension_value'] },
      { fields: ['campaign_type'] },
      { fields: ['metric_name'] },
      { fields: ['computed_at'] },
      {
        unique: true,
        fields: ['dimension_type', 'dimension_value', 'campaign_type', 'metric_name', 'period_start', 'period_end'],
        name: 'icp_insights_unique_metric',
      },
    ],
  }
);

export default ICPInsight;
