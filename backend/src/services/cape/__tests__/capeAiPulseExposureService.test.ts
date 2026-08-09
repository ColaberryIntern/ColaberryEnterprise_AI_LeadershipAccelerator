import { getAiPulseExposureMap, recordAiPulseExposure } from '../capeAiPulseExposureService';
import { sequelize } from '../../../config/database';

const mockQuery = jest.spyOn(sequelize, 'query');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAiPulseExposureMap', () => {
  it('happy path: returns a ref -> last_shown_at Date map from the query result', async () => {
    mockQuery.mockResolvedValueOnce([
      { ref: 'card:1', last_shown_at: '2026-08-01T00:00:00.000Z' },
      { ref: 'card:2', last_shown_at: '2026-08-03T00:00:00.000Z' },
    ] as any);
    const map = await getAiPulseExposureMap('enr-1', ['card:1', 'card:2', 'card:3']);
    expect(map.get('card:1')).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(map.get('card:2')).toEqual(new Date('2026-08-03T00:00:00.000Z'));
    expect(map.has('card:3')).toBe(false); // never shown -> no row -> no map entry
  });

  it('boundary: empty refs array short-circuits to an empty map with no query', async () => {
    const map = await getAiPulseExposureMap('enr-1', []);
    expect(map.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('dedupes refs before querying', async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await getAiPulseExposureMap('enr-1', ['card:1', 'card:1', 'card:1']);
    const [, opts] = mockQuery.mock.calls[0];
    expect((opts as any).replacements.refs).toEqual(['card:1']);
  });

  it('failure path: a DB error degrades to an empty map (fail-soft), never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));
    await expect(getAiPulseExposureMap('enr-1', ['card:1'])).resolves.toEqual(new Map());
  });

  it('boundary: malformed rows (missing ref, unparseable date) are skipped rather than corrupting the map', async () => {
    mockQuery.mockResolvedValueOnce([
      { ref: null, last_shown_at: '2026-08-01T00:00:00.000Z' },
      { ref: 'card:1', last_shown_at: 'not-a-date' },
      { ref: 'card:2', last_shown_at: '2026-08-01T00:00:00.000Z' },
    ] as any);
    const map = await getAiPulseExposureMap('enr-1', ['card:1', 'card:2']);
    expect(map.has('card:1')).toBe(false);
    expect(map.get('card:2')).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });
});

describe('recordAiPulseExposure', () => {
  it('happy path: issues an upsert with the enrollment + ref replacements', async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await recordAiPulseExposure('enr-1', 'card:1');
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO cape_ai_pulse_exposure/);
    expect(String(sql)).toMatch(/ON CONFLICT \(enrollment_id, ref\)/);
    expect((opts as any).replacements).toEqual({ eid: 'enr-1', ref: 'card:1' });
  });

  it('idempotency: calling twice for the same (enrollment, ref) issues two upserts that converge (ON CONFLICT DO UPDATE), never a duplicate-row INSERT failure', async () => {
    mockQuery.mockResolvedValue([] as any);
    await recordAiPulseExposure('enr-1', 'card:1');
    await recordAiPulseExposure('enr-1', 'card:1');
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(String(mockQuery.mock.calls[1][0])).toMatch(/DO UPDATE SET shown_count = cape_ai_pulse_exposure\.shown_count \+ 1/);
  });

  it('failure path: a DB error is swallowed (fail-soft), never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));
    await expect(recordAiPulseExposure('enr-1', 'card:1')).resolves.toBeUndefined();
  });
});
