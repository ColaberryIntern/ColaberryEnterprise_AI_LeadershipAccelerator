import { sequelize } from '../config/database';

/**
 * hire.refactored.ai profile upgrade, Phase 2 (kit PROMPT.md §4.1): the candidate's own words,
 * the times they can interview, the order of their carousel, and the interviews employers ask for.
 *
 * ADDITIVE ONLY. Four new tables and their indexes; nothing existing is altered. Every
 * statement is `IF NOT EXISTS`, so this runs on every boot and a re-run is a no-op.
 *
 *   hire_profile_intro           one row per enrollment. `headline_draft` and `work_auth` are
 *                                INTERNAL: no public projection reads them (hireStudioSettings).
 *                                Video columns are written by Phase 5; a draft video never shows.
 *   hire_interview_availability  one row per enrollment. `enabled` is the candidate's opt-in to
 *                                booking: false (the default) means the profile keeps "Request
 *                                intro". `max_per_week` NULL means no limit.
 *   hire_case_study_order        one row per enrollment; slugs are validated against the person's
 *                                published Hire case studies on write. The signature still comes
 *                                from the existing field.
 *   hire_interviews              one row per request. `starts_at` is UTC. The employer's email
 *                                is stored for Phase 4's notifications and is never returned by
 *                                any public route nor to the candidate.
 *
 * IDEMPOTENCY. The partial unique index on (enrollment_id, starts_at, employer email) over the
 * statuses that hold a time IS the key for a repeated request: the same employer asking for the
 * same slot twice yields one row. Overlapping requests from different employers are serialised by
 * an advisory lock in hireInterviews, not by an index (two 45-minute requests at 10:00 and 10:30
 * overlap without sharing a start).
 *
 * ROLLBACK: `HIRE_INTERVIEW_ROLLBACK` below, run by hand. Nothing else references these tables,
 * so dropping them returns the platform to the Phase 1 state; the hire site already renders
 * without `hire.intro`, `hire.caseStudyOrder` and `hire.booking`.
 */
const HOLDING = `('requested','confirmed','rescheduled')`;

export const HIRE_INTERVIEW_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS hire_profile_intro (
     enrollment_id UUID PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
     headline_draft VARCHAR(90),
     answers JSONB NOT NULL DEFAULT '[]'::jsonb,
     roles TEXT[] NOT NULL DEFAULT '{}',
     setups TEXT[] NOT NULL DEFAULT '{}',
     location VARCHAR(120),
     earliest_start DATE,
     work_auth VARCHAR(80),
     video_asset_id VARCHAR(120),
     video_status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (video_status IN ('draft','published')),
     video_seconds INTEGER,
     video_stream_url TEXT,
     poster_url TEXT,
     captions_url TEXT,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS hire_interview_availability (
     enrollment_id UUID PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
     enabled BOOLEAN NOT NULL DEFAULT false,
     tz VARCHAR(64) NOT NULL DEFAULT 'America/Chicago',
     blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
     formats TEXT[] NOT NULL DEFAULT '{intro}',
     max_per_week INTEGER,
     min_notice_hours INTEGER NOT NULL DEFAULT 24,
     auto_confirm BOOLEAN NOT NULL DEFAULT false,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS hire_case_study_order (
     enrollment_id UUID PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
     slugs TEXT[] NOT NULL DEFAULT '{}',
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS hire_interviews (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     talent_slug VARCHAR(160) NOT NULL,
     format VARCHAR(20) NOT NULL CHECK (format IN ('intro','walkthrough','working')),
     case_study_slug VARCHAR(255),
     starts_at TIMESTAMPTZ NOT NULL,
     minutes INTEGER NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'requested'
       CHECK (status IN ('requested','confirmed','declined','rescheduled','cancelled','completed')),
     employer_name VARCHAR(120) NOT NULL,
     employer_email VARCHAR(254) NOT NULL,
     employer_company VARCHAR(160) NOT NULL,
     employer_role VARCHAR(120) NOT NULL,
     message TEXT NOT NULL DEFAULT '',
     extra_interviewers TEXT[] NOT NULL DEFAULT '{}',
     record_requested BOOLEAN NOT NULL DEFAULT false,
     room_url TEXT,
     lead_source VARCHAR(64) NOT NULL DEFAULT 'hire-refactored',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // The idempotency key for a repeated request (see header).
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_hire_interviews_repeat
     ON hire_interviews (enrollment_id, starts_at, LOWER(employer_email)) WHERE status IN ${HOLDING}`,
  // The slot computation reads one person's holding interviews in a window.
  `CREATE INDEX IF NOT EXISTS idx_hire_interviews_enrollment_starts
     ON hire_interviews (enrollment_id, starts_at)`,
  // Phase 5, the intro video. Coaching is the video-analysis result, shown to the candidate
  // ONLY (kit §4.3); captions_wanted is the studio's "captions automatically" box. Additive and
  // nullable, so dropping them returns the table to its Phase 4 shape.
  `ALTER TABLE hire_profile_intro ADD COLUMN IF NOT EXISTS video_coaching JSONB`,
  `ALTER TABLE hire_profile_intro ADD COLUMN IF NOT EXISTS video_captions_wanted BOOLEAN NOT NULL DEFAULT true`,
];

/** Run by hand to roll Phase 2 back. Never run at boot. */
export const HIRE_INTERVIEW_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS hire_interviews',
  'DROP TABLE IF EXISTS hire_case_study_order',
  'DROP TABLE IF EXISTS hire_interview_availability',
  'DROP TABLE IF EXISTS hire_profile_intro',
];

export async function ensureHireInterviewSchema(): Promise<void> {
  for (const sql of HIRE_INTERVIEW_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'hire_interview_schema_stmt_skipped', outcome: 'partial', error_class: e.name || 'Error',
        context: { message: e.message.slice(0, 200) },
      }));
    }
  }
  console.log('[DB] hire interview schema ensured');
}

export default ensureHireInterviewSchema;
