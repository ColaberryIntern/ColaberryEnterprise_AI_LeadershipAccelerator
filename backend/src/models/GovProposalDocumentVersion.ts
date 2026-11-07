import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ProposalDocumentSection } from '../services/factory/proposal/govProposalDocuments';
import type { CheckScores, CheckFinding, VersionAuthorKind } from '../services/factory/proposal/proposalReviewTypes';

/**
 * An IMMUTABLE version of a proposal document (Proposal Studio P3). Every save — the agent drafting or a human
 * editing — inserts a new row; rows are never updated, so the full history (content, scores, findings, pass verdict,
 * real page count) is kept and two versions can be diffed. `gov_proposal_documents.current_version_id` points at the
 * latest. Schema: db/ensureGovProposalReviewSchema.ts.
 */
export interface GovProposalDocumentVersionAttributes {
  id?: string;
  document_id: string;
  version: number;
  content_html: string | null;
  sections_json: ProposalDocumentSection[];
  author_kind: VersionAuthorKind;
  author_identity_id: string | null;
  change_summary: string | null;
  check_scores: Partial<CheckScores>;
  findings: CheckFinding[];
  passes: boolean;
  page_count: number | null;
  /** v3 T11: the independent judge run ids recorded for this version's scoring (evaluator/proof/clarity). */
  judge_run_ids?: string[] | null;
  created_at?: Date;
}

class GovProposalDocumentVersion extends Model<GovProposalDocumentVersionAttributes> implements GovProposalDocumentVersionAttributes {
  declare id: string;
  declare document_id: string;
  declare version: number;
  declare content_html: string | null;
  declare sections_json: ProposalDocumentSection[];
  declare author_kind: VersionAuthorKind;
  declare author_identity_id: string | null;
  declare change_summary: string | null;
  declare check_scores: Partial<CheckScores>;
  declare findings: CheckFinding[];
  declare passes: boolean;
  declare page_count: number | null;
  declare judge_run_ids: string[] | null;
  declare created_at: Date;
}

GovProposalDocumentVersion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    content_html: { type: DataTypes.TEXT, allowNull: true },
    sections_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    author_kind: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'agent' },
    author_identity_id: { type: DataTypes.UUID, allowNull: true },
    change_summary: { type: DataTypes.TEXT, allowNull: true },
    check_scores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    findings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    passes: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    page_count: { type: DataTypes.INTEGER, allowNull: true },
    judge_run_ids: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovProposalDocumentVersion',
    tableName: 'gov_proposal_document_versions',
    timestamps: false,
    indexes: [{ unique: true, fields: ['document_id', 'version'] }],
  },
);

export default GovProposalDocumentVersion;
