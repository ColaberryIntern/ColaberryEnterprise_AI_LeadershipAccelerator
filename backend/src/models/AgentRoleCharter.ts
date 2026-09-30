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
 * document a manager edits in place, not an append-only history. Its own
 * history lives in `AgentRoleCharterVersion`, added in the Reese Product
 * Phase 1 versioning work below.
 *
 * Reese Product Phase 1, R4 — additive, nullable columns for versioning
 * (`version`, `effective_at`) and the authority/boundary content the mission
 * requires (`boundaries`, `authority_autonomous`, `authority_approval_required`,
 * `authority_forbidden`, `escalation_policy`). Nullable so an existing charter
 * with none of these set (Dara's today, and Reese's until
 * `applyReeseCharterV2.ts --apply` runs) keeps rendering byte-identical to
 * before this change — see `agentContextLayers.ts`'s `buildRoleCharterBlock()`,
 * which only renders the new sections when `version >= 2`.
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
  /** Null for every charter written before this phase. `buildRoleCharterBlock()`
   * treats null and 1 identically (today's plain-text rendering); only
   * `version >= 2` renders boundaries/authority/escalation. */
  version?: number | null;
  effective_at?: Date | null;
  /** What this agent must NOT do, independent of the forbidden-actions list
   * below (boundaries are scope; forbidden is explicit prohibition). */
  boundaries?: string[] | null;
  /** Actions this agent may take without asking first. */
  authority_autonomous?: string[] | null;
  /** Actions this agent may propose but must not execute without a human's
   * explicit approval. */
  authority_approval_required?: string[] | null;
  /** Actions this agent must never take, full stop. */
  authority_forbidden?: string[] | null;
  /** Free text: when and to whom this agent escalates. */
  escalation_policy?: string | null;
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
  declare version: number | null;
  declare effective_at: Date | null;
  declare boundaries: string[] | null;
  declare authority_autonomous: string[] | null;
  declare authority_approval_required: string[] | null;
  declare authority_forbidden: string[] | null;
  declare escalation_policy: string | null;
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
    version: { type: DataTypes.INTEGER, allowNull: true },
    effective_at: { type: DataTypes.DATE, allowNull: true },
    boundaries: { type: DataTypes.JSONB, allowNull: true },
    authority_autonomous: { type: DataTypes.JSONB, allowNull: true },
    authority_approval_required: { type: DataTypes.JSONB, allowNull: true },
    authority_forbidden: { type: DataTypes.JSONB, allowNull: true },
    escalation_policy: { type: DataTypes.TEXT, allowNull: true },
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
