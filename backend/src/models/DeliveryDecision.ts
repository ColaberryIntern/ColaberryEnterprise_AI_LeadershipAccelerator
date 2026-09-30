import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryDecision — the decision ledger. Approved decisions are durable project truth
 * (master plan §5.3).
 *
 * SUPERSESSION, NOT MUTATION. A decision that changes gets a successor row and a
 * back-pointer; the original keeps its rationale, its decider and its timestamp. Master
 * plan §24 lists "design approval can be silently overwritten" as a stop condition, and
 * an UPDATE on an approved row is precisely how that happens — the record would then say
 * the client approved something they never saw.
 *
 * `affected_nodes` is what makes an impact-aware change request possible (master plan
 * §Gate 3): it records which requirements, design decisions, stories and agent
 * definitions a decision touches, so "what would this change break?" is a query rather
 * than a meeting.
 */
export type DecisionType =
  | 'business'
  | 'requirements'
  | 'architecture'
  | 'design'
  | 'trust'
  | 'security'
  | 'data'
  | 'agent'
  | 'release'
  | 'client';

export const DECISION_TYPES: readonly DecisionType[] = [
  'business',
  'requirements',
  'architecture',
  'design',
  'trust',
  'security',
  'data',
  'agent',
  'release',
  'client',
];

export type DecisionStatus = 'open' | 'recommended' | 'decided' | 'approved' | 'superseded';

export const DECISION_STATUSES: readonly DecisionStatus[] = [
  'open',
  'recommended',
  'decided',
  'approved',
  'superseded',
];

export interface DeliveryDecisionAttributes {
  id?: string;
  delivery_project_id: string;
  decision_type: DecisionType;
  question: string;
  options?: Record<string, any> | null;
  recommendation?: string | null;
  final_decision?: string | null;
  rationale?: string | null;
  /** Which graph nodes this decision touches. Drives change-request impact analysis. */
  affected_nodes?: Record<string, any> | null;
  status?: DecisionStatus;
  decided_by_identity_id?: string | null;
  approved_by_identity_id?: string | null;
  decided_at?: Date | null;
  supersedes_decision_id?: string | null;
  superseded_by_decision_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryDecision
  extends Model<DeliveryDecisionAttributes>
  implements DeliveryDecisionAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare decision_type: DecisionType;
  declare question: string;
  declare options: Record<string, any> | null;
  declare recommendation: string | null;
  declare final_decision: string | null;
  declare rationale: string | null;
  declare affected_nodes: Record<string, any> | null;
  declare status: DecisionStatus;
  declare decided_by_identity_id: string | null;
  declare approved_by_identity_id: string | null;
  declare decided_at: Date | null;
  declare supersedes_decision_id: string | null;
  declare superseded_by_decision_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryDecision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    decision_type: { type: DataTypes.STRING(40), allowNull: false },
    question: { type: DataTypes.TEXT, allowNull: false },
    options: { type: DataTypes.JSONB, allowNull: true },
    recommendation: { type: DataTypes.TEXT, allowNull: true },
    final_decision: { type: DataTypes.TEXT, allowNull: true },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    affected_nodes: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    decided_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    supersedes_decision_id: { type: DataTypes.UUID, allowNull: true },
    superseded_by_decision_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_decisions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['delivery_project_id', 'decision_type', 'status'],
        name: 'idx_delivery_decisions_project_type',
      },
    ],
  },
);

export default DeliveryDecision;
