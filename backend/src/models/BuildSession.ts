/**
 * BuildSession — tracks a single Claude Code build cycle from start to
 * completion. One row per session.
 *
 * Lifecycle:
 *   client calls POST /build-session/start  →  row created (status='running')
 *   client calls POST /build-session/:id/complete + manifest  →  row updated
 *   pipeline validates manifest, ingests, syncs state, marks session 'completed' or 'rejected'
 *
 * Used by:
 *   - Telemetry enforcement UX (show outcome of each session)
 *   - Build session analytics
 *   - Audit trail
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type BuildSessionStatus = 'running' | 'completed' | 'rejected' | 'abandoned';

interface BuildSessionAttributes {
  id?: string;
  project_id: string;
  task_id: string;
  bp_id: string | null;
  task_type: string;

  status: BuildSessionStatus;
  started_at: Date;
  completed_at: Date | null;

  manifest_id: string | null;
  telemetry_validated: boolean;
  validation_passed: boolean;
  contradictions_detected: number;
  queue_changes_triggered: number;

  rejection_reason: string | null;
  rejection_details: any | null;

  created_at?: Date;
}

class BuildSession extends Model<BuildSessionAttributes> implements BuildSessionAttributes {
  declare id: string;
  declare project_id: string;
  declare task_id: string;
  declare bp_id: string | null;
  declare task_type: string;
  declare status: BuildSessionStatus;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare manifest_id: string | null;
  declare telemetry_validated: boolean;
  declare validation_passed: boolean;
  declare contradictions_detected: number;
  declare queue_changes_triggered: number;
  declare rejection_reason: string | null;
  declare rejection_details: any | null;
  declare created_at: Date;
}

BuildSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    task_id: { type: DataTypes.STRING(255), allowNull: false },
    bp_id: { type: DataTypes.UUID, allowNull: true },
    task_type: { type: DataTypes.STRING(32), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'running' },
    started_at: { type: DataTypes.DATE, allowNull: false },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    manifest_id: { type: DataTypes.UUID, allowNull: true },
    telemetry_validated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    validation_passed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    contradictions_detected: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    queue_changes_triggered: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rejection_reason: { type: DataTypes.STRING(128), allowNull: true },
    rejection_details: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'build_sessions',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'started_at'] },
      { fields: ['task_id'] },
      { fields: ['status'] },
    ],
  }
);

export default BuildSession;
