import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentManagerConversation — a continuous DM-style thread between one real
 * human manager and one agent. AI Workforce Management, Checkpoint C
 * (2026-08-28), Direct Agent Communication — first slice.
 *
 * Keyed on `(agent_id, participant_email)`, not `org_member_id`: email is
 * always populated from the JWT regardless of role (matches the same
 * "email is the reliable identity, org_member_id is a when-available
 * enrichment" convention already established in ManagerDirective.ts). A
 * conversation genuinely needs to distinguish WHICH human is talking — unlike
 * a directive's attribution, a shared `null` key would incorrectly merge
 * every superadmin's conversation with one agent into a single thread.
 *
 * Find-or-create semantics: one row per (agent, manager) pair, mirroring the
 * real precedent of a continuous relationship (Reese's own student DM thread
 * — one room per enrollment, not a new thread per message) rather than named/
 * multiple threads. If a real need for multiple named conversations per
 * manager emerges later, that's a new column, not a retrofit onto this one.
 */
export interface AgentManagerConversationAttributes {
  id?: string;
  agent_id: string;
  participant_email: string;
  /** Nullable for the same reason as ManagerDirective.created_by_org_member_id
   * — a platform super_admin is never resolved to an org_member by the auth
   * gate. */
  participant_org_member_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentManagerConversation
  extends Model<AgentManagerConversationAttributes>
  implements AgentManagerConversationAttributes
{
  declare id: string;
  declare agent_id: string;
  declare participant_email: string;
  declare participant_org_member_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentManagerConversation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'ai_agents', key: 'id' } },
    participant_email: { type: DataTypes.STRING(255), allowNull: false },
    participant_org_member_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'org_members', key: 'id' } },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_manager_conversations',
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ['agent_id', 'participant_email'] }],
  }
);

export default AgentManagerConversation;
