import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

interface CampaignHealthAttributes {
  id?: string;
  campaign_id: string;
  health_score?: number;
  status?: HealthStatus;
  lead_count?: number;
  active_lead_count?: number;
  sent_count?: number;
  error_count?: number;
  components?: Record<string, any>;
  metrics?: Record<string, any>;
  last_scan_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class CampaignHealth extends Model<CampaignHealthAttributes> implements CampaignHealthAttributes {
  declare id: string;
  declare campaign_id: string;
  declare health_score: number;
  declare status: HealthStatus;
  declare lead_count: number;
  declare active_lead_count: number;
  declare sent_count: number;
  declare error_count: number;
  declare components: Record<string, any>;
  declare metrics: Record<string, any>;
  declare last_scan_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

CampaignHealth.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'campaigns', key: 'id' },
    },
    health_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'healthy',
    },
    lead_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    active_lead_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sent_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    error_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    components: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    last_scan_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: 'campaign_health',
    timestamps: false,
    indexes: [
      { fields: ['health_score'] },
      { fields: ['status'] },
      { fields: ['last_scan_at'] },
    ],
  }
);

export default CampaignHealth;
