import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ProjectStage = 'discovery' | 'architecture' | 'implementation' | 'portfolio' | 'complete';

export interface ProjectAttributes {
  id?: string;
  enrollment_id: string;
  program_id: string;
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
  created_at?: Date;
  updated_at?: Date;
}

class Project extends Model<ProjectAttributes> implements ProjectAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare program_id: string;
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
      unique: true,
      references: { model: 'enrollments', key: 'id' },
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'program_blueprints', key: 'id' },
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
  },
  {
    sequelize,
    tableName: 'projects',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['enrollment_id'], unique: true },
      { fields: ['project_stage'] },
    ],
  }
);

export default Project;
