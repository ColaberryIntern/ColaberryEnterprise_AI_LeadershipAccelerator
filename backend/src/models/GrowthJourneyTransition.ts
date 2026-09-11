import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyTransition — the history of how a subject moved between
 * programmes, paths and brands (§6.1 "state/path/program transition history";
 * Phase 2 T222).
 *
 * ─── ALSO THE HOME OF A CROSS-BRAND REFERRAL REQUEST ────────────────────────
 *
 * A referral from one brand to another is a brand transition that has been
 * ASKED FOR and not yet made, so it is a row here with `transition_type
 * 'brand_referral_requested'` and `status 'requested'` rather than a fourteenth
 * §6.1 entity. Phase 2 only ever writes the request. The approval that creates
 * the second `lead_tenant_contexts` row is Phase 4's and independently gated
 * (spec §14); when it lands it is a NEW row referencing this one, because —
 *
 * ─── APPEND-ONLY ────────────────────────────────────────────────────────────
 *
 * — rows are never updated or deleted (§6.4). No `updated_at`, and the tests'
 * source scan asserts nothing under `services/growthJourney/` calls `.update(`
 * or `.destroy(` on this model. `idempotency_key` is unique, so a replayed
 * request or assignment lands on the existing row instead of a second one.
 */

export type GrowthJourneyTransitionType =
  | 'program_assigned'
  | 'path_assigned'
  | 'path_changed'
  | 'brand_referral_requested';

export type GrowthJourneyTransitionStatus = 'applied' | 'requested';

export interface GrowthJourneyTransitionAttributes {
  id?: string;
  tenant_id: string;
  /** The brand the subject is moving FROM (or is in, for a path change). */
  brand_id: string;
  program_id?: string | null;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  transition_type: GrowthJourneyTransitionType;
  from_value?: Record<string, unknown> | null;
  to_value?: Record<string, unknown> | null;
  status: GrowthJourneyTransitionStatus;
  reason: string;
  evidence?: string[];
  /** `classifier` | `routing_rule:<id>` | `human:<admin id>` */
  requested_by: string;
  idempotency_key: string;
  created_at?: Date;
}

export class GrowthJourneyTransition
  extends Model<GrowthJourneyTransitionAttributes>
  implements GrowthJourneyTransitionAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string | null;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare transition_type: GrowthJourneyTransitionType;
  declare from_value: Record<string, unknown> | null;
  declare to_value: Record<string, unknown> | null;
  declare status: GrowthJourneyTransitionStatus;
  declare reason: string;
  declare evidence: string[];
  declare requested_by: string;
  declare idempotency_key: string;
  declare readonly created_at: Date;
}

GrowthJourneyTransition.init(
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
    program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'journey_programs', key: 'id' },
    },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    // Typed anchors, not foreign keys — see GrowthJourneyEnrollment.
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    transition_type: { type: DataTypes.STRING(32), allowNull: false },
    from_value: { type: DataTypes.JSONB, allowNull: true },
    to_value: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    requested_by: { type: DataTypes.TEXT, allowNull: false },
    idempotency_key: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    tableName: 'growth_journey_transitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        name: 'growth_journey_transitions_idempotency_unique',
        fields: ['idempotency_key'],
      },
    ],
  },
);

export default GrowthJourneyTransition;
