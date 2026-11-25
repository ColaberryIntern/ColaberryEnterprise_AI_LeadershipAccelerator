import { sequelize } from '../config/database';

/**
 * Career Prep v27, CP1.2 (kit section P5): the tables every number in the Career Prep room comes from.
 *
 * ADDITIVE ONLY. Ten new tables (prep_attempts added in CP4.4, prep_reminders in CP4.5, prep_saved_answers in R1.1) and
 * one added column (prep_saved_answers.show_public, R1.2, default false); nothing else is altered. Every statement is IF NOT EXISTS
 * or ON CONFLICT DO NOTHING, so this runs on every boot and a re-run is a no-op. CP5.8 (read-aloud) adds prep_attempts.kind
 * (default 'try') and line_id, and WIDENS (never narrows) the prep_observations.source CHECK with 'read_aloud', guarded so it
 * runs once. To revert it (by hand, never at boot), first `DELETE FROM prep_observations WHERE source = 'read_aloud'`, then
 *   ALTER TABLE prep_observations DROP CONSTRAINT prep_observations_source_check;
 *   ALTER TABLE prep_observations ADD CONSTRAINT prep_observations_source_check
 *     CHECK (source IN ('video','phone_mock','real_interview','training','project'));
 * and, for the attempt columns, `ALTER TABLE prep_attempts DROP COLUMN IF EXISTS line_id, DROP COLUMN IF EXISTS kind`. The kit says
 * `participant_id`; in this repo a student is an enrollment, so the column is `enrollment_id`.
 *
 *   career_interviews     one row per interview a student prepares for. source: real (an
 *                         employer interview, today from hire_interviews; Release 2 adds the
 *                         inbox), added (the student added it), practice (made by Cora, no date).
 *                         hire_interview_id is UNIQUE, so linking the same Hire interview twice
 *                         yields one row. placement_interview_id (CP8.3, added column) is UNIQUE
 *                         where set: one row per booked placement interview, however often the
 *                         booking work retries.
 *   prep_skills           the skills readiness is built from. Seeded with 9 (the kit's 10 minus
 *                         "Eye contact": no face analysis, Ali's 2026-11-14 ruling, M1 Q1).
 *   prep_skill_sources    maps a training source (quiz, lesson) to a skill.
 *   prep_observations     APPEND-ONLY. One score (0-100) for one skill from one source.
 *                         UNIQUE (source_ref, skill_key) is the idempotency key every scorer uses.
 *   prep_plans            a plan for an interview: days[] of segments, built by planBuilder.
 *   prep_sessions         one timed session; segments jsonb holds per-segment progress.
 *   prep_readiness_daily  the nightly rollup the trend chart reads. interview_id is NOT NULL with
 *                         a zero uuid meaning "no interview", so the unique key is plain.
 *
 * ROLLBACK: CAREER_PREP_ROLLBACK below, run by hand (backend/src/scripts/dropCareerPrepTables.ts,
 * which refuses without --yes). Nothing else references these tables.
 */
export const NO_INTERVIEW = '00000000-0000-0000-0000-000000000000';

export const PREP_SKILLS: ReadonlyArray<{ key: string; label: string; sort: number }> = [
  { key: 'ending_with_number', label: 'Ending on a result with a number', sort: 1 },
  { key: 'explaining_ai', label: 'Explaining AI simply', sort: 2 },
  { key: 'composure_followups', label: 'Composure under follow-ups', sort: 3 },
  { key: 'few_fillers', label: 'Few filler words', sort: 4 },
  { key: 'behavioral_stories', label: 'Behavioral stories', sort: 5 },
  { key: 'role_knowledge', label: 'Role knowledge', sort: 6 },
  { key: 'answer_structure', label: 'Answer structure (STAR)', sort: 7 },
  { key: 'proof_of_work', label: 'Proof of work', sort: 8 },
  { key: 'pace_clarity', label: 'Pace and clarity', sort: 9 },
];

const SKILL_SEED = `INSERT INTO prep_skills (key, label, sort) VALUES ${PREP_SKILLS
  .map((s) => `('${s.key}', '${s.label.replace(/'/g, "''")}', ${s.sort})`).join(', ')} ON CONFLICT (key) DO NOTHING`;

/**
 * CP5.8: add 'read_aloud' to an EXISTING table's source CHECK (a fresh table already has it). Runs only while the current
 * constraint lacks it, so every later boot is a no-op; it only widens the allowed set, so no stored row can violate it.
 */
export const READ_ALOUD_SOURCE = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prep_observations_source_check'
                 AND pg_get_constraintdef(oid) LIKE '%read_aloud%') THEN
    ALTER TABLE prep_observations DROP CONSTRAINT IF EXISTS prep_observations_source_check;
    ALTER TABLE prep_observations ADD CONSTRAINT prep_observations_source_check
      CHECK (source IN ('video','phone_mock','real_interview','training','project','read_aloud'));
  END IF;
END $$`;

export const CAREER_PREP_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS career_interviews (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     source VARCHAR(10) NOT NULL CHECK (source IN ('real','added','practice')),
     company VARCHAR(120) NOT NULL,
     role VARCHAR(120) NOT NULL,
     type VARCHAR(20) NOT NULL CHECK (type IN ('recruiter','hiring_manager','technical','behavioral')),
     starts_at TIMESTAMPTZ,
     target_readiness INTEGER CHECK (target_readiness BETWEEN 0 AND 100),
     jd_text TEXT,
     questions JSONB,
     hire_interview_id UUID UNIQUE,
     practice_until DATE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS career_interviews_enrollment_idx ON career_interviews (enrollment_id, starts_at)',
  // CP8.3 (Release 2): the placement interview a 'real' row was booked from (bookingConfirm links it once per booking).
  // No foreign key: placement_interviews is created after this schema at boot. Revert by hand: PLACEMENT_LINK_ROLLBACK.
  'ALTER TABLE career_interviews ADD COLUMN IF NOT EXISTS placement_interview_id UUID',
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_career_interviews_placement ON career_interviews (placement_interview_id) WHERE placement_interview_id IS NOT NULL',
  // The CCPP interview (CB_Auto_Interview_Job_Submissions.ID) a 'real' row came from (ccppInterviews.ts). Revert by hand: CCPP_LINK_ROLLBACK.
  'ALTER TABLE career_interviews ADD COLUMN IF NOT EXISTS ccpp_interview_id INTEGER',
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_career_interviews_ccpp ON career_interviews (ccpp_interview_id) WHERE ccpp_interview_id IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS prep_skills (
     key VARCHAR(40) PRIMARY KEY,
     label VARCHAR(80) NOT NULL,
     description TEXT,
     sort INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS prep_skill_sources (
     source_type VARCHAR(20) NOT NULL,
     source_key VARCHAR(120) NOT NULL,
     skill_key VARCHAR(40) NOT NULL REFERENCES prep_skills(key),
     PRIMARY KEY (source_type, source_key, skill_key)
   )`,
  `CREATE TABLE IF NOT EXISTS prep_observations (
     id BIGSERIAL PRIMARY KEY,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     skill_key VARCHAR(40) NOT NULL REFERENCES prep_skills(key),
     value NUMERIC(5,2) NOT NULL CHECK (value BETWEEN 0 AND 100),
     source VARCHAR(16) NOT NULL CHECK (source IN ('video','phone_mock','real_interview','training','project','read_aloud')),
     source_ref VARCHAR(160) NOT NULL,
     observed_at TIMESTAMPTZ NOT NULL,
     weight NUMERIC(4,2) NOT NULL DEFAULT 1,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (source_ref, skill_key)
   )`,
  'CREATE INDEX IF NOT EXISTS prep_observations_enrollment_idx ON prep_observations (enrollment_id, skill_key, observed_at)',
  `CREATE TABLE IF NOT EXISTS prep_plans (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     interview_id UUID REFERENCES career_interviews(id) ON DELETE CASCADE,
     kind VARCHAR(10) NOT NULL CHECK (kind IN ('days','tonight','full','custom')),
     minutes INTEGER NOT NULL CHECK (minutes BETWEEN 5 AND 90),
     focus_skill VARCHAR(40) REFERENCES prep_skills(key),
     days JSONB NOT NULL,
     status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','abandoned')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One active plan per interview, guaranteed by the database (plans.ts also serialises with a lock).
  `CREATE UNIQUE INDEX IF NOT EXISTS prep_plans_one_active ON prep_plans (enrollment_id, interview_id) WHERE status = 'active'`,
  `CREATE TABLE IF NOT EXISTS prep_sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     plan_id UUID REFERENCES prep_plans(id) ON DELETE SET NULL,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ended_at TIMESTAMPTZ,
     seconds_active INTEGER NOT NULL DEFAULT 0 CHECK (seconds_active >= 0),
     segments JSONB NOT NULL DEFAULT '[]'::jsonb,
     status VARCHAR(10) NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','finished','ended','abandoned'))
   )`,
  'CREATE INDEX IF NOT EXISTS prep_sessions_enrollment_idx ON prep_sessions (enrollment_id, started_at)',
  // CP4.4: one recorded "Try" answer. client_key makes a retried upload the same attempt (UNIQUE per session).
  `CREATE TABLE IF NOT EXISTS prep_attempts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id UUID NOT NULL REFERENCES prep_sessions(id) ON DELETE CASCADE,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     segment_index INTEGER NOT NULL CHECK (segment_index BETWEEN 0 AND 20),
     client_key VARCHAR(64) NOT NULL,
     status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
     result JSONB,
     error_class VARCHAR(40),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (session_id, client_key)
   )`,
  // CP4.5: one reminder per (ref, kind); ref = session:<id> or plan:<id>. Sent at most once (claimed before sending).
  `CREATE TABLE IF NOT EXISTS prep_reminders (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     ref VARCHAR(80) NOT NULL,
     kind VARCHAR(10) NOT NULL CHECK (kind IN ('tonight','tomorrow')),
     send_at TIMESTAMPTZ NOT NULL,
     status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed','cancelled')),
     sent_at TIMESTAMPTZ,
     error_class VARCHAR(40),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (ref, kind)
   )`,
  'CREATE INDEX IF NOT EXISTS prep_reminders_due_idx ON prep_reminders (status, send_at)',
  // R1.1: a Try answer the student CHOSE to keep (a ticked box after scoring). Every other recording is deleted.
  // asset_id names its folder under PREP_ANSWER_ROOT (stream.mp4 + poster.jpg); deleting the row deletes the folder.
  `CREATE TABLE IF NOT EXISTS prep_saved_answers (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     attempt_id UUID NOT NULL UNIQUE REFERENCES prep_attempts(id) ON DELETE CASCADE,
     asset_id VARCHAR(24) NOT NULL UNIQUE,
     question TEXT,
     delivery INTEGER CHECK (delivery BETWEEN 0 AND 100),
     seconds INTEGER,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS prep_saved_answers_enrollment_idx ON prep_saved_answers (enrollment_id, created_at)',
  // R1.2 (Ali, Q1: A): the second opt-in. A saved answer shows on the public hire profile only when this is on; off by default.
  'ALTER TABLE prep_saved_answers ADD COLUMN IF NOT EXISTS show_public BOOLEAN NOT NULL DEFAULT false',
  // CP5.8 (Ali 2026-11-21, read-aloud at full weight): which kind of recording an attempt is, and the line it was read from.
  "ALTER TABLE prep_attempts ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'try' CHECK (kind IN ('try','readaloud'))",
  'ALTER TABLE prep_attempts ADD COLUMN IF NOT EXISTS line_id VARCHAR(20)',
  READ_ALOUD_SOURCE,
  `CREATE TABLE IF NOT EXISTS prep_readiness_daily (
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     interview_id UUID NOT NULL DEFAULT '${NO_INTERVIEW}',
     date DATE NOT NULL,
     readiness NUMERIC(5,2),
     skills JSONB NOT NULL DEFAULT '{}'::jsonb,
     PRIMARY KEY (enrollment_id, interview_id, date)
   )`,
  SKILL_SEED,
];

/** Run by hand to remove only CP8.3's link column (its unique index goes with it). Never run at boot. */
export const PLACEMENT_LINK_ROLLBACK = 'ALTER TABLE career_interviews DROP COLUMN IF EXISTS placement_interview_id';

/** Run by hand to remove only the CCPP link column (its unique index goes with it). Never run at boot. */
export const CCPP_LINK_ROLLBACK = 'ALTER TABLE career_interviews DROP COLUMN IF EXISTS ccpp_interview_id';

/** Run by hand to roll CP1.2 back. Never run at boot. Dependents first. */
export const CAREER_PREP_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS prep_reminders',
  'DROP TABLE IF EXISTS prep_readiness_daily',
  'DROP TABLE IF EXISTS prep_saved_answers',
  'DROP TABLE IF EXISTS prep_attempts',
  'DROP TABLE IF EXISTS prep_sessions',
  'DROP TABLE IF EXISTS prep_plans',
  'DROP TABLE IF EXISTS prep_observations',
  'DROP TABLE IF EXISTS prep_skill_sources',
  'DROP TABLE IF EXISTS career_interviews',
  'DROP TABLE IF EXISTS prep_skills',
];

export async function ensureCareerPrepSchema(): Promise<void> {
  for (const sql of CAREER_PREP_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'career_prep_schema_stmt_skipped', outcome: 'partial', error_class: e.name || 'Error',
        context: { message: e.message.slice(0, 200) },
      }));
    }
  }
  console.log('[DB] career prep schema ensured');
}

export default ensureCareerPrepSchema;
