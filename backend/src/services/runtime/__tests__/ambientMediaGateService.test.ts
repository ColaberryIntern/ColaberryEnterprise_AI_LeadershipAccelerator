/**
 * The listen-to-earn gate's I/O shell. The math is the card gate's own
 * (watchProgressMath, already tested); what is under test here is the shape
 * around it: beats accumulate per (student, media ref), the 75% bar gates the
 * collect with a 422, and the award is idempotent per episode.
 */
jest.mock('../../../models/index', () => ({}));

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

const mockAward = jest.fn();
jest.mock('../../pointsService', () => ({ award: (...a: any[]) => mockAward(...a) }));

const mockEnv = { portalPointsAwardEnabled: true };
jest.mock('../../../config/env', () => ({ env: mockEnv }));

import { recordMediaBeat, collectMedia, getMediaVerdict } from '../ambientMediaGateService';

const E = 'e-1';

/** Simulate the store: SELECT returns the last state we "wrote". */
let stored: any = null;
beforeEach(() => {
  stored = null;
  mockQuery.mockReset();
  mockAward.mockReset();
  mockEnv.portalPointsAwardEnabled = true;
  mockQuery.mockImplementation(async (sql: string, opts: any) => {
    if (/^SELECT/i.test(sql.trim())) return stored ? [{ watch_state: stored }] : [];
    if (/^INSERT/i.test(sql.trim())) { stored = JSON.parse(opts.replacements.ws); return [[], 1]; }
    return [];
  });
});

describe('recordMediaBeat', () => {
  it('accumulates played seconds against the player-reported duration', async () => {
    const v1 = await recordMediaBeat(E, 'podcast', 'ep-1', { delta_s: 15, position_s: 15, duration_s: 100, provider: 'audio' });
    expect(v1.met).toBe(false);
    expect(v1.required_pct).toBe(75);
    expect(v1.watched_pct).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) await recordMediaBeat(E, 'podcast', 'ep-1', { delta_s: 15, position_s: 30 + i * 15, duration_s: 100, provider: 'audio' });
    const v = await getMediaVerdict(E, 'podcast', 'ep-1');
    expect(v.watched_pct).toBeGreaterThanOrEqual(75);
    expect(v.met).toBe(true);
  });

  it('keys the row on the feed ref, so two episodes never share progress', async () => {
    await recordMediaBeat(E, 'podcast', 'ep-1', { delta_s: 15, duration_s: 20 });
    const insert = mockQuery.mock.calls.find((c) => /INSERT/i.test(c[0]));
    expect(insert[1].replacements.ref).toBe('podcast:ep-1');
    expect(insert[1].replacements.eid).toBe(E);
  });

  it('does not count a seek as listening', async () => {
    // A 600s jump in one beat is a scrub, not 10 minutes of play; the shared
    // math clamps it, so the bar is not met.
    const v = await recordMediaBeat(E, 'podcast', 'ep-1', { delta_s: 600, position_s: 600, duration_s: 600 });
    expect(v.met).toBe(false);
  });
});

describe('collectMedia', () => {
  it('refuses with a 422 before the bar is met, in the card gate’s shape', async () => {
    await recordMediaBeat(E, 'testimonial', 't-1', { delta_s: 10, position_s: 10, duration_s: 100 });
    await expect(collectMedia(E, 'testimonial', 't-1')).rejects.toMatchObject({ status: 422, code: 'watch_requirement' });
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('awards the kind’s points once the bar is met, keyed on the ref', async () => {
    stored = { watched_s: 80, max_position_s: 80, duration_s: 100, watched_pct: 80 };
    mockAward.mockResolvedValue({ awarded: true, points: 35 });

    const r = await collectMedia(E, 'podcast', 'ep-1');

    expect(r).toEqual({ points_awarded: 35, already: false, watched_pct: 80 });
    expect(mockAward).toHaveBeenCalledWith(E, expect.objectContaining({ eventKey: 'podcast:ep-1', points: 35 }));
  });

  it('pays a testimonial 10, not 35', async () => {
    stored = { watched_s: 9, max_position_s: 9, duration_s: 10, watched_pct: 90 };
    mockAward.mockResolvedValue({ awarded: true, points: 10 });
    const r = await collectMedia(E, 'testimonial', 't-1');
    expect(r.points_awarded).toBe(10);
    expect(mockAward.mock.calls[0][1].points).toBe(10);
  });

  it('is idempotent — a second collect reports already, awards 0', async () => {
    stored = { watched_s: 80, max_position_s: 80, duration_s: 100, watched_pct: 80 };
    mockAward.mockResolvedValueOnce({ awarded: true, points: 35 }).mockResolvedValueOnce({ awarded: false, points: 35 });
    const first = await collectMedia(E, 'podcast', 'ep-1');
    const second = await collectMedia(E, 'podcast', 'ep-1');
    expect(first.points_awarded).toBe(35);
    expect(second).toEqual({ points_awarded: 0, already: true, watched_pct: 80 });
  });

  it('honours the global points kill switch', async () => {
    stored = { watched_s: 80, max_position_s: 80, duration_s: 100, watched_pct: 80 };
    mockEnv.portalPointsAwardEnabled = false;
    const r = await collectMedia(E, 'podcast', 'ep-1');
    expect(r.points_awarded).toBe(0);
    expect(mockAward).not.toHaveBeenCalled();
  });
});
