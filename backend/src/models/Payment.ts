import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Payment — the Accelerator payment ledger, mirrored from PaySimple.
 *
 * There was no single source of truth for money: it was scattered across
 * enrollments.amount_paid, account_credits, subscriptions and refunds, and that
 * enrollment-based model structurally could not represent a recurring member who
 * paid two months. This table is one row per PaySimple payment, keyed on
 * `paysimple_payment_id` (UNIQUE), so:
 *
 *   Revenue = SUM(amount_cents WHERE is_live) / 100
 *
 * `is_live` is derived from the CURRENT PaySimple status on every sync, so a
 * Posted→ReverseNSF/Returned/Failed flip drops the payment out of revenue with no
 * extra bookkeeping ("revenue until the payment fails, then subtracted").
 *
 * SCOPE: the PaySimple gateway is shared with the bootcamp, so the sync only
 * ingests recognized Accelerator amounts (a $50 deposit + the membership dollars
 * in config) — bootcamp tuition ($250 installments, etc.) never enters this table.
 *
 * Idempotency: upsert on `paysimple_payment_id`. Re-running the sync only writes on
 * a real status/amount change; it can never duplicate a payment or double-count.
 */
export type PaymentType = 'membership' | 'deposit' | 'other';

export interface PaymentAttributes {
  id?: string;
  paysimple_payment_id: string;         // UNIQUE idempotency key
  paysimple_customer_id?: string | null;
  payer_email?: string | null;          // lowercased
  payer_name?: string | null;
  amount_cents: number;
  status: string;                       // raw PaySimple status (Posted | Settled | ReverseNSF | ...)
  is_live: boolean;                     // counts toward revenue (collected & not failed/reversed)
  payment_type: PaymentType;            // classified from amount
  payment_date?: Date | null;
  enrollment_id?: string | null;        // linked platform member (may be created by the sync)
  raw?: unknown;                        // raw PaySimple payment for audit
  synced_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class Payment extends Model<PaymentAttributes> implements PaymentAttributes {
  declare id: string;
  declare paysimple_payment_id: string;
  declare paysimple_customer_id: string | null;
  declare payer_email: string | null;
  declare payer_name: string | null;
  declare amount_cents: number;
  declare status: string;
  declare is_live: boolean;
  declare payment_type: PaymentType;
  declare payment_date: Date | null;
  declare enrollment_id: string | null;
  declare raw: unknown;
  declare synced_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

Payment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    paysimple_payment_id: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    paysimple_customer_id: { type: DataTypes.STRING(120), allowNull: true },
    payer_email: { type: DataTypes.STRING(255), allowNull: true },
    payer_name: { type: DataTypes.STRING(255), allowNull: true },
    amount_cents: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false },
    is_live: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    payment_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'other' },
    payment_date: { type: DataTypes.DATE, allowNull: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    raw: { type: DataTypes.JSONB, allowNull: true },
    synced_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'payments',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['paysimple_payment_id'], name: 'payments_paysimple_id_unique' },
      { fields: ['payer_email'], name: 'idx_payments_payer_email' },
      { fields: ['is_live'], name: 'idx_payments_is_live' },
      { fields: ['payment_date'], name: 'idx_payments_payment_date' },
      { fields: ['enrollment_id'], name: 'idx_payments_enrollment' },
    ],
  },
);

export default Payment;
