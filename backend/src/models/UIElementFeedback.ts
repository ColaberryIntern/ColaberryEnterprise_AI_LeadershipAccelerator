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
  // Phase 10.5 — UX remediation intelligence. cluster_signature is a readable
  // string ("hierarchy:capId:/route") so the regression detector + reranker
  // group rows by stable identity. Persisted at create time so heuristic
  // changes don't silently shift cluster identity for historical rows.
  cluster_signature?: string;
  cluster_type?: string;
  first_seen_at?: Date;
  last_regressed_at?: Date;
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
  declare cluster_signature: string;
  declare cluster_type: string;
  declare first_seen_at: Date;
  declare last_regressed_at: Date;
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
    // Phase 10.5 cluster identity. Stamped at createFeedback time after a
    // one-shot classification call into issueClusterEngine.classifyRow().
    // Nullable so legacy rows continue to work — issueClusterEngine handles
    // null cluster_signature by classifying them lazily on read.
    cluster_signature: { type: DataTypes.STRING(120), allowNull: true },
    cluster_type: { type: DataTypes.STRING(40), allowNull: true },
    // first_seen_at is set on createFeedback ONLY when the row is genuinely
    // new (no prior resolved row with the same feedback_hash exists). When a
    // resolved-then-recreated row is detected, last_regressed_at is stamped
    // and first_seen_at is copied from the earlier resolved row.
    first_seen_at: { type: DataTypes.DATE, allowNull: true },
    last_regressed_at: { type: DataTypes.DATE, allowNull: true },
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
      // Phase 10.5 hot paths: cluster reranker, regression detector.
      { fields: ['cluster_signature'] },
      { fields: ['cluster_type'] },
    ],
  }
);

export default UIElementFeedback;
