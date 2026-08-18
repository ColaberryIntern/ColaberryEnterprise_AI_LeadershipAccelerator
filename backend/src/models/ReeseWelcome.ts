import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One row per introduction Reese has sent — keyed on (enrollment, kind), so a
 * person who signs up for an account and later joins a class receives two
 * distinct intros and neither can repeat.
 *
 * This table does double duty, and the second job is the important one: there
 * is no `last_login_at` on enrollments, so the ABSENCE of an 'account' row is
 * what defines "this is their first login". Writing the row is therefore not
 * bookkeeping after the fact — it is the claim on the greeting, taken before
 * the message is sent.
 *
 * `outcome` records rows where the claim was taken but the send did not
 * succeed, so a failed welcome is visible in the ledger instead of looking
 * identical to a student who was never eligible.
 */
export type ReeseWelcomeOutcome = 'sent' | 'failed';

/**
 * Which introduction this row records.
 *  'account' — they now have a login on the platform.
 *  'student' — they have joined a real class.
 * Someone who signs up and later enrols receives both, in that order.
 */
export type ReeseWelcomeKind = 'account' | 'student';

export interface ReeseWelcomeAttributes {
  id?: string;
  enrollment_id: string;
  kind: ReeseWelcomeKind;
  room_id?: string | null;
  message_id?: string | null;
  outcome?: ReeseWelcomeOutcome;
  detail?: string | null;
  created_at?: Date;
}

class ReeseWelcome extends Model<ReeseWelcomeAttributes> implements ReeseWelcomeAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare kind: ReeseWelcomeKind;
  declare room_id: string | null;
  declare message_id: string | null;
  declare outcome: ReeseWelcomeOutcome;
  declare detail: string | null;
  declare created_at: Date;
}

ReeseWelcome.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'account' },
    room_id: { type: DataTypes.UUID, allowNull: true },
    message_id: { type: DataTypes.UUID, allowNull: true },
    outcome: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'sent' },
    detail: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'ReeseWelcome',
    tableName: 'reese_welcomes',
    timestamps: false,
    indexes: [{ unique: true, fields: ['enrollment_id', 'kind'] }],
  },
);

export default ReeseWelcome;
