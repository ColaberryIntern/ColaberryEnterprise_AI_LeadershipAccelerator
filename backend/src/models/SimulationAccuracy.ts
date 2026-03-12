import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SimulationType = 'strategy' | 'campaign' | 'experiment';
export type SimulationStatus = 'pending' | 'tracking' | 'completed' | 'expired';

interface SimulationAccuracyAttributes {
  id?: string;
  simulation_id: string;
  simulation_type: SimulationType;
  context: Record<string, any>;
  predicted_outcome: Record<string, any>;
  actual_outcome?: Record<string, any> | null;
  accuracy_score?: number | null;
  confidence: number;
  risk_score: number;
  ticket_id?: string | null;
  insight_id?: string | null;
  status?: SimulationStatus;
  tracking_start?: string | null;
  tracking_end?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class SimulationAccuracy extends Model<SimulationAccuracyAttributes> implements SimulationAccuracyAttributes {
  declare id: string;
  declare simulation_id: string;
  declare simulation_type: SimulationType;
  declare context: Record<string, any>;
  declare predicted_outcome: Record<string, any>;
  declare actual_outcome: Record<string, any> | null;
  declare accuracy_score: number | null;
  declare confidence: number;
  declare risk_score: number;
  declare ticket_id: string | null;
  declare insight_id: string | null;
  declare status: SimulationStatus;
  declare tracking_start: string | null;
  declare tracking_end: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

SimulationAccuracy.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    simulation_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    simulation_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    predicted_outcome: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    actual_outcome: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    accuracy_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    risk_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    insight_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    tracking_start: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    tracking_end: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'simulation_accuracy',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['simulation_type'] },
      { fields: ['status'] },
      { fields: ['ticket_id'] },
    ],
  }
);

export default SimulationAccuracy;
