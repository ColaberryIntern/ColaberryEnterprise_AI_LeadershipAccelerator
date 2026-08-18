import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One row per student Reese has welcomed — written the first time they ever
 * log in.
 *
 * This table does double duty, and the second job is the important one: there
 * is no `last_login_at` on enrollments, so the ABSENCE of a row here is what
 * defines "this is their first login". Writing the row is therefore not
 * bookkeeping after the fact — it is the claim on the greeting, taken before
 * the message is sent.
 *
 * `outcome` records rows where the claim was taken but the send did not
 * succeed, so a failed welcome is visible in the ledger instead of looking
 * identical to a student who was never eligible.
 */
export type ReeseWelcomeOutcome = 'sent' | 'failed';

export interface ReeseWelcomeAttributes {
  id?: string;
  enrollment_id: string;
  room_id?: string | null;
  message_id?: string | null;
  outcome?: ReeseWelcomeOutcome;
  detail?: string | null;
  created_at?: Date;
}

class ReeseWelcome extends Model<ReeseWelcomeAttributes> implements ReeseWelcomeAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare room_id: string | null;
  declare message_id: string | null;
  declare outcome: ReeseWelcomeOutcome;
  declare detail: string | null;
  declare created_at: Date;
}

ReeseWelcome.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
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
    indexes: [{ unique: true, fields: ['enrollment_id'] }],
  },
);

export default ReeseWelcome;
