import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyClassification — one answer to "which brand relationship, which
 * programme, which path?" for a subject, with the evidence that produced it
 * (§6.1, §7.1; Phase 2 T222).
 *
 * ─── APPEND-ONLY ────────────────────────────────────────────────────────────
 *
 * Rows are never updated or deleted (§6.4). A reclassification is a NEW row; a
 * human override is a NEW row with `source_step = 1`, `decided_by` set and
 * `override_of` pointing at the row it supersedes. The model declares no
 * `updated_at` on purpose, and a source scan in the tests asserts nothing under
 * `services/growthJourney/` calls `.update(` or `.destroy(` on it. The history
 * of how a subject was understood is therefore complete and cannot be edited
 * into looking cleaner than it was.
 *
 * ─── WHO IS AUTHORITATIVE FOR WHAT ──────────────────────────────────────────
 *
 * `primary_path` is an offer-family slug that has ALREADY been checked against
 * `brand_offer_policies` by the writer; `eligibility` stores that decision. The
 * model, the rule tables and a human override are all subject to the same
 * check — the only authority on a brand boundary is the policy table. An AI
 * proposal that failed it is stored with the path dropped and `status
 * 'proposed'`, never anything stronger.
 *
 * `source_step` is the §7.1 step (1-8) that produced the answer; `ai_involved`
 * and `model_version` say whether a model took part and which one, so a Why
 * view can state it rather than infer it.
 */

export type GrowthJourneyClassificationTrigger =
  | 'lead_ingest'
  | 'reply'
  | 'form'
  | 'manual'
  | 'replay';

export type GrowthJourneyClassificationStatus =
  | 'proposed'
  | 'needs_review'
  | 'confirmed'
  | 'rejected';

export interface GrowthJourneyClassificationAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  trigger: GrowthJourneyClassificationTrigger;
  input_hash: string;
  brand_relationship?: string | null;
  journey_program_slug?: string | null;
  primary_path?: string | null;
  secondary_paths?: string[];
  intent?: string | null;
  confidence?: number | null;
  evidence?: string[];
  source_step: number;
  requires_human_review?: boolean;
  status: GrowthJourneyClassificationStatus;
  locked?: boolean;
  eligibility?: Record<string, unknown> | null;
  referral_target_brand_id?: string | null;
  ai_involved?: boolean;
  model_version?: string | null;
  ruleset_version: string;
  override_of?: string | null;
  decided_by?: string | null;
  idempotency_key: string;
  created_at?: Date;
}

export class GrowthJourneyClassification
  extends Model<GrowthJourneyClassificationAttributes>
  implements GrowthJourneyClassificationAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare trigger: GrowthJourneyClassificationTrigger;
  declare input_hash: string;
  declare brand_relationship: string | null;
  declare journey_program_slug: string | null;
  declare primary_path: string | null;
  declare secondary_paths: string[];
  declare intent: string | null;
  declare confidence: number | null;
  declare evidence: string[];
  declare source_step: number;
  declare requires_human_review: boolean;
  declare status: GrowthJourneyClassificationStatus;
  declare locked: boolean;
  declare eligibility: Record<string, unknown> | null;
  declare referral_target_brand_id: string | null;
  declare ai_involved: boolean;
  declare model_version: string | null;
  declare ruleset_version: string;
  declare override_of: string | null;
  declare decided_by: string | null;
  declare idempotency_key: string;
  declare readonly created_at: Date;
}

GrowthJourneyClassification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    brand_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'brands', key: 'id' },
    },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    // Typed anchors beside the derived key, NOT foreign keys — the
    // GrowthJourneyEnrollment precedent and §6.4's mixed-key rule.
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    trigger: { type: DataTypes.STRING(24), allowNull: false },
    input_hash: { type: DataTypes.TEXT, allowNull: false },
    brand_relationship: { type: DataTypes.STRING(64), allowNull: true },
    journey_program_slug: { type: DataTypes.STRING(64), allowNull: true },
    primary_path: { type: DataTypes.STRING(64), allowNull: true },
    secondary_paths: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    intent: { type: DataTypes.TEXT, allowNull: true },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    source_step: { type: DataTypes.SMALLINT, allowNull: false },
    requires_human_review: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    eligibility: { type: DataTypes.JSONB, allowNull: true },
    referral_target_brand_id: { type: DataTypes.UUID, allowNull: true },
    ai_involved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    model_version: { type: DataTypes.TEXT, allowNull: true },
    ruleset_version: { type: DataTypes.STRING(16), allowNull: false },
    override_of: { type: DataTypes.UUID, allowNull: true },
    decided_by: { type: DataTypes.TEXT, allowNull: true },
    idempotency_key: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    tableName: 'growth_journey_classifications',
    // Append-only: a creation timestamp and nothing else. See the header.
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        name: 'growth_journey_classifications_idempotency_unique',
        fields: ['idempotency_key'],
      },
    ],
  },
);

export default GrowthJourneyClassification;
