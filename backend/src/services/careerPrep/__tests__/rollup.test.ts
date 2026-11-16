const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockLoad = jest.fn();
jest.mock('../prepData', () => ({ loadPrepData: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));

import cron from 'node-cron';
import { rollupAll, rollupFor, startCareerPrepRollupCron } from '../rollup';

const NOW = new Date('2026-11-18T18:00:00Z');
const data = (interviews: unknown[] = []) => ({ enrollmentId: 'e1', firstName: null, observations: [], sourceRefs: [], sessions: [], trend: [], interviews });

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([[], 0]); mockLoad.mockReset(); });

describe('rollupFor', () => {
  it('upserts the general row plus one per interview, keyed (enrollment, interview, Central date)', async () => {
    mockLoad.mockResolvedValue(data([{ id: 'i1', type: 'technical' }]));
    expect(await rollupFor('e1', NOW)).toBe(2);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (enrollment_id, interview_id, date) DO UPDATE');
    expect(opts.replacements).toMatchObject({ e: 'e1', d: '2026-11-18', r: null });
  });

  it('is idempotent: running the same day twice issues the same upserts', async () => {
    mockLoad.mockResolvedValue(data());
    await rollupFor('e1', NOW);
    await rollupFor('e1', NOW);
    expect(mockQuery.mock.calls[0]).toEqual(mockQuery.mock.calls[1]);
  });
});

describe('rollupAll', () => {
  it('keeps going past one student\'s failure and reports it', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: 'a' }, { enrollment_id: 'b' }], 2]);
    mockLoad.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(data());
    expect(await rollupAll(NOW)).toEqual({ students: 2, failed: 1 });
  });
});

describe('startCareerPrepRollupCron', () => {
  it('registers once, at 01:30 Central', () => {
    startCareerPrepRollupCron();
    startCareerPrepRollupCron();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect((cron.schedule as jest.Mock).mock.calls[0][0]).toBe('30 1 * * *');
    expect((cron.schedule as jest.Mock).mock.calls[0][2]).toEqual({ timezone: 'America/Chicago' });
  });
});
