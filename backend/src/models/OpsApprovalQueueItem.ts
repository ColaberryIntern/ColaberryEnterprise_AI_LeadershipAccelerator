/**
 * OpsApprovalQueueItem — the core table. Every human approval lives here.
 *
 * Open items (decided_at IS NULL) are what the Waiting on Human panel shows.
 * Decided items become the audit trail.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ApprovalDecision =
  | 'approve'
  | 'approve_and_continue'
  | 'approve_and_convert_to_skill'
  | 'revise'
  | 'reject'
  | 'escalate'
  | null;

interface OpsApprovalQueueItemAttributes {
  id?: string;
  todo_bc_id: string;
  artifact_id: string | null;
  summary: string;
  recommended_decision: ApprovalDecision;
  confidence: number | null; // 0.0 - 1.0
  estimated_review_seconds: number | null;
  blocked_downstream_count: number;
  urgency_snapshot: number | null;
  ai_opportunity_snapshot: number | null;
  // Routing
  target_user_id: string | null; // who should decide
  enqueued_at: Date;
  // Decision
  decided_at: Date | null;
  decision: ApprovalDecision;
  decided_by: string | null;
  decision_reasoning: string | null;
  next_actions: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class OpsApprovalQueueItem extends Model<OpsApprovalQueueItemAttributes> implements OpsApprovalQueueItemAttributes {
  declare id: string;
  declare todo_bc_id: string;
  declare artifact_id: string | null;
  declare summary: string;
  declare recommended_decision: ApprovalDecision;
  declare confidence: number | null;
  declare estimated_review_seconds: number | null;
  declare blocked_downstream_count: number;
  declare urgency_snapshot: number | null;
  declare ai_opportunity_snapshot: number | null;
  declare target_user_id: string | null;
  declare enqueued_at: Date;
  declare decided_at: Date | null;
  declare decision: ApprovalDecision;
  declare decided_by: string | null;
  declare decision_reasoning: string | null;
  declare next_actions: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsApprovalQueueItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    todo_bc_id: { type: DataTypes.STRING(50), allowNull: false },
    artifact_id: { type: DataTypes.UUID, allowNull: true },
    summary: { type: DataTypes.TEXT, allowNull: false },
    recommended_decision: { type: DataTypes.STRING(40), allowNull: true },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    estimated_review_seconds: { type: DataTypes.INTEGER, allowNull: true },
    blocked_downstream_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    urgency_snapshot: { type: DataTypes.INTEGER, allowNull: true },
    ai_opportunity_snapshot: { type: DataTypes.INTEGER, allowNull: true },
    target_user_id: { type: DataTypes.STRING(100), allowNull: true },
    enqueued_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    decision: { type: DataTypes.STRING(40), allowNull: true },
    decided_by: { type: DataTypes.STRING(100), allowNull: true },
    decision_reasoning: { type: DataTypes.TEXT, allowNull: true },
    next_actions: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OpsApprovalQueueItem',
    tableName: 'ops_approval_queue',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['decided_at'] },              // open queue: WHERE decided_at IS NULL
      { fields: ['urgency_snapshot'] },        // sort by urgency
      { fields: ['target_user_id', 'decided_at'] }, // per-user open queue
      { fields: ['todo_bc_id'] },
    ],
  },
);

export default OpsApprovalQueueItem;
