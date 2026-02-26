import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LeadTemperatureHistoryAttributes {
  id?: string;
  lead_id: number;
  previous_temperature?: string;
  new_temperature: string;
  trigger_type: string;
  trigger_detail?: string;
  campaign_id?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class LeadTemperatureHistory extends Model<LeadTemperatureHistoryAttributes> implements LeadTemperatureHistoryAttributes {
  declare id: string;
  declare lead_id: number;
  declare previous_temperature: string;
  declare new_temperature: string;
  declare trigger_type: string;
  declare trigger_detail: string;
  declare campaign_id: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

LeadTemperatureHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    previous_temperature: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    new_temperature: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    trigger_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    trigger_detail: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'lead_temperature_history',
    timestamps: false,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['campaign_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default LeadTemperatureHistory;
