import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Trust Contract Phase 1 (2026-08-26). One row = one real, observed change to
// an agent's `persona_version` — see ensureAgentPersonaVersionHistorySchema.ts
// for why this table exists and where its one real writer lives
// (agentPersonaVersionHistoryService.ts, called from agentRegistrySeed.ts).
//
// `previous_version` is null only for the very first row ever captured for an
// agent (there is nothing to compare against). `system_prompt`/`tools_granted`
// are a snapshot AT this version, not a diff — so a reader can see what the
// prompt actually was at a given point without reconstructing it from git
// history.
export interface AgentPersonaVersionHistoryAttributes {
  id?: string;
  agent_id: string;
  agent_name: string;
  persona_version: string;
  previous_version?: string | null;
  system_prompt?: string | null;
  tools_granted?: string[] | null;
  source?: string;
  created_at?: Date;
}

class AgentPersonaVersionHistory
  extends Model<AgentPersonaVersionHistoryAttributes>
  implements AgentPersonaVersionHistoryAttributes
{
  declare id: string;
  declare agent_id: string;
  declare agent_name: string;
  declare persona_version: string;
  declare previous_version: string | null;
  declare system_prompt: string | null;
  declare tools_granted: string[] | null;
  declare source: string;
  declare created_at: Date;
}

AgentPersonaVersionHistory.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'ai_agents', key: 'id' } },
    agent_name: { type: DataTypes.STRING(255), allowNull: false },
    persona_version: { type: DataTypes.STRING(50), allowNull: false },
    previous_version: { type: DataTypes.STRING(50), allowNull: true },
    system_prompt: { type: DataTypes.TEXT, allowNull: true },
    tools_granted: { type: DataTypes.JSONB, allowNull: true },
    source: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'registry_seed' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_persona_version_history',
    timestamps: false,
    indexes: [{ fields: ['agent_id', 'created_at'] }],
  }
);

export default AgentPersonaVersionHistory;
