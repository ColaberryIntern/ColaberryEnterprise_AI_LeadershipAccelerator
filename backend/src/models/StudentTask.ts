import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { TaskExecutionMode } from '../services/buildPlanIngestHelpers';

// A student build task — maps an engine story (STORY-###) to the student's unit
// of work. Carries the Gherkin acceptance (= demo script + loop stop), the
// paste-ready `vibe` prompt (what an AI executor consumes), and execution_mode
// (human / ai_with_approval / ai_autonomous). See docs/student-platform-sync/.
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped';

export interface TaskAcceptanceScenario {
  scenario: string;
  trust?: boolean;
  given?: string;
  when?: string;
  then?: string;
}

export interface StudentTaskAttributes {
  id?: string;
  project_id: string;
  sprint_id?: string | null;
  story_id: string;
  title: string;
  narrative?: string | null;
  fulfills?: string[];
  owner_agent?: string | null;
  acceptance?: TaskAcceptanceScenario[];
  build?: string | null;
  vibe?: string | null;
  trust?: string | null;
  execution_mode?: TaskExecutionMode;
  status?: TaskStatus;
  due_on?: string | null;
  assignee?: string | null;
  verifier_score?: number | null;
  completed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class StudentTask extends Model<StudentTaskAttributes> implements StudentTaskAttributes {
  declare id: string;
  declare project_id: string;
  declare sprint_id: string | null;
  declare story_id: string;
  declare title: string;
  declare narrative: string | null;
  declare fulfills: string[];
  declare owner_agent: string | null;
  declare acceptance: TaskAcceptanceScenario[];
  declare build: string | null;
  declare vibe: string | null;
  declare trust: string | null;
  declare execution_mode: TaskExecutionMode;
  declare status: TaskStatus;
  declare due_on: string | null;
  declare assignee: string | null;
  declare verifier_score: number | null;
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentTask.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    sprint_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'student_sprints', key: 'id' } },
    story_id: { type: DataTypes.STRING(60), allowNull: false },
    title: { type: DataTypes.STRING(500), allowNull: false },
    narrative: { type: DataTypes.TEXT, allowNull: true },
    fulfills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    owner_agent: { type: DataTypes.STRING(255), allowNull: true },
    acceptance: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    build: { type: DataTypes.TEXT, allowNull: true },
    vibe: { type: DataTypes.TEXT, allowNull: true },
    trust: { type: DataTypes.TEXT, allowNull: true },
    execution_mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ai_with_approval' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'todo' },
    due_on: { type: DataTypes.DATEONLY, allowNull: true },
    assignee: { type: DataTypes.STRING(255), allowNull: true },
    verifier_score: { type: DataTypes.INTEGER, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'student_tasks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id', 'sprint_id'] },
      { fields: ['project_id', 'status'] },
      { unique: true, fields: ['project_id', 'story_id'], name: 'student_tasks_unique_project_story' },
    ],
  }
);

export default StudentTask;
