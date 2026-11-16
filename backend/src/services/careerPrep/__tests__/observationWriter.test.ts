const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { logSkipped, writeObservations } from '../observationWriter';
import type { ObservationRow } from '../observationAdapters';

const row = (i: number): ObservationRow => ({
  enrollmentId: 'e1', skill: 'few_fillers', value: 80, source: 'video', sourceRef: `hire-intro:${i}`, observedAt: new Date('2026-11-16T00:00:00Z'),
});

beforeEach(() => mockQuery.mockReset());

describe('writeObservations', () => {
  it('writes nothing and makes no query for an empty list', async () => {
    expect(await writeObservations([])).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('inserts with ON CONFLICT DO NOTHING and counts only the new rows', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }], 2]);
    expect(await writeObservations([row(1), row(2)])).toBe(2);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (source_ref, skill_key) DO NOTHING');
    expect((opts as { replacements: Record<string, unknown> }).replacements.r1).toBe('hire-intro:2');
  });

  it('is idempotent: the same rows again report 0 new', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await writeObservations([row(1), row(2)])).toBe(0);
  });

  it('batches 450 rows as 200 + 200 + 50', async () => {
    mockQuery.mockImplementation(async (_sql: string, o: { replacements: Record<string, unknown> }) => [Array(Object.keys(o.replacements).length / 6).fill({}), 0]);
    expect(await writeObservations(Array.from({ length: 450 }, (_, i) => row(i)))).toBe(450);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('lets a database error propagate so the caller can retry', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));
    await expect(writeObservations([row(1)])).rejects.toThrow('connection reset');
  });
});

describe('logSkipped', () => {
  it('logs a skipped record with a stable error_class', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSkipped({ sourceRef: 'assessment:q1', reason: 'quiz score not in 0..1' });
    expect(String(warn.mock.calls[0][0])).toContain('"error_class":"ValidationError"');
    warn.mockRestore();
  });
});
