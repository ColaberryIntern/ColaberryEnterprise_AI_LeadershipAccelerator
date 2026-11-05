import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentDomainToolGrant — one recorded grant of one tool to one agent.
 *
 * AF3.5. This is the RECORD behind `ai_agents.tools_granted`. The column is what the runtime
 * reads to decide whether an agent may act; this table is who said it could, which capability it
 * was granted for, and when.
 *
 * ## Why the record exists separately from the column
 *
 * `seedAgentRegistry()` rewrites `tools_granted` wholesale from source literals on every boot.
 * Without a record the seed cannot tell a human's grant from a stale value, so it reverted every
 * grant on the next deploy — and the reclassification that rides on that column then rewrote
 * `autonomy_level` as a side effect of the revert. The seed now unions the registry list with
 * the grants recorded here.
 *
 * ## What this row deliberately cannot say
 *
 * It carries no autonomy level, no `enabled`, no `abac_mode_override` and no verdict. A grant
 * and an autonomy level are two decisions, and a row that could express both is how they stop
 * being two.
 *
 * `capability_id` is deliberately not a foreign key: the 443 capabilities are JSON files on
 * disk, not rows, and the AF11.0 confirmation table takes the same position for the same reason.
 */
export interface AgentDomainToolGrantAttributes {
  id?: string;
  agent_id: string;
  /** Denormalised so the boot seed, which matches on `agent_name`, needs no join per agent. */
  agent_name: string;
  tool_name: string;
  /** The capability this grant serves. Must be confirmed at the moment of granting. */
  capability_id: string;
  approved_by_identity: string;
  approved_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class AgentDomainToolGrant
  extends Model<AgentDomainToolGrantAttributes>
  implements AgentDomainToolGrantAttributes {
  declare id: string;
  declare agent_id: string;
  declare agent_name: string;
  declare tool_name: string;
  declare capability_id: string;
  declare approved_by_identity: string;
  declare approved_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentDomainToolGrant.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    agent_id: { type: DataTypes.UUID, allowNull: false },
    agent_name: { type: DataTypes.TEXT, allowNull: false },
    tool_name: { type: DataTypes.TEXT, allowNull: false },
    capability_id: { type: DataTypes.TEXT, allowNull: false },
    approved_by_identity: { type: DataTypes.TEXT, allowNull: false },
    approved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_grants',
    timestamps: false,
    indexes: [
      { fields: ['agent_id', 'tool_name'], unique: true },
      { fields: ['agent_name'] },
    ],
  },
);

export default AgentDomainToolGrant;
