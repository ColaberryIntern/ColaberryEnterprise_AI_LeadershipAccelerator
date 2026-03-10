import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SimulationStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type SpeedMode = 'normal' | 'fast' | 'ultra' | 'instant';

interface CampaignSimulationAttributes {
  id?: string;
  campaign_id: string;
  sequence_id: string;
  test_lead_id: number;
  speed_mode: SpeedMode;
  status?: SimulationStatus;
  current_step_index?: number;
  total_steps: number;
  started_at?: Date;
  paused_at?: Date | null;
  completed_at?: Date | null;
  summary?: Record<string, any> | null;
  created_at?: Date;
}

class CampaignSimulation extends Model<CampaignSimulationAttributes> implements CampaignSimulationAttributes {
  declare id: string;
  declare campaign_id: string;
  declare sequence_id: string;
  declare test_lead_id: number;
  declare speed_mode: SpeedMode;
  declare status: SimulationStatus;
  declare current_step_index: number;
  declare total_steps: number;
  declare started_at: Date;
  declare paused_at: Date | null;
  declare completed_at: Date | null;
  declare summary: Record<string, any> | null;
  declare created_at: Date;
}

CampaignSimulation.init(
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
    sequence_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'follow_up_sequences', key: 'id' },
    },
    test_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    speed_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'fast',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'running',
    },
    current_step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_steps: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    paused_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    summary: {
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
    tableName: 'campaign_simulations',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id'] },
      { fields: ['status'] },
    ],
  }
);

export default CampaignSimulation;
