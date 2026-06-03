/**
 * OpsSkill — a reusable decision pattern captured when Ali clicks
 * "Approve + skill" in the Approval Workspace.
 *
 * v0 is deterministic: we just record the action_kind + the reasoning
 * + the todo metadata so the team can see "Ali's known patterns" and
 * the agent loop can prefer-replay these when similar tasks arise.
 * LLM-based clustering is reserved for Phase 2.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface OpsSkillAttributes {
  id?: string;
  name: string;
  action_kind: string; // reply / decision / meeting / research / default
  captured_from_todo_bc_id: string | null;
  captured_from_todo_title: string | null;
  reasoning: string | null;
  decision: string | null;
  is_active: boolean;
  use_count: number;
  created_by: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class OpsSkill extends Model<OpsSkillAttributes> implements OpsSkillAttributes {
  declare id: string;
  declare name: string;
  declare action_kind: string;
  declare captured_from_todo_bc_id: string | null;
  declare captured_from_todo_title: string | null;
  declare reasoning: string | null;
  declare decision: string | null;
  declare is_active: boolean;
  declare use_count: number;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsSkill.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.TEXT, allowNull: false },
    action_kind: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'default' },
    captured_from_todo_bc_id: { type: DataTypes.STRING(50), allowNull: true },
    captured_from_todo_title: { type: DataTypes.TEXT, allowNull: true },
    reasoning: { type: DataTypes.TEXT, allowNull: true },
    decision: { type: DataTypes.STRING(40), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    use_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_by: { type: DataTypes.STRING(120), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OpsSkill',
    tableName: 'ops_skills',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['action_kind'] },
      { fields: ['is_active'] },
      { fields: ['created_at'] },
    ],
  },
);

export default OpsSkill;
