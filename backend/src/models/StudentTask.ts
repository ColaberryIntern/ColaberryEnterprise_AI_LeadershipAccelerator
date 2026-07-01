import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type StudentTaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

export interface StudentTaskAttributes {
  id?: string;
  task_list_id: string;
  project_id: string;
  requirement_map_id?: string | null;
  requirement_key?: string | null;
  title: string;
  description?: string | null;
  status?: StudentTaskStatus;
  position?: number;
  // Unified story-driven fields (all nullable) — merges the Story-Driven Build
  // engine's task shape into this one canonical model. Requirement-based tasks
  // (Kes's ProjectDnaWizard path) leave these null; story/engine-based tasks
  // leave requirement_key null and carry these instead.
  story_id?: string | null;
  narrative?: string | null;
  owner_agent?: string | null;
  acceptance?: any;
  build?: string | null;
  vibe?: string | null;
  trust?: string | null;
  execution_mode?: string | null;
  fulfills?: any;
  release_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class StudentTask extends Model<StudentTaskAttributes> implements StudentTaskAttributes {
  declare id: string;
  declare task_list_id: string;
  declare project_id: string;
  declare requirement_map_id: string | null;
  declare requirement_key: string;
  declare title: string;
  declare description: string | null;
  declare status: StudentTaskStatus;
  declare position: number;
  declare story_id: string | null;
  declare narrative: string | null;
  declare owner_agent: string | null;
  declare acceptance: any;
  declare build: string | null;
  declare vibe: string | null;
  declare trust: string | null;
  declare execution_mode: string | null;
  declare fulfills: any;
  declare release_key: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentTask.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    task_list_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'student_task_lists', key: 'id' } },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    requirement_map_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'requirements_maps', key: 'id' } },
    // Nullable in the unified model: story/engine-based tasks have no requirement_key.
    requirement_key: { type: DataTypes.STRING(255), allowNull: true },
    title: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('not_started', 'in_progress', 'complete', 'blocked'),
      allowNull: false,
      defaultValue: 'not_started',
    },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // ── Unified story-driven fields (nullable) ──
    story_id: { type: DataTypes.STRING(60), allowNull: true },
    narrative: { type: DataTypes.TEXT, allowNull: true },
    owner_agent: { type: DataTypes.STRING(120), allowNull: true },
    acceptance: { type: DataTypes.JSONB, allowNull: true },
    build: { type: DataTypes.TEXT, allowNull: true },
    vibe: { type: DataTypes.TEXT, allowNull: true },
    trust: { type: DataTypes.TEXT, allowNull: true },
    execution_mode: { type: DataTypes.STRING(30), allowNull: true },
    fulfills: { type: DataTypes.JSONB, allowNull: true },
    release_key: { type: DataTypes.STRING(60), allowNull: true },
  },
  {
    sequelize,
    tableName: 'student_tasks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['task_list_id'] },
      { fields: ['project_id'] },
      { fields: ['requirement_map_id'] },
      { fields: ['story_id'] },
      { unique: true, fields: ['project_id', 'requirement_key'], name: 'student_tasks_unique_req_key' },
    ],
  }
);

export default StudentTask;
