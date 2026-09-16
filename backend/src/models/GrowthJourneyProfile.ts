import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyProfile — where a subject currently stands in one brand's
 * journey: lifecycle state, overlays, score vector and staleness
 * (§6.1 `growth_journey_profiles`; Phase 3 T301).
 *
 * ─── THE ONE MUTABLE TABLE THIS RUN OWNS ────────────────────────────────────
 *
 * Every other growth-journey table is append-only. This one is a PROJECTION of
 * the current state, not a ledger, so it is updated in place — and every state
 * change it records also writes an append-only `growth_journey_transitions` row
 * of type `state_changed`. The history lives there; this is the answer to "where
 * are they now". It therefore keeps `updated_at`, deliberately, and it is NOT
 * in the append-only source scan.
 *
 * ─── WHY NOT `explorer_journey_profiles` ────────────────────────────────────
 *
 * That table is the right shape and the wrong scope: its primary key is an
 * `enrollments.id`, so it can only describe a learner who is enrolled in the
 * curriculum, and it has three fixed score columns (`e_score`, `i_score`,
 * `f_score`) that mean nothing to a business lifecycle. Here the key is
 * `(brand_id, subject_ref)` — one person can stand in a different place in each
 * brand, which §3.3 requires — and `scores` is JSONB because §5.3 and §5.4
 * name ten and nine named dimensions respectively, not three.
 *
 * ─── `scores_computed_at` IS A STALENESS MARKER, AND NULLABLE ───────────────
 *
 * Explorer's freshness gate refuses to decide on a profile whose scores are
 * older than 26 hours, and distinguishes "never scored" from "stale". Null here
 * means never scored — which is the honest state for a CPN subject, who has no
 * score source at all. `scores` may be null with `score_gaps` listing why; a
 * dimension with no source in this codebase is recorded as a gap, never as a
 * zero.
 */

export interface GrowthJourneyProfileAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  program_id?: string | null;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  state: string;
  state_entered_at?: Date;
  overlays?: string[];
  scores?: Record<string, unknown> | null;
  score_gaps?: string[];
  scores_computed_at?: Date | null;
  signals_summary?: Record<string, unknown> | null;
  last_decision_at?: Date | null;
  source: string;
  created_at?: Date;
  updated_at?: Date;
}

class GrowthJourneyProfile
  extends Model<GrowthJourneyProfileAttributes>
  implements GrowthJourneyProfileAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string | null;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare state: string;
  declare state_entered_at: Date;
  declare overlays: string[];
  declare scores: Record<string, unknown> | null;
  declare score_gaps: string[];
  declare scores_computed_at: Date | null;
  declare signals_summary: Record<string, unknown> | null;
  declare last_decision_at: Date | null;
  declare source: string;
  declare created_at: Date;
  declare updated_at: Date;
}

GrowthJourneyProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: true },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    state: { type: DataTypes.STRING(48), allowNull: false },
    state_entered_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    overlays: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    scores: { type: DataTypes.JSONB, allowNull: true },
    score_gaps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    scores_computed_at: { type: DataTypes.DATE, allowNull: true },
    signals_summary: { type: DataTypes.JSONB, allowNull: true },
    last_decision_at: { type: DataTypes.DATE, allowNull: true },
    source: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    tableName: 'growth_journey_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'growth_journey_profiles_brand_subject_unique',
        fields: ['brand_id', 'subject_ref'],
      },
    ],
  },
);

export default GrowthJourneyProfile;
