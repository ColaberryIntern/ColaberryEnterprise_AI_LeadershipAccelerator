import { sequelize } from '../config/database';

/**
 * Weekly Live Studio data model (Basecamp WL2.1, Ali 2026-11-24): the topic picker, its research,
 * the content plan and the live moments. Created at startup like every other ensure*Schema (prod
 * never alter-syncs). Every statement is CREATE ... IF NOT EXISTS, so a second startup creates
 * nothing; there is no DROP, RENAME or type change anywhere in this file.
 *
 *  - weekly_live_plans: one planning run for an air date (inputs, the batch it lands in, the pick).
 *  - weekly_live_signals: dated, fetched news items a plan found, tagged with the 10 viral factors.
 *  - weekly_live_demand: best recent YouTube video per curriculum week vs its channel median.
 *  - weekly_live_topics: the five scored topics a plan offered.
 *  - weekly_live_content_pieces: one row per piece of the content plan (long video, Shorts, cards,
 *    posts). UNIQUE(session_id, piece_key) is the idempotency key for the Basecamp to-do button.
 *  - weekly_live_moments: "mark a moment" timestamps during the live, for clips.
 *  - weekly_live_session_weeks: which curriculum week a live session taught (the curriculum map's
 *    coverage). import_batch lets the one-time history import be deleted by id.
 *  - weekly_live_plan_runs: the stage, message and heartbeat of a plan's latest run.
 *  - weekly_live_spend: one row per paid research call, reserved before the call (the monthly cap).
 */
export const WEEKLY_LIVE_TABLES = [
  'weekly_live_plans',
  'weekly_live_signals',
  'weekly_live_demand',
  'weekly_live_topics',
  'weekly_live_content_pieces',
  'weekly_live_moments',
  'weekly_live_session_weeks',
  'weekly_live_spend',
  'weekly_live_plan_runs',
  'weekly_live_blueprints',
] as const;

export const PLAN_STATUSES = ['draft', 'researching', 'ready', 'chosen', 'failed'] as const;
export const PIECE_STATUSES = ['planned', 'assigned', 'uploaded', 'approved', 'scheduled', 'posted', 'rejected'] as const;
export const MOMENT_KINDS = ['clip', 'quote', 'question', 'demo', 'note'] as const;

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(', ');

export const WEEKLY_LIVE_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS weekly_live_plans (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     air_date DATE NOT NULL,
     cohort_id UUID REFERENCES cohorts(id),
     live_session_id UUID REFERENCES live_sessions(id),
     inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
     status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN (${list(PLAN_STATUSES)})),
     chosen_topic_id UUID,
     cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
     created_by VARCHAR(254),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS ix_weekly_live_plans_air_date ON weekly_live_plans (air_date)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_signals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     plan_id UUID NOT NULL REFERENCES weekly_live_plans(id) ON DELETE CASCADE,
     published_at DATE,
     date_confirmed BOOLEAN NOT NULL DEFAULT false,
     factors INTEGER[] NOT NULL DEFAULT '{}',
     headline VARCHAR(500) NOT NULL,
     publisher VARCHAR(200),
     url VARCHAR(1000) NOT NULL,
     fits_weeks INTEGER[] NOT NULL DEFAULT '{}',
     idea TEXT,
     fetched_ok BOOLEAN NOT NULL DEFAULT false,
     dropped_reason VARCHAR(200),
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_live_signals_plan_url ON weekly_live_signals (plan_id, url)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_demand (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
     video_url VARCHAR(500),
     video_title VARCHAR(500),
     channel VARCHAR(200),
     views INTEGER,
     channel_median INTEGER,
     multiple NUMERIC(8, 2),
     score INTEGER CHECK (score BETWEEN 0 AND 5),
     thin_median BOOLEAN NOT NULL DEFAULT false,
     error VARCHAR(200),
     measured_at DATE NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_live_demand_week_day ON weekly_live_demand (week, measured_at)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_topics (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     plan_id UUID NOT NULL REFERENCES weekly_live_plans(id) ON DELETE CASCADE,
     rank INTEGER NOT NULL,
     week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
     title VARCHAR(200) NOT NULL,
     spin TEXT,
     parody TEXT,
     hooks JSONB NOT NULL DEFAULT '[]'::jsonb,
     package JSONB NOT NULL DEFAULT '{}'::jsonb,
     marketing JSONB NOT NULL DEFAULT '{}'::jsonb,
     signals_used UUID[] NOT NULL DEFAULT '{}',
     teach_lines JSONB NOT NULL DEFAULT '{}'::jsonb,
     teach NUMERIC(5, 1) NOT NULL,
     viral NUMERIC(5, 1) NOT NULL,
     convert NUMERIC(5, 1) NOT NULL,
     topic_score NUMERIC(5, 1) NOT NULL,
     factors INTEGER[] NOT NULL DEFAULT '{}',
     warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_live_topics_plan_rank ON weekly_live_topics (plan_id, rank)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_content_pieces (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id UUID NOT NULL REFERENCES live_sessions(id),
     piece_key VARCHAR(64) NOT NULL,
     kind VARCHAR(32) NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK (status IN (${list(PIECE_STATUSES)})),
     plan JSONB NOT NULL DEFAULT '{}'::jsonb,
     basecamp_todo_id BIGINT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_live_content_pieces ON weekly_live_content_pieces (session_id, piece_key)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_moments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id UUID NOT NULL REFERENCES live_sessions(id),
     at TIMESTAMPTZ NOT NULL,
     kind VARCHAR(16) NOT NULL DEFAULT 'clip' CHECK (kind IN (${list(MOMENT_KINDS)})),
     slide_index INTEGER,
     note VARCHAR(500),
     created_by VARCHAR(254),
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS ix_weekly_live_moments_session ON weekly_live_moments (session_id, at)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_session_weeks (
     session_id UUID PRIMARY KEY REFERENCES live_sessions(id),
     week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
     source VARCHAR(32) NOT NULL DEFAULT 'studio',
     import_batch VARCHAR(64),
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS weekly_live_spend (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     plan_id UUID REFERENCES weekly_live_plans(id) ON DELETE SET NULL,
     purpose VARCHAR(64) NOT NULL,
     cost_usd NUMERIC(10, 4) NOT NULL CHECK (cost_usd >= 0),
     settled BOOLEAN NOT NULL DEFAULT false,
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS ix_weekly_live_spend_created ON weekly_live_spend (created_at)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_plan_runs (
     plan_id UUID PRIMARY KEY REFERENCES weekly_live_plans(id) ON DELETE CASCADE,
     run_id UUID NOT NULL DEFAULT gen_random_uuid(),
     stage VARCHAR(16) NOT NULL DEFAULT 'queued',
     note VARCHAR(300),
     error VARCHAR(300),
     heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // WL4.1: how the plan's session came to be. 'created' = Studio made the row and may retitle it on a
  // re-choose; 'adopted' = a class already sat on that date and Studio only links it, never edits it.
  `ALTER TABLE weekly_live_plans ADD COLUMN IF NOT EXISTS session_origin VARCHAR(16) CHECK (session_origin IN ('created', 'adopted'))`,
  // WL4.2: the session blueprint the deck is built from, one per plan and topic. Kept so a rebuild is
  // free and byte-identical; status/heartbeat make the background writer claimable exactly once.
  `CREATE TABLE IF NOT EXISTS weekly_live_blueprints (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     plan_id UUID NOT NULL REFERENCES weekly_live_plans(id) ON DELETE CASCADE,
     topic_id UUID NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'writing' CHECK (status IN ('writing', 'ready', 'failed')),
     blueprint JSONB,
     problems JSONB NOT NULL DEFAULT '[]'::jsonb,
     error VARCHAR(400),
     model VARCHAR(64),
     attempts INTEGER NOT NULL DEFAULT 0,
     heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (plan_id, topic_id)
   )`,
];

/** Run every statement in order. Throws on the first failure: a half-made schema must not boot quietly. */
export async function ensureWeeklyLiveSchema(): Promise<void> {
  for (const ddl of WEEKLY_LIVE_DDL) await sequelize.query(ddl);
}
