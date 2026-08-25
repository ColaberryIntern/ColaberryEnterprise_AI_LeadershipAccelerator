import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudySyncRun — append-only audit row for one sync attempt.
 *
 * `correlation_id` is the thread that ties a symptom back to a root cause across
 * every log line the run emits (root CLAUDE.md, Observability Framework), so it is
 * a real column rather than something buried in `metadata`.
 *
 * TIMESTAMPS: this table has neither `created_at` nor `updated_at` — the run's own
 * `started_at` / `completed_at` are the timeline, and duplicating them would leave
 * two clocks to disagree. `timestamps: false` is therefore load bearing: Sequelize
 * defaults to true, and it would then write two columns that do not exist.
 */
export interface CaseStudySyncRunAttributes {
  id?: string;
  case_study_id: string;
  /** manual | scheduled | webhook */
  trigger?: string;
  /** running | success | partial | failed */
  status?: string;
  repos_attempted?: number;
  repos_succeeded?: number;
  repos_failed?: number;
  facts_extracted?: number;
  candidate_metrics?: number;
  snapshot_id?: string | null;
  correlation_id?: string | null;
  error_class?: string | null;
  error_summary?: string | null;
  started_at?: Date;
  completed_at?: Date | null;
  metadata?: Record<string, any>;
}

class CaseStudySyncRun
  extends Model<CaseStudySyncRunAttributes>
  implements CaseStudySyncRunAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare trigger: string;
  declare status: string;
  declare repos_attempted: number;
  declare repos_succeeded: number;
  declare repos_failed: number;
  declare facts_extracted: number;
  declare candidate_metrics: number;
  declare snapshot_id: string | null;
  declare correlation_id: string | null;
  declare error_class: string | null;
  declare error_summary: string | null;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare metadata: Record<string, any>;
}

CaseStudySyncRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    trigger: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'running' },
    repos_attempted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    repos_succeeded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    repos_failed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    facts_extracted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    candidate_metrics: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    snapshot_id: { type: DataTypes.UUID, allowNull: true },
    correlation_id: { type: DataTypes.STRING(64), allowNull: true },
    error_class: { type: DataTypes.STRING(60), allowNull: true },
    error_summary: { type: DataTypes.TEXT, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'case_study_sync_runs',
    timestamps: false,
    underscored: true,
    indexes: [{ fields: ['case_study_id', 'started_at'], name: 'idx_cs_sync_runs_case_started' }],
  }
);

export default CaseStudySyncRun;
