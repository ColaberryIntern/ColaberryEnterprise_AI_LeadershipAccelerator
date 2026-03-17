import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AgentPerformanceSnapshotAttributes {
  id?: string;
  agent_name: string;
  period: string;
  success_rate: number;
  avg_duration_ms?: number | null;
  error_count?: number;
  writes_count?: number;
  proposals_count?: number;
  snapshot_at: Date;
  created_at?: Date;
}

class AgentPerformanceSnapshot extends Model<AgentPerformanceSnapshotAttributes> implements AgentPerformanceSnapshotAttributes {
  declare id: string;
  declare agent_name: string;
  declare period: string;
  declare success_rate: number;
  declare avg_duration_ms: number | null;
  declare error_count: number;
  declare writes_count: number;
  declare proposals_count: number;
  declare snapshot_at: Date;
  declare created_at: Date;
}

AgentPerformanceSnapshot.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    period: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'hourly | daily | weekly',
    },
    success_rate: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    avg_duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    error_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    writes_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    proposals_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    snapshot_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'agent_performance_history',
    timestamps: false,
    indexes: [
      { fields: ['agent_name'] },
      { fields: ['period'] },
      { fields: ['snapshot_at'] },
      { fields: ['agent_name', 'period', 'snapshot_at'] },
    ],
  }
);

export default AgentPerformanceSnapshot;
