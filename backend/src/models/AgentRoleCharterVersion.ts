import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentRoleCharterVersion — Reese Product Phase 1, R4. Append-only history of
 * `agent_role_charters`, one row per version ever activated. Mirrors
 * `AgentPersonaVersionHistory`'s own append-only pattern for the same reason:
 * `agent_role_charters` itself is a current-state row a manager edits in
 * place, and rollback (`activateCharterVersion()`) needs a real, immutable
 * prior version to restore from, not a value reconstructed from memory.
 *
 * A row here is a full, self-contained snapshot of the charter at that
 * version — never a diff — so restoring version N never depends on replaying
 * every version before it.
 */
export interface AgentRoleCharterVersionAttributes {
  id?: string;
  agent_id: string;
  version: number;
  effective_at: Date;
  role_title: string;
  mission: string;
  responsibilities: string[];
  kpis: string[];
  boundaries: string[];
  authority_autonomous: string[];
  authority_approval_required: string[];
  authority_forbidden: string[];
  escalation_policy: string | null;
  updated_by_email: string;
  created_at?: Date;
}

class AgentRoleCharterVersion
  extends Model<AgentRoleCharterVersionAttributes>
  implements AgentRoleCharterVersionAttributes
{
  declare id: string;
  declare agent_id: string;
  declare version: number;
  declare effective_at: Date;
  declare role_title: string;
  declare mission: string;
  declare responsibilities: string[];
  declare kpis: string[];
  declare boundaries: string[];
  declare authority_autonomous: string[];
  declare authority_approval_required: string[];
  declare authority_forbidden: string[];
  declare escalation_policy: string | null;
  declare updated_by_email: string;
  declare created_at: Date;
}

AgentRoleCharterVersion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ai_agents', key: 'id' },
    },
    version: { type: DataTypes.INTEGER, allowNull: false },
    effective_at: { type: DataTypes.DATE, allowNull: false },
    role_title: { type: DataTypes.STRING(255), allowNull: false },
    mission: { type: DataTypes.TEXT, allowNull: false },
    responsibilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    kpis: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    boundaries: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    authority_autonomous: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    authority_approval_required: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    authority_forbidden: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    escalation_policy: { type: DataTypes.TEXT, allowNull: true },
    updated_by_email: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_role_charter_versions',
    timestamps: false,
    underscored: true,
    indexes: [{ unique: true, fields: ['agent_id', 'version'] }],
  }
);

export default AgentRoleCharterVersion;
