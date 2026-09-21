import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyExecution — the receipt for one decision this run carried out
 * (§15 Phase 5; Phase 5 T503).
 *
 * ─── WHAT A RECEIPT IS FOR ──────────────────────────────────────────────────
 *
 * The existing campaign engine cannot promise exactly once: `scheduled_emails`
 * has no unique index, `campaign_leads`' unique pair lives only in its Sequelize
 * model, and the sequence's own de-dupe is a racy pre-count blind to rows already
 * sent. This row carries the guarantee instead — one per decision, keyed unique
 * on `decision_id`, with at most one OPEN row per person per brand per channel —
 * and it is what reconciliation reads back to say what the send path actually
 * did.
 *
 * ─── IT POINTS AT THE EXISTING ROWS, IT DOES NOT COPY THEM ──────────────────
 *
 * `campaign_id`, `sequence_id`, `scheduled_email_id` and `nudge_id` are ids in
 * other systems' tables, deliberately without foreign keys: those tables are not
 * this run's to constrain, and a receipt must outlive an archived campaign. The
 * row says WHICH rows and WHY — never a recipient, a subject line or a body.
 *
 * Mutable by design (a receipt moves through review, approval, enrolment and an
 * outcome), so `updated_at` is maintained and this model is outside the
 * append-only guard's pattern; every transition is also an `event_ledger` row.
 */

/** Review filed and waiting, or approved and not yet enrolled, or in flight. */
export type GrowthJourneyExecutionStatus =
  | 'pending_review'
  | 'approved'
  | 'enrolling'
  | 'enrolled'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'rejected';

/** The statuses that hold the one-open-per-person slot, and the DDL's partial predicate. */
export const OPEN_EXECUTION_STATUSES: readonly GrowthJourneyExecutionStatus[] = [
  'pending_review',
  'approved',
  'enrolling',
  'enrolled',
  'in_progress',
];

/** Only what a human has approved, or a bounded cohort, may execute. `live` is not reachable in Phase 5. */
export type GrowthJourneyExecutionMode = 'review' | 'limited';

/** Email and in-app are Phase 5's channels; Ali outreach is REVIEW-only; SMS and voice are refused by construction. */
export type GrowthJourneyExecutionChannel = 'email' | 'in_app' | 'ali_outreach';

export interface GrowthJourneyExecutionAttributes {
  id?: string;
  tenant_id: string;
  brand_id: string;
  program_id?: string | null;
  decision_id: string;
  subject_ref: string;
  lead_id?: number | null;
  enrollment_id?: string | null;
  channel: GrowthJourneyExecutionChannel;
  action_type: string;
  campaign_id?: string | null;
  campaign_key?: string | null;
  sequence_id?: string | null;
  mode: GrowthJourneyExecutionMode;
  status?: GrowthJourneyExecutionStatus;
  status_reason?: string | null;
  control_ids?: string[];
  proposal_id?: string | null;
  approved_by?: string | null;
  approved_at?: Date | null;
  claimed_at?: Date | null;
  attempts?: number;
  scheduled_email_id?: string | null;
  nudge_id?: string | null;
  outcome?: string | null;
  last_error_class?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GrowthJourneyExecution
  extends Model<GrowthJourneyExecutionAttributes>
  implements GrowthJourneyExecutionAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare brand_id: string;
  declare program_id: string | null;
  declare decision_id: string;
  declare subject_ref: string;
  declare lead_id: number | null;
  declare enrollment_id: string | null;
  declare channel: GrowthJourneyExecutionChannel;
  declare action_type: string;
  declare campaign_id: string | null;
  declare campaign_key: string | null;
  declare sequence_id: string | null;
  declare mode: GrowthJourneyExecutionMode;
  declare status: GrowthJourneyExecutionStatus;
  declare status_reason: string | null;
  declare control_ids: string[];
  declare proposal_id: string | null;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare claimed_at: Date | null;
  declare attempts: number;
  declare scheduled_email_id: string | null;
  declare nudge_id: string | null;
  declare outcome: string | null;
  declare last_error_class: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GrowthJourneyExecution.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: true },
    decision_id: { type: DataTypes.UUID, allowNull: false },
    subject_ref: { type: DataTypes.STRING(128), allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    channel: { type: DataTypes.STRING(16), allowNull: false },
    action_type: { type: DataTypes.STRING(32), allowNull: false },
    campaign_id: { type: DataTypes.UUID, allowNull: true },
    campaign_key: { type: DataTypes.STRING(64), allowNull: true },
    sequence_id: { type: DataTypes.UUID, allowNull: true },
    mode: { type: DataTypes.STRING(8), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending_review' },
    status_reason: { type: DataTypes.STRING(128), allowNull: true },
    control_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    proposal_id: { type: DataTypes.UUID, allowNull: true },
    approved_by: { type: DataTypes.STRING(128), allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    claimed_at: { type: DataTypes.DATE, allowNull: true },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    scheduled_email_id: { type: DataTypes.UUID, allowNull: true },
    nudge_id: { type: DataTypes.UUID, allowNull: true },
    outcome: { type: DataTypes.STRING(32), allowNull: true },
    last_error_class: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    tableName: 'growth_journey_executions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default GrowthJourneyExecution;
