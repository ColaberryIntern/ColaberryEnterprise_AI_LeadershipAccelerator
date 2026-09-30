import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AccountCredit — a credit balance line applied to a student's next payment.
 *
 * Append-only ledger (one row per grant): the $50 Open House "hold your spot"
 * deposits are the first source. A credit is `available` until a subscription
 * checkout consumes it, at which point it flips to `applied` and links to the
 * subscription it discounted. The student's available balance is the SUM of
 * `amount_cents` over rows with status `available`.
 *
 * Idempotency: `source_event_id` is UNIQUE — granting the same business event
 * (e.g. a specific PaySimple deposit `OH716-...`) twice is a no-op, so re-running
 * a grant script cannot double-credit an account.
 */
export type AccountCreditStatus = 'available' | 'applied' | 'void';

export interface AccountCreditAttributes {
  id?: string;
  enrollment_id: string;
  amount_cents: number;                 // positive = credit toward a future charge
  reason: string;                       // 'open_house_deposit', ...
  source_event_id: string;              // UNIQUE idempotency key (e.g. the PaySimple external_id)
  status?: AccountCreditStatus;
  applied_subscription_id?: string | null;
  applied_at?: Date | null;
  granted_by?: string | null;           // who/what created it (script tag, admin email)
  note?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class AccountCredit extends Model<AccountCreditAttributes> implements AccountCreditAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare amount_cents: number;
  declare reason: string;
  declare source_event_id: string;
  declare status: AccountCreditStatus;
  declare applied_subscription_id: string | null;
  declare applied_at: Date | null;
  declare granted_by: string | null;
  declare note: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AccountCredit.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    amount_cents: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(64), allowNull: false },
    source_event_id: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'available' },
    applied_subscription_id: { type: DataTypes.UUID, allowNull: true },
    applied_at: { type: DataTypes.DATE, allowNull: true },
    granted_by: { type: DataTypes.STRING(120), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'account_credits',
    timestamps: false,
    indexes: [
      { fields: ['enrollment_id', 'status'], name: 'idx_account_credits_enrollment_status' },
    ],
  },
);

export default AccountCredit;
