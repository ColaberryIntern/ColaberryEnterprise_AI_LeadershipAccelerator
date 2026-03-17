import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AgentCreationProposalAttributes {
  id?: string;
  agent_name: string;
  purpose: string;
  department?: string | null;
  agent_group?: string | null;
  trigger_type?: string | null;
  schedule?: string | null;
  justification: string;
  proposed_by?: string | null;
  status?: string;
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  created_at?: Date;
}

class AgentCreationProposal extends Model<AgentCreationProposalAttributes> implements AgentCreationProposalAttributes {
  declare id: string;
  declare agent_name: string;
  declare purpose: string;
  declare department: string | null;
  declare agent_group: string | null;
  declare trigger_type: string | null;
  declare schedule: string | null;
  declare justification: string;
  declare proposed_by: string | null;
  declare status: string;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: Date;
}

AgentCreationProposal.init(
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
    purpose: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    agent_group: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    trigger_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    schedule: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    justification: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    proposed_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending | approved | rejected',
    },
    reviewed_by: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'agent_creation_proposals',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['department'] },
      { fields: ['proposed_by'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AgentCreationProposal;
