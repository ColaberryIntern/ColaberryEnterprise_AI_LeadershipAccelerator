import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryExperienceClaim — a claim a builder has actually earned.
 *
 * `experienceLedger.ts` shipped as pure logic with no table: claim types, rubrics, evidence
 * bands and `evaluateClaim`, and nowhere for an earned claim to live. Scenario A's
 * observable is *an `experience_claims` row that is earned, traceable to a
 * `delivery_evidence` row* — and there was nothing to observe.
 *
 * ## `evidence_id` is the reason this table is worth having
 *
 * A claim exists only as a consequence of one specific evidence row. Storing that id rather
 * than a copy of the verdict is what lets someone later go and look at what actually
 * happened. A ledger of claims with no traceable backing is a list of assertions, and it
 * would be indistinguishable from one somebody typed in.
 *
 * ## `builder_did_the_work` is NOT NULL deliberately
 *
 * Master plan §Gate 11: **no credit solely for attendance.** `evaluateClaim` rejects an
 * explicit `false` — but an *omitted* value passes that check, because the field is
 * optional on `ClaimCandidate`. At the persistence layer the column refuses to be absent,
 * so a claim can never be earned because nobody said otherwise. That is the same failure
 * the rule exists to prevent, arriving through a different door.
 */
export interface DeliveryExperienceClaimAttributes {
  id: string;
  builder_identity_id: string;
  delivery_project_id: string;
  /** The delivery_evidence row this claim is a consequence of. */
  evidence_id: string;
  claim_type: string;
  band: string;
  evidence_type: string;
  evidence_outcome: string;
  human_confirmed: boolean;
  builder_did_the_work: boolean;
  /** Who stood behind the builder-did-the-work attestation. */
  attested_by_identity_id: string | null;
  created_at: Date;
  updated_at: Date;
}

class DeliveryExperienceClaim
  extends Model<DeliveryExperienceClaimAttributes>
  implements DeliveryExperienceClaimAttributes
{
  declare id: string;
  declare builder_identity_id: string;
  declare delivery_project_id: string;
  declare evidence_id: string;
  declare claim_type: string;
  declare band: string;
  declare evidence_type: string;
  declare evidence_outcome: string;
  declare human_confirmed: boolean;
  declare builder_did_the_work: boolean;
  declare attested_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryExperienceClaim.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    builder_identity_id: { type: DataTypes.UUID, allowNull: false },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    evidence_id: { type: DataTypes.UUID, allowNull: false },
    claim_type: { type: DataTypes.STRING(60), allowNull: false },
    band: { type: DataTypes.STRING(20), allowNull: false },
    // Copied from the evidence row at claim time so the ledger records what the claim was
    // judged on, even if the evidence row is later superseded.
    evidence_type: { type: DataTypes.STRING(40), allowNull: false },
    evidence_outcome: { type: DataTypes.STRING(20), allowNull: false },
    human_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // No default. See the header: an omitted value is how attendance becomes credit.
    builder_did_the_work: { type: DataTypes.BOOLEAN, allowNull: false },
    attested_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_experience_claims',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['builder_identity_id', 'claim_type', 'evidence_id'],
        name: 'delivery_experience_claims_unique',
      },
      { fields: ['builder_identity_id', 'claim_type'], name: 'idx_delivery_experience_claims_builder' },
    ],
  },
);

export default DeliveryExperienceClaim;
