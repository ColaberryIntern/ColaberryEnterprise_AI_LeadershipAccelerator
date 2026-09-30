import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * "Not now" on the Today internship card, with the date it comes back.
 *
 * SERVER-stored rather than localStorage, and that is the whole point: a student
 * who dismisses the card on their laptop should not meet it again on their phone
 * ten minutes later. Per-device storage would make "not now" mean "not now, in
 * this browser", which is not what the student said.
 *
 * One row per enrollment, upserted. A dismissal REPLACES the previous one rather
 * than appending to a history nobody reads — the only question anyone asks of
 * this table is "is the card hidden right now", and that has one answer.
 */
class InternshipCardDismissal extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare dismissed_at: Date;
  /** When the card becomes visible again. Always set — a dismissal is never permanent. */
  declare reappear_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipCardDismissal.init(
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    dismissed_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reappear_at:   { type: DataTypes.DATE, allowNull: false },
    created_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_card_dismissals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipCardDismissal;
