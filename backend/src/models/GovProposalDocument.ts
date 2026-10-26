import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A named proposal document a bid must submit (cockpit v2 Proposal workstream): Cover Letter, Technical Proposal,
 * Price/Cost Proposal, Past Performance, HUB Plan, Reps & Certs, etc. Derived from the established requirements
 * (govProposalDocuments) and synced into this table so its authored state survives re-derivation.
 *
 * The AI drafts `content_html`; a reviewer accepts it. status: not_started → drafting → drafted →
 * (accepted | changes_requested). `accepted` is reviewer-only; the AI never self-accepts. `admin_only` (the price
 * document) is dropped by the student-safe projection so an intern never sees it. Schema: db/ensureGovProposalDocumentSchema.ts.
 */
export interface GovProposalDocumentComment { id: string; authorIdentityId: string; body: string; at: string; }
export type GovProposalDocumentStatus = 'not_started' | 'drafting' | 'drafted' | 'changes_requested' | 'accepted';

export interface GovProposalDocumentAttributes {
  id?: string;
  delivery_project_id: string;
  doc_key: string;
  title: string;
  status: GovProposalDocumentStatus;
  content_html: string | null;
  version: number;
  admin_only: boolean;
  gate: boolean;
  order_index: number;
  /** The canonical_req_ids this document must cover — the AI's grounding and the reviewer's checklist. */
  requirement_ids: string[];
  /** The review thread (newest appended last). */
  comments: GovProposalDocumentComment[];
  drafted_at?: Date | null;
  drafted_by_identity_id?: string | null;
  accepted_at?: Date | null;
  accepted_by_identity_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovProposalDocument extends Model<GovProposalDocumentAttributes> implements GovProposalDocumentAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare doc_key: string;
  declare title: string;
  declare status: GovProposalDocumentStatus;
  declare content_html: string | null;
  declare version: number;
  declare admin_only: boolean;
  declare gate: boolean;
  declare order_index: number;
  declare requirement_ids: string[];
  declare comments: GovProposalDocumentComment[];
  declare drafted_at: Date | null;
  declare drafted_by_identity_id: string | null;
  declare accepted_at: Date | null;
  declare accepted_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovProposalDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    doc_key: { type: DataTypes.STRING(60), allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'not_started' },
    content_html: { type: DataTypes.TEXT, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    admin_only: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    gate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    order_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    requirement_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    comments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    drafted_at: { type: DataTypes.DATE, allowNull: true },
    drafted_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    accepted_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovProposalDocument',
    tableName: 'gov_proposal_documents',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id', 'doc_key'] }],
  },
);

export default GovProposalDocument;
