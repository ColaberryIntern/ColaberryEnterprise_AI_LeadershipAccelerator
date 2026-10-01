import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Where one project stands in the unified lifecycle.
 *
 * TWO THINGS THIS MODEL ENCODES THAT ARE EASY TO GET WRONG.
 *
 * 1. `condition` is not a stage. `blocked` / `failed` / `awaiting_input` / `needs_reapproval`
 *    are recorded ALONGSIDE the stage, so the stage to resume FROM survives the failure. A
 *    provider failure at `process_ready` leaves ('process_ready', 'failed') — never 'failed'.
 *    Collapsing the two is how a recoverable project becomes an unrecoverable one.
 *
 * 2. Exactly one of `student_project_id` / `delivery_project_id` is set. `projects` and
 *    `delivery_projects` are separate domain models that the request forbids merging, so the
 *    lifecycle spans both without collapsing them. The database enforces it via
 *    `ck_lifecycle_exactly_one_project`; this model cannot, so read the CHECK as the contract.
 *
 * Stage is never written by a client. Transitions are server commands evaluated against typed
 * prerequisites and actor permission — see services/lifecycle/. Schema:
 * db/ensureProjectLifecycleSchema.ts. Decision record: docs/project-lifecycle/architecture.md.
 */
export interface ProjectLifecycleStateAttributes {
  id?: string;
  tenant_id: string;
  student_project_id?: string | null;
  delivery_project_id?: string | null;
  stage: string;
  condition?: string | null;
  condition_reason?: string | null;
  entry_point?: string | null;
  next_actor_role?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ProjectLifecycleState extends Model<ProjectLifecycleStateAttributes> implements ProjectLifecycleStateAttributes {
  declare id: string;
  declare tenant_id: string;
  declare student_project_id: string | null;
  declare delivery_project_id: string | null;
  declare stage: string;
  declare condition: string | null;
  declare condition_reason: string | null;
  declare entry_point: string | null;
  declare next_actor_role: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ProjectLifecycleState.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    student_project_id: { type: DataTypes.UUID, allowNull: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: true },
    stage: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'discovery' },
    condition: { type: DataTypes.TEXT, allowNull: true },
    condition_reason: { type: DataTypes.TEXT, allowNull: true },
    entry_point: { type: DataTypes.TEXT, allowNull: true },
    next_actor_role: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'project_lifecycle_states', timestamps: true, underscored: true },
);

export default ProjectLifecycleState;
