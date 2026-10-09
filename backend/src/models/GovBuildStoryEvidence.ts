import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A student's completion evidence for one Build-track story — the "evidence hand-in" (P3-T3). The student
 * (an assigned associate_builder) SUBMITS a description + an optional artifact reference (a repo link / screenshot
 * id) for a story, traced to the requirement it builds. It is recorded `submitted`, NEVER `verified`: the student
 * cannot self-verify — only a reviewer holding `evidence.verify` (which an associate_builder does NOT hold) moves
 * it to `verified`/`rejected`. The hand-in is the student's claim; verification is a separate, gated human act.
 *
 * Keyed to the delivery project + the story id, so evidence survives refresh and maps a completed story back to
 * its requirement (the traceability spine). Mirrors the additive, idempotent ensure-schema pattern of
 * gov_source_bundles.
 */
export interface GovBuildStoryEvidenceAttributes {
  id?: string;
  delivery_project_id: string;
  /** The Build story this evidence is for (STORY-<canonical_req_id>). */
  story_id: string;
  /** The requirement the story builds — the traceability anchor. */
  canonical_req_id: string;
  description: string;
  /** Optional reference to the artifact (a repo commit/PR url, a screenshot id) — reviewed, never self-attested. */
  artifact_ref: string | null;
  /** submitted → awaiting review; verified/rejected are set ONLY by a reviewer with evidence.verify. */
  status: 'submitted' | 'verified' | 'rejected';
  submitted_by_identity_id: string;
  submitted_at?: Date;
  reviewed_by_identity_id: string | null;
  reviewed_at: Date | null;
}

class GovBuildStoryEvidence extends Model<GovBuildStoryEvidenceAttributes> implements GovBuildStoryEvidenceAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare story_id: string;
  declare canonical_req_id: string;
  declare description: string;
  declare artifact_ref: string | null;
  declare status: 'submitted' | 'verified' | 'rejected';
  declare submitted_by_identity_id: string;
  declare submitted_at: Date;
  declare reviewed_by_identity_id: string | null;
  declare reviewed_at: Date | null;
}

GovBuildStoryEvidence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    story_id: { type: DataTypes.STRING(120), allowNull: false },
    canonical_req_id: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    artifact_ref: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'submitted' },
    submitted_by_identity_id: { type: DataTypes.UUID, allowNull: false },
    submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reviewed_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'GovBuildStoryEvidence',
    tableName: 'gov_build_story_evidence',
    timestamps: false,
    indexes: [{ fields: ['delivery_project_id', 'story_id'] }],
  },
);

export default GovBuildStoryEvidence;
