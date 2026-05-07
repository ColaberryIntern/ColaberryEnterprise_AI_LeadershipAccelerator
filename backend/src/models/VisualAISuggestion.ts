/**
 * VisualAISuggestion — AI-generated suggestion responding to a critique item.
 *
 * Phase 5 V1 generates these from rule-based templates (visualCritiqueEngine).
 * Phase 6 will plug in OpenAI vision for richer suggestions.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SuggestionKind =
  | 'layout' | 'hierarchy' | 'spacing' | 'cta' | 'onboarding'
  | 'accessibility' | 'workflow' | 'simplification' | 'copy';

interface Attrs {
  id?: string;
  session_id: string;
  critique_id: string | null;     // null when generated holistically (not tied to a specific item)
  project_id: string;

  kind: SuggestionKind;
  title: string;
  body: string;
  rationale: string | null;

  confidence: number;             // 0-100
  expected_ux_impact: number;     // 0-100 — how much UX debt this resolves

  source: 'rule_based' | 'llm';
  source_metadata: any;

  created_at?: Date;
}

class VisualAISuggestion extends Model<Attrs> implements Attrs {
  declare id: string;
  declare session_id: string;
  declare critique_id: string | null;
  declare project_id: string;
  declare kind: SuggestionKind;
  declare title: string;
  declare body: string;
  declare rationale: string | null;
  declare confidence: number;
  declare expected_ux_impact: number;
  declare source: 'rule_based' | 'llm';
  declare source_metadata: any;
  declare created_at: Date;
}

VisualAISuggestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    critique_id: { type: DataTypes.UUID, allowNull: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(32), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    confidence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 70 },
    expected_ux_impact: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'rule_based' },
    source_metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'visual_ai_suggestions',
    timestamps: false,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['critique_id'] },
      { fields: ['project_id'] },
      { fields: ['kind'] },
    ],
  }
);

export default VisualAISuggestion;
