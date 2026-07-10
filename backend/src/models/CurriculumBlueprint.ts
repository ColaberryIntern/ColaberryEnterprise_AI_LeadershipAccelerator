/**
 * CurriculumBlueprint — the source of truth for a Curriculum Composer experience.
 * The instructor describes an outcome; everything else (the plan, the DNA, the
 * published Timeline cards) is generated from this record. Rich arrays live in
 * JSONB; key scalars are columns for querying. Created by ensureCurriculumComposerSchema.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CurriculumBlueprintAttributes {
  id?: string;
  title: string;
  purpose?: string | null;
  problem_statement?: string | null;
  target_audience?: string | null;
  program_id?: string | null;
  cohort_id?: string | null;
  week?: number | null;
  session?: string | null;
  scope?: string;                 // lesson|session|day|week|sprint|month|certification_module|internship|program
  difficulty?: string;
  estimated_hours?: number | null;
  learning_objectives?: any;      // string[]
  competencies?: any;             // string[]
  architect_domains?: any;        // string[]
  bloom?: any;                    // string[]
  evidence_produced?: any;        // string[]
  github_deliverables?: any;      // string[]
  portfolio_deliverables?: any;   // string[]
  builder_xp?: number;
  learning_xp?: number;
  community_xp?: number;
  architect_readiness?: number;
  certification_mapping?: any;    // {}
  unlock_rules?: any;             // []
  completion_rules?: any;         // {}
  success_criteria?: any;         // string[]
  instructor_notes?: string | null;
  ai_notes?: string | null;
  risk_areas?: any;               // string[]
  student_outcomes?: any;         // string[]
  generated_plan?: any;           // CurriculumPlan
  dna?: any;                      // CurriculumDna
  quality_score?: number;
  coverage_score?: number;
  readiness_score?: number;
  status?: string;                // draft|generated|validated|published
  published_card_ids?: any;       // string[]
  created_at?: Date;
  updated_at?: Date;
}

class CurriculumBlueprint extends Model<CurriculumBlueprintAttributes> implements CurriculumBlueprintAttributes {
  declare id: string;
  declare title: string;
  declare purpose: string | null;
  declare problem_statement: string | null;
  declare target_audience: string | null;
  declare program_id: string | null;
  declare cohort_id: string | null;
  declare week: number | null;
  declare session: string | null;
  declare scope: string;
  declare difficulty: string;
  declare estimated_hours: number | null;
  declare learning_objectives: any;
  declare competencies: any;
  declare architect_domains: any;
  declare bloom: any;
  declare evidence_produced: any;
  declare github_deliverables: any;
  declare portfolio_deliverables: any;
  declare builder_xp: number;
  declare learning_xp: number;
  declare community_xp: number;
  declare architect_readiness: number;
  declare certification_mapping: any;
  declare unlock_rules: any;
  declare completion_rules: any;
  declare success_criteria: any;
  declare instructor_notes: string | null;
  declare ai_notes: string | null;
  declare risk_areas: any;
  declare student_outcomes: any;
  declare generated_plan: any;
  declare dna: any;
  declare quality_score: number;
  declare coverage_score: number;
  declare readiness_score: number;
  declare status: string;
  declare published_card_ids: any;
  declare created_at: Date;
  declare updated_at: Date;
}

CurriculumBlueprint.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING(500), allowNull: false },
  purpose: { type: DataTypes.TEXT, allowNull: true },
  problem_statement: { type: DataTypes.TEXT, allowNull: true },
  target_audience: { type: DataTypes.STRING(300), allowNull: true },
  program_id: { type: DataTypes.UUID, allowNull: true },
  cohort_id: { type: DataTypes.UUID, allowNull: true },
  week: { type: DataTypes.INTEGER, allowNull: true },
  session: { type: DataTypes.STRING(120), allowNull: true },
  scope: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'week' },
  difficulty: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'core' },
  estimated_hours: { type: DataTypes.FLOAT, allowNull: true },
  learning_objectives: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  competencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  architect_domains: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  bloom: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  evidence_produced: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  github_deliverables: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  portfolio_deliverables: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  builder_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  learning_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  community_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  architect_readiness: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  certification_mapping: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  unlock_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  completion_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  success_criteria: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  instructor_notes: { type: DataTypes.TEXT, allowNull: true },
  ai_notes: { type: DataTypes.TEXT, allowNull: true },
  risk_areas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  student_outcomes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  generated_plan: { type: DataTypes.JSONB, allowNull: true },
  dna: { type: DataTypes.JSONB, allowNull: true },
  quality_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  coverage_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  readiness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
  published_card_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, {
  sequelize,
  modelName: 'CurriculumBlueprint',
  tableName: 'curriculum_blueprints',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default CurriculumBlueprint;
