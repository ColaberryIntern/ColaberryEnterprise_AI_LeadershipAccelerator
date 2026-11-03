import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Every value this column is allowed to hold.
 *
 * `no_answer` was added on 2026-11-02 (C8.4) because production already held **407 rows
 * across 379 leads** carrying it, every one on `channel = 'voice'`, written continuously
 * between 2026-03-23 and 2026-08-24. It is the fifth most common value in the table, and
 * this union said it could not exist.
 *
 * HOW A TYPE AND A TABLE DISAGREED FOR SEVEN MONTHS, because the mechanism is the lesson:
 * `synthflowWebhookController` writes it through a `create(... as any)`. The cast was not
 * there to smuggle the outcome — it was there because `step_index` was declared REQUIRED on
 * the attributes interface while the column carries `defaultValue: 0`, so an honest call
 * could not compile. One cast silenced both, and the column is a bare `STRING(30)` with no
 * enum, so Postgres accepted whatever arrived. The fix is therefore two-part: widen this
 * union to the truth, and give the model a creation type that makes the cast unnecessary
 * (below), so the next wrong value fails to compile instead of landing.
 *
 * `funnelStages.ts` already lists `no_answer` among "the ten recorded outcomes", so the
 * funnel documentation was right and the type was wrong.
 *
 * Declared but with no writer in the tree: `converted`, `no_response`, `unsubscribed`,
 * `declined`. They are kept because they are a legitimate target vocabulary, but note that
 * `campaignAnalyticsService` computes `conversion_rate` from `converted` — a metric nothing
 * can currently move off zero.
 */
export type OutcomeType =
  | 'sent'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'booked_meeting'
  | 'converted'
  | 'no_response'
  | 'no_answer'
  | 'bounced'
  | 'unsubscribed'
  | 'voicemail'
  | 'answered'
  | 'declined';

/**
 * The same values as `OutcomeType`, as data rather than only as a type.
 *
 * Needed because the column is a bare `STRING(30)` with no database enum, so nothing at
 * runtime could previously answer "is this a legal outcome?" — which is how a value the type
 * forbade sat in 407 rows undetected. `funnelStages.ts` had to restate the list in prose for
 * the same reason. A caller validating an inbound webhook value can now check it.
 *
 * The assertion below makes the two definitions impossible to drift: adding a member to
 * `OutcomeType` without adding it here fails `tsc`, and vice versa.
 */
export const OUTCOME_TYPES = [
  'sent',
  'opened',
  'clicked',
  'replied',
  'booked_meeting',
  'converted',
  'no_response',
  'no_answer',
  'bounced',
  'unsubscribed',
  'voicemail',
  'answered',
  'declined',
] as const;

/** Compile-time proof that `OUTCOME_TYPES` and `OutcomeType` describe the same set. */
type AssertSameSet<A extends readonly string[], B extends string> =
  [Exclude<A[number], B>] extends [never]
    ? [Exclude<B, A[number]>] extends [never]
      ? true
      : { missingFromArray: Exclude<B, A[number]> }
    : { notInUnion: Exclude<A[number], B> };
const _outcomeTypesAreExhaustive: AssertSameSet<typeof OUTCOME_TYPES, OutcomeType> = true;
void _outcomeTypesAreExhaustive;

/** True when `value` is a legal outcome. For validating anything off the wire. */
export function isOutcomeType(value: unknown): value is OutcomeType {
  return typeof value === 'string' && (OUTCOME_TYPES as readonly string[]).includes(value);
}

interface InteractionOutcomeAttributes {
  id?: string;
  lead_id: number;
  campaign_id?: string;
  scheduled_email_id?: string;
  channel: string;
  step_index: number;
  outcome: OutcomeType;
  lead_industry?: string;
  lead_title_category?: string;
  lead_company_size_bucket?: string;
  lead_source_type?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

/**
 * What a caller must actually supply. The database mints the id, defaults `step_index` to 0
 * and `created_at` to NOW, so demanding them of a caller is a lie that gets paid for in
 * `as any` casts — which is precisely how `no_answer` reached production unnoticed (see
 * `OutcomeType` above). Follows the `RoutingRuleCreationAttributes` precedent.
 */
export type InteractionOutcomeCreationAttributes = Optional<
  InteractionOutcomeAttributes,
  'id' | 'step_index' | 'created_at'
>;

class InteractionOutcome
  extends Model<InteractionOutcomeAttributes, InteractionOutcomeCreationAttributes>
  implements InteractionOutcomeAttributes {
  declare id: string;
  declare lead_id: number;
  declare campaign_id: string;
  declare scheduled_email_id: string;
  declare channel: string;
  declare step_index: number;
  declare outcome: OutcomeType;
  declare lead_industry: string;
  declare lead_title_category: string;
  declare lead_company_size_bucket: string;
  declare lead_source_type: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

InteractionOutcome.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    scheduled_email_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'scheduled_emails', key: 'id' },
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    outcome: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    lead_industry: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lead_title_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    lead_company_size_bucket: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    lead_source_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'interaction_outcomes',
    timestamps: false,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['campaign_id'] },
      { fields: ['scheduled_email_id'] },
      { fields: ['outcome'] },
      { fields: ['channel'] },
      { fields: ['lead_industry'] },
      { fields: ['lead_title_category'] },
      { fields: ['lead_company_size_bucket'] },
      { fields: ['lead_source_type'] },
      { fields: ['created_at'] },
      // Composite — supports the outcomes-per-row subquery in the
      // /api/admin/communications list endpoint (filters by lead_id +
      // channel, sorted by created_at).
      { fields: ['lead_id', 'channel', 'created_at'], name: 'idx_interaction_outcomes_lead_channel_created' },
    ],
  }
);

export default InteractionOutcome;
