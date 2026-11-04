import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A typed GAP on a proposal document section (P1 of the Gov Proposal Studio). The AI never invents a fact it cannot
 * ground — it inserts a question here instead. `resolution`: `open` (unanswered), `answered` (a human gave a real
 * answer, optionally `answer_ref` into the company library), or `filler` (a visibly flagged placeholder that BLOCKS
 * export until replaced). Moved off response slots (responseSlots.ts `ResponseGap`) so the named documents are the
 * single proposal model. Schema: db/ensureGovProposalDocumentGapsSchema.ts.
 */
export type GovProposalGapResolution = 'open' | 'answered' | 'filler';

export interface GovProposalDocumentGapAttributes {
  id?: string;
  delivery_project_id: string;
  doc_key: string;
  section_key: string;
  question: string;
  why: string | null;
  suggestions: string[];
  resolution: GovProposalGapResolution;
  answer: string | null;
  answer_ref: string | null;
  /** The original `ResponseGap.id` this row was migrated from — the idempotency anchor for the migration. */
  source_gap_id: string | null;
  created_at?: Date;
  resolved_by?: string | null;
  resolved_at?: Date | null;
}

class GovProposalDocumentGap extends Model<GovProposalDocumentGapAttributes> implements GovProposalDocumentGapAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare doc_key: string;
  declare section_key: string;
  declare question: string;
  declare why: string | null;
  declare suggestions: string[];
  declare resolution: GovProposalGapResolution;
  declare answer: string | null;
  declare answer_ref: string | null;
  declare source_gap_id: string | null;
  declare created_at: Date;
  declare resolved_by: string | null;
  declare resolved_at: Date | null;
}

GovProposalDocumentGap.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    doc_key: { type: DataTypes.STRING(60), allowNull: false },
    section_key: { type: DataTypes.TEXT, allowNull: false },
    question: { type: DataTypes.TEXT, allowNull: false },
    why: { type: DataTypes.TEXT, allowNull: true },
    suggestions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    resolution: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
    answer: { type: DataTypes.TEXT, allowNull: true },
    answer_ref: { type: DataTypes.TEXT, allowNull: true },
    source_gap_id: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    resolved_by: { type: DataTypes.UUID, allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'GovProposalDocumentGap',
    tableName: 'gov_proposal_document_gaps',
    timestamps: false,
    indexes: [{ fields: ['delivery_project_id', 'doc_key'] }],
  },
);

export default GovProposalDocumentGap;
