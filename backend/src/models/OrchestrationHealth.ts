import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OrchestrationStatus = 'healthy' | 'degraded' | 'critical';

interface OrchestrationHealthAttributes {
  id?: string;
  scan_timestamp: Date;
  health_score: number;
  status: OrchestrationStatus;
  component_scores?: Record<string, number>;
  findings?: Array<{ severity: string; category: string; message: string; count?: number }>;
  agent_id?: string;
  duration_ms?: number;
  created_at?: Date;
}

class OrchestrationHealth extends Model<OrchestrationHealthAttributes> implements OrchestrationHealthAttributes {
  declare id: string;
  declare scan_timestamp: Date;
  declare health_score: number;
  declare status: OrchestrationStatus;
  declare component_scores: Record<string, number>;
  declare findings: Array<{ severity: string; category: string; message: string; count?: number }>;
  declare agent_id: string;
  declare duration_ms: number;
  declare created_at: Date;
}

OrchestrationHealth.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    scan_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
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
    component_scores: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    findings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'ai_agents', key: 'id' },
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'orchestration_health',
    timestamps: false,
    indexes: [
      { fields: ['scan_timestamp'] },
      { fields: ['status'] },
      { fields: ['agent_id'] },
    ],
  }
);

export default OrchestrationHealth;
