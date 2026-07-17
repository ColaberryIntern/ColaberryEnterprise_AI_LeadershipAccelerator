import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Refund — an admin-issued PaySimple refund (or void) of a payment.
 *
 * Ledger row per refund attempt. `status` moves pending → succeeded | failed:
 * the row is written `pending` BEFORE the PaySimple call so a crash mid-flight
 * leaves a visible record (no silent double-refund on retry). `method` is
 * 'void' when the payment is still inside its void window (full reversal, no
 * fee) or 'refund' once it has posted/settled. Refunding a payment that granted
 * an account credit voids that credit (`voided_credit_cents`).
 */
export type RefundMethod = 'refund' | 'void';
export type RefundStatus = 'pending' | 'succeeded' | 'failed';

export interface RefundAttributes {
  id?: string;
  enrollment_id?: string | null;         // resolved from the payer email when possible
  paysimple_payment_id: string;          // the payment being refunded
  paysimple_refund_id?: string | null;   // PaySimple's id for the refund/void txn
  amount_cents: number;                  // amount refunded
  method: RefundMethod;
  status: RefundStatus;
  reason?: string | null;
  customer_email?: string | null;
  voided_credit_cents?: number;          // account credit voided as a result
  issued_by?: string | null;             // admin email
  error?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class Refund extends Model<RefundAttributes> implements RefundAttributes {
  declare id: string;
  declare enrollment_id: string | null;
  declare paysimple_payment_id: string;
  declare paysimple_refund_id: string | null;
  declare amount_cents: number;
  declare method: RefundMethod;
  declare status: RefundStatus;
  declare reason: string | null;
  declare customer_email: string | null;
  declare voided_credit_cents: number;
  declare issued_by: string | null;
  declare error: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Refund.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    paysimple_payment_id: { type: DataTypes.STRING(120), allowNull: false },
    paysimple_refund_id: { type: DataTypes.STRING(120), allowNull: true },
    amount_cents: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'refund' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    customer_email: { type: DataTypes.STRING(255), allowNull: true },
    voided_credit_cents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    issued_by: { type: DataTypes.STRING(120), allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'refunds',
    timestamps: false,
    indexes: [
      { fields: ['paysimple_payment_id'], name: 'idx_refunds_payment' },
      { fields: ['status'], name: 'idx_refunds_status' },
    ],
  },
);

export default Refund;
