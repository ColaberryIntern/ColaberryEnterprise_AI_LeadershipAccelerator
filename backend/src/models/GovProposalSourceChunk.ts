import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One embedded chunk of a {@link GovProposalSourceDocument}. The `embedding` is a pgvector(1536) column, nullable so a
 * chunk is still stored when the embedding proxy is unavailable (it can be re-embedded later).
 *
 * NOTE: rows are INSERTED and vector-SEARCHED via raw SQL in `govProposalSources.ts` (the pgvector `::vector` cast and
 * `<=>` operator), the same pattern `vectorMemory.ts` uses for `intelligence_memory`. This model is for typed reads and
 * plain-field access; do not rely on it to serialize the `embedding` array on create.
 */
interface GovProposalSourceChunkAttributes {
  id?: string;
  document_id: string;
  project_id: string;
  tenant_id: string;
  chunk_index: number;
  text: string;
  token_estimate?: number;
  embedding?: number[] | null;
  created_at?: Date;
}

class GovProposalSourceChunk extends Model<GovProposalSourceChunkAttributes> implements GovProposalSourceChunkAttributes {
  declare id: string;
  declare document_id: string;
  declare project_id: string;
  declare tenant_id: string;
  declare chunk_index: number;
  declare text: string;
  declare token_estimate: number;
  declare embedding: number[] | null;
  declare created_at: Date;
}

GovProposalSourceChunk.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: { type: DataTypes.UUID, allowNull: false },
    project_id: { type: DataTypes.UUID, allowNull: false },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    chunk_index: { type: DataTypes.INTEGER, allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },
    token_estimate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    embedding: { type: 'vector(1536)' as any, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'gov_proposal_source_chunks',
    timestamps: false,
    indexes: [{ fields: ['project_id'] }, { fields: ['document_id'] }],
  }
);

export default GovProposalSourceChunk;
