/**
 * Static contract test for ensureCapeTodayPlanSchema — asserts the SQL
 * statement array declares the new today_plan_feedback table correctly,
 * WITHOUT requiring a live database (mocked sequelize.query, same convention
 * as ensureCapeLearningValueRankerSchema.test.ts / ensureCapeSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapeTodayPlanSchema } from '../ensureCapeTodayPlanSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapeTodayPlanSchema', () => {
  it('happy path: creates today_plan_feedback with IF NOT EXISTS', async () => {
    await ensureCapeTodayPlanSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS today_plan_feedback/.test(s))).toBe(true);
  });

  it('declares the unique idempotency_key index (findOrCreate dedup guarantee)', async () => {
    await ensureCapeTodayPlanSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /CREATE UNIQUE INDEX IF NOT EXISTS idx_today_plan_feedback_idem ON today_plan_feedback \(idempotency_key\)/.test(s))).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL) — second run resolves cleanly even if statements "already exist"', async () => {
    await ensureCapeTodayPlanSchema();
    await expect(ensureCapeTodayPlanSchema()).resolves.toBeUndefined();
  });

  it('idempotency: a statement failure does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapeTodayPlanSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(4);
  });

  it('does not touch student_skill_evidence or any other CAPE evidence/promotion table — feedback is a ranking signal, never Architecture Skill credit (design doc §11, §17)', async () => {
    await ensureCapeTodayPlanSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesOther = statements.some((s) =>
      /\b(student_skill_evidence|student_architecture_skill|resume_skill_claims|curriculum_skill_maps|architecture_skill_prerequisites|diagnostic_attempts|xp_events|evidence_records|competency_domains|student_competencies|points_config|today_feed_impressions)\b/.test(s));
    expect(touchesOther).toBe(false);
  });

  it('only touches today_plan_feedback (one new table, no ALTER of any existing table)', async () => {
    await ensureCapeTodayPlanSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.every((s) => /today_plan_feedback/.test(s))).toBe(true);
    expect(statements.some((s) => /^ALTER TABLE/i.test(s))).toBe(false);
  });
});
