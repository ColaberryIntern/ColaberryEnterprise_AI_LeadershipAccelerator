import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SimStepStatus = 'pending' | 'waiting' | 'executing' | 'sent' | 'responded' | 'skipped' | 'failed';

interface CampaignSimulationStepAttributes {
  id?: string;
  simulation_id: string;
  step_index: number;
  channel: string;
  status?: SimStepStatus;
  original_delay_days: number;
  compressed_delay_ms: number;
  wait_started_at?: Date | null;
  executed_at?: Date | null;
  duration_ms?: number | null;
  ai_content?: Record<string, any> | null;
  lead_response?: Record<string, any> | null;
  details?: Record<string, any> | null;
  error_message?: string | null;
  created_at?: Date;
}

class CampaignSimulationStep extends Model<CampaignSimulationStepAttributes> implements CampaignSimulationStepAttributes {
  declare id: string;
  declare simulation_id: string;
  declare step_index: number;
  declare channel: string;
  declare status: SimStepStatus;
  declare original_delay_days: number;
  declare compressed_delay_ms: number;
  declare wait_started_at: Date | null;
  declare executed_at: Date | null;
  declare duration_ms: number | null;
  declare ai_content: Record<string, any> | null;
  declare lead_response: Record<string, any> | null;
  declare details: Record<string, any> | null;
  declare error_message: string | null;
  declare created_at: Date;
}

CampaignSimulationStep.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    simulation_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'campaign_simulations', key: 'id' },
    },
    step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    original_delay_days: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    compressed_delay_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    wait_started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    executed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ai_content: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    lead_response: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'campaign_simulation_steps',
    timestamps: false,
    indexes: [
      { fields: ['simulation_id'] },
      { fields: ['status'] },
    ],
  }
);

export default CampaignSimulationStep;
