jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import { CAREER_PREP_STATEMENTS, CAREER_PREP_ROLLBACK, PREP_SKILLS, ensureCareerPrepSchema } from '../ensureCareerPrepSchema';

const query = sequelize.query as unknown as jest.Mock;
const created = CAREER_PREP_STATEMENTS.map((s) => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1]).filter(Boolean) as string[];

describe('ensureCareerPrepSchema (statements)', () => {
  it('creates exactly the seven P5 tables', () => {
    expect(created.sort()).toEqual(['career_interviews', 'prep_observations', 'prep_plans', 'prep_readiness_daily', 'prep_sessions', 'prep_skill_sources', 'prep_skills']);
  });

  it('is additive and re-runnable: every statement is IF NOT EXISTS or ON CONFLICT DO NOTHING, and none ALTERs or DROPs', () => {
    for (const s of CAREER_PREP_STATEMENTS) {
      expect(/IF NOT EXISTS|ON CONFLICT \(key\) DO NOTHING/.test(s)).toBe(true);
      expect(s).not.toMatch(/\bALTER\b|\bDROP\b/i);
    }
  });

  it('carries the idempotency keys the scorers and the rollup rely on', () => {
    const joined = CAREER_PREP_STATEMENTS.join('\n');
    expect(joined).toContain('UNIQUE (source_ref, skill_key)');
    expect(joined).toContain('PRIMARY KEY (enrollment_id, interview_id, date)');
    expect(joined).toContain('hire_interview_id UUID UNIQUE');
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
