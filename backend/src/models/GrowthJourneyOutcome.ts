import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyOutcome — one normalised thing that happened to a subject
 * (§6.1 `growth_journey_outcomes`; §13 the handoff rates; Phase 4 T401).
 *
 * ─── AN INDEX OVER TRUTHS THAT ALREADY EXIST ────────────────────────────────
 *
 * A reply, a meeting booked or completed or missed, a decline, a pipeline
 * stage, a paid enrolment, an active subscription, a project started, a
 * handoff accepted or dispositioned. Every one of these is ALREADY recorded
 * somewhere — `interaction_outcomes`, `strategy_calls`, `leads.pipeline_stage`,
 * `enrollments`, `subscriptions`, `delivery_engagements`, this run's own
 * handoffs — and this table is the one place they can be read together. It
 * is not a new source of truth about a person: `source` names the record it
 * was read from and `source_ref` identifies that record.
 *
 * ─── APPEND-ONLY ────────────────────────────────────────────────────────────
 *
 * No `updated_at`. `(source, source_ref)` is unique, so the same source row
 * normalised twice is one outcome (`replayed: true` from the recorder) rather
 * than two. A corrected outcome is a new row from a new source record, never
 * an edit; the append-only guard's model pattern names this model so a
 * `.update(` / `.destroy(` on it fails the guard.
 *
 * ─── MISSING IS NOT ZERO ────────────────────────────────────────────────────
 *
 * A subject with no outcome rows has no known outcome. The §13 rates read
 * from here report "no evidence" for that case; they never count it as a
 * decline, a no-show or a loss.
 */

export type GrowthJourneyOutcomeType =
  | 'reply'
  | 'meeting_booked'
  | 'meeting_completed'
  | 'meeting_no_show'
  | 'declined'
  | 'opportunity_stage'
  | 'enrolled_paid'
  | 'subscription_active'
  | 'project_started'
  | 'handoff_accepted'
  | 'handoff_dispositioned'
  // Phase 5 T512: what the campaign engine did with a receipt's send, one per scheduled row; `contact_replied` is
  // recorded by the reply path (T515), never by the reconciler.
  | 'contact_sent'
  | 'contact_blocked'
  | 'contact_failed'
  | 'contact_replied';

export type GrowthJourneyOutcomeSource =
  | 'interaction_outcomes'
  | 'appointments'
  | 'strategy_calls'
  | 'leads.pipeline_stage'
  | 'enrollments'
  | 'subscriptions'
  | 'delivery_engagements'
  | 'growth_journey_handoffs'
  | 'growth_journey_executions';

export interface GrowthJourneyOutcomeAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  subject_ref: string;
  lead_id?: number | null;
  handoff_id?: string | null;
  decision_id?: string | null;
  outcome_type: GrowthJourneyOutcomeType;
  source: GrowthJourneyOutcomeSource;
  source_ref: string;
  occurred_at: Date;
  value?: number | string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: Date;
}

class GrowthJourneyOutcome
  extends Model<GrowthJourneyOutcomeAttributes>
  implements GrowthJourneyOutcomeAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare handoff_id: string | null;
  declare decision_id: string | null;
  declare outcome_type: GrowthJourneyOutcomeType;
  declare source: GrowthJourneyOutcomeSource;
  declare source_ref: string;
  declare occurred_at: Date;
  declare value: number | string | null;
  declare metadata: Record<string, unknown> | null;
  declare created_at: Date;
}

GrowthJourneyOutcome.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    handoff_id: { type: DataTypes.UUID, allowNull: true },
    decision_id: { type: DataTypes.UUID, allowNull: true },
    outcome_type: { type: DataTypes.STRING(32), allowNull: false },
    source: { type: DataTypes.STRING(32), allowNull: false },
    source_ref: { type: DataTypes.STRING(160), allowNull: false },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    value: { type: DataTypes.DECIMAL, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'growth_journey_outcomes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        name: 'growth_journey_outcomes_source_unique',
        fields: ['source', 'source_ref'],
      },
    ],
  },
);

export default GrowthJourneyOutcome;
