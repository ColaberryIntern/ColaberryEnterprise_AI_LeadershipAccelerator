import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface StrategyCallIntelligenceAttributes {
  id?: string;
  strategy_call_id: string;
  lead_id?: number | null;
  primary_challenges: string[];
  ai_maturity_level: string;
  team_size: string;
  priority_use_case: string;
  timeline_urgency: string;
  current_tools: string[];
  budget_range: string;
  evaluating_consultants: boolean;
  previous_ai_investment: string;
  specific_questions: string;
  additional_context: string;
  uploaded_file_path: string | null;
  uploaded_file_name: string | null;
  uploaded_file_type: string | null;
  extracted_text: string | null;
  completion_score: number;
  ai_synthesis: string | null;
  ai_confidence_score: number | null;
  ai_recommended_focus: string[] | null;
  ai_synthesized_at: Date | null;
  status: 'draft' | 'submitted' | 'synthesized';
  submitted_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class StrategyCallIntelligence
  extends Model<StrategyCallIntelligenceAttributes>
  implements StrategyCallIntelligenceAttributes
{
  declare id: string;
  declare strategy_call_id: string;
  declare lead_id: number | null;
  declare primary_challenges: string[];
  declare ai_maturity_level: string;
  declare team_size: string;
  declare priority_use_case: string;
  declare timeline_urgency: string;
  declare current_tools: string[];
  declare budget_range: string;
  declare evaluating_consultants: boolean;
  declare previous_ai_investment: string;
  declare specific_questions: string;
  declare additional_context: string;
  declare uploaded_file_path: string | null;
  declare uploaded_file_name: string | null;
  declare uploaded_file_type: string | null;
  declare extracted_text: string | null;
  declare completion_score: number;
  declare ai_synthesis: string | null;
  declare ai_confidence_score: number | null;
  declare ai_recommended_focus: string[] | null;
  declare ai_synthesized_at: Date | null;
  declare status: 'draft' | 'submitted' | 'synthesized';
  declare submitted_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StrategyCallIntelligence.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    strategy_call_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'strategy_calls', key: 'id' },
      unique: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    primary_challenges: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    ai_maturity_level: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '',
    },
    team_size: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '',
    },
    priority_use_case: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    timeline_urgency: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '',
    },
    current_tools: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    budget_range: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '',
    },
    evaluating_consultants: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    previous_ai_investment: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    specific_questions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    additional_context: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    uploaded_file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    uploaded_file_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    uploaded_file_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    extracted_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completion_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ai_synthesis: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_confidence_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    ai_recommended_focus: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ai_synthesized_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'strategy_call_intelligence',
    timestamps: false,
  }
);

export default StrategyCallIntelligence;
