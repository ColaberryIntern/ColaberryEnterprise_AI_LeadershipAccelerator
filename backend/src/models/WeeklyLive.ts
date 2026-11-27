import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { PLAN_STATUSES, PIECE_STATUSES, MOMENT_KINDS } from '../db/ensureWeeklyLiveSchema';

/**
 * Typed Sequelize models for the Weekly Live Studio tables (Basecamp WL2.1). The tables are created
 * by db/ensureWeeklyLiveSchema.ts, never by sync: every model sets timestamps false and the DDL file
 * is the single source of the schema. These models are the read/write contract the topic picker,
 * the content plan and the live tab use (CLAUDE.md: Sequelize models are the contract).
 *
 * Not registered in models/index.ts on purpose: nothing associates with them yet, and leaving them
 * out keeps any dev alter-sync from touching tables whose DDL lives elsewhere.
 */
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PieceStatus = (typeof PIECE_STATUSES)[number];
export type MomentKind = (typeof MOMENT_KINDS)[number];

/** Topic picker inputs, as Ali fills them in on Studio setup. */
export interface PlanInputs {
  week: number | 'auto';
  proof?: string;
  forceNews?: string;
  audience?: string;
  avoid?: string;
  notes?: string;
}

/*
 * Every column definition is a FUNCTION that returns a fresh object. Sequelize writes into the object it
 * is given, so one object shared by several columns keeps only the first: on 2026-11-27 the topic save
 * sent `teach` but not `viral`, `convert` or `topic_score` and Postgres refused the row, and every signal
 * lost `fits_weeks` without any error. models/__tests__/weeklyLiveModels.test.ts checks each column.
 */
const id = () => ({ type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true });
const uuid = (allowNull = true) => ({ type: DataTypes.UUID, allowNull });
const json = (fallback: unknown) => ({ type: DataTypes.JSONB, allowNull: false, defaultValue: fallback });
const ints = () => ({ type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] });
const score = () => ({ type: DataTypes.DECIMAL(5, 1), allowNull: false });
const opts = (tableName: string) => ({ sequelize, tableName, timestamps: false, underscored: true });

export class WeeklyLivePlan extends Model {
  declare id: string;
  declare air_date: string;
  declare cohort_id: string | null;
  declare live_session_id: string | null;
  declare inputs: PlanInputs;
  declare status: PlanStatus;
  declare chosen_topic_id: string | null;
  declare cost_usd: string;
  declare created_by: string | null;
}
WeeklyLivePlan.init({
  id: id(),
  air_date: { type: DataTypes.DATEONLY, allowNull: false },
  cohort_id: uuid(),
  live_session_id: uuid(),
  inputs: json({}),
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
  chosen_topic_id: uuid(),
  cost_usd: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0 },
  created_by: { type: DataTypes.STRING(254), allowNull: true },
}, opts('weekly_live_plans'));

export class WeeklyLiveSignal extends Model {
  declare id: string;
  declare plan_id: string;
  declare published_at: string | null;
  declare date_confirmed: boolean;
  declare factors: number[];
  declare headline: string;
  declare publisher: string | null;
  declare url: string;
  declare fits_weeks: number[];
  declare idea: string | null;
  declare fetched_ok: boolean;
  declare dropped_reason: string | null;
}
WeeklyLiveSignal.init({
  id: id(),
  plan_id: uuid(false),
  published_at: { type: DataTypes.DATEONLY, allowNull: true },
  date_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  factors: ints(),
  headline: { type: DataTypes.STRING(500), allowNull: false },
  publisher: { type: DataTypes.STRING(200), allowNull: true },
  url: { type: DataTypes.STRING(1000), allowNull: false },
  fits_weeks: ints(),
  idea: { type: DataTypes.TEXT, allowNull: true },
  fetched_ok: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  dropped_reason: { type: DataTypes.STRING(200), allowNull: true },
}, opts('weekly_live_signals'));

export class WeeklyLiveDemand extends Model {
  declare id: string;
  declare week: number;
  declare video_url: string | null;
  declare video_title: string | null;
  declare channel: string | null;
  declare views: number | null;
  declare channel_median: number | null;
  declare multiple: string | null;
  declare score: number | null;
  declare thin_median: boolean;
  declare error: string | null;
  declare measured_at: string;
}
WeeklyLiveDemand.init({
  id: id(),
  week: { type: DataTypes.INTEGER, allowNull: false },
  video_url: { type: DataTypes.STRING(500), allowNull: true },
  video_title: { type: DataTypes.STRING(500), allowNull: true },
  channel: { type: DataTypes.STRING(200), allowNull: true },
  views: { type: DataTypes.INTEGER, allowNull: true },
  channel_median: { type: DataTypes.INTEGER, allowNull: true },
  multiple: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
  score: { type: DataTypes.INTEGER, allowNull: true },
  thin_median: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  error: { type: DataTypes.STRING(200), allowNull: true },
  measured_at: { type: DataTypes.DATEONLY, allowNull: false },
}, opts('weekly_live_demand'));

export interface TopicHook { text: string; viral: number; }
export interface TopicWarning { code: string; message: string; }

export class WeeklyLiveTopic extends Model {
  declare id: string;
  declare plan_id: string;
  declare rank: number;
  declare week: number;
  declare title: string;
  declare spin: string | null;
  declare parody: string | null;
  declare hooks: TopicHook[];
  declare package: Record<string, string>;
  declare marketing: Record<string, string>;
  declare signals_used: string[];
  declare teach_lines: Record<string, { score: number; why: string }>;
  declare teach: string;
  declare viral: string;
  declare convert: string;
  declare topic_score: string;
  declare factors: number[];
  declare warnings: TopicWarning[];
}
WeeklyLiveTopic.init({
  id: id(),
  plan_id: uuid(false),
  rank: { type: DataTypes.INTEGER, allowNull: false },
  week: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: false },
  spin: { type: DataTypes.TEXT, allowNull: true },
  parody: { type: DataTypes.TEXT, allowNull: true },
  hooks: json([]),
  package: json({}),
  marketing: json({}),
  signals_used: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false, defaultValue: [] },
  teach_lines: json({}),
  teach: score(),
  viral: score(),
  convert: score(),
  topic_score: score(),
  factors: ints(),
  warnings: json([]),
}, opts('weekly_live_topics'));

export class WeeklyLiveContentPiece extends Model {
  declare id: string;
  declare session_id: string;
  declare piece_key: string;
  declare kind: string;
  declare status: PieceStatus;
  declare plan: Record<string, unknown>;
  declare basecamp_todo_id: string | null;
}
WeeklyLiveContentPiece.init({
  id: id(),
  session_id: uuid(false),
  piece_key: { type: DataTypes.STRING(64), allowNull: false },
  kind: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'planned' },
  plan: json({}),
  basecamp_todo_id: { type: DataTypes.BIGINT, allowNull: true },
}, opts('weekly_live_content_pieces'));

export class WeeklyLiveMoment extends Model {
  declare id: string;
  declare session_id: string;
  declare at: Date;
  declare kind: MomentKind;
  declare slide_index: number | null;
  declare note: string | null;
  declare created_by: string | null;
}
WeeklyLiveMoment.init({
  id: id(),
  session_id: uuid(false),
  at: { type: DataTypes.DATE, allowNull: false },
  kind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'clip' },
  slide_index: { type: DataTypes.INTEGER, allowNull: true },
  note: { type: DataTypes.STRING(500), allowNull: true },
  created_by: { type: DataTypes.STRING(254), allowNull: true },
}, opts('weekly_live_moments'));

export class WeeklyLiveSessionWeek extends Model {
  declare session_id: string;
  declare week: number;
  declare source: string;
  declare import_batch: string | null;
}
WeeklyLiveSessionWeek.init({
  session_id: { type: DataTypes.UUID, primaryKey: true },
  week: { type: DataTypes.INTEGER, allowNull: false },
  source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'studio' },
  import_batch: { type: DataTypes.STRING(64), allowNull: true },
}, opts('weekly_live_session_weeks'));
