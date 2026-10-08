import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A proposal RESPONSE authored against one established requirement (P4 proposal production). The response
 * checklist derives one slot per established requirement (responseSlots.ts); this is the persisted answer that
 * overlays a slot — its drafted content, any commit-bound figures, and its review lifecycle.
 *
 * Lifecycle (honest, reviewer-gated): `draft` (being authored) → `reviewed` (a reviewer passed it) → `approved`
 * (final sign-off); `revision_required` is the kickback (a reviewer sends it back, OR a material amendment to the
 * requirement invalidates it). ANY edit to the content resets the status to `draft` — a changed answer is not a
 * reviewed/approved one. The agent NEVER advances the lifecycle on its own: approval is a human act.
 *
 * Keyed (delivery_project_id, requirement_id) UNIQUE — exactly one response per requirement; a re-save upserts in
 * place. Mirrors the additive, idempotent pattern of gov_build_story_assignment.
 */
export interface ResponseFigureAttr {
  /** The git commit the figure was captured at — the provenance binding (a figure without it is not commit-bound). */
  commit: string;
  /** The figure reference (a repo path, a screenshot id/url). Opaque; reviewed, never self-attested. */
  ref: string;
  caption: string;
}

export type ProposalResponseStatusAttr = 'draft' | 'reviewed' | 'approved' | 'revision_required';

export interface GovProposalResponseAttributes {
  id?: string;
  delivery_project_id: string;
  /** The established requirement this response answers (the slot anchor + traceability spine). */
  requirement_id: string;
  content: string;
  status: ProposalResponseStatusAttr;
  /** Commit-bound figures attached to the response. JSONB array of {commit, ref, caption}. */
  figures: ResponseFigureAttr[];
  authored_by_identity_id: string | null;
  reviewed_by_identity_id: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovProposalResponse extends Model<GovProposalResponseAttributes> implements GovProposalResponseAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare requirement_id: string;
  declare content: string;
  declare status: ProposalResponseStatusAttr;
  declare figures: ResponseFigureAttr[];
  declare authored_by_identity_id: string | null;
  declare reviewed_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovProposalResponse.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    requirement_id: { type: DataTypes.STRING(120), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    figures: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    authored_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    reviewed_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovProposalResponse',
    tableName: 'gov_proposal_response',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id', 'requirement_id'] }],
  },
);

export default GovProposalResponse;
