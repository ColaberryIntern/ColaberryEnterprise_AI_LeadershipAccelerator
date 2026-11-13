import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A reference/source document uploaded to ONE gov project's proposal source library (P-SRC). Its text is split into
 * embedded chunks (see {@link GovProposalSourceChunk}) so the proposal agent can retrieve the relevant parts per
 * section. Project-scoped; grounds nothing until a human sets `approved = true`.
 */
export type GovProposalSourceStatus = 'ready' | 'embedding_pending' | 'error';

interface GovProposalSourceDocumentAttributes {
  id?: string;
  project_id: string;
  tenant_id: string;
  name: string;
  mime_type?: string | null;
  source?: string | null;
  status?: GovProposalSourceStatus;
  approved?: boolean;
  approved_by_identity_id?: string | null;
  uploaded_by_identity_id?: string | null;
  extracted_chars?: number;
  truncated?: boolean;
  chunk_count?: number;
  embedded_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

class GovProposalSourceDocument extends Model<GovProposalSourceDocumentAttributes> implements GovProposalSourceDocumentAttributes {
  declare id: string;
  declare project_id: string;
  declare tenant_id: string;
  declare name: string;
  declare mime_type: string | null;
  declare source: string | null;
  declare status: GovProposalSourceStatus;
  declare approved: boolean;
  declare approved_by_identity_id: string | null;
  declare uploaded_by_identity_id: string | null;
  declare extracted_chars: number;
  declare truncated: boolean;
  declare chunk_count: number;
  declare embedded_count: number;
  declare created_at: Date;
  declare updated_at: Date;
}

GovProposalSourceDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.TEXT, allowNull: false },
    mime_type: { type: DataTypes.TEXT, allowNull: true },
    source: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'ready' },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    uploaded_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    extracted_chars: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    truncated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    chunk_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    embedded_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'gov_proposal_source_documents',
    timestamps: false,
    indexes: [{ fields: ['project_id'] }],
  }
);

export default GovProposalSourceDocument;
