/**
 * OpsAiAssessment — per-todo scoring history (audit trail).
 *
 * Each row is one execution of any scoring agent (Priority / AI Opportunity /
 * Brand) against one todo. We keep history so we can audit how scores changed
 * over time and detect agent regressions.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AgentName =
  | 'priority_v1'
  | 'priority_v2'
  | 'ai_opportunity_v1'
  | 'brand_v1'
  | 'triage_v1'
  | 'meeting_eliminator_v1'
  | 'skill_extraction_v1'
  | 'chief_of_staff_v1';

interface OpsAiAssessmentAttributes {
  id?: string;
  todo_bc_id: string;
  agent: AgentName;
  agent_version: string;
  urgency_score: number | null;
  ai_opportunity_score: number | null;
  brand_score: number | null;
  category: string | null;
  reasoning: Record<string, any> | null;
  llm_model: string | null;
  llm_input_tokens: number | null;
  llm_output_tokens: number | null;
  llm_cost_usd: number | null;
  computed_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class OpsAiAssessment extends Model<OpsAiAssessmentAttributes> implements OpsAiAssessmentAttributes {
  declare id: string;
  declare todo_bc_id: string;
  declare agent: AgentName;
  declare agent_version: string;
  declare urgency_score: number | null;
  declare ai_opportunity_score: number | null;
  declare brand_score: number | null;
  declare category: string | null;
  declare reasoning: Record<string, any> | null;
  declare llm_model: string | null;
  declare llm_input_tokens: number | null;
  declare llm_output_tokens: number | null;
  declare llm_cost_usd: number | null;
  declare computed_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsAiAssessment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    todo_bc_id: { type: DataTypes.STRING(50), allowNull: false },
    agent: { type: DataTypes.STRING(60), allowNull: false },
    agent_version: { type: DataTypes.STRING(20), allowNull: false },
    urgency_score: { type: DataTypes.INTEGER, allowNull: true },
    ai_opportunity_score: { type: DataTypes.INTEGER, allowNull: true },
    brand_score: { type: DataTypes.INTEGER, allowNull: true },
    category: { type: DataTypes.STRING(40), allowNull: true },
    reasoning: { type: DataTypes.JSONB, allowNull: true },
    llm_model: { type: DataTypes.STRING(60), allowNull: true },
    llm_input_tokens: { type: DataTypes.INTEGER, allowNull: true },
    llm_output_tokens: { type: DataTypes.INTEGER, allowNull: true },
    llm_cost_usd: { type: DataTypes.DECIMAL(10, 5), allowNull: true },
    computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OpsAiAssessment',
    tableName: 'ops_ai_assessments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['todo_bc_id', 'computed_at'] },
      { fields: ['agent'] },
      { fields: ['computed_at'] },
    ],
  },
);

export default OpsAiAssessment;
