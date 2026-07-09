import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CurriculumTypeDefinitionAttributes {
  id?: string;
  slug: string;
  label: string;
  student_label: string;
  description?: string;
  icon?: string;
  badge_class?: string;
  can_create_variables?: boolean;
  can_create_artifacts?: boolean;
  applicable_prompt_pairs?: string[];
  default_prompts?: Record<string, { system: string; user: string }>;
  settings_schema?: Record<string, any>;
  is_system?: boolean;
  is_active?: boolean;
  display_order?: number;
  // Timeline Engine registry metadata (Classroom rebuild — all nullable/additive).
  bucket_default?: string | null;
  render_band?: string | null;
  learning_xp?: number | null;
  builder_xp?: number | null;
  community_xp?: number | null;
  estimated_time?: number | null;
  difficulty?: string | null;
  competencies?: any;
  evidence_required?: boolean;
  github_required?: boolean;
  ai_evaluation?: boolean;
  instructor_review?: boolean;
  portfolio_eligible?: boolean;
  certification_mapping?: any;
  // Experience Builder (Phase 1) — every Type is a versioned AI Component. All
  // additive/nullable so the live registry is untouched until backfilled.
  design_prompt?: string | null;      // pipeline stage 0 — how the experience is designed
  renderer_prompt?: string | null;
  generation_prompt?: string | null;
  evaluation_prompt?: string | null;
  reflection_prompt?: string | null;
  github_prompt?: string | null;
  improvement_prompt?: string | null;
  thumbnail_url?: string | null;
  preview_examples?: any;              // [{ title, output, generated_at }]
  variable_keys?: any;                 // string[] — variables the component reads
  est_input_tokens?: number | null;
  est_output_tokens?: number | null;
  est_cost_usd?: number | null;
  est_runtime_ms?: number | null;
  component_version?: number;
  // Experience Studio metadata + composition (additive/nullable).
  category?: string | null;
  tags?: any;                          // string[]
  status?: string | null;             // draft | ready | published | deprecated
  learning_objectives?: any;          // string[]
  architect_domains?: any;            // string[]
  capabilities?: any;                 // string[] of capability-module ids
  // Output Contracts (explicit I/O — no implicit behavior).
  inputs?: any;                       // [{ key, type, required }]
  outputs?: any;                      // [{ key, type, description }]
  artifacts_produced?: any;           // string[]
  evidence_produced?: any;            // string[]
  portfolio_assets?: any;             // string[]
  github_assets?: any;                // string[]
  evaluation_type?: string | null;    // none | ai | rubric | instructor | peer
  completion_rules?: any;             // { on: 'view'|'submit'|'evaluate'|'approve', min_score? }
  // Dependencies + lifecycle.
  dependencies?: any;                 // string[] of component slugs this requires
  version_locked?: boolean;
  // Renderer Engine — prompt-driven renderer definition (8 surfaces). No hardcoded layouts.
  renderers?: any;                    // { thumbnail, timeline, expanded, runtime, student, mobile, tablet, desktop: string }
  created_at?: Date;
  updated_at?: Date;
}

class CurriculumTypeDefinition extends Model<CurriculumTypeDefinitionAttributes> implements CurriculumTypeDefinitionAttributes {
  declare id: string;
  declare slug: string;
  declare label: string;
  declare student_label: string;
  declare description: string;
  declare icon: string;
  declare badge_class: string;
  declare can_create_variables: boolean;
  declare can_create_artifacts: boolean;
  declare applicable_prompt_pairs: string[];
  declare default_prompts: Record<string, { system: string; user: string }>;
  declare settings_schema: Record<string, any>;
  declare is_system: boolean;
  declare is_active: boolean;
  declare display_order: number;
  declare bucket_default: string | null;
  declare render_band: string | null;
  declare learning_xp: number | null;
  declare builder_xp: number | null;
  declare community_xp: number | null;
  declare estimated_time: number | null;
  declare difficulty: string | null;
  declare competencies: any;
  declare evidence_required: boolean;
  declare github_required: boolean;
  declare ai_evaluation: boolean;
  declare instructor_review: boolean;
  declare portfolio_eligible: boolean;
  declare certification_mapping: any;
  declare design_prompt: string | null;
  declare renderer_prompt: string | null;
  declare generation_prompt: string | null;
  declare evaluation_prompt: string | null;
  declare reflection_prompt: string | null;
  declare github_prompt: string | null;
  declare improvement_prompt: string | null;
  declare thumbnail_url: string | null;
  declare preview_examples: any;
  declare variable_keys: any;
  declare est_input_tokens: number | null;
  declare est_output_tokens: number | null;
  declare est_cost_usd: number | null;
  declare est_runtime_ms: number | null;
  declare component_version: number;
  declare category: string | null;
  declare tags: any;
  declare status: string | null;
  declare learning_objectives: any;
  declare architect_domains: any;
  declare capabilities: any;
  declare inputs: any;
  declare outputs: any;
  declare artifacts_produced: any;
  declare evidence_produced: any;
  declare portfolio_assets: any;
  declare github_assets: any;
  declare evaluation_type: string | null;
  declare completion_rules: any;
  declare dependencies: any;
  declare version_locked: boolean;
  declare renderers: any;
  declare created_at: Date;
  declare updated_at: Date;
}

CurriculumTypeDefinition.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    student_label: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'bi-square',
    },
    badge_class: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'bg-secondary',
    },
    can_create_variables: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    can_create_artifacts: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    applicable_prompt_pairs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    default_prompts: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    settings_schema: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Timeline Engine registry metadata — nullable so existing rows are untouched.
    bucket_default: { type: DataTypes.STRING(30), allowNull: true },
    render_band: { type: DataTypes.STRING(60), allowNull: true },
    learning_xp: { type: DataTypes.INTEGER, allowNull: true },
    builder_xp: { type: DataTypes.INTEGER, allowNull: true },
    community_xp: { type: DataTypes.INTEGER, allowNull: true },
    estimated_time: { type: DataTypes.INTEGER, allowNull: true },
    difficulty: { type: DataTypes.STRING(20), allowNull: true },
    competencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    evidence_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    github_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ai_evaluation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    instructor_review: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    portfolio_eligible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    certification_mapping: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Experience Builder — AI Component fields (additive/nullable).
    design_prompt: { type: DataTypes.TEXT, allowNull: true },
    renderer_prompt: { type: DataTypes.TEXT, allowNull: true },
    generation_prompt: { type: DataTypes.TEXT, allowNull: true },
    evaluation_prompt: { type: DataTypes.TEXT, allowNull: true },
    reflection_prompt: { type: DataTypes.TEXT, allowNull: true },
    github_prompt: { type: DataTypes.TEXT, allowNull: true },
    improvement_prompt: { type: DataTypes.TEXT, allowNull: true },
    thumbnail_url: { type: DataTypes.TEXT, allowNull: true },
    preview_examples: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    variable_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    est_input_tokens: { type: DataTypes.INTEGER, allowNull: true },
    est_output_tokens: { type: DataTypes.INTEGER, allowNull: true },
    est_cost_usd: { type: DataTypes.DOUBLE, allowNull: true },
    est_runtime_ms: { type: DataTypes.INTEGER, allowNull: true },
    component_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    category: { type: DataTypes.STRING(60), allowNull: true },
    tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ready' },
    learning_objectives: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    architect_domains: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    capabilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    outputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    artifacts_produced: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    evidence_produced: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    portfolio_assets: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    github_assets: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    evaluation_type: { type: DataTypes.STRING(20), allowNull: true },
    completion_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    dependencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    version_locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    renderers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'curriculum_type_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default CurriculumTypeDefinition;
