import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyScoreSnapshot — one row per subject per brand per day, so a
 * score or a state can be explained months later
 * (§6.1 `growth_journey_score_snapshots`; Phase 3 T301).
 *
 * ─── APPEND-ONLY, AND UNIQUE PER DAY ────────────────────────────────────────
 *
 * No `updated_at`: a snapshot is what was true on `as_of_date`, and rewriting it
 * would destroy the only record of what the Governor actually saw. The unique
 * key `(brand_id, subject_ref, as_of_date)` makes a re-run of the same day
 * idempotent — it lands on the existing row instead of a second one.
 *
 * Explorer's `explorer_score_snapshots` is the precedent, and its gap is the
 * reason this one differs: it has three fixed score columns and **no unique
 * index at all**, so a second run that day silently doubles the history. Here
 * the index is declared in the DDL and mirrored on the model, and the parity
 * test asserts both.
 *
 * `scores` is nullable and `score_gaps` carries the reasons, because a subject
 * with no score source — a CPN lead, for instance — still gets a snapshot
 * saying so. An absent score is recorded as absent, never as zero.
 */

export interface GrowthJourneyScoreSnapshotAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  subject_ref: string;
  as_of_date: string;
  state?: string | null;
  overlays?: string[];
  scores?: Record<string, unknown> | null;
  score_gaps?: string[];
  created_at?: Date;
}

class GrowthJourneyScoreSnapshot
  extends Model<GrowthJourneyScoreSnapshotAttributes>
  implements GrowthJourneyScoreSnapshotAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare subject_ref: string;
  declare as_of_date: string;
  declare state: string | null;
  declare overlays: string[];
  declare scores: Record<string, unknown> | null;
  declare score_gaps: string[];
  declare created_at: Date;
}

GrowthJourneyScoreSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    as_of_date: { type: DataTypes.DATEONLY, allowNull: false },
    state: { type: DataTypes.STRING(48), allowNull: true },
    overlays: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    scores: { type: DataTypes.JSONB, allowNull: true },
    score_gaps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  },
  {
    sequelize,
    tableName: 'growth_journey_score_snapshots',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        name: 'growth_journey_snapshots_subject_date_unique',
        fields: ['brand_id', 'subject_ref', 'as_of_date'],
      },
    ],
  },
);

export default GrowthJourneyScoreSnapshot;
