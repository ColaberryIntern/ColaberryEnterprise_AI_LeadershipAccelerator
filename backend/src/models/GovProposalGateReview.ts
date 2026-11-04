import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { GovProposalGate, GateStatus } from '../services/factory/proposal/proposalReviewTypes';

/**
 * A color-team GATE review of a proposal document (Proposal Studio P3): Pink / Red / Gold / White Glove. A gate
 * opens only when the pointed-at version passes the checks relevant to it; Gold requires a program-capable human and
 * separation of duties (the approver is not the version's last human author); a new version after an approval
 * reopens the later gates. Schema: db/ensureGovProposalReviewSchema.ts.
 */
export interface GovProposalGateReviewAttributes {
  id?: string;
  document_id: string;
  gate: GovProposalGate;
  version_id: string | null;
  status: GateStatus;
  reviewer_identity_id: string | null;
  note: string | null;
  decided_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovProposalGateReview extends Model<GovProposalGateReviewAttributes> implements GovProposalGateReviewAttributes {
  declare id: string;
  declare document_id: string;
  declare gate: GovProposalGate;
  declare version_id: string | null;
  declare status: GateStatus;
  declare reviewer_identity_id: string | null;
  declare note: string | null;
  declare decided_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovProposalGateReview.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: { type: DataTypes.UUID, allowNull: false },
    gate: { type: DataTypes.STRING(16), allowNull: false },
    version_id: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
    reviewer_identity_id: { type: DataTypes.UUID, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovProposalGateReview',
    tableName: 'gov_proposal_gate_reviews',
    timestamps: false,
    indexes: [{ unique: true, fields: ['document_id', 'gate'] }],
  },
);

export default GovProposalGateReview;
