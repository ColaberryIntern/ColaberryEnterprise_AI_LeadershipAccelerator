/**
 * Static contract test for ensureCapeAiPulseExposureSchema — asserts the SQL
 * statement array declares the new cape_ai_pulse_exposure table correctly,
 * WITHOUT requiring a live database (mocked sequelize.query, same convention
 * as ensureCapeTodayPlanSchema.test.ts / ensureCapeLearningValueRankerSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapeAiPulseExposureSchema } from '../ensureCapeAiPulseExposureSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapeAiPulseExposureSchema', () => {
  it('happy path: creates cape_ai_pulse_exposure with IF NOT EXISTS', async () => {
    await ensureCapeAiPulseExposureSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS cape_ai_pulse_exposure/.test(s))).toBe(true);
  });

  it('declares the unique (enrollment_id, ref) index the upsert relies on', async () => {
    await ensureCapeAiPulseExposureSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) =>
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_cape_ai_pulse_exposure_enrollment_ref ON cape_ai_pulse_exposure \(enrollment_id, ref\)/.test(s),
    )).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureCapeAiPulseExposureSchema();
    await expect(ensureCapeAiPulseExposureSchema()).resolves.toBeUndefined();
  });

  it('idempotency: a statement failure does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapeAiPulseExposureSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(2);
  });

  it('only touches cape_ai_pulse_exposure (one new table, no ALTER of any existing table, no today_feed_impressions write)', async () => {
    await ensureCapeAiPulseExposureSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.every((s) => /cape_ai_pulse_exposure/.test(s))).toBe(true);
    expect(statements.some((s) => /^ALTER TABLE/i.test(s))).toBe(false);
    expect(statements.some((s) => /today_feed_impressions/.test(s))).toBe(false);
  });
});
