jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import { CAREER_PREP_STATEMENTS, CAREER_PREP_ROLLBACK, PLACEMENT_LINK_ROLLBACK, PREP_SKILLS, READ_ALOUD_SOURCE, ensureCareerPrepSchema } from '../ensureCareerPrepSchema';

const query = sequelize.query as unknown as jest.Mock;
const created = CAREER_PREP_STATEMENTS.map((s) => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1]).filter(Boolean) as string[];

describe('ensureCareerPrepSchema (statements)', () => {
  it('creates exactly the seven P5 tables plus prep_attempts (CP4.4) and prep_reminders (CP4.5)', () => {
    expect(created.sort()).toEqual(['career_interviews', 'prep_attempts', 'prep_observations', 'prep_plans', 'prep_readiness_daily', 'prep_reminders', 'prep_saved_answers', 'prep_sessions', 'prep_skill_sources', 'prep_skills']);
  });

  it('is additive and re-runnable: every statement is IF NOT EXISTS or ON CONFLICT DO NOTHING, and none ALTERs or DROPs', () => {
    // Two kinds of ALTER are allowed, both on Career Prep tables: adding a column IF NOT EXISTS (R1.2's show_public, CP5.8's
    // prep_attempts.kind and line_id), and CP5.8's guarded WIDENING of the prep_observations source CHECK (READ_ALOUD_SOURCE).
    // Nothing outside Career Prep is ever altered, and nothing is dropped, retyped or narrowed.
    const addColumn = /^ALTER TABLE (prep_[a-z_]+|career_interviews) ADD COLUMN IF NOT EXISTS [a-z_]+ [A-Z]+(\(\d+\))?[A-Z ]*(DEFAULT [a-z0-9']+)?( CHECK \([a-z_]+ IN \([a-z',]+\)\))?$/;
    for (const s of CAREER_PREP_STATEMENTS) {
      expect(/IF NOT EXISTS|ON CONFLICT \(key\) DO NOTHING/.test(s)).toBe(true);
      if (addColumn.test(s) || s === READ_ALOUD_SOURCE) continue;
      expect(s).not.toMatch(/\bALTER\b|\bDROP\b/i);
    }
    expect(CAREER_PREP_STATEMENTS.filter((s) => /\bALTER\b/i.test(s))).toEqual([
      'ALTER TABLE career_interviews ADD COLUMN IF NOT EXISTS placement_interview_id UUID',
      'ALTER TABLE prep_saved_answers ADD COLUMN IF NOT EXISTS show_public BOOLEAN NOT NULL DEFAULT false',
      "ALTER TABLE prep_attempts ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'try' CHECK (kind IN ('try','readaloud'))",
      'ALTER TABLE prep_attempts ADD COLUMN IF NOT EXISTS line_id VARCHAR(20)',
      READ_ALOUD_SOURCE,
    ]);
  });

  it('CP5.8 only WIDENS the observation source CHECK: every old source stays allowed, read_aloud is added, it runs once', () => {
    const allowed = (sql: string) => (/source IN \(([^)]*)\)/.exec(sql)?.[1] ?? '').split(',').map((x) => x.trim().replace(/'/g, ''));
    const table = CAREER_PREP_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS prep_observations')) as string;
    const widened = allowed(READ_ALOUD_SOURCE);
    for (const old of ['video', 'phone_mock', 'real_interview', 'training', 'project']) expect(widened).toContain(old);
    expect(widened).toContain('read_aloud');
    expect(allowed(table)).toEqual(widened);
    expect(READ_ALOUD_SOURCE).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'prep_observations_source_check'/);
  });

  it('carries the idempotency keys the scorers and the rollup rely on', () => {
    const joined = CAREER_PREP_STATEMENTS.join('\n');
    expect(joined).toContain('UNIQUE (source_ref, skill_key)');
    expect(joined).toContain('PRIMARY KEY (enrollment_id, interview_id, date)');
    expect(joined).toContain('UNIQUE (ref, kind)');
    expect(joined).toContain('hire_interview_id UUID UNIQUE');
    // CP8.3: one prep row per placement interview; the partial index is what linkPlacementInterview's ON CONFLICT names.
    expect(joined).toContain('ON career_interviews (placement_interview_id) WHERE placement_interview_id IS NOT NULL');
    expect(joined.indexOf('ADD COLUMN IF NOT EXISTS placement_interview_id')).toBeLessThan(joined.indexOf('uq_career_interviews_placement'));
  });

  it('CP8.3: the link column has its own hand-run rollback, never in the boot statements', () => {
    expect(PLACEMENT_LINK_ROLLBACK).toBe('ALTER TABLE career_interviews DROP COLUMN IF EXISTS placement_interview_id');
    expect(CAREER_PREP_STATEMENTS).not.toContain(PLACEMENT_LINK_ROLLBACK);
  });

  it('seeds 9 skills and never eye contact (no face analysis)', () => {
    expect(PREP_SKILLS).toHaveLength(9);
    expect(JSON.stringify(PREP_SKILLS)).not.toMatch(/eye|expression|accent/i);
    expect(CAREER_PREP_STATEMENTS.join('\n')).not.toMatch(/eye.?contact/i);
  });

  it('has a rollback that drops every table it creates, dependents first', () => {
    const dropped = CAREER_PREP_ROLLBACK.map((s) => /DROP TABLE IF EXISTS (\w+)/.exec(s)?.[1]);
    expect([...dropped].sort()).toEqual([...created].sort());
    expect(dropped.indexOf('prep_observations')).toBeLessThan(dropped.indexOf('prep_skills'));
    expect(dropped.indexOf('prep_plans')).toBeLessThan(dropped.indexOf('career_interviews'));
    expect(dropped.indexOf('prep_attempts')).toBeLessThan(dropped.indexOf('prep_sessions'));
  });

  it('keeps booting when one statement fails, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockReset().mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'DatabaseError' })).mockResolvedValue([[], 0]);
    await ensureCareerPrepSchema();
    expect(query).toHaveBeenCalledTimes(CAREER_PREP_STATEMENTS.length);
    expect(String(warn.mock.calls[0][0])).toContain('"error_class":"DatabaseError"');
  });
});
