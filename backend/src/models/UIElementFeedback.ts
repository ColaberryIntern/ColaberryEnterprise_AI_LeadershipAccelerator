import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface UIElementFeedbackAttributes {
  id?: string;
  capability_id: string;
  project_id: string;
  element_id: string;
  element_type?: string;
  element_selector?: string;
  element_text?: string;
  page_route?: string;
  issue_type: string;
  title: string;
  description: string;
  suggestion?: string;
  severity?: string;
  status?: string;
  resolved_at?: Date;
  resolved_by?: string;
  feedback_hash: string;
  prompt?: string;
  execution_status?: string;
  source?: string;
  confidence?: number;
  source_step?: string;
}

class UIElementFeedback extends Model<UIElementFeedbackAttributes> implements UIElementFeedbackAttributes {
  declare id: string;
  declare capability_id: string;
  declare project_id: string;
  declare element_id: string;
  declare element_type: string;
  declare element_selector: string;
  declare element_text: string;
  declare page_route: string;
  declare issue_type: string;
  declare title: string;
  declare description: string;
  declare suggestion: string;
  declare severity: string;
  declare status: string;
  declare resolved_at: Date;
  declare resolved_by: string;
  declare feedback_hash: string;
  declare prompt: string;
  declare execution_status: string;
  declare source: string;
  declare confidence: number;
  declare source_step: string;
}

UIElementFeedback.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    capability_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'capabilities', key: 'id' } },
    project_id: { type: DataTypes.UUID, allowNull: false },
    element_id: { type: DataTypes.STRING(200), allowNull: false },
    element_type: { type: DataTypes.STRING(50), allowNull: true },
    element_selector: { type: DataTypes.STRING(500), allowNull: true },
    element_text: { type: DataTypes.STRING(500), allowNull: true },
    page_route: { type: DataTypes.STRING(200), allowNull: true },
    issue_type: { type: DataTypes.STRING(50), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    suggestion: { type: DataTypes.TEXT, allowNull: true },
    severity: { type: DataTypes.STRING(10), defaultValue: 'medium' },
    status: { type: DataTypes.STRING(20), defaultValue: 'open' },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    resolved_by: { type: DataTypes.STRING(50), allowNull: true },
    feedback_hash: { type: DataTypes.STRING(64), allowNull: false },
    prompt: { type: DataTypes.TEXT, allowNull: true },
    execution_status: { type: DataTypes.STRING(20), allowNull: true },
    source: { type: DataTypes.STRING(20), defaultValue: 'rule' },
    confidence: { type: DataTypes.FLOAT, defaultValue: 1.0 },
    // The UI Advisor step that triggered this feedback row.
    // 'layout_hierarchy' | 'usability' | 'mobile_responsiveness'.
    // Nullable so pre-existing rows (created before this column shipped)
    // continue to work — the frontend treats them as "untagged" and groups
    // them in a separate section.
    source_step: { type: DataTypes.STRING(40), allowNull: true },
  },
  {
    sequelize,
    tableName: 'ui_element_feedback',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['capability_id'] },
      { fields: ['capability_id', 'element_id'] },
      { fields: ['capability_id', 'status'] },
      { unique: true, fields: ['capability_id', 'feedback_hash'], name: 'ui_feedback_dedup' },
    ],
  }
);

export default UIElementFeedback;
