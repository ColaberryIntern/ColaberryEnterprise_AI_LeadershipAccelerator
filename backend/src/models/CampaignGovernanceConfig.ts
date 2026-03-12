import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CampaignGovernanceConfigAttributes {
  id: string;
  campaign_id: string;
  ramp_profile: any | null;
  max_unsubscribe_rate: number;
  max_bounce_rate: number;
  max_sms_failure_rate: number;
  min_open_rate: number;
  min_reply_rate: number;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

class CampaignGovernanceConfig extends Model<CampaignGovernanceConfigAttributes> implements CampaignGovernanceConfigAttributes {
  declare id: string;
  declare campaign_id: string;
  declare ramp_profile: any | null;
  declare max_unsubscribe_rate: number;
  declare max_bounce_rate: number;
  declare max_sms_failure_rate: number;
  declare min_open_rate: number;
  declare min_reply_rate: number;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CampaignGovernanceConfig.init(
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
    },
    ramp_profile: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    max_unsubscribe_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 1.5,
    },
    max_bounce_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 5.0,
    },
    max_sms_failure_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 10.0,
    },
    min_open_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.10,
    },
    min_reply_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.01,
    },
    updated_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'campaign_governance_configs',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id'], unique: true },
    ],
  }
);

export default CampaignGovernanceConfig;
