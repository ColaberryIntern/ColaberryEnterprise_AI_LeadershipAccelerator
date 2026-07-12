import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * XpEvent — append-only log of every XP award across the three visible
 * streams (learning / builder / community). A student's XP totals are the
 * SUM over this log, NOT a denormalized counter — so awards are idempotent
 * (unique idempotency_key) and totals can never drift or double-count.
 *
 * (ERD.md described three separate stream tables; consolidated to one table
 * with a `stream` discriminator to avoid three near-identical models.)
 */
export type XpStream = 'learning' | 'builder' | 'community';

export interface XpEventAttributes {
  id?: string;
  enrollment_id: string;
  stream: XpStream;
  card_id?: string | null;
  amount: number;
  reason?: string | null;
  idempotency_key: string;
  created_at?: Date;
}

class XpEvent extends Model<XpEventAttributes> implements XpEventAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare stream: XpStream;
  declare card_id: string | null;
  declare amount: number;
  declare reason: string | null;
  declare idempotency_key: string;
  declare created_at: Date;
}

XpEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    stream: { type: DataTypes.STRING(20), allowNull: false },
    card_id: { type: DataTypes.UUID, allowNull: true },
    amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    idempotency_key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'xp_events',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['enrollment_id', 'stream'] },
    ],
  }
);

export default XpEvent;
