/**
 * GovernanceRecommendation — operator-facing recommendation produced by
 * the Phase 12 governance recommendation engine. Persisted (not stream-
 * only) because operators accept/reject via API call; we need stable IDs
 * + indexed dedupe ("skip if pending of same type exists").
 *
 * Lifecycle: created (status='pending') → operator decides → accepted /
 * rejected, or → expired by retention sweep (90d default).
 *
 * Phase 12 §B.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type GovernanceRecommendationType =
  | 'escalate_remediation'
  | 'pause_orchestration'
  | 'accelerate_cluster'
  | 'rollback_policy'
  | 'request_operator_review'
  | 'tighten_governance_threshold'
  | 'loosen_governance_threshold'
  | 'prepare_remediation_plan';

export type GovernanceRecommendationStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type GovernanceRiskLevel = 'low' | 'moderate' | 'elevated' | 'high';

interface Attrs {
  id?: string;
  project_id: string;
  type: GovernanceRecommendationType;
  recommendation_text: string;
  rationale: string;
  confidence: number;
  risk_level: GovernanceRiskLevel;
  supporting_evidence: any;
  projected_outcomes: any;
  /** 1 (top) .. 99. Drives dashboard sort order. */
  priority: number;
  /** Soft SLA in minutes for operator review before the recommendation goes stale. */
  requires_review_within_min: number;
  status: GovernanceRecommendationStatus;
  operator_decision_at: Date | null;
  operator_id: string | null;
  decision_reason: string | null;
  created_at?: Date;
}

class GovernanceRecommendation extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare type: GovernanceRecommendationType;
  declare recommendation_text: string;
  declare rationale: string;
  declare confidence: number;
  declare risk_level: GovernanceRiskLevel;
  declare supporting_evidence: any;
  declare projected_outcomes: any;
  declare priority: number;
  declare requires_review_within_min: number;
  declare status: GovernanceRecommendationStatus;
  declare operator_decision_at: Date | null;
  declare operator_id: string | null;
  declare decision_reason: string | null;
  declare created_at: Date;
}

GovernanceRecommendation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    recommendation_text: { type: DataTypes.TEXT, allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: false },
    confidence: { type: DataTypes.INTEGER, allowNull: false },
    risk_level: { type: DataTypes.STRING(10), allowNull: false },
    supporting_evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    projected_outcomes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    requires_review_within_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    status: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'pending' },
    operator_decision_at: { type: DataTypes.DATE, allowNull: true },
    operator_id: { type: DataTypes.STRING(64), allowNull: true },
    decision_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'governance_recommendations',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'status', 'created_at'] },
      // Dedupe hot path: "skip if pending of same type exists for this project"
      { fields: ['project_id', 'type', 'status'] },
    ],
  }
);

export default GovernanceRecommendation;
