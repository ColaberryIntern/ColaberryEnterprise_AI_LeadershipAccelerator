import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CampaignLeadStatus = 'enrolled' | 'active' | 'paused' | 'completed' | 'removed';

interface CampaignLeadAttributes {
  id?: string;
  campaign_id: string;
  lead_id: number;
  status?: CampaignLeadStatus;
  enrolled_at?: Date;
  completed_at?: Date;
  outcome?: string;
  metadata?: Record<string, any>;
}

class CampaignLead extends Model<CampaignLeadAttributes> implements CampaignLeadAttributes {
  declare id: string;
  declare campaign_id: string;
  declare lead_id: number;
  declare status: CampaignLeadStatus;
  declare enrolled_at: Date;
  declare completed_at: Date;
  declare outcome: string;
  declare metadata: Record<string, any>;
}

CampaignLead.init(
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
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'enrolled',
    },
    enrolled_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    outcome: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'campaign_leads',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['campaign_id', 'lead_id'],
      },
    ],
  }
);

export default CampaignLead;
