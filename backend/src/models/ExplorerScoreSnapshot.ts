import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ExplorerPrimaryState, ExplorerOverlay } from '../types/explorerGrowth';

/**
 * explorer_score_snapshots — APPEND-ONLY, one row per learner per day.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §5.4 T3, §24.
 *
 * The profile table holds only CURRENT scores, so without this there is no way
 * to answer "how many learners were in ENROLLMENT_READY three weeks ago" — and
 * the cohort forecast (§24) needs exactly that: observed stage counts at
 * points in time, from which stage-conversion rates are derived. Recomputing
 * history from raw signals is not equivalent, because the scoring rules
 * themselves change over time.
 *
 * UNIQUE (enrollment_id, as_of_date) makes the daily snapshot job idempotent.
 * Retention: 400 days rolling.
 */
interface ExplorerScoreSnapshotAttributes {
  id?: string;
  enrollment_id: string;
  as_of_date: string;
  e_score: number;
  i_score: number;
  f_score: number;
  primary_state: ExplorerPrimaryState;
  overlays?: ExplorerOverlay[];
  created_at?: Date;
}

class ExplorerScoreSnapshot
  extends Model<ExplorerScoreSnapshotAttributes>
  implements ExplorerScoreSnapshotAttributes
{
  declare id: string;
  declare enrollment_id: string;
  declare as_of_date: string;
  declare e_score: number;
  declare i_score: number;
  declare f_score: number;
  declare primary_state: ExplorerPrimaryState;
  declare overlays: ExplorerOverlay[];
  declare created_at: Date;
}

ExplorerScoreSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    as_of_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'UNIQUE with enrollment_id — the daily snapshot job is idempotent.',
    },
    e_score: { type: DataTypes.SMALLINT, allowNull: false },
    i_score: { type: DataTypes.SMALLINT, allowNull: false },
    f_score: { type: DataTypes.SMALLINT, allowNull: false },
    primary_state: { type: DataTypes.STRING(32), allowNull: false },
    overlays: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'explorer_score_snapshots',
    timestamps: false,
  },
);

export default ExplorerScoreSnapshot;
