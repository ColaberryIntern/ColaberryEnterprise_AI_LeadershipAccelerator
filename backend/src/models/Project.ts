import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ProjectStage = 'discovery' | 'architecture' | 'implementation' | 'portfolio' | 'complete';

/**
 * Review-and-approve state.
 *   pending_approval  — built, waiting on the student to review and approve.
 *   approved          — the student confirmed the build matches what they wanted.
 *   changes_requested — the student said it is not right; flagged for revision.
 *   null              — legacy / never gated. Treated exactly like `approved`
 *                       (NOT gated). A project only becomes pending_approval by a
 *                       publish that ran while the gate was on for its enrollment.
 */
export type ProjectApprovalState = 'pending_approval' | 'approved' | 'changes_requested';

export interface ProjectAttributes {
  id?: string;
  enrollment_id: string;
  program_id: string;
  name?: string; // project display name, derived from the idea
  organization_name?: string;
  industry?: string;
  primary_business_problem?: string;
  selected_use_case?: string;
  automation_goal?: string;
  data_sources?: any;
  project_stage?: ProjectStage;
  project_variables?: any;
  github_repo_url?: string;
  portfolio_url?: string;
  system_model?: Record<string, any>;
  executive_summary?: string;
  portfolio_cache?: any;
  portfolio_updated_at?: Date;
  executive_updated_at?: Date;
  maturity_score?: number;
  requirements_completion_pct?: number;
  readiness_score_breakdown?: any;
  progress_computed_at?: Date;
  health_score?: number;
  velocity_score?: number;
  stability_score?: number;
  setup_status?: {
    requirements_loaded: boolean;
    claude_md_loaded: boolean;
    github_connected: boolean;
    activated: boolean;
  } | null;
  claude_md_content?: string;
  requirements_document?: string;
  target_mode?: string;
  share_token?: string | null;
  share_enabled?: boolean;
  /**
   * Soft-delete stamp. NULL = live; a timestamp = the student archived it then.
   * Archived projects are filtered out of every listing and of active-project
   * resolution (see services/projectService.ts) but no row is ever deleted, so
   * tasks, verified stories and awarded points stay intact and restorable.
   */
  archived_at?: Date | null;
  /**
   * Review-and-approve. NULL = legacy / never gated (treated as approved). See
   * ProjectApprovalState and db/ensureProjectApprovalSchema.ts. No default on the
   * column, deliberately, so existing projects stay NULL and ungated.
   */
  approval_state?: ProjectApprovalState | null;
  approved_at?: Date | null;
  approved_by?: string | null;
  approval_notes?: string | null;
  approval_updated_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class Project extends Model<ProjectAttributes> implements ProjectAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare program_id: string;
  declare name: string;
  declare organization_name: string;
  declare industry: string;
  declare primary_business_problem: string;
  declare selected_use_case: string;
  declare automation_goal: string;
  declare data_sources: any;
  declare project_stage: ProjectStage;
  declare project_variables: any;
  declare github_repo_url: string;
  declare portfolio_url: string;
  declare executive_summary: string;
  declare portfolio_cache: any;
  declare portfolio_updated_at: Date;
  declare executive_updated_at: Date;
  declare maturity_score: number;
  declare requirements_completion_pct: number;
  declare readiness_score_breakdown: any;
  declare progress_computed_at: Date;
  declare health_score: number;
  declare velocity_score: number;
  declare stability_score: number;
  declare setup_status: any;
  declare claude_md_content: string;
  declare requirements_document: string;
  declare share_token: string | null;
  declare share_enabled: boolean;
  declare archived_at: Date | null;
  declare approval_state: ProjectApprovalState | null;
  declare approved_at: Date | null;
  declare approved_by: string | null;
  declare approval_notes: string | null;
  declare approval_updated_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Project.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      // Multi-project: an enrollment can own several projects. The "current"
      // one is enrollments.active_project_id. (Was unique: true.)
      references: { model: 'enrollments', key: 'id' },
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'program_blueprints', key: 'id' },
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    organization_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    industry: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    primary_business_problem: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    selected_use_case: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    automation_goal: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    data_sources: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    project_stage: {
      type: DataTypes.ENUM('discovery', 'architecture', 'implementation', 'portfolio', 'complete'),
      allowNull: false,
      defaultValue: 'discovery',
    },
    project_variables: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    github_repo_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    portfolio_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    system_model: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    executive_summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    portfolio_cache: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    portfolio_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    executive_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    maturity_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    requirements_completion_pct: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    readiness_score_breakdown: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    progress_computed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    health_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    velocity_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    stability_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    setup_status: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    claude_md_content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    requirements_document: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    target_mode: {
      type: DataTypes.STRING(20),
      defaultValue: 'production',
    },
    share_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    share_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // MUST be declared here, not only in the interface: Sequelize silently
    // strips any attribute absent from `init` out of both writes and reads, so
    // an undeclared archived_at would make `project.archived_at = new Date()`
    // a no-op that still resolves — the archive would appear to succeed and
    // change nothing. Deliberately no defaultValue (see
    // db/ensureProjectArchiveSchema.ts).
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Review-and-approve. Same rule as archived_at: declared here so Sequelize
    // does not silently strip it from reads and writes. Deliberately NO
    // defaultValue on approval_state (see db/ensureProjectApprovalSchema.ts) —
    // NULL must mean "never gated" for every project that predates this.
    approval_state: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    approved_by: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    approval_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    approval_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'projects',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['enrollment_id'] }, // non-unique: multiple projects per enrollment
      { fields: ['project_stage'] },
    ],
  }
);

export default Project;
