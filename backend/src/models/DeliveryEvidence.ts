import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type {
  DeliveryEvidenceOutcome,
  DeliveryEvidenceType,
  QualityDimension,
} from '../modules/delivery/deliveryEvidence';

/**
 * DeliveryEvidence — the Quality OS ledger (master plan §Gate 9).
 *
 * ## Why this is not `EvidenceRecord`
 *
 * Gate 0's EVIDENCE_INTEGRATION_MAP found `evidence_records.enrollment_id` is NOT NULL.
 * A client project has no enrollment, so delivery evidence cannot live there. The two
 * alternatives were both worse: relaxing `enrollment_id` pushes a delivery concern into
 * the student progression path (master plan §24 lists "student Project behavior
 * regresses" as a stop condition), and widening its closed `EvidenceSource` union to
 * carry eleven delivery-only types would make the progression table answer two questions
 * at once.
 *
 * ## The one-way rule (master plan §2.5)
 *
 *   delivery_evidence ──(builder credit only)──▶ evidence_records
 *
 * The projection runs only for builder-credit events and reuses the SAME
 * `idempotency_key`, so a replayed execution callback produces at most one row on each
 * side. It never runs in reverse: student evidence does not become delivery evidence. A
 * builder without an enrollment simply produces no projected row — a supported outcome,
 * not an error. See `deliveryEvidenceProjection.ts`.
 *
 * ## Fields that carry weight
 *
 * `dimension` is **declared, not inferred**. A `test_run` could satisfy unit tests,
 * integration, acceptance or defects; if the gate inferred, one jest run would silently
 * claim four dimensions. `deliveryQualityGate` validates the declaration against
 * `DIMENSION_SATISFIED_BY`.
 *
 * `subject_sha` is what the measurement ran against. For SHA-pinned dimensions a passing
 * run against a different commit is not evidence about this one, and the gate says so.
 *
 * `outcome` includes `not_run` on purpose. A recorded `not_run` says "we looked and chose
 * not to measure," which is auditable; an absent row says nothing. Both fail the gate,
 * but only one of them is a decision.
 */
export interface DeliveryEvidenceAttributes {
  id?: string;
  delivery_project_id: string;
  /** No FK: `delivery_stories` does not exist yet. Same convention as execution runs. */
  story_id?: string | null;
  release_id?: string | null;
  execution_run_id?: string | null;
  dimension: QualityDimension;
  evidence_type: DeliveryEvidenceType;
  outcome: DeliveryEvidenceOutcome;
  /** Commit SHA the measurement ran against. */
  subject_sha?: string | null;
  /** Commit SHA, PR URL, CI run id, storage key. */
  source_ref?: string | null;
  /** Normalized summary. NEVER raw secrets and never a full log body. */
  payload?: any;
  recorded_by_identity_id?: string | null;
  idempotency_key: string;
  created_at?: Date;
}

class DeliveryEvidence extends Model<DeliveryEvidenceAttributes>
  implements DeliveryEvidenceAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare story_id: string | null;
  declare release_id: string | null;
  declare execution_run_id: string | null;
  declare dimension: QualityDimension;
  declare evidence_type: DeliveryEvidenceType;
  declare outcome: DeliveryEvidenceOutcome;
  declare subject_sha: string | null;
  declare source_ref: string | null;
  declare payload: any;
  declare recorded_by_identity_id: string | null;
  declare idempotency_key: string;
  declare created_at: Date;
}

DeliveryEvidence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    story_id: { type: DataTypes.UUID, allowNull: true },
    release_id: { type: DataTypes.UUID, allowNull: true },
    execution_run_id: { type: DataTypes.UUID, allowNull: true },
    dimension: { type: DataTypes.STRING(40), allowNull: false },
    evidence_type: { type: DataTypes.STRING(40), allowNull: false },
    outcome: { type: DataTypes.STRING(20), allowNull: false },
    subject_sha: { type: DataTypes.STRING(64), allowNull: true },
    source_ref: { type: DataTypes.TEXT, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: true },
    recorded_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    // Unique, exactly as `evidence_records` does it. Master plan §15: a replayed
    // execution callback must not produce a second row.
    idempotency_key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_evidence',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['delivery_project_id'] },
      { fields: ['story_id'] },
      { fields: ['release_id'] },
      { fields: ['dimension'] },
    ],
  },
);

export default DeliveryEvidence;
