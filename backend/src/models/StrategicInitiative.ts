import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InitiativeStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
export type InitiativeType = 'strategic_initiative' | 'ai_optimization' | 'agent_restructure'
  | 'agent_creation' | 'workflow_redesign' | 'system_automation';

interface StrategicInitiativeAttributes {
  id?: string;
  title: string;
  description?: string;
  initiative_type: InitiativeType;
  priority?: string;
  source_decision_id?: string | null;
  involved_departments?: string[] | null;
  involved_agents?: string[] | null;
  ticket_id?: string | null;
  created_by?: string;
  status?: InitiativeStatus;
  strategic_priority?: string | null;
  expected_impact?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class StrategicInitiative extends Model<StrategicInitiativeAttributes> implements StrategicInitiativeAttributes {
  declare id: string;
  declare title: string;
  declare description: string;
  declare initiative_type: InitiativeType;
  declare priority: string;
  declare source_decision_id: string | null;
  declare involved_departments: string[] | null;
  declare involved_agents: string[] | null;
  declare ticket_id: string | null;
  declare created_by: string;
  declare status: InitiativeStatus;
  declare strategic_priority: string | null;
  declare expected_impact: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StrategicInitiative.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    initiative_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'strategic_initiative | ai_optimization | agent_restructure | agent_creation | workflow_redesign | system_automation',
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    source_decision_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK to intelligence_decisions if initiative originated from a strategic insight',
    },
    involved_departments: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    involved_agents: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tickets', key: 'id' },
      comment: 'Parent ticket tracking this initiative',
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'CoryBrain',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'proposed',
    },
    strategic_priority: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Business priority classification',
    },
    expected_impact: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Projected impact metrics',
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
    tableName: 'strategic_initiatives',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['initiative_type'] },
      { fields: ['priority'] },
      { fields: ['ticket_id'] },
      { fields: ['source_decision_id'] },
      { fields: ['created_by'] },
      { fields: ['created_at'] },
    ],
  }
);

export default StrategicInitiative;
