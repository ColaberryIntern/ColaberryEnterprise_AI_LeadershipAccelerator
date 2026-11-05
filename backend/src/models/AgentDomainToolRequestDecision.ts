import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ToolRequestVerb } from '../services/agentDomain/toolRequestDecisionContract';

/**
 * AgentDomainToolRequestDecision — AF11.3. One row per decision, append-only.
 *
 * Not one row per request, because `send_back` happens more than once: a request can be sent
 * back, edited, sent back again and finally approved, and each of those is something somebody
 * decided and may be asked about later. A single column would keep only the last one and lose
 * exactly the history that makes an approval auditable.
 *
 * It also means a decision cannot be edited into a different decision. A correction is a new row,
 * so "who approved what, and when" survives somebody changing their mind.
 *
 * ## It carries no status, on purpose
 *
 * The governance status stays on `AgentDomainChangeRequest`, written in the same transaction. The
 * ticket says there is already an approval spine and not to build a second one, so this table
 * holds only the VERB and the words that verb required — the things the parent's four-value
 * status cannot express. With no status of its own it cannot disagree with the parent about
 * whether a request is open.
 *
 * ## And no autonomy level, no granted tool list
 *
 * AF11.3's sharpest warning: a console that grants a tool and lifts an autonomy level in one
 * action means nobody separately decided the agent may act more freely. `assigned_tool_name`
 * records an INTENT; AF11.4 performs the grant against `ai_agents.tools_granted`, and nothing
 * here touches that column.
 */
export interface AgentDomainToolRequestDecisionAttributes {
  id?: string;
  change_request_id: string;
  verb: ToolRequestVerb;
  decided_by_identity: string;
  decided_at?: Date;
  /** Mandatory on `deny`, null otherwise. */
  reason?: string | null;
  /** Mandatory on `send_back`, null otherwise. */
  missing_field?: string | null;
  /** Mandatory on `assign_existing_tool`, null otherwise. An intent, not a grant. */
  assigned_tool_name?: string | null;
  created_at?: Date;
}

class AgentDomainToolRequestDecision
  extends Model<AgentDomainToolRequestDecisionAttributes>
  implements AgentDomainToolRequestDecisionAttributes {
  declare id: string;
  declare change_request_id: string;
  declare verb: ToolRequestVerb;
  declare decided_by_identity: string;
  declare decided_at: Date;
  declare reason: string | null;
  declare missing_field: string | null;
  declare assigned_tool_name: string | null;
  declare created_at: Date;
}

AgentDomainToolRequestDecision.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    change_request_id: { type: DataTypes.UUID, allowNull: false },
    verb: { type: DataTypes.TEXT, allowNull: false },
    decided_by_identity: { type: DataTypes.TEXT, allowNull: false },
    decided_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reason: { type: DataTypes.TEXT, allowNull: true },
    missing_field: { type: DataTypes.TEXT, allowNull: true },
    assigned_tool_name: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_request_decisions',
    timestamps: false,
    indexes: [{ fields: ['change_request_id', 'decided_at'] }],
  },
);

export default AgentDomainToolRequestDecision;
