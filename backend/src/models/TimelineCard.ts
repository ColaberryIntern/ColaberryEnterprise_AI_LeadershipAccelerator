import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TimelineCard — the universal card template of the Timeline Engine.
 *
 * Every learning object (lesson, mini-section, session, announcement,
 * milestone, ...) is one row here, regardless of type. The card's `type`
 * resolves through the Curriculum Type Registry (no per-type tables, no
 * switch). Per-student state lives in TimelineCardProgress.
 *
 * See docs/architecture/timeline-engine/{ARCHITECTURE,ERD}.md.
 * Gated by TIMELINE_ENGINE_ENABLED; legacy tables stay authoritative until
 * the flag flips per cohort.
 */

export type TimelineBucket =
  | 'pre_class' | 'learn' | 'practice' | 'build' | 'reflect' | 'share' | 'advance';

export type TimelineCardVisibility = 'draft' | 'scheduled' | 'published' | 'archived';
export type TimelineCardDifficulty = 'intro' | 'core' | 'stretch';
export type TimelineCardRefKind = 'lesson' | 'session' | 'mini_section' | 'artifact' | 'none';

export interface TimelinePoints {
  learning?: number;
  builder?: number;
  community?: number;
}

export interface TimelineCardAttributes {
  id?: string;
  type: string;                 // FK-by-convention -> curriculum_type_definitions.slug
  title: string;
  subtitle?: string | null;
  description?: string | null;
  week?: number | null;
  bucket: TimelineBucket;
  event_id?: string | null;
  session_id?: string | null;
  visibility: TimelineCardVisibility;
  release_date?: Date | null;
  unlock_rules?: any;           // JSONB predicate array
  completion_rules?: any;       // JSONB
  estimated_time?: number | null;
  difficulty?: TimelineCardDifficulty;
  priority?: number;
  points?: TimelinePoints;      // per-card override of type defaults
  competencies?: any;           // [{domain_id, weight}]
  ref_kind?: TimelineCardRefKind;
  ref_id?: string | null;       // FK-by-convention to the referenced content entity
  prompt_refs?: any;            // {concept,build,mentor,kc,reflection}
  variable_keys?: string[];
  creates_variable_keys?: string[];
  artifact_ids?: string[];
  github?: any;                 // {required, repo, path, issue, pr, release}
  ai_actions?: any;
  status: 'active' | 'inactive';
  cohort_id?: string | null;
  program_id?: string | null;
  order?: number;
  metadata?: any;
  // Feed Control plane (all nullable → fall back to type default, then policy).
  feed_surface?: string | null;       // override the type's home_surface for this card
  feed_cadence?: number | null;       // per-card Today cadence override
  feed_frequency_cap?: number | null; // max times shown to one student
  feed_cooldown_days?: number | null; // min days before it can reappear
  pinned_until?: Date | null;         // boosted to the top while in the future
  created_at?: Date;
  updated_at?: Date;
}

class TimelineCard extends Model<TimelineCardAttributes> implements TimelineCardAttributes {
  declare id: string;
  declare type: string;
  declare title: string;
  declare subtitle: string | null;
  declare description: string | null;
  declare week: number | null;
  declare bucket: TimelineBucket;
  declare event_id: string | null;
  declare session_id: string | null;
  declare visibility: TimelineCardVisibility;
  declare release_date: Date | null;
  declare unlock_rules: any;
  declare completion_rules: any;
  declare estimated_time: number | null;
  declare difficulty: TimelineCardDifficulty;
  declare priority: number;
  declare points: TimelinePoints;
  declare competencies: any;
  declare ref_kind: TimelineCardRefKind;
  declare ref_id: string | null;
  declare prompt_refs: any;
  declare variable_keys: string[];
  declare creates_variable_keys: string[];
  declare artifact_ids: string[];
  declare github: any;
  declare ai_actions: any;
  declare status: 'active' | 'inactive';
  declare cohort_id: string | null;
  declare program_id: string | null;
  declare order: number;
  declare metadata: any;
  declare feed_surface: string | null;
  declare feed_cadence: number | null;
  declare feed_frequency_cap: number | null;
  declare feed_cooldown_days: number | null;
  declare pinned_until: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

TimelineCard.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.STRING(100), allowNull: false },
    title: { type: DataTypes.STRING(500), allowNull: false },
    subtitle: { type: DataTypes.STRING(500), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    week: { type: DataTypes.INTEGER, allowNull: true },
    bucket: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'learn' },
    event_id: { type: DataTypes.UUID, allowNull: true },
    session_id: { type: DataTypes.UUID, allowNull: true },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    release_date: { type: DataTypes.DATE, allowNull: true },
    unlock_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    completion_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    estimated_time: { type: DataTypes.INTEGER, allowNull: true },
    difficulty: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'core' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    points: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    competencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    ref_kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none' },
    ref_id: { type: DataTypes.UUID, allowNull: true },
    prompt_refs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    variable_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    creates_variable_keys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    artifact_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    github: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    ai_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    cohort_id: { type: DataTypes.UUID, allowNull: true },
    program_id: { type: DataTypes.UUID, allowNull: true },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    feed_surface: { type: DataTypes.STRING(20), allowNull: true },
    feed_cadence: { type: DataTypes.INTEGER, allowNull: true },
    feed_frequency_cap: { type: DataTypes.INTEGER, allowNull: true },
    feed_cooldown_days: { type: DataTypes.INTEGER, allowNull: true },
    pinned_until: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'timeline_cards',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['cohort_id', 'week', 'bucket', 'order'] },
      { fields: ['type'] },
      { fields: ['event_id'] },
      { fields: ['session_id'] },
      { fields: ['visibility'] },
      { fields: ['ref_kind', 'ref_id'] },
    ],
  }
);

export default TimelineCard;
