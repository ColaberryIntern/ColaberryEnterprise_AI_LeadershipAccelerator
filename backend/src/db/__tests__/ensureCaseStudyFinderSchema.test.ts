import { CASE_STUDY_FINDER_ROLLBACK, CASE_STUDY_FINDER_STATEMENTS } from '../ensureCaseStudyFinderSchema';

/**
 * CF1 storage. Runs at boot, so it must never be the thing that crash-loops production (16 Nov 2026): every
 * statement is idempotent and none takes a replacement that Sequelize could expand into invalid SQL.
 */
describe('case study finder schema', () => {
  const all = CASE_STUDY_FINDER_STATEMENTS.join('\n');

  it('is idempotent and additive', () => {
    for (const s of CASE_STUDY_FINDER_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(all).not.toMatch(/\b(DROP|TRUNCATE|ALTER)\b/i);
  });

  it('takes no replacements at boot', () => {
    expect(all).not.toMatch(/:[a-z_]+/i);
  });

  it('lets Postgres, not a read-then-insert, allow only one running run per tenant', () => {
    expect(all).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS case_study_finder_runs_one_running_idx\s+ON case_study_finder_runs \(tenant_id\) WHERE status = 'running'/);
  });

  it('rolls back by dropping only its own tables', () => {
    expect(CASE_STUDY_FINDER_ROLLBACK).toEqual(['DROP TABLE IF EXISTS case_study_finder_builds', 'DROP TABLE IF EXISTS case_study_finder_runs']);
  });

  it('a build is unique per proposal, so a second click can never create a second draft', () => {
    expect(all).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS case_study_finder_builds_proposal_idx\s+ON case_study_finder_builds \(tenant_id, proposal_id\)/);
  });
});
