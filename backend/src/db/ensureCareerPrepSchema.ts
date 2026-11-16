import { sequelize } from '../config/database';

/**
 * Career Prep v27, CP1.2 (kit section P5): the tables every number in the Career Prep room comes from.
 *
 * ADDITIVE ONLY. Seven new tables; nothing existing is altered. Every statement is IF NOT EXISTS
 * or ON CONFLICT DO NOTHING, so this runs on every boot and a re-run is a no-op. The kit says
 * `participant_id`; in this repo a student is an enrollment, so the column is `enrollment_id`.
 *
 *   career_interviews     one row per interview a student prepares for. source: real (an
 *                         employer interview, today from hire_interviews; Release 2 adds the
 *                         inbox), added (the student added it), practice (made by Cora, no date).
 *                         hire_interview_id is UNIQUE, so linking the same Hire interview twice
 *                         yields one row.
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
     source VARCHAR(16) NOT NULL CHECK (source IN ('video','phone_mock','real_interview','training','project')),
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

/** Run by hand to roll CP1.2 back. Never run at boot. Dependents first. */
export const CAREER_PREP_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS prep_readiness_daily',
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
