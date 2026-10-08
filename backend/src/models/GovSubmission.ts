import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The submission + outcome state for ONE gov delivery project (P5). A per-project singleton (UNIQUE
 * delivery_project_id) that carries the submission lifecycle, the exported package manifest, the manually-recorded
 * external receipt, the win/loss outcome, and the PRIVATE reusable candidates (a case-study candidate + a
 * service-capability candidate) generated for BOTH won and lost.
 *
 * HONESTY RAILS (spec §5):
 *  - Submission lifecycle: preparing → needs_review → ready → exported → externally_submitted → acknowledged.
 *    EXPORTED ≠ SUBMITTED: the agent may assemble + export the package, but marking it externally_submitted /
 *    acknowledged is a MANUAL operator act (there is no external submission here). You cannot export an unready
 *    proposal (responses not all approved / coverage insufficient), and cannot mark submitted what was not exported.
 *  - Outcome: pending | won | lost | withdrawn | no_bid | unknown — recorded, never fabricated.
 *  - The candidates are born PRIVATE ('candidate' / 'suggested') and are NEVER published: the agent writes them
 *    here as JSONB, it does not create a published case_studies row or a live service_offerings row. A human
 *    promotes a candidate later.
 */
export type SubmissionStatus = 'preparing' | 'needs_review' | 'ready' | 'exported' | 'externally_submitted' | 'acknowledged';
export type SubmissionOutcome = 'pending' | 'won' | 'lost' | 'withdrawn' | 'no_bid' | 'unknown';

export interface GovSubmissionAttributes {
  id?: string;
  delivery_project_id: string;
  status: SubmissionStatus;
  outcome: SubmissionOutcome;
  /** The manifest of the last export: { exportedAt, responseCount, items:[{requirementId,status,contentSha256,figures}] }. */
  export_manifest: any | null;
  exported_at: Date | null;
  /** The MANUALLY-recorded external submission receipt (a confirmation number / portal ref). Never auto-filled. */
  external_ref: string | null;
  externally_submitted_at: Date | null;
  acknowledged_ref: string | null;
  acknowledged_at: Date | null;
  outcome_note: string | null;
  outcome_recorded_at: Date | null;
  /** PRIVATE case-study candidate (status 'candidate'); never a published case_studies row. */
  case_study_candidate: any | null;
  /** PRIVATE service-capability candidate (state 'suggested'); never a live service_offerings row. */
  service_capability_candidate: any | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovSubmission extends Model<GovSubmissionAttributes> implements GovSubmissionAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare status: SubmissionStatus;
  declare outcome: SubmissionOutcome;
  declare export_manifest: any | null;
  declare exported_at: Date | null;
  declare external_ref: string | null;
  declare externally_submitted_at: Date | null;
  declare acknowledged_ref: string | null;
  declare acknowledged_at: Date | null;
  declare outcome_note: string | null;
  declare outcome_recorded_at: Date | null;
  declare case_study_candidate: any | null;
  declare service_capability_candidate: any | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovSubmission.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'preparing' },
    outcome: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    export_manifest: { type: DataTypes.JSONB, allowNull: true },
    exported_at: { type: DataTypes.DATE, allowNull: true },
    external_ref: { type: DataTypes.TEXT, allowNull: true },
    externally_submitted_at: { type: DataTypes.DATE, allowNull: true },
    acknowledged_ref: { type: DataTypes.TEXT, allowNull: true },
    acknowledged_at: { type: DataTypes.DATE, allowNull: true },
    outcome_note: { type: DataTypes.TEXT, allowNull: true },
    outcome_recorded_at: { type: DataTypes.DATE, allowNull: true },
    case_study_candidate: { type: DataTypes.JSONB, allowNull: true },
    service_capability_candidate: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovSubmission',
    tableName: 'gov_submission',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id'] }],
  },
);

export default GovSubmission;
