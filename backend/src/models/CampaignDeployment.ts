import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CampaignDeploymentAttributes {
  id?: string;
  campaign_id: string;
  landing_page_id?: string | null;
  channel?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  budget?: number;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

class CampaignDeployment extends Model<CampaignDeploymentAttributes> implements CampaignDeploymentAttributes {
  declare id: string;
  declare campaign_id: string;
  declare landing_page_id: string | null;
  declare channel: string;
  declare utm_source: string;
  declare utm_medium: string;
  declare utm_campaign: string;
  declare budget: number;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CampaignDeployment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'campaigns', key: 'id' },
      onDelete: 'RESTRICT',
    },
    landing_page_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'landing_pages', key: 'id' },
      onDelete: 'SET NULL',
    },
    channel: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    utm_source: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    utm_medium: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    utm_campaign: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    budget: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'campaign_deployments',
    timestamps: true,
    underscored: true,
  },
);

export default CampaignDeployment;
