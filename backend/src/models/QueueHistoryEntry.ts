/**
 * QueueHistoryEntry — append-only diff log of how the authoritative queue
 * changed between snapshots.
 *
 * One row per snapshot (written by the queue history writer when the engine
 * persists a new snapshot). Diff is computed against the previous snapshot.
 *
 * Powers /api/portal/project/history/queue.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface QueueHistoryAttributes {
  id?: string;
  project_id: string;
  snapshot_id: string;
  recorded_at: Date;

  task_id: string;
  bp_id: string | null;
  task_title: string;

  /** Rank in this snapshot (lower = earlier). */
  rank: number;
  /** Rank in the previous snapshot, or null if newly appeared. */
  previous_rank: number | null;

  /** Net change in rank (negative = moved earlier). */
  rank_delta: number;

  /** State in this snapshot. */
  state: string;
  previous_state: string | null;

  /** Why the rank/state changed — usually one of the refresh trigger kinds. */
  change_reason: string;

  /** Full task payload at the time, for replay. */
  task_payload: any;

  created_at?: Date;
}

class QueueHistoryEntry extends Model<QueueHistoryAttributes> implements QueueHistoryAttributes {
  declare id: string;
  declare project_id: string;
  declare snapshot_id: string;
  declare recorded_at: Date;
  declare task_id: string;
  declare bp_id: string | null;
  declare task_title: string;
  declare rank: number;
  declare previous_rank: number | null;
  declare rank_delta: number;
  declare state: string;
  declare previous_state: string | null;
  declare change_reason: string;
  declare task_payload: any;
  declare created_at: Date;
}

QueueHistoryEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    snapshot_id: { type: DataTypes.UUID, allowNull: false },
    recorded_at: { type: DataTypes.DATE, allowNull: false },
    task_id: { type: DataTypes.STRING(255), allowNull: false },
    bp_id: { type: DataTypes.UUID, allowNull: true },
    task_title: { type: DataTypes.STRING(512), allowNull: false },
    rank: { type: DataTypes.INTEGER, allowNull: false },
    previous_rank: { type: DataTypes.INTEGER, allowNull: true },
    rank_delta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    state: { type: DataTypes.STRING(32), allowNull: false },
    previous_state: { type: DataTypes.STRING(32), allowNull: true },
    change_reason: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'manual' },
    task_payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'queue_history_entries',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'recorded_at'] },
      { fields: ['snapshot_id'] },
      { fields: ['task_id'] },
    ],
  }
);

export default QueueHistoryEntry;
