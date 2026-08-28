import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentRoleCharter — an agent's business-facing job description.
 *
 * AI Workforce Management, Checkpoint B (2026-08-28). Confirmed absent in
 * Checkpoint A discovery (docs/architecture/ai-workforce-management/
 * DOMAIN_REUSE_MAP.md): `AiAgent` has no `mission`/`responsibilities`/`kpis`
 * fields, and the only place that shape exists today is the *synthetic*
 * Workforce OS roster (`services/workforce/orgRegistry.ts`), which is a
 * fictional persona list, not `ai_agents`-keyed, and explicitly not reused
 * here (see CURRENT_STATE.md §E).
 *
 * Deliberately separate from `AiAgent.system_prompt` — this is what a human
 * manager reads to understand what the agent is FOR, not the technical
 * instructions that drive its behavior. Editing a charter never touches
 * `system_prompt` (non-negotiable #5 in the governing mission).
 *
 * One row per agent (`agent_id` unique) — a charter is a current-state
 * document a manager edits in place, not an append-only history. If a real
 * need for charter version history emerges later that's a new, separate
 * table, not a retrofit onto this one.
 */
export interface AgentRoleCharterAttributes {
  id?: string;
  agent_id: string;
  role_title: string;
  mission: string;
  /** Business-facing responsibilities, e.g. "Recover students showing dropout
   * risk signals." Not the technical tools_granted list. */
  responsibilities: string[];
  /** Business-facing KPIs a manager cares about, e.g. "Reply rate."
   * Deliberately distinct from the technical INPACT/GOALS trust dimensions
   * (trustMetricsService.ts) — this is what the agent is FOR, not how
   * trustworthy its execution has been measured to be. */
  kpis: string[];
  /** The admin email that wrote the current version. Always populated
   * (unlike an org_member id, which is only resolved for non-superadmin
   * callers) — sourced from the JWT-verified req.admin.email. */
  updated_by_email: string;
  created_at?: Date;
  updated_at?: Date;
}

class AgentRoleCharter
  extends Model<AgentRoleCharterAttributes>
  implements AgentRoleCharterAttributes
{
  declare id: string;
  declare agent_id: string;
  declare role_title: string;
  declare mission: string;
  declare responsibilities: string[];
  declare kpis: string[];
  declare updated_by_email: string;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentRoleCharter.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'ai_agents', key: 'id' },
    },
    role_title: { type: DataTypes.STRING(255), allowNull: false },
    mission: { type: DataTypes.TEXT, allowNull: false },
    responsibilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    kpis: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    updated_by_email: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_role_charters',
    timestamps: true,
    underscored: true,
  }
);

export default AgentRoleCharter;
