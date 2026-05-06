/**
 * SystemStateSnapshot — persisted output of the SystemStateEngine.
 *
 * Every successful run of buildAuthoritativeState(projectId) writes one
 * row here. Lets us:
 *   - audit historical state changes (cap was 60% on Tuesday, 80% on Friday)
 *   - replay what the engine "thought" at a point in time
 *   - detect drift between persisted snapshots and freshly computed state
 *
 * One row per (project_id, generated_at). No mutation; immutable history.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type {
  AuthoritativeTask,
  ContradictionFlag,
  StateGraph,
} from '../intelligence/systemStateEngine/types/systemState.types';

interface SystemStateSnapshotAttributes {
  id?: string;
  project_id: string;
  generated_at: Date;

  // Top-level scores (each 0-100). All denormalized from authoritative_queue
  // / state_graph below for fast querying without parsing the JSONB.
  readiness_score: number;
  coverage_score: number;
  maturity_score: number;
  health_score: number;
  sync_health_score: number;

  // Per-layer aggregates
  backend_score: number;
  frontend_score: number;
  intelligence_score: number;
  observability_score: number;

  // Quick pointers to the engine's selected next action
  next_task_id: string | null;
  next_bp_id: string | null;

  // Detail blobs
  contradiction_flags: ContradictionFlag[];
  blocking_issues: ContradictionFlag[];
  authoritative_queue: AuthoritativeTask[];
  state_graph: StateGraph;

  created_at?: Date;
}

class SystemStateSnapshot extends Model<SystemStateSnapshotAttributes> implements SystemStateSnapshotAttributes {
  declare id: string;
  declare project_id: string;
  declare generated_at: Date;

  declare readiness_score: number;
  declare coverage_score: number;
  declare maturity_score: number;
  declare health_score: number;
  declare sync_health_score: number;

  declare backend_score: number;
  declare frontend_score: number;
  declare intelligence_score: number;
  declare observability_score: number;

  declare next_task_id: string | null;
  declare next_bp_id: string | null;

  declare contradiction_flags: ContradictionFlag[];
  declare blocking_issues: ContradictionFlag[];
  declare authoritative_queue: AuthoritativeTask[];
  declare state_graph: StateGraph;

  declare created_at: Date;
}

SystemStateSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    generated_at: { type: DataTypes.DATE, allowNull: false },

    readiness_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    coverage_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    maturity_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    health_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    sync_health_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    backend_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    frontend_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    intelligence_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    observability_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    next_task_id: { type: DataTypes.STRING(255), allowNull: true },
    next_bp_id: { type: DataTypes.UUID, allowNull: true },

    contradiction_flags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    blocking_issues: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    authoritative_queue: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    state_graph: { type: DataTypes.JSONB, allowNull: false, defaultValue: { nodes: [], edges: [] } },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'system_state_snapshots',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['generated_at'] },
      { fields: ['project_id', 'generated_at'] },
    ],
  }
);

export default SystemStateSnapshot;
