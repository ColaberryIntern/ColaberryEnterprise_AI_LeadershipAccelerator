/**
 * WalkCapEntry — Phase B (2026-05-20).
 *
 * Per-cap state during a walk: the operator's verdict, an optional
 * cap-level note specific to this walk, and a link to a visual review
 * session if they opened the visual workspace while on this cap.
 *
 * One row per (walk_session_id, cap_id). Verdict defaults to 'pending'
 * until the operator decides; pending entries are surfaced as "still to
 * walk" in the summary.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type WalkVerdict = 'pending' | 'reviewed' | 'follow_up' | 'skip';

interface Attrs {
  id?: string;
  walk_session_id: string;
  cap_id: string;
  verdict: WalkVerdict;
  cap_level_note?: string | null;
  visual_review_session_id?: string | null;
  visited_at?: Date | null;
  decided_at?: Date | null;
  created_at?: Date;
}

class WalkCapEntry extends Model<Attrs> implements Attrs {
  declare id: string;
  declare walk_session_id: string;
  declare cap_id: string;
  declare verdict: WalkVerdict;
  declare cap_level_note: string | null;
  declare visual_review_session_id: string | null;
  declare visited_at: Date | null;
  declare decided_at: Date | null;
  declare created_at: Date;
}

WalkCapEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    walk_session_id: { type: DataTypes.UUID, allowNull: false },
    cap_id: { type: DataTypes.UUID, allowNull: false },
    verdict: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
    cap_level_note: { type: DataTypes.TEXT, allowNull: true },
    visual_review_session_id: { type: DataTypes.UUID, allowNull: true },
    visited_at: { type: DataTypes.DATE, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'walk_cap_entries',
    timestamps: false,
    indexes: [
      { fields: ['walk_session_id'] },
      { fields: ['walk_session_id', 'cap_id'], unique: true },
      { fields: ['cap_id'] },
    ],
  }
);

export default WalkCapEntry;
