/**
 * OpsBcTodo — mirror of Basecamp todos enriched with our ops scores.
 *
 * Owned by the AI Ops Command Center sync worker. Read-mirror of BC; we never
 * mutate the upstream BC record through this table — only push-back through
 * the Workflow layer.
 *
 * Source: Phase 0 of the AI Ops Command Center architecture brief (Part II).
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpsTodoCategory =
  | 'human_required'
  | 'ai_can_finish'
  | 'ai_can_prepare'
  | 'can_eliminate'
  | 'waiting_dependency'
  | 'completed'
  | 'unscored';

interface OpsBcTodoAttributes {
  bc_id: string; // primary key; matches BC's todo id
  project_id: string;
  todolist_id: string | null;
  title: string;
  description: string | null;
  status: string; // BC's own status: 'active' | 'completed' | 'trashed'
  due_on: Date | null;
  assignee_ids: string[];
  bc_creator_id: string | null;
  bc_app_url: string | null;

  // Our ops enrichment
  urgency_score: number | null; // 0-100, rule-based (Priority Engine v0)
  ai_opportunity_score: number | null; // 0-100, AI Opportunity Agent
  brand_score: number | null; // 0-100, Brand Agent
  category: OpsTodoCategory;
  last_human_action_at: Date | null;
  downstream_blocked_count: number;

  // Bookkeeping
  bc_created_at: Date;
  bc_updated_at: Date;
  last_synced_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class OpsBcTodo extends Model<OpsBcTodoAttributes> implements OpsBcTodoAttributes {
  declare bc_id: string;
  declare project_id: string;
  declare todolist_id: string | null;
  declare title: string;
  declare description: string | null;
  declare status: string;
  declare due_on: Date | null;
  declare assignee_ids: string[];
  declare bc_creator_id: string | null;
  declare bc_app_url: string | null;
  declare urgency_score: number | null;
  declare ai_opportunity_score: number | null;
  declare brand_score: number | null;
  declare category: OpsTodoCategory;
  declare last_human_action_at: Date | null;
  declare downstream_blocked_count: number;
  declare bc_created_at: Date;
  declare bc_updated_at: Date;
  declare last_synced_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsBcTodo.init(
  {
    bc_id: { type: DataTypes.STRING(50), primaryKey: true, allowNull: false },
    project_id: { type: DataTypes.STRING(50), allowNull: false },
    todolist_id: { type: DataTypes.STRING(50), allowNull: true },
    title: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'active' },
    due_on: { type: DataTypes.DATEONLY, allowNull: true },
    assignee_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    bc_creator_id: { type: DataTypes.STRING(50), allowNull: true },
    bc_app_url: { type: DataTypes.TEXT, allowNull: true },

    urgency_score: { type: DataTypes.INTEGER, allowNull: true },
    ai_opportunity_score: { type: DataTypes.INTEGER, allowNull: true },
    brand_score: { type: DataTypes.INTEGER, allowNull: true },
    category: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'unscored' },
    last_human_action_at: { type: DataTypes.DATE, allowNull: true },
    downstream_blocked_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    bc_created_at: { type: DataTypes.DATE, allowNull: false },
    bc_updated_at: { type: DataTypes.DATE, allowNull: false },
    last_synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OpsBcTodo',
    tableName: 'ops_bc_todos',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['status'] },
      { fields: ['urgency_score'] },
      { fields: ['category'] },
      { fields: ['due_on'] },
    ],
  },
);

export default OpsBcTodo;
