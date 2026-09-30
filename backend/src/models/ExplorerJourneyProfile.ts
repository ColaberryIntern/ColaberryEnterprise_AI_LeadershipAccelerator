import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type {
  ExplorerPrimaryState,
  ExplorerOverlay,
  ExplorerContactability,
  ExplorerAffinity,
} from '../types/explorerGrowth';

/**
 * explorer_journey_profiles — one MUTABLE row per free Explorer.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §5.4 T1.
 *
 * This table is the identity bridge. `enrollments` is UUID-keyed and owns the
 * learner; `leads` is INTEGER-keyed and owns campaign membership; today they are
 * joined only by a best-effort lowercased-email lookup inside a try/catch in
 * enrollmentService.createExplorerEnrollment. Persisting `lead_id` here makes
 * that link durable and repairable instead of recomputed and silently missing.
 *
 * The PK is `enrollment_id`, not a synthetic `id` — there is exactly one profile
 * per learner, and making that a database fact removes a whole class of
 * duplicate-profile bug.
 *
 * Scores are never incrementally mutated; they are recomputed wholesale from
 * source tables, which is what makes shadow mode replayable (CLAUDE.md
 * idempotency). Created explicitly via ensureExplorerGrowthSchema() — prod does
 * not run sequelize.sync.
 */
interface ExplorerJourneyProfileAttributes {
  enrollment_id: string;
  lead_id?: number | null;
  email_normalized: string;
  primary_state?: ExplorerPrimaryState;
  overlays?: ExplorerOverlay[];
  e_score?: number;
  i_score?: number;
  f_score?: number;
  contactability?: ExplorerContactability;
  affinities?: ExplorerAffinity[];
  signal_summary?: Record<string, any>;
  days_since_last_activity?: number | null;
  state_entered_at?: Date | null;
  last_decision_at?: Date | null;
  last_contacted_at?: Date | null;
  scores_computed_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class ExplorerJourneyProfile
  extends Model<ExplorerJourneyProfileAttributes>
  implements ExplorerJourneyProfileAttributes
{
  declare enrollment_id: string;
  declare lead_id: number | null;
  declare email_normalized: string;
  declare primary_state: ExplorerPrimaryState;
  declare overlays: ExplorerOverlay[];
  declare e_score: number;
  declare i_score: number;
  declare f_score: number;
  declare contactability: ExplorerContactability;
  declare affinities: ExplorerAffinity[];
  declare signal_summary: Record<string, any>;
  declare days_since_last_activity: number | null;
  declare state_entered_at: Date | null;
  declare last_decision_at: Date | null;
  declare last_contacted_at: Date | null;
  declare scores_computed_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

ExplorerJourneyProfile.init(
  {
    enrollment_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      comment: 'The identity bridge. Null means unresolved — surfaced, never silently ignored.',
    },
    email_normalized: { type: DataTypes.STRING(255), allowNull: false },
    primary_state: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'NEW_EXPLORER',
    },
    overlays: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    e_score: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    i_score: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    f_score: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    contactability: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    affinities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    signal_summary: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    days_since_last_activity: { type: DataTypes.SMALLINT, allowNull: true },
    state_entered_at: { type: DataTypes.DATE, allowNull: true },
    last_decision_at: { type: DataTypes.DATE, allowNull: true },
    last_contacted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Learner-side. Distinct from leads.last_contacted_at, which is CRM-side.',
    },
    scores_computed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Staleness marker. The Governor refuses to decide on a stale profile.',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'explorer_journey_profiles',
    timestamps: false,
  },
);

export default ExplorerJourneyProfile;
