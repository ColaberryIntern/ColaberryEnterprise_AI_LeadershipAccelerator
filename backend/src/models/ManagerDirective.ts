import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ManagerDirective — a standing instruction from a real human manager to an
 * agent, injected into that agent's runtime context on every turn
 * (agentSystemPrompt.ts's buildAgentSystemPrompt) — NEVER written into
 * AiAgent.system_prompt itself (non-negotiable #4 in the governing mission:
 * durable instructions must be injected at runtime, not baked into the base
 * prompt).
 *
 * Append-only and versioned: a directive is never edited in place. Superseding
 * an instruction means creating a new row and revoking the old one (`status`
 * transitions `active -> revoked`, `revoked_at`/`revoked_by_email` recorded) —
 * the full history stays queryable for audit, matching this repo's own
 * "append-only/supersession" precedent (see DeliveryDecision.ts).
 *
 * Restrict-only by construction, not by validating directive text: nothing in
 * this codebase ever reads a ManagerDirective row to grant a tool, raise
 * autonomy_level, or bypass agentAuthorizationService — a directive is pure
 * prompt-level guidance the model sees as an instruction, never a capability
 * grant through any code path. Detecting a manager's directive TEXT that
 * *asks* for expanded authority (turning it into a governed approval-path
 * proposal instead of silently injecting it) is a real, deliberately deferred
 * gap — flagged in MANAGER_AUTHORIZATION_MAP.md's Checkpoint C notes, not
 * built in this first slice.
 */
export type ManagerDirectiveStatus = 'active' | 'revoked';

export interface ManagerDirectiveAttributes {
  id?: string;
  agent_id: string;
  /** Nullable: a platform super_admin bypasses the manager-chain walk
   * entirely (requireAgentManagerOrAdmin's own performance/simplicity
   * design — it never does an extra DB hit to resolve their org_member row
   * on read paths), so this is only reliably populated for a direct/upstream
   * manager. `created_by_email` (always populated from the JWT) is the real,
   * always-reliable attribution — this column is a when-available
   * enrichment for future reports-to-chain queries, not the source of truth. */
  created_by_org_member_id?: string | null;
  created_by_email: string;
  directive_text: string;
  status?: ManagerDirectiveStatus;
  revoked_at?: Date | null;
  revoked_by_email?: string | null;
  created_at?: Date;
}

class ManagerDirective extends Model<ManagerDirectiveAttributes> implements ManagerDirectiveAttributes {
  declare id: string;
  declare agent_id: string;
  declare created_by_org_member_id: string | null;
  declare created_by_email: string;
  declare directive_text: string;
  declare status: ManagerDirectiveStatus;
  declare revoked_at: Date | null;
  declare revoked_by_email: string | null;
  declare created_at: Date;
}

ManagerDirective.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'ai_agents', key: 'id' } },
    created_by_org_member_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'org_members', key: 'id' } },
    created_by_email: { type: DataTypes.STRING(255), allowNull: false },
    directive_text: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_by_email: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'manager_directives',
    timestamps: false,
    indexes: [{ fields: ['agent_id', 'status', 'created_at'] }],
  }
);

export default ManagerDirective;
