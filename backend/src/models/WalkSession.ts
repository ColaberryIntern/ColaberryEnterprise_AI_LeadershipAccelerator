/**
 * WalkSession — Phase B (2026-05-20).
 *
 * One walk = an operator stepping through a cap queue one at a time,
 * leaving a verdict (and optionally a note) per cap. The session holds
 * the ordered queue, the current position, and the filter used to build
 * the queue. Per-cap state lives in WalkCapEntry.
 *
 * Resume by URL: /portal/walk-caps?session=<uuid>.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type WalkFilter = 'all' | 'pending_review' | 'top_10' | 'with_notes' | 'custom';

interface Attrs {
  id?: string;
  project_id: string;
  created_by: string;
  started_at: Date;
  closed_at?: Date | null;
  cap_queue: string[];
  current_index: number;
  filter: WalkFilter;
  notes_summary?: string | null;
  created_at?: Date;
}

class WalkSession extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare created_by: string;
  declare started_at: Date;
  declare closed_at: Date | null;
  declare cap_queue: string[];
  declare current_index: number;
  declare filter: WalkFilter;
  declare notes_summary: string | null;
  declare created_at: Date;
}

WalkSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    created_by: { type: DataTypes.STRING(255), allowNull: false },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    cap_queue: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    current_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    filter: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'all' },
    notes_summary: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'walk_sessions',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'started_at'] },
      { fields: ['created_by'] },
    ],
  }
);

export default WalkSession;
