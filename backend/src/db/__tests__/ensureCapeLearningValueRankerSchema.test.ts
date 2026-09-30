/**
 * Static contract test for ensureCapeLearningValueRankerSchema — asserts the
 * SQL statement array declares the 4 new today_feed_impressions columns,
 * WITHOUT requiring a live database (mocked sequelize.query, same convention
 * as ensureCapeCurriculumMapSchema.test.ts / ensureCapePlacementSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapeLearningValueRankerSchema } from '../ensureCapeLearningValueRankerSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapeLearningValueRankerSchema', () => {
  it('happy path: adds the 4 new today_feed_impressions columns, each IF NOT EXISTS', async () => {
    await ensureCapeLearningValueRankerSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    for (const col of ['rank_score', 'reasons', 'policy_version', 'learner_state_version']) {
      expect(statements.some((s) => new RegExp(`ALTER TABLE today_feed_impressions ADD COLUMN IF NOT EXISTS ${col}\\b`).test(s))).toBe(true);
    }
  });

  it('declares reasons as a NOT NULL JSONB defaulting to an empty array (never null, always a valid list to render)', async () => {
    await ensureCapeLearningValueRankerSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /reasons JSONB NOT NULL DEFAULT '\[\]'::jsonb/.test(s))).toBe(true);
  });

  it('rank_score, policy_version, learner_state_version are nullable (no NOT NULL) — every existing row and every flag-off row stays valid with them unset', async () => {
    await ensureCapeLearningValueRankerSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const rankScoreStmt = statements.find((s) => /ADD COLUMN IF NOT EXISTS rank_score/.test(s));
    const policyVersionStmt = statements.find((s) => /ADD COLUMN IF NOT EXISTS policy_version/.test(s));
    const learnerStateVersionStmt = statements.find((s) => /ADD COLUMN IF NOT EXISTS learner_state_version/.test(s));
    expect(rankScoreStmt).not.toMatch(/NOT NULL/);
    expect(policyVersionStmt).not.toMatch(/NOT NULL/);
    expect(learnerStateVersionStmt).not.toMatch(/NOT NULL/);
  });

  it('idempotency: a statement failure does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapeLearningValueRankerSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(4);
  });

  it('does not touch student_skill_evidence, student_architecture_skill, resume_skill_claims, curriculum_skill_maps, architecture_skill_prerequisites, or any promotion/XP table', async () => {
    await ensureCapeLearningValueRankerSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesOther = statements.some((s) =>
      /\b(student_skill_evidence|student_architecture_skill|resume_skill_claims|curriculum_skill_maps|architecture_skill_prerequisites|diagnostic_attempts|xp_events|evidence_records|competency_domains|student_competencies|points_config)\b/.test(s));
    expect(touchesOther).toBe(false);
  });

  it('only touches today_feed_impressions (no CREATE TABLE — purely additive to an existing table)', async () => {
    await ensureCapeLearningValueRankerSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.every((s) => /^ALTER TABLE today_feed_impressions/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE/i.test(s))).toBe(false);
  });
});
