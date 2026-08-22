import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Subscription — a student's self-serve paid plan.
 *
 * V1 uses PaySimple's one-time hosted checkout (card + ACH): each paid term is a
 * discrete payment that extends `current_period_end`. True auto-charging recurs
 * once PaySimple recurring is enabled; this schema already carries the period so
 * that upgrade is additive (no data migration). One row per checkout attempt;
 * the student's CURRENT subscription is the newest non-failed row.
 */
// 'annual' | 'monthly' are the two self-serve paid plans; 'comp' is an
// admin-granted comped seat (Free Access — full program access at $0, never
// billed). 'comp' is never offered in the student checkout (getSubscription
// lists only annual+monthly; startCheckout rejects it).
export type SubscriptionPlan = 'annual' | 'monthly' | 'comp';
// 'past_due' exists so a FAILED scheduled charge is storable state rather than
// something recomputed at read time. Before recurring billing there was nothing
// to record: a lapse was inferred on the dashboard and no code could act on it.
export type SubscriptionStatus = 'pending' | 'active' | 'canceled' | 'failed' | 'past_due';

export interface SubscriptionAttributes {
  id?: string;
  enrollment_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  amount_cents: number;                // full recurring plan price (unchanged by any credit)
  applied_credit_cents?: number;       // account credit discounted off THIS checkout's first charge
  payment_ref: string;                 // PaySimple external_id (SUB-<enr>-<ts>) — idempotency anchor
  paysimple_customer_id?: string | null;
  paysimple_payment_id?: string | null;
  // The standing schedule at PaySimple, once one exists. NULL means this member
  // is still on manual renewal. Cleared when a schedule is suspended, so a
  // non-null value always means a live schedule is drawing against this row.
  paysimple_schedule_id?: string | null;
  started_at?: Date | null;
  current_period_end?: Date | null;
  canceled_at?: Date | null;
  cancel_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class Subscription extends Model<SubscriptionAttributes> implements SubscriptionAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare plan: SubscriptionPlan;
  declare status: SubscriptionStatus;
  declare amount_cents: number;
  declare applied_credit_cents: number;
  declare payment_ref: string;
  declare paysimple_customer_id: string | null;
  declare paysimple_payment_id: string | null;
  declare paysimple_schedule_id: string | null;
  declare started_at: Date | null;
  declare current_period_end: Date | null;
  declare canceled_at: Date | null;
  declare cancel_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Subscription.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    plan: { type: DataTypes.STRING(20), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    amount_cents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    applied_credit_cents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    payment_ref: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    paysimple_customer_id: { type: DataTypes.STRING(120), allowNull: true },
    paysimple_payment_id: { type: DataTypes.STRING(120), allowNull: true },
    paysimple_schedule_id: { type: DataTypes.STRING(120), allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    current_period_end: { type: DataTypes.DATE, allowNull: true },
    canceled_at: { type: DataTypes.DATE, allowNull: true },
    cancel_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'subscriptions',
    timestamps: false,
    indexes: [
      { fields: ['enrollment_id'], name: 'idx_subscriptions_enrollment' },
      { fields: ['status'], name: 'idx_subscriptions_status' },
      { fields: ['paysimple_schedule_id'], name: 'idx_subscriptions_schedule' },
    ],
  },
);

export default Subscription;
